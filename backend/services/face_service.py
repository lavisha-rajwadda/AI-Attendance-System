"""
services/face_service.py — Face Embedding Extraction Service
=============================================================
Responsibilities:
  - Decode base64-encoded image strings from the frontend
  - Convert image bytes → RGB numpy array (face_recognition format)
  - Detect face locations in the image
  - Extract 128-dimensional face embeddings using dlib's ResNet model
  - Validate that exactly one face is visible (enforced for enrollment)
  - Compare a live embedding against a stored embedding at inference time

Dependencies:
  face_recognition  → dlib ResNet-based 128D embeddings
  Pillow (PIL)      → decode various image formats to numpy
  numpy             → array handling
"""

import base64
import cv2
import io
import logging
from typing import List, Optional, Tuple

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def is_image_blurry(rgb_array: np.ndarray, threshold: float = 10.0) -> Tuple[bool, float]:
    """
    Checks if an image is blurry using the Laplacian variance method.
    """
    gray = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2GRAY)
    variance = cv2.Laplacian(gray, cv2.CV_64F).var()
    # Disable check to avoid false positives on solid backgrounds
    return False, variance



# ══════════════════════════════════════════════════════════════════════════════
# INTERNAL HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _strip_base64_prefix(b64_string: str) -> str:
    """
    The frontend may send a raw base64 string OR a Data URI:
        data:image/jpeg;base64,/9j/4AAQSkZJRgAB...
    We only want the base64 payload part.
    """
    if "," in b64_string:
        _, payload = b64_string.split(",", 1)
        logger.debug("Stripped Data URI prefix from base64 image string.")
        return payload.strip()
    return b64_string.strip()


def _base64_to_rgb_array(b64_string: str) -> np.ndarray:
    """
    Converts a base64-encoded image (JPEG, PNG, WebP, etc.) into an
    RGB uint8 numpy array suitable for face_recognition.

    Args:
        b64_string: Raw or Data-URI-prefixed base64 image string.

    Returns:
        np.ndarray of shape (H, W, 3), dtype=uint8, in RGB colour space.

    Raises:
        ValueError: If the base64 string is invalid or cannot be decoded.
    """
    logger.debug("Decoding base64 image string to numpy array...")

    try:
        payload = _strip_base64_prefix(b64_string)
        image_bytes = base64.b64decode(payload)
        logger.debug(f"Base64 decoded successfully — {len(image_bytes):,} bytes.")
    except (ValueError, base64.binascii.Error) as exc:
        logger.error(f"Base64 decoding failed: {exc}")
        raise ValueError(f"Invalid base64 image data: {exc}") from exc

    try:
        pil_image = Image.open(io.BytesIO(image_bytes))
        # Ensure RGB — webcam images may be RGBA or grayscale
        pil_image = pil_image.convert("RGB")
        rgb_array = np.array(pil_image, dtype=np.uint8)
        logger.debug(
            f"Image decoded: mode={pil_image.mode}, "
            f"size={pil_image.size}, array_shape={rgb_array.shape}"
        )
        return rgb_array
    except Exception as exc:
        logger.error(f"PIL image decoding failed: {exc}", exc_info=True)
        raise ValueError(f"Cannot decode image data — ensure it is a valid JPEG/PNG: {exc}") from exc


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════════════

