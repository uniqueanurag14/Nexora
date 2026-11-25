"""008_performance_management

Revision ID: 008_performance_management
Revises: 007_invoice_management
Create Date: 2026-10-28 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '008_performance_management'
down_revision: Union[str, None] = '007_invoice_management'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. work_completion_events
    if 'work_completion_events' not in existing_tables:
        op.create_table(
            'work_completion_events',
            sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
            sa.Column('employee_id', sa.Integer(), nullable=False),
            sa.Column('event_timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('source', sa.String(length=50), server_default='SIMULATED', nullable=False),
            sa.Column('device_id', sa.String(length=100), nullable=True),
            sa.Column('idempotency_key', sa.String(length=100), unique=True, nullable=True),
            sa.Column('recorded_by_user_id', sa.Integer(), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
        )
        op.create_index(op.f('ix_work_completion_events_employee_timestamp'), 'work_completion_events', ['employee_id', 'event_timestamp'], unique=False)
        op.create_index(op.f('ix_work_completion_events_timestamp'), 'work_completion_events', ['event_timestamp'], unique=False)
        op.create_index(op.f('ix_work_completion_events_source'), 'work_completion_events', ['source'], unique=False)
        op.create_index(op.f('ix_work_completion_events_idempotency_key'), 'work_completion_events', ['idempotency_key'], unique=True)


def downgrade() -> None:
    op.drop_table('work_completion_events')
