"""
routers/subjects.py — Subject Management Router
=================================================
Endpoints (all under /api/v1/subjects):
  POST   /                          → Teacher creates a new subject
  GET    /                          → Teacher lists their own subjects
  GET    /{subject_id}              → Get a single subject's details
  DELETE /{subject_id}              → Teacher deletes their subject
  GET    /{subject_id}/qr           → Generate enrollment QR code (PNG base64)
  POST   /enroll                    → Student self-enrolls via subject_id
  GET    /{subject_id}/students     → Teacher lists enrolled students

Access control:
  - Create / list / QR / delete / list-students → teacher only (require_teacher)
  - Enroll                                       → student only (require_student)
"""

import logging
import uuid
from typing import List

# pyrefly: ignore [missing-import]
import segno                              # QR code generation
import io
import base64
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status

from config import get_settings
from database import get_supabase_client
from models.schemas import (
    SubjectCreateRequest,
    SubjectResponse,
    EnrollmentRequest,
    StudentResponse,
    TokenData,
)
from utils.auth import require_teacher, require_student, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/subjects")
settings = get_settings()


# ══════════════════════════════════════════════════════════════════════════════
# INTERNAL HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _get_subject_or_404(subject_id: str) -> dict:
    """
    Fetches a subject by its ID. Raises HTTP 404 if not found.
    """
    client = get_supabase_client()
    logger.debug(f"Fetching subject_id='{subject_id}'...")
    try:
        response = (
            client.table("subjects")
            .select("*")
            .eq("subject_id", subject_id)
            .limit(1)
            .execute()
        )
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Subject '{subject_id}' not found.",
            )
        logger.debug(f"Subject found: {response.data[0]}")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"❌ DB fetch for subject_id='{subject_id}' failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch subject: {exc}",
        ) from exc


def _assert_teacher_owns_subject(subject: dict, teacher_id: str) -> None:
    """
    Raises HTTP 403 if the requesting teacher does not own the subject.
    """
    if str(subject.get("teacher_id")) != str(teacher_id):
        logger.warning(
            f"Forbidden: teacher_id='{teacher_id}' attempted to access "
            f"subject_id='{subject['subject_id']}' owned by teacher_id='{subject['teacher_id']}'"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this subject.",
        )


def _make_enrollment_link(subject_id: str) -> str:
    """
    Builds the enrollment deep-link URL that the QR code encodes.
    Points to the student-facing enrollment page on the frontend.
    """
    frontend_base = "http://localhost:5173"   # swapped for env var in production
    return f"{frontend_base}/enroll/{subject_id}"


def _generate_qr_base64(data: str) -> str:
    """
    Generates a QR code PNG and returns it as a base64 Data URI string.
    Uses segno which is a pure-Python library (no C dependencies).

    Args:
        data: The string to encode in the QR (typically a URL).

    Returns:
        str: 'data:image/png;base64,...' ready to embed in <img src=...>
    """
    logger.debug(f"Generating QR code for data='{data}'")
    qr = segno.make_qr(data, error="H")      # High error correction
    buf = io.BytesIO()
    qr.save(buf, kind="png", scale=8, border=2)
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode("utf-8")
    data_uri = f"data:image/png;base64,{b64}"
    logger.debug(f"QR code generated — base64 length={len(b64):,} chars")
    return data_uri


# ══════════════════════════════════════════════════════════════════════════════
# TEACHER — SUBJECT CRUD
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/",
    response_model=SubjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new subject (teacher only)",
)
async def create_subject(
    payload: SubjectCreateRequest,
    current_teacher: TokenData = Depends(require_teacher),
):
    """
    Creates a new subject and associates it with the authenticated teacher.

    The `enrollment_link` in the response is the URL that students
    scan (via QR) or visit directly to self-enroll in this subject.
    """
    logger.info(
        f"[CREATE SUBJECT] teacher_id='{current_teacher.user_id}' "
        f"creating subject: code='{payload.subject_code}', name='{payload.name}', "
        f"section='{payload.section}'"
    )

    client = get_supabase_client()
    row = {
        "subject_code": payload.subject_code,
        "name": payload.name,
        "section": payload.section,
        "teacher_id": current_teacher.user_id,
    }

    try:
        response = client.table("subjects").insert(row).execute()
        if not response.data:
            raise RuntimeError("Insert returned no data.")
        inserted = response.data[0]
        # Coerce the database-generated bigint ID into a string
        subject_id = str(inserted["subject_id"])
        logger.info(
            f"✅ [CREATE SUBJECT] subject_id='{subject_id}' created by "
            f"teacher_id='{current_teacher.user_id}'"
        )
    except Exception as exc:
        logger.error(f"❌ [CREATE SUBJECT] DB insert failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create subject: {exc}",
        ) from exc

    enrollment_link = _make_enrollment_link(subject_id)
    return SubjectResponse(
        subject_id=subject_id,
        subject_code=inserted["subject_code"],
        name=inserted["name"],
        section=inserted["section"],
        teacher_id=inserted["teacher_id"],
        enrollment_link=enrollment_link,
        enrolled_count=0,
    )


