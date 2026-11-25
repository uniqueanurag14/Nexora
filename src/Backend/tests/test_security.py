"""
Unit Tests: Nexora Security Utilities
"""

import time
import pytest
from Backend.core.security import (
    create_access_token,
    decode_access_token,
    generate_secure_token,
    get_password_hash,
    hash_token,
    validate_password_strength,
    verify_password,
)


def test_password_hashing_and_verification():
    pw = "SuperSecure@2026!"
    hashed = get_password_hash(pw)
    assert hashed != pw
    assert verify_password(pw, hashed) is True
    assert verify_password("WrongPassword123!", hashed) is False


def test_password_complexity():
    # Valid
    ok, _ = validate_password_strength("ValidPass123!")
    assert ok is True

    # Too short
    ok, msg = validate_password_strength("Short1!")
    assert ok is False

    # Missing special character
    ok, msg = validate_password_strength("NoSpecialChar123")
    assert ok is False

    # Missing uppercase
    ok, msg = validate_password_strength("nouppercase123!")
    assert ok is False


def test_jwt_issuance_and_decoding():
    token_str, jti, expire = create_access_token(
        subject="test@example.com",
        role="user",
        user_id=42,
    )
    assert isinstance(token_str, str)
    assert len(jti) == 32

    payload = decode_access_token(token_str)
    assert payload["sub"] == "test@example.com"
    assert payload["role"] == "user"
    assert payload["uid"] == 42
    assert payload["jti"] == jti
    assert payload["iss"] == "nexora"
    assert payload["aud"] == "nexora-application"


def test_secure_token_generation_and_hashing():
    t1 = generate_secure_token()
    t2 = generate_secure_token()
    assert t1 != t2
    assert len(t1) >= 40

    h1 = hash_token(t1)
    assert len(h1) == 64  # SHA-256 hex digest
    assert h1 == hash_token(t1)
    assert h1 != hash_token(t2)
