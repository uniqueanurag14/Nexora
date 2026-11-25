"""
Nexora Database Backup History Model
Records database backup metadata and verification statuses.
"""

from datetime import datetime, timezone
from sqlalchemy import BigInteger, Column, DateTime, Integer, String, Text
from Backend.core.database import Base


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
        return f"<DatabaseBackup(filename='{self.filename}', status='{self.status}')>"
