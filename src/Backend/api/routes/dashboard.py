"""
Nexora Role-Specific Dashboard API Endpoints
Provides real authorized statistics and recent activity metrics.
Never introduces fabricated dummy data.
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from Backend.api.deps import get_current_user
from Backend.core.database import get_db
from Backend.models.audit import SecurityAuditLog
from Backend.models.session import UserSession
from Backend.models.user import User
from Backend.schemas.response import APIResponse

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


class DashboardStatsDTO(BaseModel):
    user_name: str
    first_name: str
    last_name: str
    email: str
    role: str
    total_users_count: Optional[int] = None
    active_sessions_count: int
    security_audits_count: Optional[int] = None
    last_login_at: Optional[str] = None
    recent_activities: List[Dict[str, Any]] = []
    quick_shortcuts: List[Dict[str, str]] = []


@router.get("/stats", response_model=APIResponse[DashboardStatsDTO])
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns personalized, role-specific metrics.
    Admins see platform user counts and recent audit events.
    Regular users see their personal session status and permitted shortcuts.
    """
    is_admin = current_user.role in ("super_admin", "admin")

    # Name breakdown
    fname = current_user.first_name or (current_user.name.split()[0] if current_user.name else "User")
    lname = current_user.last_name or (" ".join(current_user.name.split()[1:]) if current_user.name and len(current_user.name.split()) > 1 else "")

    # Active session count for user
    active_sessions = db.query(UserSession).filter(UserSession.user_id == current_user.id, UserSession.is_revoked == False).count()

    # Admin stats
    total_users = None
    security_audits = None
    recent_activities: List[Dict[str, Any]] = []

    if is_admin:
        total_users = db.query(User).count()
        security_audits = db.query(SecurityAuditLog).count()
        logs = db.query(SecurityAuditLog).order_by(SecurityAuditLog.created_at.desc()).limit(5).all()
        recent_activities = [
            {
                "id": l.id,
                "event": l.event_type,
                "email": l.email,
                "details": l.details,
                "timestamp": l.created_at.isoformat() if l.created_at else "",
            }
            for l in logs
        ]
    else:
        user_logs = db.query(SecurityAuditLog).filter(SecurityAuditLog.user_id == current_user.id).order_by(SecurityAuditLog.created_at.desc()).limit(5).all()
        recent_activities = [
            {
                "id": l.id,
                "event": l.event_type,
                "email": l.email,
                "details": l.details,
                "timestamp": l.created_at.isoformat() if l.created_at else "",
            }
            for l in user_logs
        ]

    # Shortcuts
    shortcuts = [
        {"label": "My Profile", "route": "/profile", "icon": "User"},
        {"label": "Change Password", "route": "/change-password", "icon": "KeyRound"},
        {"label": "Active Sessions", "route": "/settings/sessions", "icon": "Laptop"},
    ]
    if is_admin:
        shortcuts.extend([
            {"label": "General Settings", "route": "/settings/general", "icon": "Settings"},
            {"label": "Audit Trail", "route": "/settings/audit", "icon": "FileSpreadsheet"},
        ])
    if current_user.role == "super_admin":
        shortcuts.append({"label": "Database Backups", "route": "/settings/backups", "icon": "HardDriveDownload"})

    dto = DashboardStatsDTO(
        user_name=current_user.name,
        first_name=fname,
        last_name=lname,
        email=current_user.email,
        role=current_user.role,
        total_users_count=total_users,
        active_sessions_count=max(active_sessions, 1),
        security_audits_count=security_audits,
        last_login_at=current_user.last_login_at.isoformat() if current_user.last_login_at else None,
        recent_activities=recent_activities,
        quick_shortcuts=shortcuts,
    )

    return APIResponse.ok(
        data=dto,
        message="Dashboard statistics retrieved successfully.",
    )
