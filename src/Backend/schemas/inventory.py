"""
Nexora Inventory Pydantic Schemas
Defines request and response structures for Inventory Management operations.
"""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


# --- Category Schemas ---
class CategoryBase(BaseModel):
    code: str = Field(..., min_length=2, max_length=50)
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        clean = v.strip().upper()
        if not clean:
            raise ValueError("Category code cannot be blank.")
        return clean


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class CategoryRead(CategoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Unit of Measure Schemas ---
class UOMBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=20)
    name: str = Field(..., min_length=1, max_length=50)
    symbol: str = Field(..., min_length=1, max_length=10)
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        clean = v.strip().upper()
        if not clean:
            raise ValueError("UOM code cannot be blank.")
        return clean


class UOMCreate(UOMBase):
    pass


class UOMRead(UOMBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Warehouse Schemas ---
class WarehouseBase(BaseModel):
    code: str = Field(..., min_length=2, max_length=50)
    name: str = Field(..., min_length=2, max_length=100)
    address: Optional[str] = None
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        clean = v.strip().upper()
        if not clean:
            raise ValueError("Warehouse code cannot be blank.")
        return clean


class WarehouseCreate(WarehouseBase):
    pass


class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class WarehouseRead(WarehouseBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Item Master Schemas ---
class ItemBase(BaseModel):
    code: str = Field(..., min_length=2, max_length=50)
    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    category_id: Optional[int] = None
    uom_id: Optional[int] = None
    barcode: Optional[str] = None
    min_stock_level: Decimal = Field(default=Decimal("0.0"))
    reorder_quantity: Decimal = Field(default=Decimal("0.0"))
    cost_price: Decimal = Field(default=Decimal("0.0"))
    selling_price: Decimal = Field(default=Decimal("0.0"))
    status: str = Field("active")

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        clean = v.strip().upper()
        if not clean:
            raise ValueError("Item code cannot be blank.")
        return clean


class ItemCreate(ItemBase):
    initial_warehouse_id: Optional[int] = None
    initial_quantity: Optional[Decimal] = None


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    uom_id: Optional[int] = None
    barcode: Optional[str] = None
    min_stock_level: Optional[Decimal] = None
    reorder_quantity: Optional[Decimal] = None
    cost_price: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    status: Optional[str] = None


class ItemRead(ItemBase):
    id: int
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    category_name: Optional[str] = None
    uom_symbol: Optional[str] = None
    total_on_hand: Decimal = Decimal("0.0")

    class Config:
        from_attributes = True


# --- Stock Operation Schemas ---
class StockReceiptCreate(BaseModel):
    reference_no: str = Field(..., min_length=2, max_length=100)
    item_id: int
    warehouse_id: int
    quantity: Decimal = Field(..., gt=0)
    supplier_id: Optional[int] = None
    unit_cost: Optional[Decimal] = None
    notes: Optional[str] = None
    receipt_date: Optional[datetime] = None


class StockIssueCreate(BaseModel):
    reference_no: str = Field(..., min_length=2, max_length=100)
    item_id: int
    warehouse_id: int
    quantity: Decimal = Field(..., gt=0)
    reason: str = Field(..., min_length=2, max_length=255)
    notes: Optional[str] = None
    issue_date: Optional[datetime] = None


class StockAdjustmentCreate(BaseModel):
    reference_no: str = Field(..., min_length=2, max_length=100)
    item_id: int
    warehouse_id: int
    actual_quantity: Decimal = Field(..., ge=0)
    reason: str = Field(..., min_length=2, max_length=255)
    notes: Optional[str] = None


class StockTransferCreate(BaseModel):
    reference_no: str = Field(..., min_length=2, max_length=100)
    item_id: int
    source_warehouse_id: int
    destination_warehouse_id: int
    quantity: Decimal = Field(..., gt=0)
    notes: Optional[str] = None


class StockTransactionRead(BaseModel):
    id: int
    transaction_type: str
    reference_no: str
    item_id: int
    item_code: Optional[str] = None
    item_name: Optional[str] = None
    quantity: Decimal
    source_warehouse_name: Optional[str] = None
    destination_warehouse_name: Optional[str] = None
    supplier_name: Optional[str] = None
    unit_cost: Optional[Decimal] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    transaction_date: datetime
    user_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class StockBalanceRead(BaseModel):
    id: int
    item_id: int
    warehouse_id: int
    warehouse_name: str
    warehouse_code: str
    quantity: Decimal
    updated_at: datetime

    class Config:
        from_attributes = True


class InventoryDashboardData(BaseModel):
    total_active_items: int
    total_quantity_on_hand: Decimal
    low_stock_items_count: int
    out_of_stock_items_count: int
    recent_receipts_count: int
    recent_issues_count: int
    recent_adjustments_count: int
    recent_transfers_count: int
    inventory_valuation: Decimal
