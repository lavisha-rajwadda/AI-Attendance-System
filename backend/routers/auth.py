"""
routers/auth.py — Authentication Router
=========================================
Endpoints:
  POST /api/v1/auth/teacher/register   → Create teacher account
  POST /api/v1/auth/teacher/login      → Teacher login → JWT
  POST /api/v1/auth/student/register   → Create student account + extract face embedding
  POST /api/v1/auth/student/login      → Student login → JWT
  GET  /api/v1/auth/me                 → Decode token → return current user info

Design decisions:
  - All passwords are bcrypt-hashed BEFORE storage (never store plaintext).
  - Face embeddings are stored as JSON arrays in the `face_embedding` column.
  - Supabase service-role client is used (bypasses RLS) since our JWT is the
    authorisation layer.
  - Duplicate username check is done BEFORE hashing to return a fast 409.
  - All Supabase errors are caught and re-raised as clean HTTPExceptions.
"""

import logging
import uuid
from typing import Any, Dict

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status

from config import get_settings
from database import get_supabase_client
from models.schemas import (
    TeacherRegisterRequest,
    TeacherLoginRequest,
    TeacherResponse,
    StudentRegisterRequest,
    StudentLoginRequest,
    StudentResponse,
    TokenResponse,
    TokenData,
    FaceRecognitionException,
)
from utils.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from services.face_service import extract_embedding_from_base64

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth")

settings = get_settings()


