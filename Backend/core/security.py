"""
Nexora Security Utilities
Cryptographic password hashing (bcrypt), JWT issuance and verification,
and secure single-use token hashing.
"""

import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import jwt
import bcrypt
from Backend.core.config import settings

PASSWORD_MIN_LENGTH = 8

# Password hashing using native bcrypt
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a bcrypt hash."""
    try:
        pw_bytes = plain_password.encode("utf-8")[:72]
        hash_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pw_bytes, hash_bytes)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Generates a secure bcrypt password hash."""
    pw_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pw_bytes, salt).decode("utf-8")


def validate_password_strength(password: str) -> tuple[bool, str]:
    """
    Validates password against security policy:
    - At least 8 characters
    - At least one lowercase letter
    - At least one uppercase letter
    - At least one digit
    - At least one special character
    """
    if len(password) < PASSWORD_MIN_LENGTH:
        return False, f"Password must be at least {PASSWORD_MIN_LENGTH} characters long."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"\d", password):
        return False, "Password must contain at least one digit."
    if not re.search(r"[@$!%*?&#^+=_\-~`()<>{}[\]|:;,.]", password):
        return False, "Password must contain at least one special character."
    return True, ""


def create_access_token(
    subject: str,
    role: str,
    user_id: int,
    expires_delta: Optional[timedelta] = None,
    extra_claims: Optional[Dict[str, Any]] = None,
) -> tuple[str, str, datetime]:
    """
    Creates a signed JWT access token.
    Returns: (token_str, jti, expire_datetime)
    Never places password hashes or sensitive personal info into the payload.
    """
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.jwt_expiry_minutes)

    jti = secrets.token_hex(16)

    payload = {
        "sub": str(subject),       # email / identifier
        "uid": user_id,            # internal user ID
        "role": role,              # verified user role
        "jti": jti,                # unique token ID for revocation
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    if extra_claims:
        payload.update(extra_claims)

    token = jwt.encode(payload, settings.JWT_ACCESS_SECRET, algorithm="HS256")
    return token, jti, expire


def decode_access_token(token: str) -> Dict[str, Any]:
    """
    Decodes and validates a JWT access token.
    Enforces secret, issuer, audience, and expiration.
    """
    return jwt.decode(
        token,
        settings.JWT_ACCESS_SECRET,
        algorithms=["HS256"],
        issuer=settings.JWT_ISSUER,
        audience=settings.JWT_AUDIENCE,
        options={
            "require": ["exp", "iat", "sub", "jti", "iss", "aud"],
            "verify_exp": True,
            "verify_iat": True,
            "verify_iss": True,
            "verify_aud": True,
        },
    )


def generate_secure_token() -> str:
    """Generates a cryptographically strong, URL-safe random token for password reset."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Computes a SHA-256 hash of a token for secure database storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
