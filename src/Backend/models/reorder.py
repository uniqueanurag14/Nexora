from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime

Base = declarative_base()

class ReorderRequest(Base):
    __tablename__ = 'reorder_requests'

    id = Column(Integer, primary_key=True)
    reference_no = Column(String(100), unique=True, nullable=False)
    item_id = Column(Integer, ForeignKey('inventory_items.id', ondelete='CASCADE'), nullable=False)
    supplier_id = Column(Integer, ForeignKey('suppliers.id', ondelete='RESTRICT'), nullable=False)
    requested_quantity = Column(Numeric(12, 2), nullable=False)
    agreed_quantity = Column(Numeric(12, 2), nullable=True)
    proposed_unit_price = Column(Numeric(12, 2), nullable=False)
    final_unit_price = Column(Numeric(12, 2), nullable=True)
    status = Column(String(50), nullable=False, default='pending')
    token_hash = Column(String(64), unique=True, nullable=False)
    token_expiry = Column(DateTime(timezone=True), nullable=False)
    delivery_date = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    email_sent_at = Column(DateTime(timezone=True), nullable=True)
    email_status = Column(String(50), default='pending')
    email_error = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    negotiations = relationship("ReorderNegotiation", back_populates="reorder", cascade="all, delete-orphan")


class ReorderNegotiation(Base):
    __tablename__ = 'reorder_negotiations'

    id = Column(Integer, primary_key=True)
    reorder_id = Column(Integer, ForeignKey('reorder_requests.id', ondelete='CASCADE'), nullable=False)
    sender_type = Column(String(50), nullable=False)  # 'supplier' or 'admin'
    proposed_quantity = Column(Numeric(12, 2), nullable=False)
    proposed_unit_price = Column(Numeric(12, 2), nullable=False)
    proposed_delivery_date = Column(String(50), nullable=True)
    notes = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    reorder = relationship("ReorderRequest", back_populates="negotiations")
