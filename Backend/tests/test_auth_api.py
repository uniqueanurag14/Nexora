"""
Integration Tests: Nexora Auth API Endpoints
Tests full login, profile retrieval, logout, and token protection flows against PostgreSQL.
"""

import pytest
from fastapi.testclient import TestClient
from Backend.core.config import settings
from Backend.main import app

client = TestClient(app)


def test_health_liveness():
    res = client.get("/api/health/liveness")
    assert res.status_code == 200
    assert res.json()["data"]["status"] == "ok"


def test_health_readiness():
    res = client.get("/api/health/readiness")
    assert res.status_code == 200
    assert res.json()["data"]["status"] == "healthy"
    assert res.json()["data"]["database"] == "connected"


def test_login_failure_invalid_credentials():
    res = client.post(
        "/api/auth/login",
        json={"email": "nonexistent@example.com", "password": "WrongPassword123!"},
    )
    assert res.status_code == 401
    data = res.json()
    assert data["success"] is False
    assert "Invalid email or password" in data["message"]


def test_super_admin_login_success():
    res = client.post(
        "/api/auth/login",
        json={
            "email": settings.SUPER_ADMIN_EMAIL,
            "password": settings.SUPER_ADMIN_PASSWORD,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "access_token" in data["data"]
    assert data["data"]["user"]["email"] == settings.SUPER_ADMIN_EMAIL.lower()
    assert data["data"]["user"]["role"] == "super_admin"

    # Profile endpoint using Bearer token
    token = data["data"]["access_token"]
    profile_res = client.get(
        "/api/users/profile",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert profile_res.status_code == 200
    profile_data = profile_res.json()
    assert profile_data["data"]["email"] == settings.SUPER_ADMIN_EMAIL.lower()

    # Logout
    logout_res = client.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert logout_res.status_code == 200
    assert logout_res.json()["success"] is True

    # After logout, token must be rejected
    rejected_res = client.get(
        "/api/users/profile",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert rejected_res.status_code == 401


def test_forgot_password_generic_response():
    # Test with both valid and non-existent email; both must return identical generic success
    res1 = client.post(
        "/api/auth/forgot-password",
        json={"email": settings.SUPER_ADMIN_EMAIL},
    )
    assert res1.status_code == 200
    assert res1.json()["success"] is True

    res2 = client.post(
        "/api/auth/forgot-password",
        json={"email": "nobody@example.com"},
    )
    assert res2.status_code == 200
    assert res2.json()["success"] is True
