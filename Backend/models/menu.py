"""
Nexora Navigation Menu & RBAC Models
Persists database-driven navigation menus and permission assignments.
"""

from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from Backend.core.database import Base


class MenuItem(Base):
    __tablename__ = "menu_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(100), unique=True, index=True, nullable=False)
    label = Column(String(100), nullable=False)
    icon = Column(String(50), nullable=False, default="Circle")
    route = Column(String(255), nullable=True)
    parent_code = Column(String(100), nullable=True)
    display_order = Column(Integer, nullable=False, default=0)
    required_permission = Column(String(100), nullable=True)
    module_tag = Column(String(50), nullable=False, default="core")
    is_implemented = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<MenuItem(code='{self.code}', label='{self.label}')>"


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    module = Column(String(50), nullable=False)
    category = Column(String(50), nullable=False, default="menu")  # menu, action, data

    def __repr__(self) -> str:
        return f"<Permission(code='{self.code}', module='{self.module}')>"


class RolePermission(Base):
    __tablename__ = "role_permissions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    role = Column(String(50), nullable=False, index=True)
    permission_code = Column(String(100), nullable=False, index=True)

    def __repr__(self) -> str:
        return f"<RolePermission(role='{self.role}', permission_code='{self.permission_code}')>"
