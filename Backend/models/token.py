"""
Nexora Token & Session Models
Supports server-side token revocation (blocklist) and cryptographically secure password reset tokens.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from Backend.core.database import Base


class RevokedToken(Base):
    """
    Stores revoked JWT IDs (jti) for server-side token invalidation upon logout or password change.
    Expired tokens can be purged periodically.
    """
    __tablename__ = "revoked_tokens"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    jti = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    reason = Column(String(100), nullable=True)

    user = relationship("User", back_populates="revoked_tokens")

    def __repr__(self) -> str:
        return f"<RevokedToken(jti='{self.jti}', user_id={self.user_id})>"


class PasswordResetToken(Base):
    """
    Stores cryptographically secure hashes of single-use password reset tokens.
    Raw tokens are never written to PostgreSQL.
    """
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash = Column(String(64), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="password_reset_tokens")

    @property
    def is_valid(self) -> bool:
        now = datetime.now(timezone.utc)
        return self.used_at is None and self.expires_at > now

    def __repr__(self) -> str:
        return f"<PasswordResetToken(user_id={self.user_id}, used={self.used_at is not None})>"
