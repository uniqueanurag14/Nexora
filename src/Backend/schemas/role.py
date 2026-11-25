"""
Nexora Role & Permission Schemas
Pydantic DTOs for RBAC role management and fine-grained permission assignments.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class PermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    module: str
    category: str


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str
    description: Optional[str] = ""
    is_system: bool = False
    is_active: bool = True
    permissions: List[str] = []
    user_count: int = 0
    created_at: datetime


class RoleCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    code: str = Field(..., min_length=2, max_length=50)
    description: Optional[str] = Field(default="", max_length=500)
    permissions: List[str] = Field(default_factory=list)

    @field_validator("name", "code")
    @classmethod
    def clean_text(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Field cannot be empty.")
        return clean


class RoleUpdateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(default="", max_length=500)
    is_active: Optional[bool] = True
    permissions: List[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Role name cannot be empty.")
        return clean


class UserRoleAssignRequest(BaseModel):
    role: str = Field(..., min_length=2, max_length=50)