# ══════════════════════════════════════════════════════════════════════════════
# INTERNAL HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _supabase_insert(table: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Inserts a single row into a Supabase table and returns the inserted row.
    Wraps Supabase errors in a clean HTTPException.

    Args:
        table: Supabase table name.
        data:  Dict of column → value pairs.

    Returns:
        The inserted row as a dict.

    Raises:
        HTTPException 500 on Supabase failure.
    """
    client = get_supabase_client()
    logger.debug(f"Inserting row into '{table}': {list(data.keys())}")
    try:
        response = client.table(table).insert(data).execute()
        if not response.data:
            raise RuntimeError("Supabase insert returned no data.")
        logger.info(f"✅ Row inserted into '{table}' successfully.")
        return response.data[0]
    except Exception as exc:
        logger.error(f"❌ Supabase insert into '{table}' failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database write failed. Please try again. [{exc}]",
        ) from exc


def _supabase_fetch_by_username(table: str, username: str) -> Dict[str, Any] | None:
    """
    Fetches a single row by username from the given table.
    Returns None if no row found.

    Args:
        table:    Supabase table name ('teachers' or 'students').
        username: The username to look up.

    Returns:
        Row dict or None.
    """
    client = get_supabase_client()
    logger.debug(f"Fetching '{username}' from '{table}'...")
    try:
        response = (
            client.table(table)
            .select("*")
            .eq("username", username)
            .limit(1)
            .execute()
        )
        if response.data:
            logger.debug(f"User '{username}' found in '{table}'.")
            return response.data[0]
        logger.debug(f"User '{username}' NOT found in '{table}'.")
        return None
    except Exception as exc:
        logger.error(f"❌ Supabase fetch from '{table}' failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database read failed. Please try again. [{exc}]",
        ) from exc


def _check_username_available(table: str, username: str) -> None:
    """
    Raises HTTP 409 Conflict if the username is already taken in the given table.
    """
    existing = _supabase_fetch_by_username(table, username)
    if existing:
        logger.warning(f"Registration conflict: username '{username}' already exists in '{table}'.")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{username}' is already taken. Please choose a different one.",
        )


def _verify_credentials(
    table: str,
    username: str,
    password: str,
    id_field: str,
) -> Dict[str, Any]:
    """
    Generic credential verification used by both teacher and student login.

    1. Fetches user by username (404 if not found).
    2. Verifies bcrypt password (401 if wrong).

    Returns the full user row on success.
    """
    user = _supabase_fetch_by_username(table, username)

    if not user:
        logger.warning(f"Login failed: username '{username}' not found in '{table}'.")
        # Return same error as wrong password to prevent user enumeration
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    if not verify_password(password, user["password_hash"]):
        logger.warning(f"Login failed: wrong password for username '{username}'.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    logger.info(f"✅ Credentials verified for username='{username}' in '{table}'.")
    return user


# ══════════════════════════════════════════════════════════════════════════════
# TEACHER ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/teacher/register",
    response_model=TeacherResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new teacher account",
)
async def teacher_register(payload: TeacherRegisterRequest):
    """
    Creates a new teacher account.

    Flow:
      1. Validate that username is not already taken.
      2. Hash the password with bcrypt.
      3. Insert the new teacher row into the `teachers` table.
      4. Return the created teacher (without the password hash).

    The teacher_id is generated server-side (UUID4) to avoid client tampering.
    """
    logger.info(f"[TEACHER REGISTER] Incoming request for username='{payload.username}'")

    # ── Step 1: Uniqueness check ──────────────────────────────────────────────
    _check_username_available("teachers", payload.username)

    # ── Step 2: Hash password ─────────────────────────────────────────────────
    logger.debug(f"Hashing password for username='{payload.username}'...")
    hashed_pw = hash_password(payload.password)
    logger.debug("Password hashed successfully.")

    # ── Step 3: Build row & insert ────────────────────────────────────────────
    row = {
        "username": payload.username,
        "password_hash": hashed_pw,
        "name": payload.name,
    }
    inserted = _supabase_insert("teachers", row)

    logger.info(
        f"✅ [TEACHER REGISTER] New teacher created: "
        f"teacher_id={inserted['teacher_id']}, username='{payload.username}'"
    )

    return TeacherResponse(
        teacher_id=inserted["teacher_id"],
        username=inserted["username"],
        name=inserted["name"],
    )


@router.post(
    "/teacher/login",
    response_model=TokenResponse,
    summary="Authenticate a teacher and receive a JWT",
)
async def teacher_login(payload: TeacherLoginRequest):
    """
    Authenticates a teacher using username + password.

    Returns a JWT that encodes:
      - sub   : teacher_id
      - role  : "teacher"
      - exp   : access_token_expire_minutes from settings

    The frontend stores this token and sends it as
    `Authorization: Bearer <token>` on subsequent requests.
    """
    logger.info(f"[TEACHER LOGIN] Attempt for username='{payload.username}'")

    teacher = _verify_credentials(
        table="teachers",
        username=payload.username,
        password=payload.password,
        id_field="teacher_id",
    )

    token = create_access_token(data={
        "sub": teacher["teacher_id"],
        "role": "teacher",
    })

    logger.info(
        f"✅ [TEACHER LOGIN] Token issued for "
        f"teacher_id={teacher['teacher_id']}, username='{payload.username}'"
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role="teacher",
        user_id=teacher["teacher_id"],
        name=teacher["name"],
    )


# ══════════════════════════════════════════════════════════════════════════════
# STUDENT ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/student/register",
    response_model=StudentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new student account (with face enrollment)",
)
async def student_register(payload: StudentRegisterRequest):
    """
    Creates a new student account AND extracts a 128D face embedding
    from the provided webcam image for future attendance recognition.

    Flow:
      1. Validate username uniqueness.
      2. Decode the base64 image and extract a 128D face embedding.
         - Exactly ONE face must be visible (enforced).
         - Raises 422 if no face or multiple faces detected.
      3. Hash the password with bcrypt.
      4. Insert student row (including face_embedding JSON) into `students` table.
      5. Return the created student.

    Why store the embedding and not the image?
      Embedding storage is O(128 floats) vs O(W×H×3 bytes) for raw image.
      Embeddings are also privacy-preserving (cannot reconstruct the face).
    """
    logger.info(f"[STUDENT REGISTER] Incoming request for username='{payload.username}'")

    # ── Step 1: Uniqueness check ──────────────────────────────────────────────
    _check_username_available("students", payload.username)

    # ── Step 2: Face embedding extraction ────────────────────────────────────
    logger.info(f"[STUDENT REGISTER] Extracting face embedding for username='{payload.username}'...")
    try:
        embedding = extract_embedding_from_base64(
            b64_string=payload.face_image_base64,
            tolerance=settings.face_detection_tolerance,
            require_single_face=True,
        )
        logger.info(
            f"[STUDENT REGISTER] Embedding extracted — "
            f"vector_length={len(embedding)}"
        )
    except FaceRecognitionException:
        raise
    except ValueError as exc:
        logger.warning(f"[STUDENT REGISTER] Face extraction failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    # ── Step 3: Hash password ─────────────────────────────────────────────────
    logger.debug(f"Hashing password for student username='{payload.username}'...")
    hashed_pw = hash_password(payload.password)

    # ── Step 4: Build row & insert ────────────────────────────────────────────
    row = {
        "username": payload.username,
        "password_hash": hashed_pw,
        "name": payload.name,
        "face_embedding": embedding,   # stored as JSON array in Supabase
    }
    inserted = _supabase_insert("students", row)

    logger.info(
        f"✅ [STUDENT REGISTER] New student created: "
        f"student_id={inserted['student_id']}, username='{payload.username}', "
        f"face_embedding_stored=True"
    )

    return StudentResponse(
        student_id=inserted["student_id"],
        username=inserted["username"],
        name=inserted["name"],
        has_face_embedding=True,
    )


@router.post(
    "/student/login",
    response_model=TokenResponse,
    summary="Authenticate a student and receive a JWT",
)
async def student_login(payload: StudentLoginRequest):
    """
    Authenticates a student using username + password.
    Returns a JWT encoding student_id and role='student'.
    """
    logger.info(f"[STUDENT LOGIN] Attempt for username='{payload.username}'")

    student = _verify_credentials(
        table="students",
        username=payload.username,
        password=payload.password,
        id_field="student_id",
    )

    token = create_access_token(data={
        "sub": student["student_id"],
        "role": "student",
    })

    logger.info(
        f"✅ [STUDENT LOGIN] Token issued for "
        f"student_id={student['student_id']}, username='{payload.username}'"
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role="student",
        user_id=student["student_id"],
        name=student["name"],
    )


# ══════════════════════════════════════════════════════════════════════════════
# SHARED — /me endpoint
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/me",
    summary="Return the current authenticated user's identity",
)
async def get_me(current_user: TokenData = Depends(get_current_user)):
    """
    Returns the decoded JWT payload — useful for the frontend to verify
    authentication state and determine which UI variant to show
    (teacher dashboard vs. student portal).

    Does NOT query the database — purely token-based.
    """
    logger.info(
        f"[GET /me] user_id={current_user.user_id}, role={current_user.role}"
    )
    return {
        "user_id": current_user.user_id,
        "role": current_user.role,
    }