@router.get(
    "/",
    response_model=List[SubjectResponse],
    summary="List all subjects (teacher's own or student's enrolled)",
)
async def list_subjects(
    current_user: TokenData = Depends(get_current_user),
):
    """
    Returns all subjects belonging to the authenticated teacher (if teacher)
    or enrolled subjects (if student).
    """
    client = get_supabase_client()
    if current_user.role == "teacher":
        logger.info(f"[LIST SUBJECTS] teacher_id='{current_user.user_id}'")
        try:
            response = (
                client.table("subjects")
                .select("*")
                .eq("teacher_id", current_user.user_id)
                .order("subject_id", desc=True)
                .execute()
            )
            rows = response.data or []
            logger.info(f"[LIST SUBJECTS] Found {len(rows)} subject(s).")

            # Fetch enrollment counts
            enroll_resp = (
                client.table("subject_students")
                .select("subject_id")
                .execute()
            )
            from collections import Counter
            counts = Counter(str(e["subject_id"]) for e in (enroll_resp.data or []))
        except Exception as exc:
            logger.error(f"❌ [LIST SUBJECTS] DB query failed: {exc}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch subjects: {exc}",
            ) from exc

        return [
            SubjectResponse(
                subject_id=r["subject_id"],
                subject_code=r["subject_code"],
                name=r["name"],
                section=r["section"],
                teacher_id=r["teacher_id"],
                enrollment_link=_make_enrollment_link(r["subject_id"]),
                enrolled_count=counts.get(str(r["subject_id"]), 0),
            )
            for r in rows
        ]
    elif current_user.role == "student":
        logger.info(f"[LIST SUBJECTS] student_id='{current_user.user_id}'")
        try:
            # Get enrolled subject IDs
            enroll_resp = (
                client.table("subject_students")
                .select("subject_id")
                .eq("student_id", current_user.user_id)
                .execute()
            )
            subject_ids = [e["subject_id"] for e in (enroll_resp.data or [])]
            logger.info(f"[LIST SUBJECTS] Student enrolled in {len(subject_ids)} subject(s).")

            if not subject_ids:
                return []

            # Fetch subjects details
            subjects_resp = (
                client.table("subjects")
                .select("*")
                .in_("subject_id", subject_ids)
                .execute()
            )
            rows = subjects_resp.data or []

            # Fetch enrollment counts for these subjects
            enroll_counts_resp = (
                client.table("subject_students")
                .select("subject_id")
                .in_("subject_id", subject_ids)
                .execute()
            )
            from collections import Counter
            counts = Counter(str(e["subject_id"]) for e in (enroll_counts_resp.data or []))
        except Exception as exc:
            logger.error(f"❌ [LIST SUBJECTS] Student DB query failed: {exc}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch enrolled subjects: {exc}",
            ) from exc

        return [
            SubjectResponse(
                subject_id=r["subject_id"],
                subject_code=r["subject_code"],
                name=r["name"],
                section=r["section"],
                teacher_id=r["teacher_id"],
                enrollment_link=_make_enrollment_link(r["subject_id"]),
                enrolled_count=counts.get(str(r["subject_id"]), 0),
            )
            for r in rows
        ]
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Role not authorized to list subjects.",
        )


