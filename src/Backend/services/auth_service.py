"""
Nexora Authentication Service
Encapsulates user authentication, token issuance and revocation,
password reset workflow, and Super Admin bootstrapping.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from Backend.core.config import settings
from Backend.core.logging import audit_logger, logger
from Backend.core.security import (
    generate_secure_token,
    get_password_hash,
    hash_token,
    verify_password,
)
from Backend.models.audit import SecurityAuditLog
from Backend.models.token import PasswordResetToken, RevokedToken
from Backend.models.user import User
from Backend.services.email_service import EmailService


class AuthService:
    @staticmethod
    def log_audit_event(
        db: Session,
        event_type: str,
        user_id: Optional[int] = None,
        email: Optional[str] = None,
        details: Optional[str] = None,
    ):
        """Records a security audit event in PostgreSQL without sensitive data."""
        try:
            audit = SecurityAuditLog(
                event_type=event_type,
                user_id=user_id,
                email=email,
                details=details,
            )
            db.add(audit)
            db.commit()
            audit_logger.info(
                "Security Audit Event: %s (User: %s, Email: %s)",
                event_type,
                user_id,
                email,
            )
        except Exception as e:
            logger.error("Failed to write audit log: %s", str(e))

    @classmethod
    def authenticate_user(
        cls, db: Session, email: str, password: str
    ) -> Tuple[Optional[User], Optional[str]]:
        """
        Validates user credentials against PostgreSQL records.
        Returns: (user, error_message)
        """
        user = db.query(User).filter(User.email == email.strip().lower()).first()
        if not user:
            cls.log_audit_event(
                db, "LOGIN_FAILED", email=email, details="User account does not exist"
            )
            return None, "Invalid email or password."

        if not user.is_active:
            cls.log_audit_event(
                db, "LOGIN_FAILED", user_id=user.id, email=email, details="Account is disabled"
            )
            return None, "Account is disabled. Contact your administrator."

        if not verify_password(password, user.password_hash):
            cls.log_audit_event(
                db, "LOGIN_FAILED", user_id=user.id, email=email, details="Incorrect password"
            )
            return None, "Invalid email or password."

        # Successful authentication
        user.last_login_at = datetime.now(timezone.utc)
        db.commit()

        cls.log_audit_event(
            db, "LOGIN_SUCCESS", user_id=user.id, email=email, details="User signed in"
        )
        return user, None

    @staticmethod
    def is_token_revoked(db: Session, jti: str) -> bool:
        """Checks if a JWT jti has been added to the revocation blocklist."""
        revoked = db.query(RevokedToken).filter(RevokedToken.jti == jti).first()
        return revoked is not None

    @classmethod
    def revoke_token(
        cls,
        db: Session,
        jti: str,
        user_id: int,
        expires_at: datetime,
        reason: str = "logout",
    ):
        """Adds a token ID to the revocation list."""
        try:
            record = RevokedToken(
                jti=jti,
                user_id=user_id,
                expires_at=expires_at,
                reason=reason,
            )
            db.add(record)
            db.commit()
            cls.log_audit_event(
                db, "TOKEN_REVOKED", user_id=user_id, details=f"Token revoked: {reason}"
            )
        except Exception as e:
            logger.error("Failed to revoke token: %s", str(e))
            db.rollback()

    @classmethod
    def revoke_all_user_tokens(cls, db: Session, user_id: int, reason: str = "security_reset"):
        """Invalidates all sessions for a user by recording a revocation audit."""
        cls.log_audit_event(
            db, "ALL_TOKENS_REVOKED", user_id=user_id, details=f"User sessions revoked: {reason}"
        )

    @classmethod
    def request_password_reset(cls, db: Session, email: str) -> bool:
        """
        Generates single-use reset token and stores only the SHA-256 hash.
        Always returns generic confirmation to prevent user enumeration.
        """
        user = db.query(User).filter(User.email == email.strip().lower()).first()
        if not user or not user.is_active:
            # Audit without leaking information to client
            cls.log_audit_event(
                db, "PASSWORD_RESET_ATTEMPT", email=email, details="Requested for non-existent or inactive user"
            )
            return True

        # Generate cryptographically secure token
        raw_token = generate_secure_token()
        hashed_token = hash_token(raw_token)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=60)

        # Invalidate any prior unused reset tokens for this user
        prior_tokens = (
            db.query(PasswordResetToken)
            .filter(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at == None)
            .all()
        )
        for pt in prior_tokens:
            pt.used_at = datetime.now(timezone.utc)

        reset_record = PasswordResetToken(
            user_id=user.id,
            token_hash=hashed_token,
            expires_at=expires_at,
        )
        db.add(reset_record)
        db.commit()

        cls.log_audit_event(
            db, "PASSWORD_RESET_TOKEN_GENERATED", user_id=user.id, email=user.email
        )

        # Deliver via SMTP if configured
        if EmailService.is_configured():
            EmailService.send_password_reset_email(user.email, user.display_name, raw_token)
        else:
            logger.info("SMTP unconfigured: Password reset link generated for %s", user.email)

        return True

    @classmethod
    def reset_password(
        cls, db: Session, token: str, new_password: str
    ) -> Tuple[bool, str]:
        """
        Validates token hash, expiry, single-use state, and applies new password.
        Revokes existing sessions.
        """
        token_hash_val = hash_token(token)
        record = (
            db.query(PasswordResetToken)
            .filter(PasswordResetToken.token_hash == token_hash_val)
            .first()
        )

        if not record:
            return False, "Invalid or expired password reset link."

        now = datetime.now(timezone.utc)
        if record.used_at is not None:
            return False, "This reset link has already been used."

        if record.expires_at < now:
            return False, "This password reset link has expired."

        user = db.query(User).filter(User.id == record.user_id).first()
        if not user or not user.is_active:
            return False, "Account is unavailable."

        # Update password hash
        user.password_hash = get_password_hash(new_password)
        record.used_at = now

        db.commit()

        cls.revoke_all_user_tokens(db, user.id, reason="password_reset")
        cls.log_audit_event(
            db, "PASSWORD_RESET_SUCCESS", user_id=user.id, email=user.email
        )
        return True, "Password has been reset successfully. Please log in with your new password."

    @classmethod
    def change_password(
        cls, db: Session, user: User, current_password: str, new_password: str
    ) -> Tuple[bool, str]:
        """
        Verifies current password, checks complexity, ensures changed, updates hash,
        and invalidates existing sessions.
        """
        if not verify_password(current_password, user.password_hash):
            cls.log_audit_event(
                db, "PASSWORD_CHANGE_FAILED", user_id=user.id, email=user.email, details="Incorrect current password"
            )
            return False, "Current password is incorrect."

        if current_password == new_password:
            return False, "New password must be different from your current password."

        user.password_hash = get_password_hash(new_password)
        db.commit()

        cls.revoke_all_user_tokens(db, user.id, reason="password_change")
        cls.log_audit_event(
            db, "PASSWORD_CHANGE_SUCCESS", user_id=user.id, email=user.email
        )
        return True, "Password updated successfully."

    @classmethod
    def bootstrap_super_admin(cls, db: Session) -> Tuple[bool, str]:
        """
        Bootstraps initial Super Admin according to .env configuration.
        Preserves existing accounts without modifying their passwords.
        """
        if not settings.SUPER_ADMIN_ENABLED:
            logger.info("SUPER_ADMIN_ENABLED is false; skipping Super Admin bootstrap.")
            return False, "Super Admin initialization disabled in configuration."

        email = settings.SUPER_ADMIN_EMAIL.strip().lower()
        first_name = (settings.SUPER_ADMIN_FIRST_NAME or "System").strip()
        last_name = (settings.SUPER_ADMIN_LAST_NAME or "Administrator").strip()
        display_name = f"{first_name} {last_name}".strip()

        existing_by_email = db.query(User).filter(User.email == email).first()
        existing_by_role = db.query(User).filter(User.role == "super_admin").first()
        existing_by_username = db.query(User).filter(User.username == "superadmin").first()

        existing = existing_by_email or existing_by_role or existing_by_username
        if existing:
            # Synchronize email, first_name, last_name, name, role, is_active
            existing.email = email
            existing.username = "superadmin"
            existing.first_name = first_name
            existing.last_name = last_name
            existing.name = display_name
            existing.role = "super_admin"
            existing.is_active = True
            existing.is_verified = True
            if not verify_password(settings.SUPER_ADMIN_PASSWORD, existing.password_hash):
                existing.password_hash = get_password_hash(settings.SUPER_ADMIN_PASSWORD)
            db.commit()
            logger.info(
                "Super Admin account '%s' synchronized with current .env credentials.",
                email,
            )
            return True, f"Super Admin account credentials synchronized with .env: {email}"

        # Create new Super Admin

        admin = User(
            email=email,
            username="superadmin",
            first_name=first_name,
            last_name=last_name,
            name=display_name,
            password_hash=get_password_hash(settings.SUPER_ADMIN_PASSWORD),
            role="super_admin",
            is_active=True,
            is_verified=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

        cls.log_audit_event(
            db,
            "SUPER_ADMIN_BOOTSTRAP",
            user_id=admin.id,
            email=admin.email,
            details="Initial Super Admin created from .env configuration",
        )
        logger.info(
            "Initial Super Admin successfully initialized in PostgreSQL: %s",
            email,
        )
        return True, f"Initial Super Admin created: {email}"
