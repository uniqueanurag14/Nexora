"""012_module8_purchase_requests

Revision ID: 012_module8_purchase_requests
Revises: 011_perf_roster_and_events
Create Date: 2026-10-29 10:00:00.000000

Module 8: Purchase Requests & Supplier Approval
1. Creates `purchase_requests` table.
2. Creates `purchase_request_items` table.
3. Creates `purchase_request_approvals` table.
4. Adds approval columns (`approval_status`, `approval_notes`, `approved_at`, `approved_by`, `rejection_reason`) to `suppliers` table.
5. Creates `supplier_approvals` table.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '012_module8_purchase_requests'
down_revision: Union[str, None] = '011_perf_roster_and_events'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. Update suppliers table with approval columns if not present
    if 'suppliers' in existing_tables:
        existing_cols = [c['name'] for c in inspector.get_columns('suppliers')]
        if 'approval_status' not in existing_cols:
            op.add_column(
                'suppliers',
                sa.Column('approval_status', sa.String(length=50), server_default='approved', nullable=False)
            )
        if 'approval_notes' not in existing_cols:
            op.add_column(
                'suppliers',
                sa.Column('approval_notes', sa.Text(), nullable=True)
            )
        if 'approved_at' not in existing_cols:
            op.add_column(
                'suppliers',
                sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True)
            )
        if 'approved_by' not in existing_cols:
            op.add_column(
                'suppliers',
                sa.Column('approved_by', sa.String(length=255), nullable=True)
            )
        if 'rejection_reason' not in existing_cols:
            op.add_column(
                'suppliers',
                sa.Column('rejection_reason', sa.Text(), nullable=True)
            )

    # 2. supplier_approvals table
    if 'supplier_approvals' not in existing_tables:
        op.create_table(
            'supplier_approvals',
            sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
            sa.Column('supplier_id', sa.Integer(), nullable=False),
            sa.Column('action', sa.String(length=50), nullable=False),
            sa.Column('actor_id', sa.Integer(), nullable=True),
            sa.Column('actor_name', sa.String(length=255), nullable=False),
            sa.Column('actor_role', sa.String(length=50), nullable=False),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['supplier_id'], ['suppliers.id'], ondelete='CASCADE'),
        )
        op.create_index(op.f('ix_supplier_approvals_supplier_id'), 'supplier_approvals', ['supplier_id'], unique=False)

    # 3. purchase_requests table
    if 'purchase_requests' not in existing_tables:
        op.create_table(
            'purchase_requests',
            sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
            sa.Column('pr_number', sa.String(length=100), unique=True, nullable=False),
            sa.Column('requester_id', sa.Integer(), nullable=True),
            sa.Column('requester_name', sa.String(length=255), nullable=False),
            sa.Column('department', sa.String(length=100), nullable=True),
            sa.Column('request_date', sa.String(length=50), nullable=False),
            sa.Column('required_date', sa.String(length=50), nullable=True),
            sa.Column('preferred_supplier_id', sa.Integer(), nullable=True),
            sa.Column('preferred_supplier_name', sa.String(length=255), nullable=True),
            sa.Column('status', sa.String(length=50), server_default='draft', nullable=False),
            sa.Column('priority', sa.String(length=50), server_default='medium', nullable=False),
            sa.Column('total_amount', sa.Numeric(14, 2), server_default='0.00', nullable=False),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('rejection_reason', sa.Text(), nullable=True),
            sa.Column('attachment_name', sa.String(length=255), nullable=True),
            sa.Column('created_by', sa.String(length=255), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('approved_by', sa.String(length=255), nullable=True),
            sa.ForeignKeyConstraint(['requester_id'], ['users.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['preferred_supplier_id'], ['suppliers.id'], ondelete='SET NULL'),
        )
        op.create_index(op.f('ix_purchase_requests_pr_number'), 'purchase_requests', ['pr_number'], unique=True)
        op.create_index(op.f('ix_purchase_requests_status'), 'purchase_requests', ['status'], unique=False)
        op.create_index(op.f('ix_purchase_requests_requester_id'), 'purchase_requests', ['requester_id'], unique=False)

    # 4. purchase_request_items table
    if 'purchase_request_items' not in existing_tables:
        op.create_table(
            'purchase_request_items',
            sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
            sa.Column('pr_id', sa.Integer(), nullable=False),
            sa.Column('item_id', sa.Integer(), nullable=True),
            sa.Column('item_code', sa.String(length=100), nullable=False),
            sa.Column('item_name', sa.String(length=255), nullable=False),
            sa.Column('uom', sa.String(length=50), nullable=True),
            sa.Column('quantity', sa.Numeric(12, 2), nullable=False),
            sa.Column('estimated_unit_price', sa.Numeric(12, 2), server_default='0.00', nullable=False),
            sa.Column('total_price', sa.Numeric(14, 2), server_default='0.00', nullable=False),
            sa.Column('specifications', sa.Text(), nullable=True),
            sa.Column('preferred_supplier_id', sa.Integer(), nullable=True),
            sa.Column('preferred_supplier_name', sa.String(length=255), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['pr_id'], ['purchase_requests.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['item_id'], ['inventory_items.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['preferred_supplier_id'], ['suppliers.id'], ondelete='SET NULL'),
        )
        op.create_index(op.f('ix_purchase_request_items_pr_id'), 'purchase_request_items', ['pr_id'], unique=False)

    # 5. purchase_request_approvals table
    if 'purchase_request_approvals' not in existing_tables:
        op.create_table(
            'purchase_request_approvals',
            sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
            sa.Column('pr_id', sa.Integer(), nullable=False),
            sa.Column('action', sa.String(length=50), nullable=False),
            sa.Column('actor_id', sa.Integer(), nullable=True),
            sa.Column('actor_name', sa.String(length=255), nullable=False),
            sa.Column('actor_role', sa.String(length=50), nullable=False),
            sa.Column('comments', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['pr_id'], ['purchase_requests.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
        )
        op.create_index(op.f('ix_purchase_request_approvals_pr_id'), 'purchase_request_approvals', ['pr_id'], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'purchase_request_approvals' in existing_tables:
        op.drop_table('purchase_request_approvals')
    if 'purchase_request_items' in existing_tables:
        op.drop_table('purchase_request_items')
    if 'purchase_requests' in existing_tables:
        op.drop_table('purchase_requests')
    if 'supplier_approvals' in existing_tables:
        op.drop_table('supplier_approvals')
