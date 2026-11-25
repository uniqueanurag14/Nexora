"""005_inventory_management

Revision ID: 005_inventory_management
Revises: 004_supplier_management
Create Date: 2026-10-22 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '005_inventory_management'
down_revision: Union[str, None] = '004_supplier_management'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. inventory_categories
    if 'inventory_categories' not in existing_tables:
        op.create_table(
            'inventory_categories',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('code', sa.String(length=50), nullable=False),
            sa.Column('name', sa.String(length=150), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('code', name='uq_inventory_categories_code')
        )
        op.create_index(op.f('ix_inventory_categories_code'), 'inventory_categories', ['code'], unique=True)

    # 2. units_of_measure
    if 'units_of_measure' not in existing_tables:
        op.create_table(
            'units_of_measure',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('code', sa.String(length=50), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('symbol', sa.String(length=20), nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('code', name='uq_units_of_measure_code')
        )

    # 3. warehouses
    if 'warehouses' not in existing_tables:
        op.create_table(
            'warehouses',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('code', sa.String(length=50), nullable=False),
            sa.Column('name', sa.String(length=150), nullable=False),
            sa.Column('address', sa.Text(), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('code', name='uq_warehouses_code')
        )

    # 4. inventory_items
    if 'inventory_items' not in existing_tables:
        op.create_table(
            'inventory_items',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('code', sa.String(length=100), nullable=False),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('category_id', sa.Integer(), nullable=True),
            sa.Column('uom_id', sa.Integer(), nullable=True),
            sa.Column('barcode', sa.String(length=100), nullable=True),
            sa.Column('min_stock_level', sa.Numeric(12, 2), server_default='0', nullable=False),
            sa.Column('reorder_quantity', sa.Numeric(12, 2), server_default='0', nullable=False),
            sa.Column('cost_price', sa.Numeric(12, 2), server_default='0', nullable=False),
            sa.Column('selling_price', sa.Numeric(12, 2), server_default='0', nullable=False),
            sa.Column('status', sa.String(length=50), server_default='active', nullable=False),
            sa.Column('created_by', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['category_id'], ['inventory_categories.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['uom_id'], ['units_of_measure.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('code', name='uq_inventory_items_code')
        )
        op.create_index(op.f('ix_inventory_items_code'), 'inventory_items', ['code'], unique=True)
        op.create_index(op.f('ix_inventory_items_name'), 'inventory_items', ['name'], unique=False)

    # 5. stock_balances
    if 'stock_balances' not in existing_tables:
        op.create_table(
            'stock_balances',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('item_id', sa.Integer(), nullable=False),
            sa.Column('warehouse_id', sa.Integer(), nullable=False),
            sa.Column('quantity', sa.Numeric(14, 4), server_default='0', nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['item_id'], ['inventory_items.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['warehouse_id'], ['warehouses.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('item_id', 'warehouse_id', name='uq_item_warehouse_balance')
        )

    # 6. stock_transactions
    if 'stock_transactions' not in existing_tables:
        op.create_table(
            'stock_transactions',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('transaction_type', sa.String(length=50), nullable=False),
            sa.Column('reference_no', sa.String(length=100), nullable=False),
            sa.Column('item_id', sa.Integer(), nullable=False),
            sa.Column('quantity', sa.Numeric(14, 4), nullable=False),
            sa.Column('source_warehouse_id', sa.Integer(), nullable=True),
            sa.Column('destination_warehouse_id', sa.Integer(), nullable=True),
            sa.Column('supplier_id', sa.Integer(), nullable=True),
            sa.Column('unit_cost', sa.Numeric(12, 2), nullable=True),
            sa.Column('reason', sa.String(length=255), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('transaction_date', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['item_id'], ['inventory_items.id'], ondelete='RESTRICT'),
            sa.ForeignKeyConstraint(['source_warehouse_id'], ['warehouses.id'], ondelete='RESTRICT'),
            sa.ForeignKeyConstraint(['destination_warehouse_id'], ['warehouses.id'], ondelete='RESTRICT'),
            sa.ForeignKeyConstraint(['supplier_id'], ['suppliers.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_stock_transactions_ref'), 'stock_transactions', ['reference_no'], unique=False)
        op.create_index(op.f('ix_stock_transactions_item'), 'stock_transactions', ['item_id'], unique=False)


def downgrade() -> None:
    pass
