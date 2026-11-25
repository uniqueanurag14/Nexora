"""
Nexora Users & Employee Management API Endpoints
Comprehensive CRUD, profile management, and role assignment.
Mandatory global rule: Every person's name uses separate First Name and Last Name.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from Backend.api.deps import get_current_user, require_admin_or_super
from Backend.core.database import get_db
from Backend.core.security import get_password_hash
from Backend.models.user import User
from Backend.schemas.response import APIResponse
from Backend.schemas.user import (
    UserAdminUpdateRequest,
    UserCreateRequest,
    UserProfileUpdate,
    UserRead,
)
from Backend.services.auth_service import AuthService

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/profile", response_model=APIResponse[UserRead])
def get_user_profile(
    current_user: User = Depends(get_current_user),
):
    """Retrieves profile details for the authenticated user."""
    return APIResponse.ok(
        data=UserRead.model_validate(current_user),
        message="User profile retrieved successfully.",
    )


@router.put("/profile", response_model=APIResponse[UserRead])
def update_user_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Updates allowed profile attributes (First Name, Last Name, Phone, Department).
    Users cannot modify their own role, email, or privileges through this endpoint.
    """
    current_user.first_name = payload.first_name.strip()
    current_user.last_name = payload.last_name.strip()
    current_user.phone = (payload.phone or "").strip()
    current_user.department = (payload.department or "").strip()

    db.commit()
    db.refresh(current_user)

    AuthService.log_audit_event(
        db,
        "PROFILE_UPDATED",
        user_id=current_user.id,
        email=current_user.email,
        details=f"User updated profile: {current_user.first_name} {current_user.last_name}",
    )

    return APIResponse.ok(
        data=UserRead.model_validate(current_user),
        message="Profile updated successfully.",
    )


@router.get("", response_model=APIResponse[List[UserRead]])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_super),
):
    """
    Lists all users stored in PostgreSQL.
    Restricted to Super Admin and Admin roles.
    """
    users = db.query(User).order_by(User.id.asc()).all()
    user_list = [UserRead.model_validate(u) for u in users]
    return APIResponse.ok(
        data=user_list,
        message=f"Retrieved {len(user_list)} user account(s).",
    )


@router.post("", response_model=APIResponse[UserRead], status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_super),
):
    """
    Creates a new user or employee account in PostgreSQL.
    Enforces unique email, password complexity, and separate First/Last name.
    """
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists.",
        )

    # Ordinary admins cannot create super_admin accounts
    if payload.role == "super_admin" and admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a Super Administrator can provision another Super Administrator account.",
        )

    fn = payload.first_name.strip()
    ln = payload.last_name.strip()
    display_name = f"{fn} {ln}".strip()

    new_user = User(
        email=payload.email,
        first_name=fn,
        last_name=ln,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
        is_active=True,
        is_verified=True,
        phone=payload.phone or "",
        department=payload.department or "Operations",
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    AuthService.log_audit_event(
        db,
        "USER_CREATED",
        user_id=admin.id,
        email=admin.email,
        details=f"Created user account for {new_user.email} with role {new_user.role}",
    )

    return APIResponse.ok(
        data=UserRead.model_validate(new_user),
        message=f"User account for {new_user.email} created successfully.",
    )


@router.get("/{user_id}", response_model=APIResponse[UserRead])
def get_user_by_id(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieves user account details by ID."""
    if current_user.role not in ["super_admin", "admin"] and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You can only view your own user account.",
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found.",
        )

    return APIResponse.ok(
        data=UserRead.model_validate(target_user),
        message="User details retrieved successfully.",
    )


@router.put("/{user_id}", response_model=APIResponse[UserRead])
def update_user_by_id(
    user_id: int,
    payload: UserAdminUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_super),
):
    """
    Updates user details, role, and account status with critical Super Admin safeguards.
    """
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found.",
        )

    # Super Admin safeguard: prevent non-super_admin from modifying super_admin accounts
    if target.role == "super_admin" and admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a Super Administrator can modify another Super Administrator.",
        )

    # Super Admin safeguard: prevent changing role to super_admin unless initiator is super_admin
    if payload.role == "super_admin" and admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Privilege escalation denied: Only Super Administrators can grant super_admin role.",
        )

    # Protect the last active Super Admin from accidental demotion or deactivation
    if target.role == "super_admin" and (payload.role != "super_admin" or not payload.is_active):
        active_super_admins = (
            db.query(User).filter(User.role == "super_admin", User.is_active == True).count()
        )
        if active_super_admins <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Operation rejected: Cannot demote or deactivate the last active Super Administrator.",
            )

    target.first_name = payload.first_name.strip()
    target.last_name = payload.last_name.strip()
    target.role = payload.role
    target.is_active = payload.is_active
    target.phone = (payload.phone or "").strip()
    target.department = (payload.department or "").strip()

    db.commit()
    db.refresh(target)

    AuthService.log_audit_event(
        db,
        "USER_UPDATED",
        user_id=admin.id,
        email=admin.email,
        details=f"Updated user account ID {target.id} ({target.email})",
    )

    return APIResponse.ok(
        data=UserRead.model_validate(target),
        message=f"User {target.email} updated successfully.",
    )


@router.post("/{user_id}/activate", response_model=APIResponse[UserRead])
def activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_super),
):
    """Activates a user account."""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    target.is_active = True
    db.commit()
    db.refresh(target)

    AuthService.log_audit_event(
        db, "USER_ACTIVATED", user_id=admin.id, email=admin.email, details=f"Activated account {target.email}"
    )
    return APIResponse.ok(data=UserRead.model_validate(target), message=f"User {target.email} activated.")


@router.post("/{user_id}/deactivate", response_model=APIResponse[UserRead])
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_super),
):
    """Deactivates a user account with Super Admin protection."""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if target.role == "super_admin":
        active_supers = db.query(User).filter(User.role == "super_admin", User.is_active == True).count()
        if active_supers <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate the last active Super Administrator.",
            )

    target.is_active = False
    db.commit()
    db.refresh(target)

    # Invalidate active sessions
    AuthService.revoke_all_user_tokens(db, user_id=target.id, reason="account_deactivated")

    AuthService.log_audit_event(
        db, "USER_DEACTIVATED", user_id=admin.id, email=admin.email, details=f"Deactivated account {target.email}"
    )
    return APIResponse.ok(data=UserRead.model_validate(target), message=f"User {target.email} deactivated.")


@router.delete("/{user_id}", response_model=APIResponse[None])
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_super),
):
    """Permanently removes a user account after validating Super Admin safeguards."""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if target.role == "super_admin":
        active_supers = db.query(User).filter(User.role == "super_admin", User.is_active == True).count()
        if active_supers <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last active Super Administrator.",
            )

    email_copy = target.email
    db.delete(target)
    db.commit()

    AuthService.log_audit_event(
        db, "USER_DELETED", user_id=admin.id, email=admin.email, details=f"Deleted user account {email_copy}"
    )
    return APIResponse.ok(message=f"User account {email_copy} deleted successfully.")
