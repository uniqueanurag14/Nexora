"""003_rbac_matrix_and_user_roles

Revision ID: 003_rbac_matrix_and_user_roles
Revises: 002_module4_schema
Create Date: 2026-10-21 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '003_rbac_matrix_and_user_roles'
down_revision: Union[str, None] = '002_module4_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. Create user_roles table if not exists (Multi-role support per Module 3)
    if 'user_roles' not in existing_tables:
        op.create_table(
            'user_roles',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('role_code', sa.String(length=50), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('user_id', 'role_code', name='uq_user_roles_user_code')
        )
        op.create_index(op.f('ix_user_roles_id'), 'user_roles', ['id'], unique=False)
        op.create_index(op.f('ix_user_roles_user_id'), 'user_roles', ['user_id'], unique=False)
        op.create_index(op.f('ix_user_roles_role_code'), 'user_roles', ['role_code'], unique=False)

    # 2. Add fine-grained action permissions to permissions table if table exists
    if 'permissions' in existing_tables:
        # Check existing permission codes to avoid duplicate key errors
        res = bind.execute(sa.text("SELECT code FROM permissions;")).fetchall()
        existing_codes = {row[0] for row in res}

        fine_grained_permissions = [
            # User & Employee Management Actions
            ('users.view', 'View Users and Employees', 'Users', 'action'),
            ('users.create', 'Create User and Employee Accounts', 'Users', 'action'),
            ('users.edit', 'Edit User Details and Role Assignments', 'Users', 'action'),
            ('users.update', 'Update User Details (Legacy Alias)', 'Users', 'action'),
            ('users.delete', 'Delete User Accounts', 'Users', 'action'),
            ('users.disable', 'Disable or Deactivate User Accounts', 'Users', 'action'),

            # Role Management Actions
            ('roles.view', 'View System Roles and Permissions', 'Roles', 'action'),
            ('roles.create', 'Create Custom System Roles', 'Roles', 'action'),
            ('roles.edit', 'Edit Role Details and Permission Assignments', 'Roles', 'action'),
            ('roles.update', 'Update Role Details (Legacy Alias)', 'Roles', 'action'),
            ('roles.delete', 'Delete Custom System Roles', 'Roles', 'action'),
            ('roles.disable', 'Disable or Deactivate Roles', 'Roles', 'action'),

            # Permission Catalog & Assignment Actions
            ('permissions.view', 'View Permissions Directory', 'Permissions', 'action'),
            ('permissions.create', 'Define New System Permissions', 'Permissions', 'action'),
            ('permissions.edit', 'Edit Permission Definitions', 'Permissions', 'action'),
            ('permissions.delete', 'Delete Unused Custom Permissions', 'Permissions', 'action'),
            ('permissions.assign', 'Assign Menu Items & Permissions to Roles', 'Permissions', 'action'),

            # Settings Actions
            ('settings.view', 'View System Settings', 'Settings', 'action'),
            ('settings.edit', 'Modify System Settings', 'Settings', 'action'),
            ('settings.update', 'Update System Settings (Legacy Alias)', 'Settings', 'action'),
            ('settings.backup', 'Manage Database Backups', 'Settings', 'action'),
            ('settings.sessions', 'View & Revoke Active User Sessions', 'Settings', 'action'),

            # Profile Actions
            ('profile.view', 'View Own User Profile', 'Profile', 'action'),
            ('profile.edit', 'Update Own User Profile', 'Profile', 'action'),
            ('profile.update', 'Update Own User Profile (Legacy Alias)', 'Profile', 'action'),
            ('profile.password', 'Change Account Password', 'Profile', 'action'),
        ]

        for code, name, module, category in fine_grained_permissions:
            if code not in existing_codes:
                bind.execute(
                    sa.text(
                        "INSERT INTO permissions (code, name, module, category) "
                        "VALUES (:code, :name, :module, :category);"
                    ),
                    {"code": code, "name": name, "module": module, "category": category}
                )
                existing_codes.add(code)

    # 3. Migrate existing users' single role into user_roles safely without duplicates
    if 'users' in existing_tables and 'user_roles' in inspector.get_table_names():
        bind.execute(
            sa.text(
                "INSERT INTO user_roles (user_id, role_code) "
                "SELECT id, role FROM users "
                "WHERE role IS NOT NULL "
                "ON CONFLICT (user_id, role_code) DO NOTHING;"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'user_roles' in existing_tables:
        op.drop_table('user_roles')
