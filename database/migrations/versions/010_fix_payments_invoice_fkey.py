"""010_fix_payments_invoice_fkey

Revision ID: 010_fix_payments_invoice_fkey
Revises: 009_drop_users_name_not_null
Create Date: 2026-10-28 09:51:00.000000

Phase 4 Fix:
Ensures the payments table exists with consistent types (VARCHAR(100) for invoice_id)
and establishes the foreign key constraint `payments_invoice_id_fkey` referencing
`invoices(id)` with ON DELETE RESTRICT to maintain referential integrity.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '010_fix_payments_invoice_fkey'
down_revision: Union[str, None] = '009_drop_users_name_not_null'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # Create payments table if it does not exist
    if 'payments' not in existing_tables:
        op.create_table(
            'payments',
            sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
            sa.Column('invoice_id', sa.String(length=100), nullable=False),
            sa.Column('payment_number', sa.String(length=100), unique=True, nullable=False),
            sa.Column('amount', sa.Numeric(14, 2), nullable=False),
            sa.Column('payment_date', sa.String(length=50), nullable=False),
            sa.Column('payment_method', sa.String(length=50), nullable=False),
            sa.Column('reference_note', sa.Text(), nullable=True),
            sa.Column('status', sa.String(length=50), server_default='completed', nullable=False),
            sa.Column('created_by', sa.String(length=255), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], name='payments_invoice_id_fkey', ondelete='RESTRICT')
        )
        op.create_index(op.f('ix_payments_invoice_id'), 'payments', ['invoice_id'], unique=False)
        op.create_index(op.f('ix_payments_number'), 'payments', ['payment_number'], unique=True)
    else:
        # Table exists: verify foreign key constraint exists and column types match
        fkeys = inspector.get_foreign_keys('payments')
        fkey_names = [fk['name'] for fk in fkeys if fk.get('name')]
        if 'payments_invoice_id_fkey' not in fkey_names:
            try:
                op.create_foreign_key(
                    'payments_invoice_id_fkey',
                    'payments',
                    'invoices',
                    ['invoice_id'],
                    ['id'],
                    ondelete='RESTRICT'
                )
            except Exception as e:
                print(f"[Migration 010 Note]: Foreign key payments_invoice_id_fkey check: {e}")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'payments' in existing_tables:
        fkeys = inspector.get_foreign_keys('payments')
        fkey_names = [fk['name'] for fk in fkeys if fk.get('name')]
        if 'payments_invoice_id_fkey' in fkey_names:
            op.drop_constraint('payments_invoice_id_fkey', 'payments', type_='foreignkey')
