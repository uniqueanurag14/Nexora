"""007_invoice_management

Revision ID: 007_invoice_management
Revises: 006_supplier_reorder_workflow
Create Date: 2026-10-22 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '007_invoice_management'
down_revision: Union[str, None] = '006_supplier_reorder_workflow'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. invoices
    if 'invoices' not in existing_tables:
        op.create_table(
            'invoices',
            sa.Column('id', sa.String(length=100), primary_key=True),
            sa.Column('invoice_number', sa.String(length=100), unique=True, nullable=False),
            sa.Column('organization_id', sa.String(length=100), nullable=True),
            sa.Column('branch_id', sa.String(length=100), nullable=True),
            sa.Column('patient_id', sa.String(length=100), nullable=True),
            sa.Column('total_amount', sa.Numeric(14, 2), server_default='0', nullable=False),
            sa.Column('paid_amount', sa.Numeric(14, 2), server_default='0', nullable=False),
            sa.Column('balance', sa.Numeric(14, 2), server_default='0', nullable=False),
            sa.Column('status', sa.String(length=50), server_default='issued', nullable=False),
            sa.Column('payment_method', sa.String(length=50), nullable=True),
            sa.Column('is_demo', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        )
        op.create_index(op.f('ix_invoices_number'), 'invoices', ['invoice_number'], unique=True)
        op.create_index(op.f('ix_invoices_patient'), 'invoices', ['patient_id'], unique=False)

    # 2. invoice_items
    if 'invoice_items' not in existing_tables:
        op.create_table(
            'invoice_items',
            sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
            sa.Column('invoice_id', sa.String(length=100), nullable=False),
            sa.Column('description', sa.String(length=255), nullable=False),
            sa.Column('quantity', sa.Numeric(12, 2), server_default='1', nullable=False),
            sa.Column('unit_price', sa.Numeric(14, 2), server_default='0', nullable=False),
            sa.Column('total_price', sa.Numeric(14, 2), server_default='0', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], ondelete='CASCADE'),
        )
        op.create_index(op.f('ix_invoice_items_invoice_id'), 'invoice_items', ['invoice_id'], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'invoice_items' in existing_tables:
        op.drop_table('invoice_items')
    if 'invoices' in existing_tables:
        op.drop_table('invoices')
