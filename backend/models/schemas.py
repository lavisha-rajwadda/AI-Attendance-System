"""
models/schemas.py — Pydantic Request & Response Models
=======================================================
All FastAPI endpoint I/O is typed here. Separating schemas from
business logic keeps routers thin and makes validation automatic.

Naming convention:
  - *Request  → incoming payload (POST/PUT body)
  - *Response → outgoing payload
  - *DB       → internal model matching DB row structure
"""

from __future__ import annotations
from datetime import datetime
from typing import List, Optional
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field, field_validator, BeforeValidator
from typing import Annotated
import re

CoercedStr = Annotated[str, BeforeValidator(lambda v: str(v) if v is not None else v)]


# ══════════════════════════════════════════════════════════════════════════════
# AUTH — Teacher
# ══════════════════════════════════════════════════════════════════════════════

class TeacherRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=72)
    name: str = Field(..., min_length=2, max_length=100)

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username must be alphanumeric (underscores allowed).")
        return v.lower()


class TeacherLoginRequest(BaseModel):
    username: str
    password: str


class TeacherResponse(BaseModel):
    teacher_id: CoercedStr
    username: str
    name: str


# ══════════════════════════════════════════════════════════════════════════════
# AUTH — Student
# ══════════════════════════════════════════════════════════════════════════════

class StudentRegisterRequest(BaseModel):
    """
    Student registration payload.
    The face_image field accepts a base64-encoded JPEG/PNG string
    captured from the webcam on the frontend.
    """
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=2, max_length=100)
    face_image_base64: str = Field(
        ...,
        description="Base64-encoded image string (no data:image/... prefix needed)",
    )

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username must be alphanumeric (underscores allowed).")
        return v.lower()


class StudentLoginRequest(BaseModel):
    username: str
    password: str


class StudentResponse(BaseModel):
    student_id: CoercedStr
    username: str
    name: str
    has_face_embedding: bool


# ══════════════════════════════════════════════════════════════════════════════
# JWT Token
# ══════════════════════════════════════════════════════════════════════════════

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str          # "teacher" | "student"
    user_id: CoercedStr
    name: str


class TokenData(BaseModel):
    """Internal model for decoded JWT payload."""
    user_id: CoercedStr
    role: str          # "teacher" | "student"


# ══════════════════════════════════════════════════════════════════════════════
# SUBJECTS
# ══════════════════════════════════════════════════════════════════════════════

class SubjectCreateRequest(BaseModel):
    subject_code: str = Field(..., min_length=2, max_length=20)
    name: str = Field(..., min_length=2, max_length=100)
    section: str = Field(..., min_length=1, max_length=10)


class SubjectResponse(BaseModel):
    subject_id: CoercedStr
    subject_code: str
    name: str
    section: str
    teacher_id: Optional[CoercedStr] = None
    enrollment_link: Optional[str] = None   # populated by endpoint
    enrolled_count: Optional[int] = 0       # count of enrolled students


class EnrollmentRequest(BaseModel):
    """Student self-enrolls using subject_id or subject_code."""
    subject_id: Optional[CoercedStr] = None
    subject_code: Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════════
# ATTENDANCE
# ══════════════════════════════════════════════════════════════════════════════

class AttendanceProcessRequest(BaseModel):
    """
    Teacher submits a subject_id; images are sent as multipart/form-data
    (handled separately in the router). This schema is for the JSON part.
    """
    subject_id: CoercedStr


class StudentAttendanceRecord(BaseModel):
    """Single student's attendance status in the temporary report."""
    student_id: CoercedStr
    name: str
    username: str
    is_present: bool
    confidence: Optional[float] = None   # SVM probability score (0–1)
    detected_in_photos: List[int] = []   # Indices of photos where detected


class AttendanceReportResponse(BaseModel):
    """Temporary in-memory report returned to teacher for review."""
    subject_id: CoercedStr
    subject_name: str
    total_enrolled: int
    total_present: int
    total_absent: int
    records: List[StudentAttendanceRecord]
    processed_photos: int
    faces_detected: int


class AttendanceConfirmRequest(BaseModel):
    """
    Teacher reviews the report and clicks 'Confirm'.
    The frontend sends back the final records to persist.
    """
    subject_id: CoercedStr
    records: List[StudentAttendanceRecord]


class AttendanceLogResponse(BaseModel):
    """Single row from attendance_logs table."""
    id: CoercedStr
    timestamp: datetime
    subject_id: CoercedStr
    student_id: CoercedStr
    is_present: bool


class AttendanceConfirmResponse(BaseModel):
    message: str
    logs_created: int


# ══════════════════════════════════════════════════════════════════════════════
# GENERIC
# ══════════════════════════════════════════════════════════════════════════════

class HealthResponse(BaseModel):
    status: str
    db: str
    environment: str
    version: str


class ErrorResponse(BaseModel):
    detail: str
    code: Optional[str] = None


class FaceRecognitionException(Exception):
    def __init__(self, error_code: str, message: str, details: dict = None):
        self.error_code = error_code
        self.message = message
        self.details = details or {}
        super().__init__(message)