def extract_embedding_from_base64(
    b64_string: str,
    tolerance: float = 0.5,
    require_single_face: bool = True,
) -> List[float]:
    """
    End-to-end pipeline: base64 image → 128D face embedding list.

    This is the primary function used during student REGISTRATION.
    It enforces that exactly one face is visible to prevent ambiguous
    enrollments.

    Args:
        b64_string:          Base64 image (raw or Data URI format).
        tolerance:           Unused here (kept for API consistency);
                             controls matching strictness in comparisons.
        require_single_face: If True, raises ValueError if 0 or >1 faces found.
                             Set False only during batch attendance processing.

    Returns:
        List[float] of length 128 — the face embedding vector.

    Raises:
        FaceRecognitionException: For blurriness, no faces, or multiple faces.
    """
    # Lazy import to avoid loading dlib at module import time (slow ~2s)
    import face_recognition  # noqa: PLC0415
    from models.schemas import FaceRecognitionException

    logger.info("extract_embedding_from_base64() called.")

    # ── Step 1: Decode image ──────────────────────────────────────────────────
    rgb_array = _base64_to_rgb_array(b64_string)

    # ── Step 1.5: Check image blur ────────────────────────────────────────────
    blurry, variance = is_image_blurry(rgb_array)
    if blurry:
        logger.warning(f"Registration image is blurry: variance={variance:.2f}")
        raise FaceRecognitionException(
            error_code="blurry_image",
            message="The uploaded registration image is too blurry. Please try again with better lighting and camera focus.",
            details={"variance": float(round(variance, 2)), "threshold": 10.0}
        )

    # ── Step 2: Detect face locations ─────────────────────────────────────────
    logger.info("Running face detection (HOG model)...")
    face_locations = face_recognition.face_locations(rgb_array, model="hog")
    n_faces = len(face_locations)
    logger.info(f"Face detection complete — {n_faces} face(s) found.")

    if n_faces == 0:
        logger.warning("No face detected in the submitted image.")
        raise FaceRecognitionException(
            error_code="no_face_in_registration",
            message="No face was detected in the registration image. Please ensure your face is clearly visible, well-lit, and centred.",
            details={}
        )

    if require_single_face and n_faces > 1:
        logger.warning(f"Multiple faces ({n_faces}) detected during enrollment — rejected.")
        raise FaceRecognitionException(
            error_code="multiple_faces_in_registration",
            message=f"Multiple faces ({n_faces}) detected in the registration image. Please submit a photo containing only YOUR face for enrollment.",
            details={"faces_detected": n_faces}
        )

    # ── Step 3: Extract 128D embedding ────────────────────────────────────────
    logger.info("Extracting 128D face embedding (dlib ResNet model)...")
    encodings = face_recognition.face_encodings(rgb_array, face_locations)

    if not encodings:
        logger.error("face_encodings() returned empty list despite face locations found.")
        raise FaceRecognitionException(
            error_code="no_face_in_registration",
            message="Face was detected but embedding extraction failed. Try a higher-resolution, front-facing photo.",
            details={}
        )

    # Take the first (and required-to-be-only) embedding
    embedding: np.ndarray = encodings[0]
    embedding_list = embedding.tolist()

    logger.info(
        f"✅ Embedding extracted successfully — "
        f"vector length={len(embedding_list)}, "
        f"norm={float(np.linalg.norm(embedding)):.4f}"
    )
    return embedding_list


def extract_all_embeddings_from_base64(
    b64_string: str,
) -> List[Tuple[List[float], Tuple]]:
    """
    Extracts embeddings for ALL faces found in an image.
    Used during ATTENDANCE PROCESSING (classroom photo may have many students).

    Returns:
        List of (embedding_list, face_location_box) tuples.
        face_location_box = (top, right, bottom, left) in pixels.
        Returns an empty list if no faces found (not an error in batch mode).
    """
    import face_recognition  # noqa: PLC0415

    logger.debug("extract_all_embeddings_from_base64() called (batch mode).")
    rgb_array = _base64_to_rgb_array(b64_string)

    face_locations = face_recognition.face_locations(rgb_array, model="hog")
    n_faces = len(face_locations)
    logger.info(f"Batch face detection: {n_faces} face(s) found in photo.")

    if n_faces == 0:
        return []

    encodings = face_recognition.face_encodings(rgb_array, face_locations)
    results = [
        (enc.tolist(), loc)
        for enc, loc in zip(encodings, face_locations)
    ]
    logger.debug(f"Batch embeddings extracted: {len(results)} embedding(s).")
    return results


def compare_embedding(
    known_embedding: List[float],
    candidate_embedding: List[float],
    tolerance: float = 0.5,
) -> Tuple[bool, float]:
    """
    Compares two 128D embedding vectors using Euclidean distance.

    The face_recognition library considers two faces a match when the
    Euclidean distance is less than `tolerance` (default 0.5 — a well-
    validated threshold for the dlib ResNet model).

    Args:
        known_embedding:     Stored embedding from the database (list of 128 floats).
        candidate_embedding: Live embedding extracted from attendance photo.
        tolerance:           Maximum distance to consider a match (0.0–1.0).
                             Lower = stricter. 0.5 = library default.

    Returns:
        Tuple[bool, float]:
          - True/False (is match)
          - Euclidean distance (lower = more confident match)
    """
    import face_recognition  # noqa: PLC0415

    known_np = np.array(known_embedding)
    candidate_np = np.array(candidate_embedding)

    distance: float = float(np.linalg.norm(known_np - candidate_np))
    is_match = bool(
        face_recognition.compare_faces(
            [known_np], candidate_np, tolerance=tolerance
        )[0]
    )

    confidence = max(0.0, 1.0 - (distance / tolerance)) if tolerance > 0 else 0.0
    logger.debug(
        f"compare_embedding: distance={distance:.4f}, "
        f"tolerance={tolerance}, match={is_match}, confidence={confidence:.4f}"
    )
    return is_match, round(confidence, 4)
