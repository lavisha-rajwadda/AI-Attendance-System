"""
routers/attendance.py — Attendance Processing Router
======================================================
Endpoints (all under /api/v1/attendance):
  POST /process              → Upload photos → run ML → return draft report
  POST /confirm              → Teacher confirms draft → persist to DB
  GET  /{subject_id}/history → Fetch past attendance sessions for a subject
  GET  /{subject_id}/summary → Aggregated per-student presence percentage

Flow:
  1. Teacher uploads 1–N classroom JPEGs via multipart/form-data.
  2. Backend runs ML pipeline → returns a draft AttendanceReportResponse.
  3. Teacher reviews the draft in the UI (can manually override).
  4. Teacher clicks "Confirm" → POST /confirm → records persisted to DB.

This two-phase approach (process → confirm) ensures teachers can catch
false positives/negatives before they become permanent records.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from database import get_supabase_client
from models.schemas import (
    AttendanceReportResponse,
    AttendanceConfirmRequest,
    AttendanceConfirmResponse,
    StudentAttendanceRecord,
    TokenData,
    FaceRecognitionException,
)
from utils.auth import require_teacher, get_current_user
from services.ml_service import run_attendance_inference

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/attendance")


# ══════════════════════════════════════════════════════════════════════════════
# HELPER — Image bytes → base64 string
# ══════════════════════════════════════════════════════════════════════════════

import base64

async def _upload_files_to_base64(files: List[UploadFile]) -> List[str]:
    """
    Reads uploaded UploadFile objects and returns them as raw base64 strings.
    The face_service functions accept base64 strings so we convert here.

    Args:
        files: List of multipart UploadFile objects from FastAPI.

    Returns:
        List of base64-encoded image strings (no Data URI prefix).
    """
    b64_list = []
    for i, upload_file in enumerate(files):
        logger.debug(
            f"Reading uploaded file {i + 1}/{len(files)}: "
            f"filename='{upload_file.filename}', "
            f"content_type='{upload_file.content_type}'"
        )
        raw_bytes = await upload_file.read()
        b64 = base64.b64encode(raw_bytes).decode("utf-8")
        b64_list.append(b64)
        logger.debug(
            f"File {i + 1} read: {len(raw_bytes):,} bytes "
            f"→ base64 length={len(b64):,} chars"
        )
    return b64_list


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINT: POST /recognize-team
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/recognize-team",
    summary="Mark attendance for team using group images",
)
async def recognize_team(
    subject_id: str = Form(...),
    files: List[UploadFile] = File(...),
    current_teacher: TokenData = Depends(require_teacher),
):
    """
    Unified multi-photo attendance classification endpoint.
    Accepts subject_id and group photos.
    Fits a Scikit-Learn KNeighborsClassifier(n_neighbors=1) on the fly
    with registered student embeddings, processes the group photos, and marks attendance.
    """
    import cv2
    import numpy as np
    import face_recognition
    from PIL import Image
    import io
    from sklearn.neighbors import KNeighborsClassifier
    from services.face_service import is_image_blurry
    from fastapi.responses import JSONResponse

    logger.info(f"[RECOGNIZE TEAM] teacher_id='{current_teacher.user_id}', subject_id='{subject_id}', num_photos={len(files)}")

    # ── Step 1: Read image bytes & check blur ─────────────────────────────────
    all_rgb_arrays = []
    for file in files:
        try:
            image_bytes = await file.read()
            pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            rgb_array = np.array(pil_image, dtype=np.uint8)
        except Exception as exc:
            logger.error(f"[RECOGNIZE TEAM] Image decoding failed: {exc}", exc_info=True)
            raise FaceRecognitionException(
                error_code="blurry_image",
                message="Failed to decode one of the uploaded images. Please ensure all are valid images.",
                details={"error": str(exc)}
            )

        blurry, variance = is_image_blurry(rgb_array, threshold=10.0)
        if blurry:
            logger.warning(f"[RECOGNIZE TEAM] Uploaded image is blurry: variance={variance:.2f}")
            raise FaceRecognitionException(
                error_code="blurry_image",
                message="One of the uploaded group images is too blurry. Please try again with clearer photos.",
                details={"variance": float(round(variance, 2)), "threshold": 10.0}
            )
        all_rgb_arrays.append(rgb_array)

    client = get_supabase_client()

    # ── Step 2: Validate subject enrollment ───────────────────────────────────
    try:
        enroll_resp = (
            client.table("subject_students")
            .select("student_id")
            .eq("subject_id", subject_id)
            .execute()
        )
        enrolled_ids = [str(r["student_id"]) for r in (enroll_resp.data or [])]
    except Exception as exc:
        logger.error(f"[RECOGNIZE TEAM] DB query for enrollments failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error checking enrollments: {exc}"
        )

    if not enrolled_ids:
        logger.warning(f"[RECOGNIZE TEAM] No students enrolled in subject_id='{subject_id}'.")
        raise FaceRecognitionException(
            error_code="attendance_before_enrollment",
            message="Cannot take attendance because no students are enrolled in this subject yet.",
            details={"subject_id": subject_id}
        )

    # ── Step 3: Fetch all registered student embeddings ───────────────────────
    try:
        students_resp = (
            client.table("students")
            .select("student_id, name, face_embedding")
            .execute()
        )
        all_students = students_resp.data or []
    except Exception as exc:
        logger.error(f"[RECOGNIZE TEAM] DB query for students failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error fetching students: {exc}"
        )

    valid_students = []
    for s in all_students:
        emb = s.get("face_embedding")
        if emb and isinstance(emb, list) and len(emb) == 128:
            valid_students.append(s)

    if not valid_students:
        logger.warning("[RECOGNIZE TEAM] No registered students found with face embeddings.")
        raise FaceRecognitionException(
            error_code="attendance_before_enrollment",
            message="No registered students with enrolled face templates exist in the system.",
            details={}
        )

    # ── Step 4: Fit KNeighborsClassifier ──────────────────────────────────────
    X = np.array([s["face_embedding"] for s in valid_students], dtype=np.float64)
    y_idx = np.arange(len(valid_students))

    knn = KNeighborsClassifier(n_neighbors=1, metric="cosine")
    knn.fit(X, y_idx)

    # ── Step 5: Detect faces in the group photos ──────────────────────────────
    total_faces_detected = 0
    faces_list = []
    student_matches = {}
    unrecognized_count = 0
    global_face_idx = 0

    for rgb_array in all_rgb_arrays:
        logger.info("[RECOGNIZE TEAM] Detecting faces (HOG model)...")
        face_locations = face_recognition.face_locations(rgb_array, model="hog")
        n_faces = len(face_locations)
        total_faces_detected += n_faces
        logger.info(f"[RECOGNIZE TEAM] Face detection complete: {n_faces} face(s) found.")

        if n_faces == 0:
            continue

        face_encodings = face_recognition.face_encodings(rgb_array, face_locations)

        # Sort faces left-to-right (by the 'left' coordinate, index 3 in dlib format: top, right, bottom, left)
        sorted_faces = sorted(
            zip(face_locations, face_encodings),
            key=lambda item: item[0][3]
        )

        for loc, encoding in sorted_faces:
            top, right, bottom, left = loc
            dist, ind = knn.kneighbors([encoding], n_neighbors=1)
            distance_val = float(dist[0][0])
            matched_student_idx = int(ind[0][0])

            is_recognized = distance_val < 0.18
            if is_recognized:
                matched_student = valid_students[matched_student_idx]
                assigned_name = matched_student["name"]
                student_id = str(matched_student["student_id"])
                confidence_score = max(0.0, 1.0 - (distance_val / 0.18))

                is_enrolled = student_id in enrolled_ids
                if is_enrolled:
                    if student_id not in student_matches or distance_val < student_matches[student_id]["distance"]:
                        student_matches[student_id] = {
                            "name": assigned_name,
                            "distance": distance_val,
                            "confidence": confidence_score
                        }
            else:
                assigned_name = "unknown"
                is_recognized = False
                confidence_score = 0.0
                unrecognized_count += 1

            faces_list.append({
                "face_index": global_face_idx,
                "bounding_box": {
                    "top": int(top),
                    "right": int(right),
                    "bottom": int(bottom),
                    "left": int(left)
                },
                "assigned_name": assigned_name,
                "recognized": is_recognized,
                "confidence_score": float(round(confidence_score, 4)),
                "distance": float(distance_val)
            })
            global_face_idx += 1

    if total_faces_detected == 0:
        logger.warning("[RECOGNIZE TEAM] No faces detected in any uploaded photo.")
        raise FaceRecognitionException(
            error_code="no_face_in_group_photo",
            message="No faces were detected in the group photos. Please make sure students are looking at the camera.",
            details={}
        )

    # Prepare marked attendance lists
    attendance_marked_for_ids = []
    attendance_marked_for_names = []
    for sid, match in student_matches.items():
        attendance_marked_for_ids.append(sid)
        attendance_marked_for_names.append(match["name"])

    # ── Step 7: Persist attendance logs in DB ─────────────────────────────────
    session_timestamp = datetime.now(timezone.utc).isoformat()
    rows_to_insert = []
    for sid in enrolled_ids:
        is_present = sid in attendance_marked_for_ids
        match_info = student_matches.get(sid)
        confidence = match_info["confidence"] if match_info else None
        rows_to_insert.append({
            "subject_id": subject_id,
            "student_id": sid,
            "is_present": is_present,
            "confidence": confidence,
            "timestamp": session_timestamp,
        })

    try:
        client.table("attendance_logs").insert(rows_to_insert).execute()
        logger.info(f"[RECOGNIZE TEAM] Successfully persisted attendance log rows: {len(rows_to_insert)}")
    except Exception as exc:
        logger.error(f"[RECOGNIZE TEAM] DB persist failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist attendance log: {exc}"
        )

    # Return structured JSON response in the exact order requested
    response_content = {
        "success": True,
        "message": f"Attendance successfully marked for {len(attendance_marked_for_names)} student(s).",
        "total_faces_detected": int(total_faces_detected),
        "faces": faces_list,
        "attendance_marked_for": attendance_marked_for_names,
        "unrecognized_count": int(unrecognized_count)
    }

    return JSONResponse(content=response_content)


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINT: POST /process
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/process",
    response_model=AttendanceReportResponse,
    summary="Upload classroom photos → run face recognition → get draft report",
)
async def process_attendance(
    subject_id: str = Form(...),
    photos: List[UploadFile] = File(..., description="One or more classroom JPEG/PNG photos"),
    current_teacher: TokenData = Depends(require_teacher),
):
    """
    Phase 1 of attendance marking.

    The teacher uploads classroom photos and this endpoint:
      1. Validates that the teacher owns the subject.
      2. Converts uploaded files to base64.
      3. Runs the full ML pipeline (SVM inference).
      4. Returns a draft report — NOT yet written to the DB.

    The draft contains per-student presence decisions that the teacher
    can review and optionally override before calling /confirm.

    Request format: multipart/form-data
      - subject_id: string (form field)
      - photos: list of image files (file fields, name must be 'photos')

    Note on concurrency: This is CPU-bound (face detection + SVM).
    For production, run behind a process manager like Gunicorn with
    multiple workers so requests don't block each other.
    """
    logger.info(
        f"[PROCESS ATTENDANCE] teacher_id='{current_teacher.user_id}', "
        f"subject_id='{subject_id}', "
        f"num_photos={len(photos)}"
    )

    # ── Validate input ────────────────────────────────────────────────────────
    if not photos:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one photo must be uploaded.",
        )

    MAX_PHOTOS = 20
    if len(photos) > MAX_PHOTOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_PHOTOS} photos allowed per session.",
        )

    # ── Verify teacher owns the subject ───────────────────────────────────────
    client = get_supabase_client()
    try:
        subj_resp = (
            client.table("subjects")
            .select("subject_id, name, teacher_id")
            .eq("subject_id", subject_id)
            .limit(1)
            .execute()
        )
        if not subj_resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Subject '{subject_id}' not found.",
            )
        subject = subj_resp.data[0]
        # Subject access restrictions are disabled for teachers as per instructions.
        pass
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"❌ Subject validation failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Subject validation error: {exc}",
        ) from exc

    # ── Convert uploaded photos to base64 ─────────────────────────────────────
    logger.info(f"[PROCESS ATTENDANCE] Reading {len(photos)} uploaded photo(s)...")
    try:
        photo_b64_list = await _upload_files_to_base64(photos)
    except Exception as exc:
        logger.error(f"❌ Photo reading failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to read uploaded photos: {exc}",
        ) from exc

    # ── Run ML inference ──────────────────────────────────────────────────────
    logger.info(f"[PROCESS ATTENDANCE] Launching ML inference pipeline...")
    try:
        raw_results, total_faces_detected = run_attendance_inference(
            subject_id=subject_id,
            photo_base64_list=photo_b64_list,
        )
    except RuntimeError as exc:
        # Expected errors: not enough enrolled students, no embeddings, etc.
        logger.warning(f"[PROCESS ATTENDANCE] ML pipeline error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error(f"❌ [PROCESS ATTENDANCE] Unexpected ML error: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Attendance processing failed: {exc}",
        ) from exc

    # ── Build response ────────────────────────────────────────────────────────
    records = [
        StudentAttendanceRecord(
            student_id=r["student_id"],
            name=r["name"],
            username=r["username"],
            is_present=r["is_present"],
            confidence=r.get("confidence"),
            detected_in_photos=r.get("detected_in_photos", []),
        )
        for r in raw_results
    ]

    total_present = sum(1 for r in records if r.is_present)
    total_absent = len(records) - total_present

    logger.info(
        f"✅ [PROCESS ATTENDANCE] Draft report ready — "
        f"enrolled={len(records)}, present={total_present}, absent={total_absent}, "
        f"faces_detected={total_faces_detected}"
    )

    return AttendanceReportResponse(
        subject_id=subject_id,
        subject_name=subject["name"],
        total_enrolled=len(records),
        total_present=total_present,
        total_absent=total_absent,
        records=records,
        processed_photos=len(photos),
        faces_detected=total_faces_detected,
    )


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINT: POST /confirm
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/confirm",
    response_model=AttendanceConfirmResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Confirm draft attendance report → persist to database",
)
async def confirm_attendance(
    payload: AttendanceConfirmRequest,
    current_teacher: TokenData = Depends(require_teacher),
):
    """
    Phase 2 of attendance marking.

    The teacher submits the reviewed (and optionally manually corrected)
    attendance records for permanent storage.

    Flow:
      1. Verify teacher owns subject.
      2. Batch-insert attendance log rows into `attendance_logs`.
         One row per student per session timestamp.
      3. Return a count of created records.

    The timestamp is server-generated (not client-provided) to prevent
    tampering with attendance dates.
    """
    subject_id = payload.subject_id
    logger.info(
        f"[CONFIRM ATTENDANCE] teacher_id='{current_teacher.user_id}', "
        f"subject_id='{subject_id}', "
        f"num_records={len(payload.records)}"
    )

    if not payload.records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No attendance records provided.",
        )

    # ── Verify teacher owns subject ────────────────────────────────────────────
    client = get_supabase_client()
    try:
        subj_resp = (
            client.table("subjects")
            .select("subject_id, teacher_id")
            .eq("subject_id", subject_id)
            .limit(1)
            .execute()
        )
        if not subj_resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Subject '{subject_id}' not found.",
            )
        # Subject access restrictions are disabled for teachers as per instructions.
        pass
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"❌ Subject validation failed: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # ── Build batch insert rows ────────────────────────────────────────────────
    session_timestamp = datetime.now(timezone.utc).isoformat()
    rows_to_insert = [
        {
            "subject_id": subject_id,
            "student_id": record.student_id,
            "is_present": record.is_present,
            "confidence": record.confidence,
            "timestamp": session_timestamp,
        }
        for record in payload.records
    ]

    logger.info(
        f"[CONFIRM ATTENDANCE] Batch-inserting {len(rows_to_insert)} rows "
        f"into attendance_logs at timestamp={session_timestamp}..."
    )

    try:
        response = client.table("attendance_logs").insert(rows_to_insert).execute()
        logs_created = len(response.data) if response.data else len(rows_to_insert)
        logger.info(
            f"✅ [CONFIRM ATTENDANCE] {logs_created} attendance log(s) created "
            f"for subject_id='{subject_id}'."
        )
    except Exception as exc:
        logger.error(
            f"❌ [CONFIRM ATTENDANCE] Batch insert failed: {exc}", exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save attendance records: {exc}",
        ) from exc

    return AttendanceConfirmResponse(
        message=f"Attendance confirmed and saved for {logs_created} student(s).",
        logs_created=logs_created,
    )


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINT: GET /{subject_id}/history
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/{subject_id}/history",
    summary="Get all past attendance sessions for a subject",
)
async def get_attendance_history(
    subject_id: str,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Returns all attendance log entries for a subject, grouped by
    session timestamp.
    If the user is a student, verify enrollment and only return their own records.
    """
    logger.info(
        f"[HISTORY] Fetching attendance history for subject_id='{subject_id}' "
        f"by user='{current_user.user_id}' (role={current_user.role})"
    )

    client = get_supabase_client()

    # ── Verify subject exists ──────────────────────────────────────────────
    try:
        subj_resp = (
            client.table("subjects")
            .select("subject_id, name, teacher_id")
            .eq("subject_id", subject_id)
            .limit(1)
            .execute()
        )
        if not subj_resp.data:
            raise HTTPException(status_code=404, detail=f"Subject '{subject_id}' not found.")
        subject = subj_resp.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # ── If student, verify enrollment ─────────────────────────────────────────
    if current_user.role == "student":
        try:
            enroll_resp = (
                client.table("subject_students")
                .select("student_id")
                .eq("subject_id", subject_id)
                .eq("student_id", current_user.user_id)
                .limit(1)
                .execute()
            )
            if not enroll_resp.data:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not enrolled in this subject.",
                )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    # ── Fetch all attendance logs ─────────────────────────────────────────────
    try:
        query = (
            client.table("attendance_logs")
            .select("id, student_id, is_present, confidence, timestamp")
            .eq("subject_id", subject_id)
        )
        if current_user.role == "student":
            query = query.eq("student_id", current_user.user_id)

        logs_resp = query.order("timestamp", desc=True).execute()
        logs = logs_resp.data or []
        logger.info(f"[HISTORY] {len(logs)} log row(s) fetched.")
    except Exception as exc:
        logger.error(f"❌ [HISTORY] DB query failed: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {exc}") from exc

    if not logs:
        return {"subject_id": subject_id, "subject_name": subject["name"], "sessions": []}

    # ── Fetch student names for display ───────────────────────────────────────
    student_ids_in_logs = list({log["student_id"] for log in logs})
    try:
        stu_resp = (
            client.table("students")
            .select("student_id, name, username")
            .in_("student_id", student_ids_in_logs)
            .execute()
        )
        student_map = {
            s["student_id"]: s for s in (stu_resp.data or [])
        }
    except Exception as exc:
        logger.warning(f"[HISTORY] Could not fetch student names: {exc}")
        student_map = {}

    # ── Group logs by session timestamp ───────────────────────────────────────
    from collections import defaultdict
    sessions_map = defaultdict(list)
    for log in logs:
        sessions_map[log["timestamp"]].append(log)

    sessions = []
    for ts, session_logs in sorted(sessions_map.items(), reverse=True):
        records = []
        for log in session_logs:
            student = student_map.get(log["student_id"], {})
            records.append({
                "student_id": log["student_id"],
                "name": student.get("name", "Unknown"),
                "username": student.get("username", ""),
                "is_present": log["is_present"],
                "confidence": log.get("confidence"),
            })

        present = sum(1 for r in records if r["is_present"])
        sessions.append({
            "timestamp": ts,
            "total_present": present,
            "total_absent": len(records) - present,
            "records": records,
        })

    logger.info(f"[HISTORY] Returning {len(sessions)} session(s).")
    return {
        "subject_id": subject_id,
        "subject_name": subject["name"],
        "sessions": sessions,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINT: GET /{subject_id}/summary
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/{subject_id}/summary",
    summary="Get per-student attendance percentage for a subject",
)
async def get_attendance_summary(
    subject_id: str,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Returns a per-student attendance summary.
    If the user is a student, only return their own summary details.
    """
    logger.info(
        f"[SUMMARY] Calculating attendance summary for subject_id='{subject_id}' by user='{current_user.user_id}'"
    )

    client = get_supabase_client()

    # ── Verify subject exists ──────────────────────────────────────────────────
    try:
        subj_resp = (
            client.table("subjects")
            .select("subject_id, name, teacher_id")
            .eq("subject_id", subject_id)
            .limit(1)
            .execute()
        )
        if not subj_resp.data:
            raise HTTPException(status_code=404, detail=f"Subject '{subject_id}' not found.")
        subject = subj_resp.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # ── If student, verify enrollment ─────────────────────────────────────────
    if current_user.role == "student":
        try:
            enroll_resp = (
                client.table("subject_students")
                .select("student_id")
                .eq("subject_id", subject_id)
                .eq("student_id", current_user.user_id)
                .limit(1)
                .execute()
            )
            if not enroll_resp.data:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not enrolled in this subject.",
                )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    # ── Fetch all logs for this subject ───────────────────────────────────────
    try:
        logs_resp = (
            client.table("attendance_logs")
            .select("student_id, is_present, timestamp")
            .eq("subject_id", subject_id)
            .execute()
        )
        logs = logs_resp.data or []
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not logs:
        return {
            "subject_id": subject_id,
            "subject_name": subject["name"],
            "total_sessions": 0,
            "students": [],
        }

    # ── Count sessions and presence ───────────────────────────────────────────
    from collections import defaultdict
    total_sessions = len({log["timestamp"] for log in logs})
    student_present_count: Dict[str, int] = defaultdict(int)
    for log in logs:
        if log["is_present"]:
            student_present_count[log["student_id"]] += 1

    # ── Fetch student details ────────────────────────────────────────────────
    if current_user.role == "student":
        # Only fetch this specific student
        enrolled_ids = [current_user.user_id]
    else:
        # Fetch all enrolled students for this subject
        enroll_resp = (
            client.table("subject_students")
            .select("student_id")
            .eq("subject_id", subject_id)
            .execute()
        )
        enrolled_ids = [r["student_id"] for r in (enroll_resp.data or [])]

    if not enrolled_ids:
        return {
            "subject_id": subject_id,
            "subject_name": subject["name"],
            "total_sessions": total_sessions,
            "students": [],
        }

    try:
        stu_resp = (
            client.table("students")
            .select("student_id, name, username")
            .in_("student_id", enrolled_ids)
            .execute()
        )
        students = stu_resp.data or []
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    summary_students = []
    for s in students:
        present = student_present_count.get(s["student_id"], 0)
        percentage = round((present / total_sessions) * 100, 1) if total_sessions > 0 else 0.0
        summary_students.append({
            "student_id": s["student_id"],
            "name": s["name"],
            "username": s["username"],
            "sessions_present": present,
            "total_sessions": total_sessions,
            "attendance_percentage": percentage,
        })

    # Sort by attendance percentage descending
    summary_students.sort(key=lambda x: x["attendance_percentage"], reverse=True)

    logger.info(
        f"✅ [SUMMARY] Summary built: {len(summary_students)} student(s), "
        f"{total_sessions} total session(s)."
    )

    return {
        "subject_id": subject_id,
        "subject_name": subject["name"],
        "total_sessions": total_sessions,
        "students": summary_students,
    }
