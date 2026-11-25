"""
Nexora Core Configuration
Central configuration layer utilizing Pydantic Settings for strict validation
and protection of sensitive environment settings.
"""

import os
from typing import Optional
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # Application
    APP_NAME: str = Field(default="Nexora")
    APP_ENV: str = Field(default="development")
    APP_URL: str = Field(default="http://localhost:3000")
    APP_TIMEZONE: str = Field(default="Asia/Kolkata")

    # Database (PostgreSQL only)
    DATABASE_URL: str = Field(
        default="postgresql://postgres:postgres@127.0.0.1:5432/nexora"
    )

    # Initial Super Admin
    SUPER_ADMIN_FIRST_NAME: str = Field(default="System")
    SUPER_ADMIN_LAST_NAME: str = Field(default="Administrator")
    SUPER_ADMIN_NAME: Optional[str] = Field(default=None)
    SUPER_ADMIN_EMAIL: str = Field(default="admin@example.com")
    SUPER_ADMIN_PASSWORD: str = Field(default="use-a-strong-secret")
    SUPER_ADMIN_ENABLED: bool = Field(default=True)

    # Authentication
    JWT_ACCESS_SECRET: str = Field(
        default="replace-with-a-strong-random-secret-at-least-32-chars"
    )
    JWT_ACCESS_EXPIRES_IN: str = Field(default="15m")
    JWT_ISSUER: str = Field(default="nexora")
    JWT_AUDIENCE: str = Field(default="nexora-application")

    # Email (SMTP)
    SMTP_HOST: Optional[str] = Field(default=None)
    SMTP_PORT: int = Field(default=587)
    SMTP_USER: Optional[str] = Field(default=None)
    SMTP_PASSWORD: Optional[str] = Field(default=None)
    EMAIL_FROM: str = Field(default="noreply@example.com")

    # Future Modules Reserved Configuration (Preserved as required)
    WORK_EVENT_COOLDOWN_SECONDS: int = Field(default=60)
    SUPPLIER_LINK_EXPIRY_HOURS: int = Field(default=72)

    # Server Ports
    BACKEND_PORT: int = Field(default=8001)

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v or not (v.startswith("postgresql://") or v.startswith("postgres://")):
            raise ValueError(
                "DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql://"
            )
        # Ensure compatible SQLAlchemy URL prefix if using postgres://
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql://", 1)
        return v

    @field_validator("JWT_ACCESS_SECRET")
    @classmethod
    def validate_jwt_secret(cls, v: str, info) -> str:
        app_env = os.getenv("APP_ENV", "development").lower()
        if app_env == "production" and (
            len(v) < 32 or "replace" in v or "secret" in v.lower()
        ):
            raise ValueError(
                "In production, JWT_ACCESS_SECRET must be at least 32 characters long and not use placeholders."
            )
        return v

    @field_validator("SUPER_ADMIN_PASSWORD")
    @classmethod
    def validate_super_admin_password(cls, v: str) -> str:
        app_env = os.getenv("APP_ENV", "development").lower()
        if app_env == "production" and (len(v) < 8 or "use-a-strong" in v):
            raise ValueError(
                "In production, SUPER_ADMIN_PASSWORD must be strong and not use placeholders."
            )
        return v

    @model_validator(mode="after")
    def resolve_admin_names(self) -> "Settings":
        if self.SUPER_ADMIN_NAME:
            name_str = self.SUPER_ADMIN_NAME.strip()
            if (
                self.SUPER_ADMIN_FIRST_NAME == "System"
                and self.SUPER_ADMIN_LAST_NAME == "Administrator"
                and name_str != "System Administrator"
            ):
                parts = name_str.split()
                if len(parts) >= 2:
                    self.SUPER_ADMIN_FIRST_NAME = parts[0]
                    self.SUPER_ADMIN_LAST_NAME = " ".join(parts[1:])
                elif len(parts) == 1:
                    self.SUPER_ADMIN_FIRST_NAME = parts[0]
                    self.SUPER_ADMIN_LAST_NAME = ""
        return self

    @property
    def jwt_expiry_minutes(self) -> int:
        """Parses JWT_ACCESS_EXPIRES_IN (e.g. '15m', '1h', '60m') into minutes."""
        raw = self.JWT_ACCESS_EXPIRES_IN.strip().lower()
        if raw.endswith("m"):
            return int(raw[:-1])
        elif raw.endswith("h"):
            return int(raw[:-1]) * 60
        elif raw.endswith("d"):
            return int(raw[:-1]) * 1440
        try:
            return int(raw)
        except ValueError:
            return 15


settings = Settings()
