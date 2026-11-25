"""
Nexora System Settings and Database Backup Models
Centralized configuration and database snapshot tracking in PostgreSQL.
"""

from datetime import datetime, timezone
from sqlalchemy import BigInteger, Boolean, Column, DateTime, Integer, String, Text
from Backend.core.database import Base


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    key = Column(String(100), unique=True, index=True, nullable=False)
    value = Column(Text, nullable=False)
    category = Column(String(50), nullable=False, default="general")
    description = Column(Text, nullable=True)
    is_public = Column(Boolean, nullable=False, default=False)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<SystemSetting(key='{self.key}', value='{self.value}')>"


class DatabaseBackup(Base):
    __tablename__ = "database_backups"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    filename = Column(String(255), nullable=False)
    size_bytes = Column(BigInteger, nullable=False, default=0)
    status = Column(String(50), nullable=False, default="COMPLETED")
    table_count = Column(Integer, nullable=False, default=0)
    created_by = Column(String(255), nullable=False, default="System Administrator")
    notes = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<DatabaseBackup(id={self.id}, filename='{self.filename}', status='{self.status}')>"
