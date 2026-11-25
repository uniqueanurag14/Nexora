"""004_supplier_management

Revision ID: 004_supplier_management
Revises: 003_rbac_matrix_and_user_roles
Create Date: 2026-10-22 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '004_supplier_management'
down_revision: Union[str, None] = '003_rbac_matrix_and_user_roles'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. suppliers table
    if 'suppliers' not in existing_tables:
        op.create_table(
            'suppliers',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('code', sa.String(length=100), nullable=False),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('category', sa.String(length=100), nullable=True),
            sa.Column('tax_id', sa.String(length=100), nullable=True),
            sa.Column('status', sa.String(length=50), server_default='active', nullable=False),
            sa.Column('contact_first_name', sa.String(length=100), nullable=True),
            sa.Column('contact_last_name', sa.String(length=100), nullable=True),
            sa.Column('email', sa.String(length=255), nullable=True),
            sa.Column('phone', sa.String(length=50), nullable=True),
            sa.Column('alternate_phone', sa.String(length=50), nullable=True),
            sa.Column('address_line1', sa.String(length=255), nullable=True),
            sa.Column('address_line2', sa.String(length=255), nullable=True),
            sa.Column('city', sa.String(length=100), nullable=True),
            sa.Column('state', sa.String(length=100), nullable=True),
            sa.Column('postal_code', sa.String(length=50), nullable=True),
            sa.Column('country', sa.String(length=100), nullable=True),
            sa.Column('website', sa.String(length=255), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_by', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('code', name='uq_suppliers_code')
        )
        op.create_index(op.f('ix_suppliers_code'), 'suppliers', ['code'], unique=True)
        op.create_index(op.f('ix_suppliers_name'), 'suppliers', ['name'], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'suppliers' in existing_tables:
        op.drop_table('suppliers')
