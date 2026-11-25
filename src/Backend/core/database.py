"""
Nexora PostgreSQL Connection & Session Management
Provides SQLAlchemy 2.0 connection pooling, scoped sessions, and connectivity verification.
"""

from contextlib import contextmanager
from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from Backend.core.config import settings
from Backend.core.logging import logger

# SQLAlchemy Declarative Base
Base = declarative_base()

# Database engine configuration with robust connection pooling
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_timeout=15,
    pool_pre_ping=True,  # Proactively test connection freshness
    echo=False,
)

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a database session with automatic transaction management.
    Ensures safe rollback on exception and guaranteed closure.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """Context manager for background tasks, CLI scripts, and non-HTTP database access."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def check_database_connection() -> tuple[bool, str]:
    """
    Validates PostgreSQL connectivity with a bounded ping.
    Does not expose credentials or connection strings in output.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1;"))
        return True, "PostgreSQL Database: CONNECTED"
    except Exception as e:
        logger.error("PostgreSQL connection check failed: %s", str(e))
        return False, "Failed to connect to PostgreSQL database. Verify DATABASE_URL and server status."
