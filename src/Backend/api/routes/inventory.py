"""
Nexora Inventory Management API Endpoints
Provides comprehensive inventory master management, warehouse locations, stock operations (receive, issue, adjust, transfer), ledger tracking, low-stock alerts, and Excel import/export.
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, desc, asc
from sqlalchemy.orm import Session

from Backend.api.deps import get_current_user
from Backend.core.database import get_db
from Backend.models.audit import SecurityAuditLog
from Backend.models.inventory import (
    InventoryCategory,
    UnitOfMeasure,
    Warehouse,
    InventoryItem,
    StockBalance,
    StockTransaction,
)
from Backend.models.supplier import Supplier
from Backend.models.user import User
from Backend.schemas.response import APIResponse
from Backend.schemas.inventory import (
    CategoryCreate,
    CategoryUpdate,
    CategoryRead,
    UOMCreate,
    UOMRead,
    WarehouseCreate,
    WarehouseUpdate,
    WarehouseRead,
    ItemCreate,
    ItemUpdate,
    ItemRead,
    StockReceiptCreate,
    StockIssueCreate,
    StockAdjustmentCreate,
    StockTransferCreate,
    StockTransactionRead,
    StockBalanceRead,
    InventoryDashboardData,
)

router = APIRouter(prefix="/inventory", tags=["Inventory"])


def sanitize_formula(val: Optional[str]) -> str:
    if not val:
        return ""
    s = str(val).strip()
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{s}"
    return s


# =================================================================
# DASHBOARD & ALERTS
# =================================================================
@router.get("/dashboard", response_model=APIResponse[InventoryDashboardData])
def get_inventory_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_active = db.query(InventoryItem).filter(InventoryItem.status == "active").count()
    total_qty = db.query(func.coalesce(func.sum(StockBalance.quantity), 0)).scalar() or Decimal("0.0")

    # Low stock & out of stock
    items = db.query(InventoryItem).filter(InventoryItem.status == "active").all()
    low_stock = 0
    out_of_stock = 0
    valuation = Decimal("0.0")

    for it in items:
        qty_on_hand = (
            db.query(func.coalesce(func.sum(StockBalance.quantity), 0))
            .filter(StockBalance.item_id == it.id)
            .scalar()
            or Decimal("0.0")
        )
        if qty_on_hand == 0:
            out_of_stock += 1
        elif qty_on_hand <= it.min_stock_level:
            low_stock += 1

        if it.cost_price and it.cost_price > 0:
            valuation += qty_on_hand * it.cost_price

    receipts_count = db.query(StockTransaction).filter(StockTransaction.transaction_type == "receipt").count()
    issues_count = db.query(StockTransaction).filter(StockTransaction.transaction_type == "issue").count()
    adjustments_count = db.query(StockTransaction).filter(StockTransaction.transaction_type == "adjustment").count()
    transfers_count = db.query(StockTransaction).filter(StockTransaction.transaction_type == "transfer").count()

    data = InventoryDashboardData(
        total_active_items=total_active,
        total_quantity_on_hand=Decimal(str(total_qty)),
        low_stock_items_count=low_stock,
        out_of_stock_items_count=out_of_stock,
        recent_receipts_count=receipts_count,
        recent_issues_count=issues_count,
        recent_adjustments_count=adjustments_count,
        recent_transfers_count=transfers_count,
        inventory_valuation=Decimal(str(valuation)),
    )
    return APIResponse.ok(data=data, message="Dashboard statistics retrieved.")


@router.get("/alerts/low-stock")
def get_low_stock_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = db.query(InventoryItem).filter(InventoryItem.status == "active").all()
    alerts = []
    for it in items:
        qty_on_hand = (
            db.query(func.coalesce(func.sum(StockBalance.quantity), 0))
            .filter(StockBalance.item_id == it.id)
            .scalar()
            or Decimal("0.0")
        )
        if qty_on_hand <= it.min_stock_level:
            alerts.append({
                "item_id": it.id,
                "item_code": it.code,
                "item_name": it.name,
                "category_name": it.category.name if it.category else None,
                "uom_symbol": it.uom.symbol if it.uom else None,
                "quantity_on_hand": float(qty_on_hand),
                "min_stock_level": float(it.min_stock_level),
                "reorder_quantity": float(it.reorder_quantity),
                "status": "out_of_stock" if qty_on_hand == 0 else "low_stock",
            })
    return APIResponse.ok(data=alerts, message=f"{len(alerts)} alert(s) found.")


# =================================================================
# CATEGORIES & UNITS OF MEASURE & WAREHOUSES
# =================================================================
@router.get("/categories")
def list_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cats = db.query(InventoryCategory).order_by(InventoryCategory.name).all()
    return APIResponse.ok(data=cats)


@router.post("/categories")
def create_category(cat: CategoryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(InventoryCategory).filter(InventoryCategory.code == cat.code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Category code '{cat.code}' already exists.")
    obj = InventoryCategory(**cat.dict())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return APIResponse.ok(data=obj, message="Category created.")


@router.get("/uom")
def list_uom(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    uoms = db.query(UnitOfMeasure).order_by(UnitOfMeasure.name).all()
    return APIResponse.ok(data=uoms)


@router.post("/uom")
def create_uom(uom: UOMCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(UnitOfMeasure).filter(UnitOfMeasure.code == uom.code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"UOM code '{uom.code}' already exists.")
    obj = UnitOfMeasure(**uom.dict())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return APIResponse.ok(data=obj, message="Unit of measure created.")


@router.get("/warehouses")
def list_warehouses(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    whs = db.query(Warehouse).order_by(Warehouse.name).all()
    return APIResponse.ok(data=whs)


@router.post("/warehouses")
def create_warehouse(wh: WarehouseCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(Warehouse).filter(Warehouse.code == wh.code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Warehouse code '{wh.code}' already exists.")
    obj = Warehouse(**wh.dict())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return APIResponse.ok(data=obj, message="Warehouse created.")


# =================================================================
# ITEM MASTER
# =================================================================
@router.get("/items/next-code")
def get_next_item_code(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    count = db.query(func.count(InventoryItem.id)).scalar() or 0
    next_num = count + 1
    code = f"SKU-{next_num:05d}"
    while db.query(InventoryItem.id).filter(InventoryItem.code == code).first():
        next_num += 1
        code = f"SKU-{next_num:05d}"
    return APIResponse.ok(data={"next_code": code})


@router.get("/items")
def list_items(
    search: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(InventoryItem)
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(InventoryItem.code).like(term),
                func.lower(InventoryItem.name).like(term),
                func.lower(InventoryItem.barcode).like(term),
            )
        )
    if category_id:
        query = query.filter(InventoryItem.category_id == category_id)
    if status and status != "all":
        query = query.filter(InventoryItem.status == status)

    total = query.count()
    sort_col = getattr(InventoryItem, sort_by, InventoryItem.created_at)
    if sort_order.lower() == "asc":
        query = query.order_by(asc(sort_col))
    else:
        query = query.order_by(desc(sort_col))

    items = query.offset((page - 1) * page_size).limit(page_size).all()
    results = []
    for it in items:
        qty_on_hand = (
            db.query(func.coalesce(func.sum(StockBalance.quantity), 0))
            .filter(StockBalance.item_id == it.id)
            .scalar()
            or Decimal("0.0")
        )
        results.append({
            "id": it.id,
            "code": it.code,
            "name": it.name,
            "description": it.description,
            "category_id": it.category_id,
            "category_name": it.category.name if it.category else None,
            "uom_id": it.uom_id,
            "uom_symbol": it.uom.symbol if it.uom else None,
            "barcode": it.barcode,
            "min_stock_level": float(it.min_stock_level),
            "reorder_quantity": float(it.reorder_quantity),
            "cost_price": float(it.cost_price),
            "selling_price": float(it.selling_price),
            "status": it.status,
            "total_on_hand": float(qty_on_hand),
            "created_at": it.created_at.isoformat() if it.created_at else None,
            "updated_at": it.updated_at.isoformat() if it.updated_at else None,
        })

    return APIResponse.ok(
        data={
            "items": results,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "totalPages": (total + page_size - 1) // page_size if total > 0 else 1,
        }
    )


@router.post("/items")
def create_item(
    item_in: ItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(InventoryItem).filter(InventoryItem.code == item_in.code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Item code '{item_in.code}' already exists.")

    item = InventoryItem(
        code=item_in.code,
        name=item_in.name,
        description=item_in.description,
        category_id=item_in.category_id,
        uom_id=item_in.uom_id,
        barcode=item_in.barcode,
        min_stock_level=item_in.min_stock_level,
        reorder_quantity=item_in.reorder_quantity,
        cost_price=item_in.cost_price,
        selling_price=item_in.selling_price,
        status=item_in.status,
        created_by=current_user.id,
    )
    db.add(item)
    db.flush()

    # Optional initial stock receipt
    if item_in.initial_warehouse_id and item_in.initial_quantity and item_in.initial_quantity > 0:
        balance = StockBalance(
            item_id=item.id,
            warehouse_id=item_in.initial_warehouse_id,
            quantity=item_in.initial_quantity,
        )
        db.add(balance)

        tx = StockTransaction(
            transaction_type="receipt",
            reference_no=f"INIT-{item.code}",
            item_id=item.id,
            quantity=item_in.initial_quantity,
            destination_warehouse_id=item_in.initial_warehouse_id,
            reason="Opening balance initialization",
            user_id=current_user.id,
        )
        db.add(tx)

    db.commit()
    db.refresh(item)
    return APIResponse.ok(data={"id": item.id, "code": item.code, "name": item.name}, message="Item created.")


@router.get("/items/{item_id}")
def get_item(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    balances = db.query(StockBalance).filter(StockBalance.item_id == item_id).all()
    balance_list = [
        {
            "warehouse_id": b.warehouse_id,
            "warehouse_name": b.warehouse.name if b.warehouse else "Unknown",
            "quantity": float(b.quantity),
            "updated_at": b.updated_at.isoformat() if b.updated_at else None,
        }
        for b in balances
    ]
    total_qty = sum(b["quantity"] for b in balance_list)

    return APIResponse.ok(
        data={
            "id": item.id,
            "code": item.code,
            "name": item.name,
            "description": item.description,
            "category_id": item.category_id,
            "category_name": item.category.name if item.category else None,
            "uom_id": item.uom_id,
            "uom_symbol": item.uom.symbol if item.uom else None,
            "barcode": item.barcode,
            "min_stock_level": float(item.min_stock_level),
            "reorder_quantity": float(item.reorder_quantity),
            "cost_price": float(item.cost_price),
            "selling_price": float(item.selling_price),
            "status": item.status,
            "total_on_hand": total_qty,
            "balances": balance_list,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        }
    )


@router.put("/items/{item_id}")
def update_item(item_id: int, updates: ItemUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    for k, v in updates.dict(exclude_unset=True).items():
        setattr(item, k, v)
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return APIResponse.ok(data={"id": item.id, "name": item.name}, message="Item updated.")


@router.delete("/items/{item_id}")
def delete_or_disable_item(item_id: int, force_disable: bool = False, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    has_transactions = db.query(StockTransaction).filter(StockTransaction.item_id == item_id).first()
    if has_transactions or force_disable:
        item.status = "disabled"
        item.updated_at = datetime.now(timezone.utc)
        db.commit()
        return APIResponse.ok(data={"action": "disabled"}, message="Item disabled to preserve historical stock transactions.")

    db.delete(item)
    db.commit()
    return APIResponse.ok(data={"action": "deleted"}, message="Item permanently deleted.")


# =================================================================
# STOCK TRANSACTIONS (RECEIPT, ISSUE, ADJUSTMENT, TRANSFER)
# =================================================================
@router.post("/operations/receive")
def receive_stock(
    receipt: StockReceiptCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == receipt.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    warehouse = db.query(Warehouse).filter(Warehouse.id == receipt.warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found.")

    if receipt.supplier_id:
        supplier = db.query(Supplier).filter(Supplier.id == receipt.supplier_id).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found.")

    # Update or insert stock balance atomically
    balance = (
        db.query(StockBalance)
        .filter(StockBalance.item_id == receipt.item_id, StockBalance.warehouse_id == receipt.warehouse_id)
        .with_for_update()
        .first()
    )
    if balance:
        balance.quantity += receipt.quantity
        balance.updated_at = datetime.now(timezone.utc)
    else:
        balance = StockBalance(
            item_id=receipt.item_id,
            warehouse_id=receipt.warehouse_id,
            quantity=receipt.quantity,
        )
        db.add(balance)

    tx = StockTransaction(
        transaction_type="receipt",
        reference_no=receipt.reference_no,
        item_id=receipt.item_id,
        quantity=receipt.quantity,
        destination_warehouse_id=receipt.warehouse_id,
        supplier_id=receipt.supplier_id,
        unit_cost=receipt.unit_cost,
        notes=receipt.notes,
        transaction_date=receipt.receipt_date or datetime.now(timezone.utc),
        user_id=current_user.id,
    )
    db.add(tx)
    db.commit()

    return APIResponse.ok(
        data={"transaction_id": tx.id, "new_balance": float(balance.quantity)},
        message=f"Received {receipt.quantity} of {item.name}.",
    )


@router.post("/operations/issue")
def issue_stock(
    issue: StockIssueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == issue.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    warehouse = db.query(Warehouse).filter(Warehouse.id == issue.warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found.")

    balance = (
        db.query(StockBalance)
        .filter(StockBalance.item_id == issue.item_id, StockBalance.warehouse_id == issue.warehouse_id)
        .with_for_update()
        .first()
    )
    current_qty = balance.quantity if balance else Decimal("0.0")

    if current_qty < issue.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock in warehouse '{warehouse.name}'. Available: {current_qty}, Requested: {issue.quantity}.",
        )

    balance.quantity -= issue.quantity
    balance.updated_at = datetime.now(timezone.utc)

    tx = StockTransaction(
        transaction_type="issue",
        reference_no=issue.reference_no,
        item_id=issue.item_id,
        quantity=issue.quantity,
        source_warehouse_id=issue.warehouse_id,
        reason=issue.reason,
        notes=issue.notes,
        transaction_date=issue.issue_date or datetime.now(timezone.utc),
        user_id=current_user.id,
    )
    db.add(tx)
    db.commit()

    return APIResponse.ok(
        data={"transaction_id": tx.id, "remaining_balance": float(balance.quantity)},
        message=f"Issued {issue.quantity} of {item.name}.",
    )


@router.post("/operations/adjust")
def adjust_stock(
    adj: StockAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == adj.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    warehouse = db.query(Warehouse).filter(Warehouse.id == adj.warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found.")

    balance = (
        db.query(StockBalance)
        .filter(StockBalance.item_id == adj.item_id, StockBalance.warehouse_id == adj.warehouse_id)
        .with_for_update()
        .first()
    )
    current_qty = balance.quantity if balance else Decimal("0.0")
    difference = adj.actual_quantity - current_qty

    if balance:
        balance.quantity = adj.actual_quantity
        balance.updated_at = datetime.now(timezone.utc)
    else:
        balance = StockBalance(
            item_id=adj.item_id,
            warehouse_id=adj.warehouse_id,
            quantity=adj.actual_quantity,
        )
        db.add(balance)

    tx = StockTransaction(
        transaction_type="adjustment",
        reference_no=adj.reference_no,
        item_id=adj.item_id,
        quantity=difference,
        destination_warehouse_id=adj.warehouse_id,
        reason=adj.reason,
        notes=adj.notes,
        user_id=current_user.id,
    )
    db.add(tx)
    db.commit()

    return APIResponse.ok(
        data={"transaction_id": tx.id, "difference": float(difference), "new_balance": float(adj.actual_quantity)},
        message=f"Adjusted stock for {item.name} to {adj.actual_quantity} (Difference: {difference}).",
    )


@router.post("/operations/transfer")
def transfer_stock(
    transfer: StockTransferCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if transfer.source_warehouse_id == transfer.destination_warehouse_id:
        raise HTTPException(status_code=400, detail="Source and destination warehouses must be different.")

    item = db.query(InventoryItem).filter(InventoryItem.id == transfer.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    src_balance = (
        db.query(StockBalance)
        .filter(StockBalance.item_id == transfer.item_id, StockBalance.warehouse_id == transfer.source_warehouse_id)
        .with_for_update()
        .first()
    )
    available = src_balance.quantity if src_balance else Decimal("0.0")
    if available < transfer.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient quantity in source warehouse. Available: {available}, Required: {transfer.quantity}.",
        )

    # Decrement source
    src_balance.quantity -= transfer.quantity
    src_balance.updated_at = datetime.now(timezone.utc)

    # Increment destination
    dest_balance = (
        db.query(StockBalance)
        .filter(StockBalance.item_id == transfer.item_id, StockBalance.warehouse_id == transfer.destination_warehouse_id)
        .with_for_update()
        .first()
    )
    if dest_balance:
        dest_balance.quantity += transfer.quantity
        dest_balance.updated_at = datetime.now(timezone.utc)
    else:
        dest_balance = StockBalance(
            item_id=transfer.item_id,
            warehouse_id=transfer.destination_warehouse_id,
            quantity=transfer.quantity,
        )
        db.add(dest_balance)

    tx = StockTransaction(
        transaction_type="transfer",
        reference_no=transfer.reference_no,
        item_id=transfer.item_id,
        quantity=transfer.quantity,
        source_warehouse_id=transfer.source_warehouse_id,
        destination_warehouse_id=transfer.destination_warehouse_id,
        notes=transfer.notes,
        user_id=current_user.id,
    )
    db.add(tx)
    db.commit()

    return APIResponse.ok(
        data={"transaction_id": tx.id},
        message=f"Transferred {transfer.quantity} of {item.name}.",
    )


@router.get("/movements")
def list_movements(
    item_id: Optional[int] = Query(None),
    transaction_type: Optional[str] = Query(None),
    warehouse_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(StockTransaction)
    if item_id:
        query = query.filter(StockTransaction.item_id == item_id)
    if transaction_type and transaction_type != "all":
        query = query.filter(StockTransaction.transaction_type == transaction_type)
    if warehouse_id:
        query = query.filter(
            or_(
                StockTransaction.source_warehouse_id == warehouse_id,
                StockTransaction.destination_warehouse_id == warehouse_id,
            )
        )

    total = query.count()
    txs = query.order_by(desc(StockTransaction.created_at)).offset((page - 1) * page_size).limit(page_size).all()

    items_dict = {it.id: it for it in db.query(InventoryItem).filter(InventoryItem.id.in_([t.item_id for t in txs])).all()} if txs else {}
    wh_dict = {w.id: w.name for w in db.query(Warehouse).all()}
    sup_dict = {s.id: s.name for s in db.query(Supplier).all()}

    results = []
    for t in txs:
        it = items_dict.get(t.item_id)
        results.append({
            "id": t.id,
            "transaction_type": t.transaction_type,
            "reference_no": t.reference_no,
            "item_id": t.item_id,
            "item_code": it.code if it else None,
            "item_name": it.name if it else None,
            "quantity": float(t.quantity),
            "source_warehouse_name": wh_dict.get(t.source_warehouse_id),
            "destination_warehouse_name": wh_dict.get(t.destination_warehouse_id),
            "supplier_name": sup_dict.get(t.supplier_id),
            "unit_cost": float(t.unit_cost) if t.unit_cost else None,
            "reason": t.reason,
            "notes": t.notes,
            "transaction_date": t.transaction_date.isoformat() if t.transaction_date else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    return APIResponse.ok(
        data={
            "transactions": results,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "totalPages": (total + page_size - 1) // page_size if total > 0 else 1,
        }
    )
