"""
Nexora Authentication Schemas
Pydantic models for authentication, login, password recovery, and tokens.
"""

from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator
from Backend.core.security import validate_password_strength
from Backend.schemas.user import UserRead


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class LoginResponse(BaseModel):
    user: UserRead
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def check_password_complexity(cls, v: str) -> str:
        valid, msg = validate_password_strength(v)
        if not valid:
            raise ValueError(msg)
        return v


class AuthStatusResponse(BaseModel):
    authenticated: bool
    user: Optional[UserRead] = None
