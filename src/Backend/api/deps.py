"""
Nexora API Dependencies & Guards
Reusable authentication and role-based authorization middleware.
"""

from typing import Any, Callable, Dict, Optional, Tuple
from fastapi import Cookie, Depends, HTTPException, Header, Request, status
from sqlalchemy.orm import Session
from Backend.core.database import get_db
from Backend.core.security import decode_access_token
from Backend.models.user import User
from Backend.services.auth_service import AuthService


def get_token_from_request(
    authorization: Optional[str] = Header(None),
    nexora_access_token: Optional[str] = Cookie(None),
) -> Optional[str]:
    """Extracts JWT token from Authorization header or HttpOnly cookie."""
    if authorization and authorization.startswith("Bearer "):
        return authorization.split("Bearer ")[1].strip()
    if nexora_access_token:
        return nexora_access_token.strip()
    return None


def get_current_user_and_token(
    request: Request,
    token: Optional[str] = Depends(get_token_from_request),
    db: Session = Depends(get_db),
) -> Tuple[User, Dict[str, Any]]:
    """
    Validates token signature, audience, issuer, expiry, and revocation.
    Verifies user status in PostgreSQL.
    Fails closed on any error.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    jti = payload.get("jti")
    if not jti or AuthService.is_token_revoked(db, jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication session has been revoked. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("uid")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been suspended.",
        )

    return user, payload


def get_current_user(
    auth: Tuple[User, Dict[str, Any]] = Depends(get_current_user_and_token),
) -> User:
    """Dependency returning verified User."""
    return auth[0]


def require_role(*allowed_roles: str) -> Callable:
    """
    Role-based access guard.
    Fails closed if the authenticated user's role is not in allowed_roles.
    """
    def role_checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: insufficient privilege level.",
            )
        return user

    return role_checker


# Convenient aliases
require_super_admin = require_role("super_admin")
require_admin_or_super = require_role("super_admin", "admin")
