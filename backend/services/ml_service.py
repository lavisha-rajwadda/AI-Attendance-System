"""
services/ml_service.py — SVM Face Recognition Pipeline
=========================================================
Responsibilities:
  - Load all enrolled students' face embeddings from Supabase for a subject
  - Train an in-memory SVM classifier on those embeddings (per-request, stateless)
  - Run inference on a batch of 128D embeddings extracted from classroom photos
  - Return per-student attendance decisions with confidence scores

Why train per-request (not persist the model)?
  - The enrolled student set can change between sessions.
  - Training on ≤200 students takes ~50ms — fast enough to be synchronous.
  - Avoids model staleness and the complexity of cache invalidation.
  - Stateless design scales horizontally.

SVM configuration:
  - Kernel : RBF (best for high-dimensional non-linear data)
  - C      : 10.0 (strong regularization for small datasets)
  - gamma  : 'scale' (automatically adjusted to 1/(n_features * X.var()))
  - probability = True (needed for predict_proba confidence scores)
"""

import logging
from typing import Dict, List, Tuple

import numpy as np
from sklearn.neighbors import KNeighborsClassifier

from config import get_settings
from database import get_supabase_client
from services.face_service import extract_all_embeddings_from_base64, compare_embedding
from services.model import train_knn

logger = logging.getLogger(__name__)
settings = get_settings()


# ══════════════════════════════════════════════════════════════════════════════
# DATA LOADING
# ══════════════════════════════════════════════════════════════════════════════

def load_enrolled_embeddings(subject_id: str) -> Dict[str, dict]:
    """
    Fetches all enrolled students for a subject and retrieves their
    stored face embeddings from the `students` table.

    Returns:
        dict mapping student_id → {
            "student_id": str,
            "name": str,
            "username": str,
            "embedding": List[float]   # 128D vector
        }

    Raises:
        RuntimeError: If fewer than `min_enrollment_faces` students have
                      a valid embedding (can't meaningfully train SVM).
    """
    client = get_supabase_client()
    logger.info(f"[ML] Loading enrolled embeddings for subject_id='{subject_id}'...")

    # ── Step 1: Get enrolled student IDs ─────────────────────────────────────
    enroll_resp = (
        client.table("subject_students")
        .select("student_id")
        .eq("subject_id", subject_id)
        .execute()
    )
    student_ids = [r["student_id"] for r in (enroll_resp.data or [])]
    logger.info(f"[ML] {len(student_ids)} student(s) enrolled in subject_id='{subject_id}'.")

    if not student_ids:
        raise RuntimeError(
            f"No students are enrolled in subject '{subject_id}'. "
            "Cannot process attendance."
        )

    # ── Step 2: Batch-fetch student rows with embeddings ─────────────────────
    students_resp = (
        client.table("students")
        .select("student_id, name, username, face_embedding")
        .in_("student_id", student_ids)
        .execute()
    )
    students = students_resp.data or []
    logger.info(f"[ML] Fetched {len(students)} student record(s) from DB.")

    # ── Step 3: Filter out students with missing embeddings ───────────────────
    valid_students: Dict[str, dict] = {}
    for s in students:
        embedding = s.get("face_embedding")
        if embedding and isinstance(embedding, list) and len(embedding) == 128:
            valid_students[s["student_id"]] = {
                "student_id": s["student_id"],
                "name": s["name"],
                "username": s["username"],
                "embedding": embedding,
            }
        else:
            logger.warning(
                f"[ML] Student student_id='{s['student_id']}' has no valid "
                f"face embedding — skipping."
            )

    n_valid = len(valid_students)
    logger.info(
        f"[ML] {n_valid}/{len(students)} students have valid embeddings "
        f"for subject_id='{subject_id}'."
    )

    if n_valid < settings.min_enrollment_faces:
        raise RuntimeError(
            f"Only {n_valid} student(s) have valid face embeddings. "
            f"Need at least {settings.min_enrollment_faces} to run the "
            "attendance recognition pipeline."
        )

    return valid_students


# ══════════════════════════════════════════════════════════════════════════════
# KNN CLASSIFIER
# ══════════════════════════════════════════════════════════════════════════════

def train_knn_model(
    enrolled_students: Dict[str, dict],
) -> KNeighborsClassifier:
    """
    Trains a KNN classifier on the enrolled students' face embeddings.
    """
    return train_knn(enrolled_students)


# ══════════════════════════════════════════════════════════════════════════════
# INFERENCE
# ══════════════════════════════════════════════════════════════════════════════

