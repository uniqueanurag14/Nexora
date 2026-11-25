"""
Nexora Standardized API Response Schema
Ensures uniform structure for all API endpoints in success and error scenarios.
"""

from typing import Any, Generic, List, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    success: bool
    message: str
    data: Optional[T] = None
    errors: Optional[List[dict[str, Any]]] = None

    @classmethod
    def ok(cls, data: Optional[T] = None, message: str = "Operation successful") -> "APIResponse[T]":
        return cls(success=True, message=message, data=data)

    @classmethod
    def fail(cls, message: str, errors: Optional[List[dict[str, Any]]] = None) -> "APIResponse[None]":
        return cls(success=False, message=message, data=None, errors=errors)
