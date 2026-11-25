"""
Nexora Active Sessions API Endpoints
Allows logged-in users to view their active sessions and revoke secondary sessions.
"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from Backend.api.deps import get_current_user
from Backend.core.database import get_db
from Backend.core.security import hash_token
from Backend.models.session import UserSession
from Backend.models.user import User
from Backend.schemas.response import APIResponse
from Backend.services.auth_service import AuthService

router = APIRouter(prefix="/sessions", tags=["Sessions"])


class SessionDTO(BaseModel):
    id: int
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    device_info: Optional[str] = None
    last_activity_at: datetime
    created_at: datetime
    is_current: bool


@router.get("", response_model=APIResponse[List[SessionDTO]])
def list_active_sessions(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns active (non-revoked) sessions for the authenticated user.
    Flags the currently active session based on Bearer token hash.
    """
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ")[1]
    curr_hash = hash_token(token) if token else ""

    sessions = (
        db.query(UserSession)
        .filter(UserSession.user_id == current_user.id, UserSession.is_revoked == False)
        .order_by(UserSession.last_activity_at.desc())
        .all()
    )

    dtos = [
        SessionDTO(
            id=s.id,
            ip_address=s.ip_address,
            user_agent=s.user_agent,
            device_info=s.device_info or "Web Browser",
            last_activity_at=s.last_activity_at,
            created_at=s.created_at,
            is_current=(s.token_hash == curr_hash),
        )
        for s in sessions
    ]

    return APIResponse.ok(
        data=dtos,
        message=f"Retrieved {len(dtos)} active session(s).",
    )


@router.post("/revoke-others", response_model=APIResponse[dict])
def revoke_other_sessions(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Revokes all active sessions for the user EXCEPT the current session.
    """
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ")[1]
    curr_hash = hash_token(token) if token else ""

    updated_count = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == current_user.id,
            UserSession.is_revoked == False,
            UserSession.token_hash != curr_hash,
        )
        .update({"is_revoked": True})
    )
    db.commit()

    AuthService.log_audit_event(
        db,
        "OTHER_SESSIONS_REVOKED",
        user_id=current_user.id,
        email=current_user.email,
        details=f"User revoked {updated_count} other active session(s)",
    )

    return APIResponse.ok(
        data={"revoked_count": updated_count},
        message=f"Successfully revoked {updated_count} other session(s).",
    )
