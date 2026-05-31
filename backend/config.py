"""
config.py — Centralised Application Configuration
===================================================
Uses pydantic-settings to load and validate all environment variables
from the .env file at startup. Any missing required variable will raise
a clear ValidationError immediately, preventing silent misconfigurations.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl, field_validator
from typing import List


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables / .env file.
    All fields are validated by Pydantic at startup.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # silently ignore unknown env vars
    )

    # ── Supabase ──────────────────────────────────────────────────────────
    supabase_url: AnyHttpUrl
    supabase_service_role_key: str

    # ── JWT Auth ──────────────────────────────────────────────────────────
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440  # 24 hours

    # ── Application ───────────────────────────────────────────────────────
    app_env: str = "development"
    log_level: str = "DEBUG"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # ── ML Configuration ──────────────────────────────────────────────────
    svm_kernel: str = "rbf"
    svm_probability: bool = True
    face_detection_tolerance: float = 0.5
    min_enrollment_faces: int = 1

    @field_validator("app_env")
    @classmethod
    def validate_app_env(cls, v: str) -> str:
        allowed = {"development", "production", "testing"}
        if v.lower() not in allowed:
            raise ValueError(f"app_env must be one of {allowed}")
        return v.lower()

    @field_validator("face_detection_tolerance")
    @classmethod
    def validate_tolerance(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("face_detection_tolerance must be between 0.0 and 1.0")
        return v

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse the comma-separated CORS string into a Python list."""
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Returns a cached Settings singleton.
    Uses lru_cache so the .env file is only read once on first call,
    and the same object is reused for all subsequent calls.
    """
    return Settings()
