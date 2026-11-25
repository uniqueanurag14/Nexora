from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func, Numeric, Boolean
from Backend.core.database import Base

class InventoryCategory(Base):
    __tablename__ = "inventory_categories"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class UnitOfMeasure(Base):
    __tablename__ = "units_of_measure"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(50), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    symbol = Column(String(20), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class Warehouse(Base):
    __tablename__ = "warehouses"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(50), unique=True, nullable=False)
    name = Column(String(150), nullable=False)
    address = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class InventoryItem(Base):
    __tablename__ = "inventory_items"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    category_id = Column(Integer, ForeignKey("inventory_categories.id", ondelete="SET NULL"), nullable=True)
    uom_id = Column(Integer, ForeignKey("units_of_measure.id", ondelete="SET NULL"), nullable=True)
    barcode = Column(String(100), nullable=True)
    min_stock_level = Column(Numeric(12, 2), default=0, nullable=False)
    reorder_quantity = Column(Numeric(12, 2), default=0, nullable=False)
    cost_price = Column(Numeric(12, 2), default=0, nullable=False)
    selling_price = Column(Numeric(12, 2), default=0, nullable=False)
    status = Column(String(50), default="active", nullable=False)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class StockBalance(Base):
    __tablename__ = "stock_balances"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    quantity = Column(Numeric(14, 4), default=0, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class StockTransaction(Base):
    __tablename__ = "stock_transactions"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    transaction_type = Column(String(50), nullable=False)
    reference_no = Column(String(100), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False)
    quantity = Column(Numeric(14, 4), nullable=False)
    source_warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=True)
    destination_warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True)
    unit_cost = Column(Numeric(12, 2), nullable=True)
    reason = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    transaction_date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class ReorderRequest(Base):
    __tablename__ = "reorder_requests"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    reorder_no = Column(String(100), unique=True, nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False)
    quantity = Column(Numeric(12, 2), nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    total_amount = Column(Numeric(14, 2), nullable=False)
    expected_delivery_date = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String(50), default="pending_supplier_response", nullable=False, index=True)
    supplier_token_hash = Column(String(128), unique=True, nullable=False, index=True)
    token_expires_at = Column(DateTime(timezone=True), nullable=False)
    responded_at = Column(DateTime(timezone=True), nullable=True)
    supplier_response_notes = Column(Text, nullable=True)
    counter_unit_price = Column(Numeric(12, 2), nullable=True)
    counter_quantity = Column(Numeric(12, 2), nullable=True)
    counter_delivery_date = Column(String(50), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class ReorderNegotiation(Base):
    __tablename__ = "reorder_negotiations"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    reorder_id = Column(Integer, ForeignKey("reorder_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    actor = Column(String(50), nullable=False)
    action = Column(String(100), nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=True)
    quantity = Column(Numeric(12, 2), nullable=True)
    delivery_date = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
