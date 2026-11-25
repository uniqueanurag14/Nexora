"""002_module4_schema

Revision ID: 002_module4_schema
Revises: 001_initial_schema
Create Date: 2026-10-18 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '002_module4_schema'
down_revision: Union[str, None] = '001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. Add Module 4 profile columns to users table if missing
    if 'users' in existing_tables:
        existing_cols = [c['name'] for c in inspector.get_columns('users')]
        if 'username' not in existing_cols:
            op.add_column('users', sa.Column('username', sa.String(length=100), nullable=True))
            op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)
        if 'first_name' not in existing_cols:
            op.add_column('users', sa.Column('first_name', sa.String(length=100), nullable=True))
        if 'last_name' not in existing_cols:
            op.add_column('users', sa.Column('last_name', sa.String(length=100), nullable=True))
        if 'phone' not in existing_cols:
            op.add_column('users', sa.Column('phone', sa.String(length=50), nullable=True))
        if 'department' not in existing_cols:
            op.add_column('users', sa.Column('department', sa.String(length=100), nullable=True))

    # 2. user_sessions table
    if 'user_sessions' not in existing_tables:
        op.create_table(
            'user_sessions',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('token_hash', sa.String(length=64), nullable=False),
            sa.Column('ip_address', sa.String(length=100), nullable=True),
            sa.Column('user_agent', sa.Text(), nullable=True),
            sa.Column('device_info', sa.String(length=255), nullable=True),
            sa.Column('last_activity_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('is_revoked', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_user_sessions_id'), 'user_sessions', ['id'], unique=False)
        op.create_index(op.f('ix_user_sessions_user_id'), 'user_sessions', ['user_id'], unique=False)
        op.create_index(op.f('ix_user_sessions_token_hash'), 'user_sessions', ['token_hash'], unique=False)

    # 3. system_settings table
    if 'system_settings' not in existing_tables:
        op.create_table(
            'system_settings',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('key', sa.String(length=100), nullable=False),
            sa.Column('value', sa.Text(), nullable=False),
            sa.Column('category', sa.String(length=50), server_default='general', nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('is_public', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_by', sa.String(length=255), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_system_settings_id'), 'system_settings', ['id'], unique=False)
        op.create_index(op.f('ix_system_settings_key'), 'system_settings', ['key'], unique=True)

    # 4. database_backups table
    if 'database_backups' not in existing_tables:
        op.create_table(
            'database_backups',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('filename', sa.String(length=255), nullable=False),
            sa.Column('size_bytes', sa.BigInteger(), server_default='0', nullable=False),
            sa.Column('status', sa.String(length=50), server_default='COMPLETED', nullable=False),
            sa.Column('table_count', sa.Integer(), server_default='0', nullable=False),
            sa.Column('created_by', sa.String(length=255), server_default='System Administrator', nullable=False),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_database_backups_id'), 'database_backups', ['id'], unique=False)

    # 5. menu_items table
    if 'menu_items' not in existing_tables:
        op.create_table(
            'menu_items',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('code', sa.String(length=100), nullable=False),
            sa.Column('label', sa.String(length=100), nullable=False),
            sa.Column('icon', sa.String(length=50), server_default='Circle', nullable=False),
            sa.Column('route', sa.String(length=255), nullable=True),
            sa.Column('parent_code', sa.String(length=100), nullable=True),
            sa.Column('display_order', sa.Integer(), server_default='0', nullable=False),
            sa.Column('required_permission', sa.String(length=100), nullable=True),
            sa.Column('module_tag', sa.String(length=50), server_default='core', nullable=False),
            sa.Column('is_implemented', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_menu_items_id'), 'menu_items', ['id'], unique=False)
        op.create_index(op.f('ix_menu_items_code'), 'menu_items', ['code'], unique=True)

    # 6. permissions table
    if 'permissions' not in existing_tables:
        op.create_table(
            'permissions',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('code', sa.String(length=100), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('module', sa.String(length=50), nullable=False),
            sa.Column('category', sa.String(length=50), server_default='menu', nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_permissions_id'), 'permissions', ['id'], unique=False)
        op.create_index(op.f('ix_permissions_code'), 'permissions', ['code'], unique=True)

    # 7. role_permissions table
    if 'role_permissions' not in existing_tables:
        op.create_table(
            'role_permissions',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('role', sa.String(length=50), nullable=False),
            sa.Column('permission_code', sa.String(length=100), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_role_permissions_id'), 'role_permissions', ['id'], unique=False)
        op.create_index(op.f('ix_role_permissions_role'), 'role_permissions', ['role'], unique=False)
        op.create_index(op.f('ix_role_permissions_permission_code'), 'role_permissions', ['permission_code'], unique=False)

    # 8. roles table
    if 'roles' not in existing_tables:
        op.create_table(
            'roles',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('code', sa.String(length=50), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('is_system', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_roles_id'), 'roles', ['id'], unique=False)
        op.create_index(op.f('ix_roles_code'), 'roles', ['code'], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    for tbl in ['roles', 'role_permissions', 'permissions', 'menu_items', 'database_backups', 'system_settings', 'user_sessions']:
        if tbl in existing_tables:
            op.drop_table(tbl)

    if 'users' in existing_tables:
        existing_cols = [c['name'] for c in inspector.get_columns('users')]
        if 'username' in existing_cols:
            try:
                op.drop_index(op.f('ix_users_username'), table_name='users')
            except Exception:
                pass
            op.drop_column('users', 'username')
        for col in ['department', 'phone', 'last_name', 'first_name']:
            if col in existing_cols:
                op.drop_column('users', col)