@router.get(
    "/{subject_id}",
    response_model=SubjectResponse,
    summary="Get details of a single subject",
)
async def get_subject(
    subject_id: str,
    current_teacher: TokenData = Depends(require_teacher),
):
    """Returns full details of a subject. Teacher must own it."""
    logger.info(f"[GET SUBJECT] subject_id='{subject_id}' by teacher_id='{current_teacher.user_id}'")
    subject = _get_subject_or_404(subject_id)
    _assert_teacher_owns_subject(subject, current_teacher.user_id)

    client = get_supabase_client()
    enroll_resp = (
        client.table("subject_students")
        .select("student_id")
        .eq("subject_id", subject_id)
        .execute()
    )
    enrolled_count = len(enroll_resp.data or [])

    return SubjectResponse(
        subject_id=subject["subject_id"],
        subject_code=subject["subject_code"],
        name=subject["name"],
        section=subject["section"],
        teacher_id=subject["teacher_id"],
        enrollment_link=_make_enrollment_link(subject["subject_id"]),
        enrolled_count=enrolled_count,
    )


@router.delete(
    "/{subject_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a subject (teacher only)",
)
async def delete_subject(
    subject_id: str,
    current_teacher: TokenData = Depends(require_teacher),
):
    """
    Permanently deletes a subject and all associated enrollment records.
    Attendance logs referencing this subject are also cascade-deleted
    (enforced at the DB level via ON DELETE CASCADE).
    """
    logger.info(
        f"[DELETE SUBJECT] teacher_id='{current_teacher.user_id}' "
        f"deleting subject_id='{subject_id}'"
    )
    subject = _get_subject_or_404(subject_id)
    _assert_teacher_owns_subject(subject, current_teacher.user_id)

    client = get_supabase_client()
    try:
        client.table("subjects").delete().eq("subject_id", subject_id).execute()
        logger.info(f"✅ [DELETE SUBJECT] subject_id='{subject_id}' deleted.")
    except Exception as exc:
        logger.error(f"❌ [DELETE SUBJECT] DB delete failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete subject: {exc}",
        ) from exc


# ══════════════════════════════════════════════════════════════════════════════
# TEACHER — QR CODE GENERATION
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/{subject_id}/qr",
    summary="Get QR code (PNG base64) for student enrollment",
)
async def get_enrollment_qr(
    subject_id: str,
    current_teacher: TokenData = Depends(require_teacher),
):
    """
    Returns a base64-encoded PNG QR code that encodes the enrollment deep-link.
    The frontend renders this in an <img> tag during the class session.

    Response format:
        {
            "subject_id": "...",
            "enrollment_link": "http://localhost:5173/enroll/<subject_id>",
            "qr_code_base64": "data:image/png;base64,..."
        }
    """
    logger.info(
        f"[QR CODE] Generating QR for subject_id='{subject_id}' "
        f"requested by teacher_id='{current_teacher.user_id}'"
    )
    subject = _get_subject_or_404(subject_id)
    _assert_teacher_owns_subject(subject, current_teacher.user_id)

    enrollment_link = _make_enrollment_link(subject_id)
    qr_base64 = _generate_qr_base64(enrollment_link)

    logger.info(f"✅ [QR CODE] QR code generated for subject_id='{subject_id}'")
    return {
        "subject_id": subject_id,
        "subject_name": subject["name"],
        "enrollment_link": enrollment_link,
        "qr_code_base64": qr_base64,
    }