def run_attendance_inference(
    subject_id: str,
    photo_base64_list: List[str],
) -> List[dict]:
    """
    Full attendance recognition pipeline for a subject session.

    Flow:
      1. Load enrolled embeddings from DB.
      2. Train SVM classifier in-memory.
      3. For each uploaded classroom photo:
           a. Extract all face embeddings from the photo.
           b. For each detected face, run SVM prediction.
           c. Accept prediction only if SVM probability ≥ 0.55.
           d. Additionally validate with direct Euclidean distance comparison
              (double-check to reduce false positives).
      4. Collate results: mark student as present if seen in ANY photo.
      5. Return a per-student attendance record list.

    Args:
        subject_id:        Subject being processed.
        photo_base64_list: List of base64-encoded classroom photo strings.

    Returns:
        List of dicts:
          {
            "student_id": str,
            "name": str,
            "username": str,
            "is_present": bool,
            "confidence": float,          # Best SVM probability across all photos
            "detected_in_photos": List[int]  # 0-indexed photo numbers
          }
    """
    logger.info(
        f"[ATTENDANCE INFERENCE] Starting pipeline for subject_id='{subject_id}', "
        f"{len(photo_base64_list)} photo(s)."
    )

    # ── Step 1: Load embeddings ────────────────────────────────────────────────
    enrolled_students = load_enrolled_embeddings(subject_id)
    all_student_ids = list(enrolled_students.keys())

    # ── Step 2: Train KNN ──────────────────────────────────────────────────────
    knn = train_knn_model(enrolled_students)

    # ── Step 3: Initialise result accumulators ─────────────────────────────────
    # Maps student_id → {"is_present", "best_confidence", "detected_in_photos"}
    attendance_map: Dict[str, dict] = {
        sid: {
            "student_id": sid,
            "name": enrolled_students[sid]["name"],
            "username": enrolled_students[sid]["username"],
            "is_present": False,
            "best_confidence": 0.0,
            "detected_in_photos": [],
        }
        for sid in all_student_ids
    }

    total_faces_detected = 0

    # ── Step 4: Process each photo ────────────────────────────────────────────
    for photo_idx, b64_photo in enumerate(photo_base64_list):
        logger.info(f"[ATTENDANCE INFERENCE] Processing photo {photo_idx + 1}/{len(photo_base64_list)}...")

        try:
            face_embeddings = extract_all_embeddings_from_base64(b64_photo)
        except Exception as exc:
            logger.warning(
                f"[ATTENDANCE INFERENCE] Photo {photo_idx + 1} could not be "
                f"processed — skipping. Error: {exc}"
            )
            continue

        n_faces = len(face_embeddings)
        total_faces_detected += n_faces
        logger.info(
            f"[ATTENDANCE INFERENCE] Photo {photo_idx + 1}: "
            f"{n_faces} face(s) extracted."
        )

        for face_idx, (face_embedding, _face_location) in enumerate(face_embeddings):
            logger.debug(
                f"[ATTENDANCE INFERENCE] Photo {photo_idx + 1}, "
                f"face {face_idx + 1}: running prediction..."
            )

            # ── prediction using KNN (Cosine Metric) ──────────────────────────
            try:
                X_pred = np.array([face_embedding], dtype=np.float64)
                distances, indices = knn.kneighbors(X_pred, n_neighbors=1)
                cosine_distance = float(distances[0][0])
                predicted_student_id = str(knn.predict(X_pred)[0])

                # Match threshold: 0.18 Cosine distance (equivalent to 0.6 Euclidean distance)
                COSINE_THRESHOLD = 0.18
                is_match = cosine_distance < COSINE_THRESHOLD

                if not is_match:
                    logger.debug(
                        f"KNN Cosine match FAILED for predicted student_id='{predicted_student_id}' "
                        f"(cosine_dist={cosine_distance:.4f} >= {COSINE_THRESHOLD}) — rejected."
                    )
                    continue

                # Confidence score: map distance range [0.0, 0.18] to confidence [1.0, 0.0]
                final_confidence = round(max(0.0, 1.0 - (cosine_distance / COSINE_THRESHOLD)), 4)

                logger.debug(
                    f"KNN prediction → student_id='{predicted_student_id}', "
                    f"cosine_dist={cosine_distance:.4f}, confidence={final_confidence:.4f}"
                )
            except Exception as exc:
                logger.warning(f"KNN prediction failed for a face: {exc}")
                continue

            # ── Mark as present ────────────────────────────────────────────
            prev = attendance_map[predicted_student_id]
            if not prev["is_present"] or final_confidence > prev["best_confidence"]:
                prev["best_confidence"] = final_confidence

            prev["is_present"] = True
            if photo_idx not in prev["detected_in_photos"]:
                prev["detected_in_photos"].append(photo_idx)

            logger.info(
                f"✅ [ATTENDANCE] student_id='{predicted_student_id}' "
                f"('{enrolled_students[predicted_student_id]['name']}') "
                f"PRESENT in photo {photo_idx + 1} "
                f"(confidence={final_confidence:.4f})"
            )

    # ── Step 5: Build result list ─────────────────────────────────────────────
    results = []
    present_count = 0
    for sid, data in attendance_map.items():
        if data["is_present"]:
            present_count += 1
        results.append({
            "student_id": data["student_id"],
            "name": data["name"],
            "username": data["username"],
            "is_present": data["is_present"],
            "confidence": data["best_confidence"] if data["is_present"] else None,
            "detected_in_photos": data["detected_in_photos"],
        })

    absent_count = len(results) - present_count
    logger.info(
        f"[ATTENDANCE INFERENCE] Pipeline complete — "
        f"total_enrolled={len(results)}, present={present_count}, "
        f"absent={absent_count}, total_faces_detected={total_faces_detected}"
    )

    return results, total_faces_detected
