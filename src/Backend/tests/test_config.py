"""
Unit Tests: Nexora Configuration Management
"""

import pytest
from Backend.core.config import Settings


def test_settings_load_defaults():
    settings = Settings()
    assert settings.APP_NAME == "Nexora"
    assert settings.APP_TIMEZONE == "Asia/Kolkata"
    assert settings.DATABASE_URL.startswith("postgresql://")


def test_invalid_database_url():
    with pytest.raises(ValueError, match="DATABASE_URL must be a valid PostgreSQL"):
        Settings(DATABASE_URL="mysql://user:pass@localhost/db")


def test_jwt_expiry_minutes_parser():
    s = Settings(JWT_ACCESS_EXPIRES_IN="30m")
    assert s.jwt_expiry_minutes == 30

    s2 = Settings(JWT_ACCESS_EXPIRES_IN="2h")
    assert s2.jwt_expiry_minutes == 120