# ══════════════════════════════════════════════════════════════════════════════
# STUDENT — SELF-ENROLL
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/enroll",
    status_code=status.HTTP_201_CREATED,
    summary="Student self-enrolls in a subject via subject_id or subject_code",
)
async def enroll_in_subject(
    payload: EnrollmentRequest,
    current_student: TokenData = Depends(require_student),
):
    """
    Registers a student into a subject.

    Flow:
      1. Verify the subject exists (by subject_id or subject_code).
      2. Check the student isn't already enrolled (idempotency guard).
      3. Insert a row into `subject_students` (subject_id, student_id).
    """
    logger.info(
        f"[ENROLL] student_id='{current_student.user_id}' "
        f"enrolling. ID='{payload.subject_id}', Code='{payload.subject_code}'"
    )

    client = get_supabase_client()

    # ── Step 1: Subject must exist ────────────────────────────────────────────
    target_id_or_code = None
    if payload.subject_id:
        target_id_or_code = payload.subject_id
    elif payload.subject_code:
        target_id_or_code = payload.subject_code

    if not target_id_or_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either subject_id or subject_code must be provided.",
        )

    # Detect if target_id_or_code is a valid UUID
    import uuid
    is_uuid = False
    try:
        uuid.UUID(str(target_id_or_code).strip())
        is_uuid = True
    except ValueError:
        pass

    if is_uuid:
        subject = _get_subject_or_404(str(target_id_or_code).strip())
        subject_id = str(subject["subject_id"])
    else:
        # Treat as subject_code
        try:
            response = (
                client.table("subjects")
                .select("*")
                .eq("subject_code", str(target_id_or_code).strip())
                .limit(1)
                .execute()
            )
            if not response.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Subject with code '{target_id_or_code}' not found.",
                )
            subject = response.data[0]
            subject_id = str(subject["subject_id"])
        except HTTPException:
            raise
        except Exception as exc:
            logger.error(f"❌ [ENROLL] DB fetch for subject_code='{target_id_or_code}' failed: {exc}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch subject: {exc}",
            ) from exc

    # ── Step 2: Already-enrolled idempotency check ────────────────────────────
    try:
        existing = (
            client.table("subject_students")
            .select("subject_id")
            .eq("subject_id", subject_id)
            .eq("student_id", current_student.user_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            logger.info(
                f"[ENROLL] student_id='{current_student.user_id}' is already "
                f"enrolled in subject_id='{subject_id}' — returning 200."
            )
            return {
                "message": "You are already enrolled in this subject.",
                "subject_id": subject_id,
                "subject_name": subject["name"],
                "already_enrolled": True,
            }
    except Exception as exc:
        logger.error(f"❌ [ENROLL] Idempotency check failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify enrollment: {exc}",
        ) from exc

    # ── Step 3: Insert enrollment ─────────────────────────────────────────────
    try:
        response = client.table("subject_students").insert({
            "subject_id": subject_id,
            "student_id": current_student.user_id,
        }).execute()
        logger.info(
            f"✅ [ENROLL] Student student_id='{current_student.user_id}' "
            f"enrolled in subject_id='{subject_id}'"
        )
    except Exception as exc:
        logger.error(f"❌ [ENROLL] DB insert failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to enroll: {exc}",
        ) from exc

    return {
        "message": f"Successfully enrolled in '{subject['name']}'.",
        "subject_id": subject_id,
        "subject_name": subject["name"],
        "already_enrolled": False,
    }


# ══════════════════════════════════════════════════════════════════════════════
# TEACHER — LIST ENROLLED STUDENTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/{subject_id}/students",
    response_model=List[StudentResponse],
    summary="List students enrolled in a subject (teacher only)",
)
async def list_enrolled_students(
    subject_id: str,
    current_teacher: TokenData = Depends(require_teacher),
):
    """
    Returns all students enrolled in the given subject.

    Query strategy:
      1. Fetch all enrollment rows for this subject.
      2. Extract student_ids.
      3. Fetch student details (name, username) in a single IN query.

    This keeps the data model normalised while avoiding N+1 queries.
    """
    logger.info(
        f"[LIST STUDENTS] subject_id='{subject_id}' "
        f"requested by teacher_id='{current_teacher.user_id}'"
    )

    subject = _get_subject_or_404(subject_id)
    _assert_teacher_owns_subject(subject, current_teacher.user_id)

    client = get_supabase_client()

    # ── Fetch all enrollment rows ──────────────────────────────────────────────
    try:
        enroll_resp = (
            client.table("subject_students")
            .select("student_id")
            .eq("subject_id", subject_id)
            .execute()
        )
        enrollment_rows = enroll_resp.data or []
        student_ids = [r["student_id"] for r in enrollment_rows]
        logger.info(
            f"[LIST STUDENTS] {len(student_ids)} enrolled student(s) for "
            f"subject_id='{subject_id}'"
        )
    except Exception as exc:
        logger.error(f"❌ [LIST STUDENTS] Enrollment fetch failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch enrolled students: {exc}",
        ) from exc

    if not student_ids:
        logger.info("[LIST STUDENTS] No enrolled students — returning empty list.")
        return []

    # ── Fetch student details in one batch query ──────────────────────────────
    try:
        students_resp = (
            client.table("students")
            .select("student_id, username, name")
            .in_("student_id", student_ids)
            .execute()
        )
        students = students_resp.data or []
        logger.info(f"[LIST STUDENTS] Fetched {len(students)} student record(s).")
    except Exception as exc:
        logger.error(f"❌ [LIST STUDENTS] Student batch fetch failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch student details: {exc}",
        ) from exc

    return [
        StudentResponse(
            student_id=s["student_id"],
            username=s["username"],
            name=s["name"],
            has_face_embedding=True,   # only enrolled students have completed registration
        )
        for s in students
    ]
