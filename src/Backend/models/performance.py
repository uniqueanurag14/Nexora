"""
Nexora Work Completion & Performance Models
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from Backend.core.database import Base


class PerformanceEmployee(Base):
    __tablename__ = "performance_employees"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    emp_id = Column(String(50), unique=True, nullable=False, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=True)
    login_enabled = Column(Boolean, nullable=False, default=False)
    department = Column(String(100), nullable=True)
    designation = Column(String(100), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )
    created_by = Column(String(255), nullable=True)

    @property
    def display_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def __repr__(self) -> str:
        return f"<PerformanceEmployee(emp_id='{self.emp_id}', name='{self.display_name}', is_active={self.is_active})>"


class EmployeePerformanceEvent(Base):
    __tablename__ = "employee_performance_events"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    emp_id = Column(String(50), ForeignKey("performance_employees.emp_id", ondelete="CASCADE"), nullable=False, index=True)
    event_timestamp = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
    source = Column(String(20), nullable=False, default="HARDWARE", index=True)  # 'SIMULATED' or 'HARDWARE'
    device_id = Column(String(100), nullable=True)
    idempotency_key = Column(String(100), unique=True, nullable=True, index=True)
    recorded_by_user_id = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<EmployeePerformanceEvent(id={self.id}, emp_id='{self.emp_id}', source='{self.source}', timestamp='{self.event_timestamp}')>"


# Retain legacy WorkCompletionEvent model for backward compatibility
class WorkCompletionEvent(Base):
    __tablename__ = "work_completion_events"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    employee_id = Column(Integer, nullable=False, index=True)
    event_timestamp = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
    source = Column(String(50), nullable=False, default="SIMULATED", index=True)
    device_id = Column(String(100), nullable=True)
    idempotency_key = Column(String(100), unique=True, nullable=True, index=True)
    recorded_by_user_id = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<WorkCompletionEvent(id={self.id}, employee_id={self.employee_id}, source='{self.source}', timestamp='{self.event_timestamp}')>"
