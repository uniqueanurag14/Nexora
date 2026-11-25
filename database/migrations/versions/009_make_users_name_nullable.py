"""009_make_users_name_nullable

Revision ID: 009_make_users_name_nullable
Revises: 008_performance_management
Create Date: 2026-10-28 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '009_make_users_name_nullable'
down_revision: Union[str, None] = '008_performance_management'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'users' in existing_tables:
        columns = inspector.get_columns('users')
        name_col = next((c for c in columns if c['name'] == 'name'), None)
        if name_col:
            # Make users.name column nullable to decouple user initialization from legacy field
            op.alter_column('users', 'name', existing_type=sa.String(length=255), nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'users' in existing_tables:
        columns = inspector.get_columns('users')
        name_col = next((c for c in columns if c['name'] == 'name'), None)
        if name_col:
            # Backfill any NULL names with combined first_name and last_name before restoring NOT NULL
            op.execute("UPDATE users SET name = COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), 'User') WHERE name IS NULL")
            op.alter_column('users', 'name', existing_type=sa.String(length=255), nullable=False)
