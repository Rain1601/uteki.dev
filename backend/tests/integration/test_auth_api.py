"""Integration tests for Auth API — dev login, token validation, protected routes."""

import pytest
from unittest.mock import AsyncMock, patch

from tests.conftest import TEST_USER_ID, TEST_USER_EMAIL


# ══════════════════════════════════════════
# Health check (smoke test)
# ══════════════════════════════════════════

class TestHealthEndpoint:
    """Verify the test app is wired up correctly."""

    async def test_health_returns_200(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"


# ══════════════════════════════════════════
# GET /api/auth/me
# ══════════════════════════════════════════

class TestAuthMe:
    """Test the /api/auth/me endpoint for authenticated/unauthenticated access."""

    async def test_me_unauthenticated(self, client):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 200
        body = resp.json()
        assert body["authenticated"] is False
        assert body["user"] is None

    async def test_me_authenticated(self, client, auth_headers):
        resp = await client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["authenticated"] is True
        assert body["user"]["user_id"] == TEST_USER_ID
        assert body["user"]["email"] == TEST_USER_EMAIL

    async def test_me_invalid_token(self, client):
        headers = {"Authorization": "Bearer invalid-token-garbage"}
        resp = await client.get("/api/auth/me", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["authenticated"] is False


# ══════════════════════════════════════════
# GET /api/auth/dev/login
# ══════════════════════════════════════════

class TestDevLogin:
    """Test the dev login endpoint."""

    @patch("uteki.domains.auth.api.user_service")
    async def test_dev_login_redirects_with_token(self, mock_user_service, client):
        mock_user_service.get_or_create_oauth_user = AsyncMock(return_value={
            "id": "dev-user-001",
            "email": "dev@uteki.local",
            "username": "Dev User",
        })

        resp = await client.get(
            "/api/auth/dev/login",
            follow_redirects=False,
        )
        assert resp.status_code == 307
        location = resp.headers["location"]
        assert "#token=" in location

    @patch("uteki.domains.auth.api.settings")
    async def test_dev_login_blocked_in_production(self, mock_settings, client):
        mock_settings.environment = "production"
        resp = await client.get("/api/auth/dev/login", follow_redirects=False)
        assert resp.status_code == 404

    @patch("uteki.domains.auth.api.user_service")
    async def test_dev_login_custom_redirect(self, mock_user_service, client):
        mock_user_service.get_or_create_oauth_user = AsyncMock(return_value={
            "id": "dev-user-002",
            "email": "dev@uteki.local",
            "username": "Dev User",
        })

        resp = await client.get(
            "/api/auth/dev/login?redirect_url=http://custom.app",
            follow_redirects=False,
        )
        assert resp.status_code == 307
        location = resp.headers["location"]
        assert location.startswith("http://custom.app#token=")


# ══════════════════════════════════════════
# POST /api/auth/logout
# ══════════════════════════════════════════

class TestLogout:
    """Test logout endpoint."""

    async def test_logout_clears_cookie(self, client):
        resp = await client.post("/api/auth/logout")
        assert resp.status_code == 200
        assert resp.json()["message"] == "Logged out successfully"


# ══════════════════════════════════════════
# Protected Route Access
# ══════════════════════════════════════════

class TestProtectedRouteAccess:
    """Test that protected endpoints reject unauthenticated requests."""

    async def test_company_analyze_requires_auth(self, client):
        resp = await client.post(
            "/api/company/analyze",
            json={"symbol": "AAPL"},
        )
        assert resp.status_code == 401

    async def test_index_arena_run_requires_auth(self, client):
        resp = await client.post(
            "/api/index/arena/run",
            json={"harness_type": "monthly_dca"},
        )
        assert resp.status_code == 401

    async def test_company_analyses_list_requires_auth(self, client):
        resp = await client.get("/api/company/analyses")
        assert resp.status_code == 401
