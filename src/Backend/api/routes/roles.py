"""
Nexora Role & Permission Management API Endpoints
Provides CRUD operations for roles, role-permission assignments, and permission listings.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from Backend.api.deps import get_current_user, require_admin_or_super
from Backend.core.database import get_db
from Backend.models.menu import Permission, RolePermission
from Backend.models.role import Role
from Backend.models.user import User
from Backend.schemas.response import APIResponse
from Backend.schemas.role import (
    PermissionRead,
    RoleCreateRequest,
    RoleRead,
    RoleUpdateRequest,
)
from Backend.services.auth_service import AuthService

router = APIRouter(prefix="/roles", tags=["Roles & Permissions"])


@router.get("", response_model=APIResponse[List[RoleRead]])
def list_roles(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_super),
):
    """Lists all roles along with assigned permissions and user counts."""
    roles = db.query(Role).order_by(Role.id.asc()).all()
    results = []

    for r in roles:
        # Get permissions
        perms = (
            db.query(RolePermission.permission_code)
            .filter(RolePermission.role == r.code)
            .all()
        )
        perm_codes = [p[0] for p in perms]

        # Get count of users with this role
        u_count = db.query(User).filter(User.role == r.code).count()

        results.append(
            RoleRead(
                id=r.id,
                name=r.name,
                code=r.code,
                description=r.description or "",
                is_system=r.is_system,
                is_active=r.is_active,
                permissions=perm_codes,
                user_count=u_count,
                created_at=r.created_at,
            )
        )

    return APIResponse.ok(
        data=results,
        message=f"Retrieved {len(results)} system role(s).",
    )


@router.get("/{role_id}", response_model=APIResponse[RoleRead])
def get_role_by_id(
    role_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_super),
):
    """Retrieves single role details and permission mappings."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Role with ID {role_id} not found.",
        )

    perms = (
        db.query(RolePermission.permission_code)
        .filter(RolePermission.role == role.code)
        .all()
    )
    perm_codes = [p[0] for p in perms]
    u_count = db.query(User).filter(User.role == role.code).count()

    return APIResponse.ok(
        data=RoleRead(
            id=role.id,
            name=role.name,
            code=role.code,
            description=role.description or "",
            is_system=role.is_system,
            is_active=role.is_active,
            permissions=perm_codes,
            user_count=u_count,
            created_at=role.created_at,
        ),
        message="Role details retrieved successfully.",
    )


@router.post("", response_model=APIResponse[RoleRead], status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_super),
):
    """Creates a new custom role and associates selected permissions."""
    code = payload.code.strip().lower().replace(" ", "_")
    existing = db.query(Role).filter(Role.code == code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A role with code '{code}' already exists.",
        )

    role = Role(
        name=payload.name.strip(),
        code=code,
        description=(payload.description or "").strip(),
        is_system=False,
        is_active=True,
    )
    db.add(role)
    db.commit()
    db.refresh(role)

    # Assign permissions
    for p_code in payload.permissions:
        db.add(RolePermission(role=code, permission_code=p_code))
    db.commit()

    AuthService.log_audit_event(
        db,
        "ROLE_CREATED",
        user_id=admin.id,
        email=admin.email,
        details=f"Created custom role '{role.name}' ({role.code}) with {len(payload.permissions)} permission(s)",
    )

    return APIResponse.ok(
        data=RoleRead(
            id=role.id,
            name=role.name,
            code=role.code,
            description=role.description or "",
            is_system=role.is_system,
            is_active=role.is_active,
            permissions=payload.permissions,
            user_count=0,
            created_at=role.created_at,
        ),
        message=f"Role '{role.name}' created successfully.",
    )


@router.put("/{role_id}", response_model=APIResponse[RoleRead])
def update_role(
    role_id: int,
    payload: RoleUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_super),
):
    """Updates role metadata and permission assignments."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found.")

    # Protect critical super_admin role permissions
    if role.code == "super_admin" and admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a Super Administrator can modify the Super Administrator role.",
        )

    role.name = payload.name.strip()
    role.description = (payload.description or "").strip()
    if not role.is_system and payload.is_active is not None:
        role.is_active = payload.is_active

    # Re-sync permissions
    db.query(RolePermission).filter(RolePermission.role == role.code).delete()
    for p_code in payload.permissions:
        db.add(RolePermission(role=role.code, permission_code=p_code))

    db.commit()
    db.refresh(role)

    u_count = db.query(User).filter(User.role == role.code).count()

    AuthService.log_audit_event(
        db,
        "ROLE_UPDATED",
        user_id=admin.id,
        email=admin.email,
        details=f"Updated role '{role.name}' ({role.code})",
    )

    return APIResponse.ok(
        data=RoleRead(
            id=role.id,
            name=role.name,
            code=role.code,
            description=role.description or "",
            is_system=role.is_system,
            is_active=role.is_active,
            permissions=payload.permissions,
            user_count=u_count,
            created_at=role.created_at,
        ),
        message=f"Role '{role.name}' updated successfully.",
    )


@router.delete("/{role_id}", response_model=APIResponse[None])
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_super),
):
    """Deletes custom roles when safe and permitted."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found.")

    if role.is_system or role.code in ["super_admin", "admin", "user"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Security violation: System-critical role '{role.name}' cannot be deleted.",
        )

    assigned_count = db.query(User).filter(User.role == role.code).count()
    if assigned_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete role '{role.name}': currently assigned to {assigned_count} user(s). Reassign them first.",
        )

    # Delete permission mappings and role
    db.query(RolePermission).filter(RolePermission.role == role.code).delete()
    db.delete(role)
    db.commit()

    AuthService.log_audit_event(
        db,
        "ROLE_DELETED",
        user_id=admin.id,
        email=admin.email,
        details=f"Deleted custom role '{role.name}' ({role.code})",
    )

    return APIResponse.ok(message=f"Role '{role.name}' deleted successfully.")


@router.get("/catalog/permissions", response_model=APIResponse[List[PermissionRead]])
def list_permissions(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_super),
):
    """Returns the catalog of all fine-grained permissions."""
    perms = db.query(Permission).order_by(Permission.module.asc(), Permission.code.asc()).all()
    results = [PermissionRead.model_validate(p) for p in perms]
    return APIResponse.ok(
        data=results,
        message=f"Retrieved {len(results)} system permission(s).",
    )
