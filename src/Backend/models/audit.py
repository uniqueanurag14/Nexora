"""
Nexora Security Audit Log Model
Records authentication, administrative bootstrap, and security events without sensitive data.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Integer, String, Text
from Backend.core.database import Base


class SecurityAuditLog(Base):
    __tablename__ = "security_audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_type = Column(String(100), nullable=False, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    email = Column(String(255), nullable=True, index=True)
    ip_address = Column(String(100), nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<SecurityAuditLog(event='{self.event_type}', email='{self.email}')>"
