"""006_supplier_reorder_workflow

Revision ID: 006_supplier_reorder_workflow
Revises: 005_inventory_management
Create Date: 2026-10-22 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '006_supplier_reorder_workflow'
down_revision: Union[str, None] = '005_inventory_management'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. reorder_requests
    if 'reorder_requests' not in existing_tables:
        op.create_table(
            'reorder_requests',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('reorder_no', sa.String(length=100), nullable=False),
            sa.Column('item_id', sa.Integer(), nullable=False),
            sa.Column('supplier_id', sa.Integer(), nullable=False),
            sa.Column('quantity', sa.Numeric(12, 2), nullable=False),
            sa.Column('unit_price', sa.Numeric(12, 2), nullable=False),
            sa.Column('total_amount', sa.Numeric(14, 2), nullable=False),
            sa.Column('expected_delivery_date', sa.String(length=50), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('status', sa.String(length=50), server_default='pending_supplier_response', nullable=False),
            sa.Column('supplier_token_hash', sa.String(length=128), nullable=False),
            sa.Column('token_expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('supplier_response_notes', sa.Text(), nullable=True),
            sa.Column('counter_unit_price', sa.Numeric(12, 2), nullable=True),
            sa.Column('counter_quantity', sa.Numeric(12, 2), nullable=True),
            sa.Column('counter_delivery_date', sa.String(length=50), nullable=True),
            sa.Column('rejection_reason', sa.Text(), nullable=True),
            sa.Column('created_by', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['item_id'], ['inventory_items.id'], ondelete='RESTRICT'),
            sa.ForeignKeyConstraint(['supplier_id'], ['suppliers.id'], ondelete='RESTRICT'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('reorder_no', name='uq_reorder_requests_no')
        )
        op.create_index(op.f('ix_reorder_requests_token_hash'), 'reorder_requests', ['supplier_token_hash'], unique=True)
        op.create_index(op.f('ix_reorder_requests_status'), 'reorder_requests', ['status'], unique=False)

    # 2. reorder_negotiations
    if 'reorder_negotiations' not in existing_tables:
        op.create_table(
            'reorder_negotiations',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('reorder_id', sa.Integer(), nullable=False),
            sa.Column('actor', sa.String(length=50), nullable=False),
            sa.Column('action', sa.String(length=100), nullable=False),
            sa.Column('unit_price', sa.Numeric(12, 2), nullable=True),
            sa.Column('quantity', sa.Numeric(12, 2), nullable=True),
            sa.Column('delivery_date', sa.String(length=50), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['reorder_id'], ['reorder_requests.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_reorder_negotiations_reorder_id'), 'reorder_negotiations', ['reorder_id'], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'reorder_negotiations' in existing_tables:
        op.drop_table('reorder_negotiations')
    if 'reorder_requests' in existing_tables:
        op.drop_table('reorder_requests')
