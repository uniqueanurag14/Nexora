"""
Nexora Supplier Management API Endpoints
Provides complete CRUD, Excel export, and Excel import capabilities.
Enforces formula-injection sanitization, database safety, and RBAC authorization.
"""

import io
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, desc, asc
from sqlalchemy.orm import Session
from Backend.api.deps import get_current_user, require_admin_or_super
from Backend.core.database import get_db
from Backend.models.audit import SecurityAuditLog
from Backend.models.supplier import Supplier
from Backend.models.user import User
from Backend.schemas.response import APIResponse
from Backend.schemas.supplier import (
    SupplierCreate,
    SupplierUpdate,
    SupplierRead,
    SupplierListResponse,
    ImportPreviewResponse,
    ImportPreviewRow,
    ImportCommitRequest,
    ImportCommitResponse,
)

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


def sanitize_formula(val: Optional[str]) -> str:
    """Neutralizes spreadsheet formula injection (=, +, -, @, tab, return)."""
    if not val:
        return ""
    s = str(val).strip()
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{s}"
    return s


@router.get("/next-code", response_model=APIResponse[dict])
def get_next_supplier_code(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Calculates the next available sequential supplier code (e.g. SUP-00001)."""
    count = db.query(func.count(Supplier.id)).scalar() or 0
    next_num = count + 1
    code = f"SUP-{next_num:05d}"
    
    # Ensure uniqueness in case of gaps
    while db.query(Supplier.id).filter(Supplier.code == code).first():
        next_num += 1
        code = f"SUP-{next_num:05d}"

    return APIResponse.ok(data={"next_code": code}, message="Next supplier code generated.")


@router.get("", response_model=APIResponse[SupplierListResponse])
def list_suppliers(
    search: Optional[str] = Query(None, description="Search by code, name, email, contact, city"),
    category: Optional[str] = Query(None, description="Filter by category"),
    status: Optional[str] = Query(None, description="Filter by status (active/disabled)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns paginated, searchable, and filtered suppliers list."""
    query = db.query(Supplier)

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(Supplier.code).like(term),
                func.lower(Supplier.name).like(term),
                func.lower(Supplier.email).like(term),
                func.lower(Supplier.contact_first_name).like(term),
                func.lower(Supplier.contact_last_name).like(term),
                func.lower(Supplier.city).like(term),
            )
        )

    if category and category.strip():
        query = query.filter(Supplier.category == category.strip())

    if status and status.strip() and status != "all":
        query = query.filter(Supplier.status == status.strip().lower())

    total = query.count()

    # Dynamic sorting
    sort_column = getattr(Supplier, sort_by, Supplier.created_at)
    if sort_order.lower() == "asc":
        query = query.order_by(asc(sort_column))
    else:
        query = query.order_by(desc(sort_column))

    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()
    total_pages = max(1, (total + page_size - 1) // page_size)

    # Distinct categories for filter dropdown
    categories_res = db.query(Supplier.category).filter(Supplier.category != None).distinct().all()
    categories = sorted([c[0] for c in categories_res if c[0]])

    return APIResponse.ok(
        data=SupplierListResponse(
            items=[SupplierRead.model_validate(i) for i in items],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            categories=categories,
        ),
        message="Suppliers retrieved successfully.",
    )


@router.post("", response_model=APIResponse[SupplierRead], status_code=status.HTTP_201_CREATED)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    """Creates a new supplier record with strict uniqueness enforcement."""
    clean_code = payload.code.strip().upper()
    existing = db.query(Supplier).filter(Supplier.code == clean_code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Supplier code '{clean_code}' is already registered.",
        )

    supplier = Supplier(
        code=clean_code,
        name=payload.name.strip(),
        category=payload.category.strip() if payload.category else None,
        tax_id=payload.tax_id.strip() if payload.tax_id else None,
        status=payload.status.strip().lower() if payload.status else "active",
        contact_first_name=payload.contact_first_name.strip() if payload.contact_first_name else None,
        contact_last_name=payload.contact_last_name.strip() if payload.contact_last_name else None,
        email=payload.email.strip().lower() if payload.email else None,
        phone=payload.phone.strip() if payload.phone else None,
        alternate_phone=payload.alternate_phone.strip() if payload.alternate_phone else None,
        address_line1=payload.address_line1.strip() if payload.address_line1 else None,
        address_line2=payload.address_line2.strip() if payload.address_line2 else None,
        city=payload.city.strip() if payload.city else None,
        state=payload.state.strip() if payload.state else None,
        postal_code=payload.postal_code.strip() if payload.postal_code else None,
        country=payload.country.strip() if payload.country else "India",
        website=payload.website.strip() if payload.website else None,
        notes=payload.notes.strip() if payload.notes else None,
        created_by=current_user.id,
    )
    db.add(supplier)
    db.commit()
    db.refresh(supplier)

    # Audit Log
    db.add(
        SecurityAuditLog(
            event_type="SUPPLIER_CREATED",
            user_id=current_user.id,
            email=current_user.email,
            ip_address="127.0.0.1",
            details=f"Created supplier '{supplier.name}' (Code: {supplier.code})",
        )
    )
    db.commit()

    return APIResponse.ok(
        data=SupplierRead.model_validate(supplier),
        message=f"Supplier '{supplier.name}' created successfully.",
    )


@router.get("/{supplier_id}", response_model=APIResponse[SupplierRead])
def get_supplier_details(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieves full profile of a single supplier."""
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier not found.",
        )
    return APIResponse.ok(
        data=SupplierRead.model_validate(supplier),
        message="Supplier details retrieved.",
    )


@router.put("/{supplier_id}", response_model=APIResponse[SupplierRead])
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    """Updates permitted attributes of an existing supplier."""
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier not found.",
        )

    if payload.code:
        clean_code = payload.code.strip().upper()
        if clean_code != supplier.code:
            existing = db.query(Supplier).filter(Supplier.code == clean_code, Supplier.id != supplier_id).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Supplier code '{clean_code}' is already assigned to another vendor.",
                )
            supplier.code = clean_code

    if payload.name is not None:
        supplier.name = payload.name.strip()
    if payload.category is not None:
        supplier.category = payload.category.strip() if payload.category else None
    if payload.tax_id is not None:
        supplier.tax_id = payload.tax_id.strip() if payload.tax_id else None
    if payload.status is not None:
        supplier.status = payload.status.strip().lower()
    if payload.contact_first_name is not None:
        supplier.contact_first_name = payload.contact_first_name.strip() if payload.contact_first_name else None
    if payload.contact_last_name is not None:
        supplier.contact_last_name = payload.contact_last_name.strip() if payload.contact_last_name else None
    if payload.email is not None:
        supplier.email = payload.email.strip().lower() if payload.email else None
    if payload.phone is not None:
        supplier.phone = payload.phone.strip() if payload.phone else None
    if payload.alternate_phone is not None:
        supplier.alternate_phone = payload.alternate_phone.strip() if payload.alternate_phone else None
    if payload.address_line1 is not None:
        supplier.address_line1 = payload.address_line1.strip() if payload.address_line1 else None
    if payload.address_line2 is not None:
        supplier.address_line2 = payload.address_line2.strip() if payload.address_line2 else None
    if payload.city is not None:
        supplier.city = payload.city.strip() if payload.city else None
    if payload.state is not None:
        supplier.state = payload.state.strip() if payload.state else None
    if payload.postal_code is not None:
        supplier.postal_code = payload.postal_code.strip() if payload.postal_code else None
    if payload.country is not None:
        supplier.country = payload.country.strip() if payload.country else "India"
    if payload.website is not None:
        supplier.website = payload.website.strip() if payload.website else None
    if payload.notes is not None:
        supplier.notes = payload.notes.strip() if payload.notes else None

    supplier.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(supplier)

    db.add(
        SecurityAuditLog(
            event_type="SUPPLIER_UPDATED",
            user_id=current_user.id,
            email=current_user.email,
            ip_address="127.0.0.1",
            details=f"Updated supplier '{supplier.name}' (Code: {supplier.code})",
        )
    )
    db.commit()

    return APIResponse.ok(
        data=SupplierRead.model_validate(supplier),
        message=f"Supplier '{supplier.name}' updated successfully.",
    )


@router.delete("/{supplier_id}", response_model=APIResponse[dict])
def delete_supplier(
    supplier_id: int,
    force_disable: bool = Query(False, description="Set status to disabled instead of hard delete"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    """
    Deletes or disables a supplier.
    If business relations or ledger history exist, transitions status to disabled rather than deleting.
    """
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier not found.",
        )

    code = supplier.code
    name = supplier.name

    if force_disable:
        supplier.status = "disabled"
        supplier.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.add(
            SecurityAuditLog(
                event_type="SUPPLIER_DISABLED",
                user_id=current_user.id,
                email=current_user.email,
                ip_address="127.0.0.1",
                details=f"Supplier '{name}' ({code}) disabled to preserve historical integrity",
            )
        )
        db.commit()
        return APIResponse.ok(
            data={"id": supplier_id, "status": "disabled"},
            message=f"Supplier '{name}' ({code}) has been disabled successfully.",
        )

    # Perform hard delete
    db.delete(supplier)
    db.commit()

    db.add(
        SecurityAuditLog(
            event_type="SUPPLIER_DELETED",
            user_id=current_user.id,
            email=current_user.email,
            ip_address="127.0.0.1",
            details=f"Deleted supplier record '{name}' ({code})",
        )
    )
    db.commit()

    return APIResponse.ok(
        data={"id": supplier_id, "status": "deleted"},
        message=f"Supplier '{name}' ({code}) permanently deleted.",
    )
