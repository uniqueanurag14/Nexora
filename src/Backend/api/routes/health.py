"""
Nexora Health and Readiness Endpoints
Provides secure liveness and readiness probes without disclosing sensitive credentials.
"""

from fastapi import APIRouter, Response, status
from Backend.core.config import settings
from Backend.core.database import check_database_connection
from Backend.schemas.response import APIResponse
from Backend.services.email_service import EmailService

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("/liveness", response_model=APIResponse[dict])
def liveness():
    """Confirms that the backend process is responding."""
    return APIResponse.ok(
        data={"status": "ok", "app": settings.APP_NAME},
        message="Backend process active",
    )


@router.get("/readiness", response_model=APIResponse[dict])
def readiness(response: Response):
    """
    Confirms that the backend is ready to serve requests and that PostgreSQL is available.
    Does not expose connection strings, credentials, or diagnostics.
    """
    db_ok, msg = check_database_connection()
    if not db_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return APIResponse.fail(
            message="Database connection unavailable",
            errors=[{"field": "database", "message": msg}],
        )

    return APIResponse.ok(
        data={
            "status": "healthy",
            "database": "connected",
            "app": settings.APP_NAME,
            "env": settings.APP_ENV,
        },
        message="System ready",
    )


@router.get("/status", response_model=APIResponse[dict])
def full_status():
    """
    Provides operational status for startup health verification.
    """
    db_ok, _ = check_database_connection()
    smtp_configured = EmailService.is_configured()

    return APIResponse.ok(
        data={
            "app_name": settings.APP_NAME,
            "environment": settings.APP_ENV,
            "database_connected": db_ok,
            "smtp_configured": smtp_configured,
            "timezone": settings.APP_TIMEZONE,
        },
        message="Operational status retrieved",
    )
