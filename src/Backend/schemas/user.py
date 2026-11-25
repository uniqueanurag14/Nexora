"""
Nexora User Schemas
Pydantic models for user responses, profile management, and administrator CRUD.
Mandatory global rule: Every person's name uses separate First Name and Last Name.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from Backend.core.security import validate_password_strength


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    first_name: str = Field(default="")
    last_name: str = Field(default="")
    name: str = Field(default="")
    role: str
    is_active: bool
    is_verified: bool
    phone: Optional[str] = ""
    department: Optional[str] = ""
    last_login_at: Optional[datetime] = None
    created_at: datetime


class UserProfileUpdate(BaseModel):
    first_name: str = Field(..., min_length=2, max_length=100)
    last_name: str = Field(..., min_length=2, max_length=100)
    phone: Optional[str] = Field(default="", max_length=50)
    department: Optional[str] = Field(default="", max_length=100)

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_name_parts(cls, v: str) -> str:
        clean = v.strip()
        if len(clean) < 2:
            raise ValueError("Name part must be at least 2 characters.")
        return clean


class UserCreateRequest(BaseModel):
    first_name: str = Field(..., min_length=2, max_length=100)
    last_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    role: str = Field(default="user")
    password: str = Field(..., min_length=8)
    phone: Optional[str] = Field(default="", max_length=50)
    department: Optional[str] = Field(default="Operations", max_length=100)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_names(cls, v: str) -> str:
        clean = v.strip()
        if len(clean) < 2:
            raise ValueError("Name must be at least 2 characters long.")
        return clean

    @field_validator("password")
    @classmethod
    def check_password_complexity(cls, v: str) -> str:
        valid, msg = validate_password_strength(v)
        if not valid:
            raise ValueError(msg)
        return v


class UserAdminUpdateRequest(BaseModel):
    first_name: str = Field(..., min_length=2, max_length=100)
    last_name: str = Field(..., min_length=2, max_length=100)
    role: str
    is_active: bool
    phone: Optional[str] = Field(default="", max_length=50)
    department: Optional[str] = Field(default="", max_length=100)

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_names(cls, v: str) -> str:
        clean = v.strip()
        if len(clean) < 2:
            raise ValueError("Name must be at least 2 characters long.")
        return clean


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def check_password_complexity(cls, v: str) -> str:
        valid, msg = validate_password_strength(v)
        if not valid:
            raise ValueError(msg)
        return v
