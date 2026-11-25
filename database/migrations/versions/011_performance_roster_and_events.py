"""011_performance_roster_and_events

Revision ID: 011_performance_roster_and_events
Revises: 010_fix_payments_invoice_fkey
Create Date: 2026-10-28 11:30:00.000000

Phase 3: Performance Management & Workforce Roster
1. Creates `performance_employees` table with canonical emp_id, first_name, last_name,
   password_hash (nullable), login_enabled (default False), department, designation,
   and audit fields. Strictly NO `name` or `full_name` column.
2. Creates `employee_performance_events` table referencing performance_employees(emp_id).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '011_performance_roster_and_events'
down_revision: Union[str, None] = '010_fix_payments_invoice_fkey'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. performance_employees table
    if 'performance_employees' not in existing_tables:
        op.create_table(
            'performance_employees',
            sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
            sa.Column('emp_id', sa.String(length=50), unique=True, nullable=False),
            sa.Column('first_name', sa.String(length=100), nullable=False),
            sa.Column('last_name', sa.String(length=100), nullable=False),
            sa.Column('password_hash', sa.String(length=255), nullable=True),
            sa.Column('login_enabled', sa.Boolean(), server_default=sa.text('false'), nullable=False),
            sa.Column('department', sa.String(length=100), nullable=True),
            sa.Column('designation', sa.String(length=100), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('created_by', sa.String(length=255), nullable=True),
        )
        op.create_index(op.f('ix_perf_employees_emp_id'), 'performance_employees', ['emp_id'], unique=True)
        op.create_index(op.f('ix_perf_employees_active'), 'performance_employees', ['is_active'], unique=False)

    # 2. employee_performance_events table
    if 'employee_performance_events' not in existing_tables:
        op.create_table(
            'employee_performance_events',
            sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
            sa.Column('emp_id', sa.String(length=50), nullable=False),
            sa.Column('event_timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('source', sa.String(length=20), server_default='HARDWARE', nullable=False),
            sa.Column('device_id', sa.String(length=100), nullable=True),
            sa.Column('idempotency_key', sa.String(length=100), unique=True, nullable=True),
            sa.Column('recorded_by_user_id', sa.Integer(), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(['emp_id'], ['performance_employees.emp_id'], name='fk_emp_perf_events_emp_id', ondelete='CASCADE')
        )
        op.create_index(op.f('ix_emp_perf_events_emp_time'), 'employee_performance_events', ['emp_id', 'event_timestamp'], unique=False)
        op.create_index(op.f('ix_emp_perf_events_time'), 'employee_performance_events', ['event_timestamp'], unique=False)
        op.create_index(op.f('ix_emp_perf_events_source'), 'employee_performance_events', ['source'], unique=False)
        op.create_index(op.f('ix_emp_perf_events_idempotency'), 'employee_performance_events', ['idempotency_key'], unique=True)


def downgrade() -> None:
    op.drop_table('employee_performance_events')
    op.drop_table('performance_employees')
