"""009_drop_users_name_not_null

Revision ID: 009_drop_users_name_not_null
Revises: 008_performance_management
Create Date: 2026-10-28 09:50:00.000000

Phase 2 Fix:
Removes the NOT NULL constraint on the legacy `users.name` column to allow
user and super admin records to be created and managed using canonical
`first_name` and `last_name` columns without NotNullViolation errors.
Preserves the existing column and all existing data.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '009_drop_users_name_not_null'
down_revision: Union[str, None] = '008_performance_management'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'users' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('users')]
        if 'name' in columns:
            # Drop the NOT NULL constraint on users.name while preserving the column and values
            op.alter_column('users', 'name', existing_type=sa.String(length=255), nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'users' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('users')]
        if 'name' in columns:
            op.alter_column('users', 'name', existing_type=sa.String(length=255), nullable=False)
