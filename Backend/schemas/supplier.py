"""
Nexora Supplier Pydantic Schemas
Defines request and response structures for Supplier Management operations.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field, field_validator


class SupplierBase(BaseModel):
    code: str = Field(..., min_length=2, max_length=50, description="Unique alphanumeric supplier code")
    name: str = Field(..., min_length=2, max_length=255, description="Registered supplier business name")
    category: Optional[str] = Field(None, max_length=100)
    tax_id: Optional[str] = Field(None, max_length=100, description="GSTIN, VAT, or Tax Identification Number")
    status: str = Field("active", description="active or disabled")

    # Contact Person
    contact_first_name: Optional[str] = Field(None, max_length=100)
    contact_last_name: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    alternate_phone: Optional[str] = Field(None, max_length=50)

    # Address
    address_line1: Optional[str] = Field(None, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=50)
    country: Optional[str] = Field("India", max_length=100)

    # Additional
    website: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None)

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        clean = v.strip().upper()
        if not clean:
            raise ValueError("Supplier code cannot be blank.")
        return clean

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Supplier name cannot be blank.")
        return clean


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    code: Optional[str] = Field(None, min_length=2, max_length=50)
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    category: Optional[str] = None
    tax_id: Optional[str] = None
    status: Optional[str] = None
    contact_first_name: Optional[str] = None
    contact_last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    alternate_phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None


class SupplierRead(SupplierBase):
    id: int
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SupplierListResponse(BaseModel):
    items: List[SupplierRead]
    total: int
    page: int
    page_size: int
    total_pages: int
    categories: List[str]


class ImportPreviewRow(BaseModel):
    row_number: int
    code: str
    name: str
    category: Optional[str] = None
    contact_first_name: Optional[str] = None
    contact_last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    status: str = "active"
    is_valid: bool
    is_duplicate: bool
    errors: List[str] = []


class ImportPreviewResponse(BaseModel):
    total_rows: int
    valid_rows: int
    invalid_rows: int
    duplicate_rows: int
    preview_items: List[ImportPreviewRow]


class ImportCommitRequest(BaseModel):
    duplicate_policy: str = Field("skip", description="skip or update")
    rows: List[dict]


class ImportCommitResponse(BaseModel):
    total_processed: int
    created_count: int
    updated_count: int
    skipped_count: int
    failed_count: int
    errors: List[str] = []
