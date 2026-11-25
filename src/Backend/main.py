"""
Nexora Backend API Application
FastAPI entry point providing robust validation, error handling, CORS, and modular routing.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from Backend.api.routes import auth, health, roles, users, suppliers, inventory
from Backend.core.config import settings
from Backend.core.database import check_database_connection, engine
from Backend.core.logging import logger
from Backend.schemas.response import APIResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting %s API server in %s mode...", settings.APP_NAME, settings.APP_ENV)
    db_ok, msg = check_database_connection()
    if db_ok:
        logger.info("PostgreSQL Database: CONNECTED")
    else:
        logger.error("PostgreSQL Database: CONNECTION FAILED - %s", msg)
    yield
    # Shutdown
    logger.info("Shutting down %s API server...", settings.APP_NAME)
    engine.dispose()
    logger.info("Database connection pool disposed cleanly.")


app = FastAPI(
    title=settings.APP_NAME,
    description="Nexora Enterprise Foundation & Authentication API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.APP_ENV != "production" else None,
    redoc_url="/api/redoc" if settings.APP_ENV != "production" else None,
)

# CORS Configuration
allowed_origins = [
    settings.APP_URL.rstrip("/"),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:8001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# Standardized Error Handling
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Formats validation errors consistently without exposing internal details."""
    errors = []
    for err in exc.errors():
        loc = " -> ".join([str(x) for x in err.get("loc", []) if x != "body"])
        msg = err.get("msg", "Invalid value")
        errors.append({"field": loc, "message": msg})

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=APIResponse.fail(
            message="Request validation failed. Please check your input.",
            errors=errors,
        ).model_dump(),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Returns clean HTTP exceptions with standard response envelope."""
    return JSONResponse(
        status_code=exc.status_code,
        content=APIResponse.fail(message=exc.detail).model_dump(),
        headers=exc.headers,
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """
    Catches all unexpected exceptions.
    Logs full exception to server logs, but returns sanitized generic message to client.
    Never exposes SQL, stack traces, or credentials to public clients.
    """
    logger.exception("Unhandled runtime error on %s %s: %s", request.method, request.url.path, str(exc))
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=APIResponse.fail(
            message="An unexpected internal server error occurred. Please try again later."
        ).model_dump(),
    )


# Register API Route modules
app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(roles.router, prefix="/api")
app.include_router(suppliers.router, prefix="/api")
app.include_router(inventory.router, prefix="/api")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "Backend.main:app",
        host="0.0.0.0",
        port=settings.BACKEND_PORT,
        log_level="info",
        reload=False,
    )
