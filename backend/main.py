"""
main.py — FastAPI Application Entry Point
==========================================
Responsibilities:
  - Configure structured logging BEFORE anything else imports logging
  - Create the FastAPI app with lifespan context (startup/shutdown)
  - Register CORS middleware
  - Mount all routers under versioned prefix /api/v1
  - Expose /health and /api/v1/health endpoints
  - Global exception handler for clean error responses

Run with:
    uvicorn main:app --reload --port 8000
"""

import logging
import logging.config
import sys
from contextlib import asynccontextmanager

# pyrefly: ignore [missing-import]
from fastapi import FastAPI, Request, status
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from fastapi.responses import JSONResponse

from config import get_settings
from database import get_supabase_client, health_check
from models.schemas import HealthResponse, ErrorResponse, FaceRecognitionException


# ══════════════════════════════════════════════════════════════════════════════
# LOGGING SETUP
# Configure logging as the very first action so all subsequent imports
# inherit the correct handlers and formatters.
# ══════════════════════════════════════════════════════════════════════════════

def configure_logging(log_level: str = "DEBUG") -> None:
    """
    Configures the root logger with a consistent format that includes:
    timestamp, log level, module name, and message.
    Outputs to stdout so Docker / systemd / uvicorn can capture it.
    """
    log_format = (
        "%(asctime)s | %(levelname)-8s | %(name)-25s | %(message)s"
    )
    date_format = "%Y-%m-%d %H:%M:%S"

    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.DEBUG),
        format=log_format,
        datefmt=date_format,
        stream=sys.stdout,
        force=True,       # Override any previously set handlers (e.g. uvicorn's)
    )

    # Silence noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("hpack").setLevel(logging.WARNING)
    logging.getLogger("multipart").setLevel(logging.WARNING)


# Initialise logging immediately at module load time
_settings = get_settings()
configure_logging(_settings.log_level)

logger = logging.getLogger(__name__)
logger.info("=" * 60)
logger.info("  Snap Attendance — AI Attendance System")
logger.info("=" * 60)
logger.info(f"  Environment : {_settings.app_env.upper()}")
logger.info(f"  Log Level   : {_settings.log_level}")
logger.info(f"  Supabase    : {_settings.supabase_url}")
logger.info("=" * 60)


# ══════════════════════════════════════════════════════════════════════════════
# LIFESPAN — Startup & Shutdown Events
# ══════════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages application lifecycle:
      STARTUP  → validate DB connection, warm up Supabase client
      SHUTDOWN → log graceful shutdown (Supabase HTTP client is stateless)
    """
    # ── STARTUP ──────────────────────────────────────────────────────────────
    logger.info("🚀 Application startup sequence initiated...")

    try:
        # Force Supabase client creation (validates credentials immediately)
        get_supabase_client()
        logger.info("✅ Supabase client created and cached.")

        # Ping the database to confirm connectivity
        await health_check()
        logger.info("✅ Database connectivity confirmed.")

    except RuntimeError as exc:
        logger.critical(
            f"❌ FATAL: Startup failed — {exc}. Shutting down.",
            exc_info=True,
        )
        # Re-raise to prevent the app from starting in a broken state
        raise

    logger.info("🎉 Application is ready to serve requests.")
    yield

    # ── SHUTDOWN ──────────────────────────────────────────────────────────────
    logger.info("🛑 Application shutdown sequence initiated...")
    logger.info("✅ Graceful shutdown complete.")


# ══════════════════════════════════════════════════════════════════════════════
# APP FACTORY
# ══════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="Snap Attendance — AI Attendance API",
    description=(
        "A production-ready intelligent attendance system powered by "
        "face recognition (dlib/ResNet) and SVM classification."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)


# ══════════════════════════════════════════════════════════════════════════════
# MIDDLEWARE
# ══════════════════════════════════════════════════════════════════════════════

app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info(f"CORS configured for origins: {_settings.cors_origins_list}")


# ── Request Logging Middleware ─────────────────────────────────────────────────
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """
    Logs every incoming request and its response status code.
    Helps trace the full request lifecycle in the terminal.
    """
    logger.info(
        f"→ {request.method} {request.url.path} "
        f"[client: {request.client.host if request.client else 'unknown'}]"
    )
    response = await call_next(request)
    logger.info(
        f"← {request.method} {request.url.path} "
        f"[status: {response.status_code}]"
    )
    return response


# ══════════════════════════════════════════════════════════════════════════════
# GLOBAL EXCEPTION HANDLERS
# ══════════════════════════════════════════════════════════════════════════════

@app.exception_handler(FaceRecognitionException)
async def face_recognition_exception_handler(request: Request, exc: FaceRecognitionException):
    logger.warning(
        f"Face recognition exception on {request.method} {request.url.path}: code={exc.error_code}, message={exc.message}"
    )
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "success": False,
            "error_code": exc.error_code,
            "message": exc.message,
            "details": exc.details
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catches any unhandled exception and returns a clean JSON error response
    instead of a raw 500 with a traceback exposed to the client.
    """
    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: {exc}",
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred.", "code": "INTERNAL_ERROR"},
    )


# ══════════════════════════════════════════════════════════════════════════════
# HEALTH CHECK ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["Health"],
    summary="Root health check",
)
async def root_health():
    """
    Lightweight ping endpoint. Does NOT query the DB.
    Used by load balancers and uptime monitors.
    """
    logger.info("Health check endpoint called.")
    return HealthResponse(
        status="ok",
        db="not_checked",
        environment=_settings.app_env,
        version="1.0.0",
    )


@app.get(
    "/api/v1/health",
    response_model=HealthResponse,
    tags=["Health"],
    summary="Full health check (includes DB ping)",
)
async def full_health():
    """
    Deep health check — pings Supabase DB.
    Use this to verify end-to-end connectivity.
    """
    logger.info("Full health check with DB ping called.")
    db_result = await health_check()
    return HealthResponse(
        status="ok",
        db=db_result["db"],
        environment=_settings.app_env,
        version="1.0.0",
    )


# ══════════════════════════════════════════════════════════════════════════════
# ROUTER REGISTRATION
# Routers are imported here (after logging is configured) to avoid
# circular import issues and to ensure loggers in routers inherit config.
# ══════════════════════════════════════════════════════════════════════════════

# Import routers lazily to avoid circular dependency issues at module load
# pyrefly: ignore [missing-import]
from router import auth, subjects, attendance  # noqa: E402

API_PREFIX = "/api/v1"

app.include_router(auth.router,       prefix=API_PREFIX, tags=["Authentication"])
app.include_router(subjects.router,   prefix=API_PREFIX, tags=["Subjects"])
app.include_router(attendance.router, prefix=API_PREFIX, tags=["Attendance"])

logger.info(f"Registered routers under prefix: {API_PREFIX}")
logger.info("Routes: /auth, /subjects, /attendance")
