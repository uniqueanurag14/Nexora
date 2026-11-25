"""
Nexora Authentication API Endpoints
Implements login, logout, password recovery, reset, and password change.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from Backend.api.deps import get_current_user, get_current_user_and_token
from Backend.core.config import settings
from Backend.core.database import get_db
from Backend.core.security import create_access_token
from Backend.models.user import User
from Backend.schemas.auth import (
    AuthStatusResponse,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    ResetPasswordRequest,
)
from Backend.schemas.response import APIResponse
from Backend.schemas.user import ChangePasswordRequest, UserRead
from Backend.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=APIResponse[LoginResponse])
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Authenticates user against PostgreSQL credentials.
    Issues a signed JWT access token and sets a secure HttpOnly cookie.
    """
    user, error_msg = AuthService.authenticate_user(
        db, email=payload.email, password=payload.password
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_msg or "Invalid email or password.",
        )

    # Create signed JWT
    token_str, jti, expire_dt = create_access_token(
        subject=user.email,
        role=user.role,
        user_id=user.id,
    )

    # Calculate expiration in seconds
    now = datetime.now(timezone.utc)
    expires_in_seconds = int((expire_dt - now).total_seconds())

    # Set secure HttpOnly cookie
    # Secure flag is True in production, False or conditional for local HTTP dev
    is_prod = settings.APP_ENV.lower() == "production" and settings.APP_URL.startswith("https://")
    response.set_cookie(
        key="nexora_access_token",
        value=token_str,
        max_age=expires_in_seconds,
        expires=int(expire_dt.timestamp()),
        httponly=True,
        secure=is_prod,
        samesite="lax",
        path="/",
    )

    data = LoginResponse(
        user=UserRead.model_validate(user),
        access_token=token_str,
        token_type="bearer",
        expires_in_seconds=expires_in_seconds,
    )
    return APIResponse.ok(data=data, message="Login successful.")


@router.post("/logout", response_model=APIResponse[None])
def logout(
    response: Response,
    auth_data=Depends(get_current_user_and_token),
    db: Session = Depends(get_db),
):
    """
    Logs out the current user:
    - Adds the current JWT jti to the PostgreSQL revocation table
    - Clears the HttpOnly authentication cookie
    """
    user, payload = auth_data
    jti = payload.get("jti")
    exp = payload.get("exp")

    if jti and exp:
        expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
        AuthService.revoke_token(db, jti=jti, user_id=user.id, expires_at=expires_at, reason="logout")

    response.delete_cookie(
        key="nexora_access_token",
        path="/",
        httponly=True,
    )
    return APIResponse.ok(message="You have been safely logged out.")


@router.get("/me", response_model=APIResponse[AuthStatusResponse])
def get_current_session(
    auth_data=Depends(get_current_user_and_token),
):
    """Returns the profile of the currently authenticated user."""
    user, _ = auth_data
    return APIResponse.ok(
        data=AuthStatusResponse(authenticated=True, user=UserRead.model_validate(user)),
        message="Session active",
    )


@router.post("/forgot-password", response_model=APIResponse[None])
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    """
    Initiates password recovery.
    Always returns a generic success response to prevent account enumeration.
    """
    AuthService.request_password_reset(db, email=payload.email)
    return APIResponse.ok(
        message="If an account with that email exists, password recovery instructions have been sent."
    )


@router.post("/reset-password", response_model=APIResponse[None])
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """
    Completes password reset using a single-use token.
    Validates token, updates password hash, marks token used, and invalidates sessions.
    """
    success, msg = AuthService.reset_password(
        db, token=payload.token, new_password=payload.new_password
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg,
        )
    return APIResponse.ok(message=msg)


@router.post("/change-password", response_model=APIResponse[None])
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Changes password for the authenticated user.
    Verifies current password, enforces strength, and revokes other sessions.
    """
    success, msg = AuthService.change_password(
        db,
        user=current_user,
        current_password=payload.current_password,
        new_password=payload.new_password,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg,
        )
    return APIResponse.ok(message=msg)
