"""
database.py — Supabase Client Singleton
========================================
Provides a single, reusable Supabase client instance for the entire
application lifetime. Uses the service-role key (bypasses Row Level
Security) since all auth is handled by our own JWT middleware.

IMPORTANT: The service-role key has full DB access — keep it secret.
"""

import logging
from functools import lru_cache
from supabase import create_client, Client
from config import get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """
    Returns a cached Supabase client singleton.

    Using lru_cache ensures we create exactly ONE client for the entire
    process lifetime, which is safe for Supabase's stateless HTTP client.

    Raises:
        RuntimeError: If environment variables are missing or the client
                      cannot be initialised.
    """
    settings = get_settings()

    logger.info("Initialising Supabase client...")
    logger.debug(f"Connecting to Supabase URL: {settings.supabase_url}")

    try:
        client: Client = create_client(
            str(settings.supabase_url),
            settings.supabase_service_role_key,
        )
        logger.info("✅ Supabase client initialised successfully.")
        return client

    except Exception as exc:
        logger.critical(
            f"❌ FATAL: Failed to initialise Supabase client: {exc}",
            exc_info=True,
        )
        raise RuntimeError(
            "Could not connect to Supabase. "
            "Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file."
        ) from exc


async def health_check() -> dict:
    """
    Performs a lightweight DB health check by querying one row from
    the 'teachers' table. Called during application startup.

    Returns:
        dict: {"status": "ok", "db": "connected"} on success.
    Raises:
        RuntimeError: If the query fails, indicating a DB connectivity issue.
    """
    logger.info("Running database health check...")

    try:
        client = get_supabase_client()
        # Lightweight ping — fetch 1 row with minimal data transfer
        response = client.table("teachers").select("teacher_id").limit(1).execute()
        logger.info("✅ Database health check passed.")
        return {"status": "ok", "db": "connected"}

    except Exception as exc:
        logger.error(f"❌ Database health check failed: {exc}", exc_info=True)
        raise RuntimeError(f"Database health check failed: {exc}") from exc
