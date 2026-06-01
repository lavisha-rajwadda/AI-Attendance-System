"""
utils/auth.py — JWT & Password Utilities
==========================================
Centralises all auth logic:
  - bcrypt password hashing / verification
  - JWT access token creation & decoding
  - FastAPI dependency for extracting the current authenticated user
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
# pyrefly: ignore [missing-import]  
from fastapi import Depends, HTTPException, status, APIRouter
# pyrefly: ignore [missing-import]
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
# pyrefly: ignore [missing-import]
from passlib.context import CryptContext    

from config import get_settings
from models.schemas import TokenData
# pyrefly: ignore [missing-import]
from fastapi import APIRouter

logger = logging.getLogger(__name__)

# ── ROUTER INITIALIZATION ─────────────────────────────────────────────────────
# This is the exact variable that main.py is looking for!
router = APIRouter()

@router.post("/teacher/register")
def register_teacher():
    return {"message": "Teacher registered successfully!", "success": True}
# ──────────────────────────────────────────────────────────────────────────────

# ── Password hashing ──────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Password hashing ──────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── JWT bearer scheme ─────────────────────────────────────────────────────────
bearer_scheme = HTTPBearer()


def hash_password(plain_password: str) -> str:
    """Returns bcrypt hash of the given plain-text password."""
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain-text password against its bcrypt hash.
    Returns True if they match, False otherwise.
    """
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Creates a signed JWT access token.

    Args:
        data: Payload dict (must include 'sub' and 'role').
        expires_delta: Custom expiry. Defaults to settings value.

    Returns:
        Encoded JWT string.
    """
    settings = get_settings()
    to_encode = data.copy()

    # Guarantee that the sub claim is serialized as a string
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])

    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire})

    encoded_jwt = jwt.encode(
        to_encode,
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    logger.debug(f"Created access token for user_id={data.get('sub')} role={data.get('role')}")
    return encoded_jwt


def decode_access_token(token: str) -> TokenData:
    """
    Decodes and validates a JWT token.

    Returns:
        TokenData with user_id and role.
    Raises:
        HTTPException 401: If token is invalid or expired.
    """
    settings = get_settings()
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials. Token is invalid or expired.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
        user_id: str = payload.get("sub")
        role: str = payload.get("role")

        if user_id is None or role is None:
            logger.warning("JWT decode failed: missing 'sub' or 'role' in payload.")
            raise credentials_exception

        logger.debug(f"JWT decoded successfully: user_id={user_id}, role={role}")
        return TokenData(user_id=user_id, role=role)

    except JWTError as exc:
        logger.warning(f"JWT validation error: {exc}")
        raise credentials_exception from exc


# ── FastAPI Dependencies ───────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> TokenData:
    """
    FastAPI dependency: extracts and validates the Bearer token
    from the Authorization header. Inject into any protected route.
    """
    return decode_access_token(credentials.credentials)


def require_teacher(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    """
    FastAPI dependency: ensures the authenticated user is a teacher.
    Raises 403 if not.
    """
    if current_user.role != "teacher":
        logger.warning(
            f"Forbidden: user_id={current_user.user_id} "
            f"(role={current_user.role}) attempted a teacher-only action."
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: this endpoint requires teacher privileges.",
        )
    return current_user


def require_student(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    """
    FastAPI dependency: ensures the authenticated user is a student.
    Raises 403 if not.
    """
    if current_user.role != "student":
        logger.warning(
            f"Forbidden: user_id={current_user.user_id} "
            f"(role={current_user.role}) attempted a student-only action."
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: this endpoint requires student privileges.",
        )
    return current_user
