from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime

Base = declarative_base()

class Invoice(Base):
    __tablename__ = 'invoices'

    id = Column(String(100), primary_key=True)
    invoice_number = Column(String(100), unique=True, nullable=False)
    customer_name = Column(String(255), nullable=False)
    customer_email = Column(String(255), nullable=True)
    customer_phone = Column(String(50), nullable=True)
    customer_address = Column(Text, nullable=True)
    issue_date = Column(String(50), nullable=False)
    due_date = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False, default='draft')
    subtotal = Column(Numeric(12, 2), nullable=False, default=0)
    tax_rate = Column(Numeric(5, 2), nullable=False, default=0)
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)
    amount_paid = Column(Numeric(12, 2), nullable=False, default=0)
    balance_due = Column(Numeric(12, 2), nullable=False, default=0)
    payment_terms = Column(String(100), default='Net 30')
    notes = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice", cascade="all, delete-orphan")


class InvoiceItem(Base):
    __tablename__ = 'invoice_items'

    id = Column(Integer, primary_key=True)
    invoice_id = Column(String(100), ForeignKey('invoices.id', ondelete='CASCADE'), nullable=False)
    item_id = Column(Integer, ForeignKey('inventory_items.id', ondelete='SET NULL'), nullable=True)
    description = Column(Text, nullable=False)
    quantity = Column(Numeric(12, 2), nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    tax_rate = Column(Numeric(5, 2), default=0)
    total_price = Column(Numeric(12, 2), nullable=False)

    invoice = relationship("Invoice", back_populates="items")


class Payment(Base):
    __tablename__ = 'payments'

    id = Column(Integer, primary_key=True)
    invoice_id = Column(String(100), ForeignKey('invoices.id', ondelete='CASCADE'), nullable=False)
    payment_number = Column(String(100), unique=True, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_date = Column(String(50), nullable=False)
    payment_method = Column(String(50), nullable=False)
    reference_note = Column(Text, nullable=True)
    status = Column(String(50), default='completed')
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="payments")
