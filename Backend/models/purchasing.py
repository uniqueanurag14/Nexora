from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, ForeignKey, func, Boolean
from sqlalchemy.orm import relationship
from Backend.core.database import Base


class PurchaseRequest(Base):
    __tablename__ = "purchase_requests"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    pr_number = Column(String(100), unique=True, nullable=False, index=True)
    requester_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    requester_name = Column(String(255), nullable=False)
    department = Column(String(100), nullable=True)
    request_date = Column(String(50), nullable=False)
    required_date = Column(String(50), nullable=True)
    preferred_supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True)
    preferred_supplier_name = Column(String(255), nullable=True)
    status = Column(String(50), default="draft", nullable=False, index=True)
    priority = Column(String(50), default="medium", nullable=False)
    total_amount = Column(Numeric(14, 2), default=0.00, nullable=False)
    notes = Column(Text, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    attachment_name = Column(String(255), nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(String(255), nullable=True)

    items = relationship("PurchaseRequestItem", back_populates="purchase_request", cascade="all, delete-orphan")
    approvals = relationship("PurchaseRequestApproval", back_populates="purchase_request", cascade="all, delete-orphan")


class PurchaseRequestItem(Base):
    __tablename__ = "purchase_request_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    pr_id = Column(Integer, ForeignKey("purchase_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="SET NULL"), nullable=True)
    item_code = Column(String(100), nullable=False)
    item_name = Column(String(255), nullable=False)
    uom = Column(String(50), nullable=True)
    quantity = Column(Numeric(12, 2), nullable=False)
    estimated_unit_price = Column(Numeric(12, 2), default=0.00, nullable=False)
    total_price = Column(Numeric(14, 2), default=0.00, nullable=False)
    specifications = Column(Text, nullable=True)
    preferred_supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True)
    preferred_supplier_name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    purchase_request = relationship("PurchaseRequest", back_populates="items")


class PurchaseRequestApproval(Base):
    __tablename__ = "purchase_request_approvals"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    pr_id = Column(Integer, ForeignKey("purchase_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(50), nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_name = Column(String(255), nullable=False)
    actor_role = Column(String(50), nullable=False)
    comments = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    purchase_request = relationship("PurchaseRequest", back_populates="approvals")


class SupplierApproval(Base):
    __tablename__ = "supplier_approvals"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(50), nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_name = Column(String(255), nullable=False)
    actor_role = Column(String(50), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
