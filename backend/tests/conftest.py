"""Shared test fixtures for uteki backend tests."""

import os
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from contextlib import asynccontextmanager

# Ensure test environment settings before any app imports
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("DATABASE_TYPE", "sqlite")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only")

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from uteki.domains.auth.jwt import create_access_token


# ══════════════════════════════════════════
# Test App (no DB init, no schedulers)
# ══════════════════════════════════════════

def _create_test_app() -> FastAPI:
    """Create a minimal FastAPI app with all routers but no lifespan side effects."""
    app = FastAPI(title="uteki test")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from uteki.domains.auth.api import router as auth_router
    from uteki.domains.index.api import router as index_router
    from uteki.domains.company.api import router as company_router
    from uteki.domains.evaluation.api import router as evaluation_router
    from uteki.domains.notification.api import router as notification_router

    app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
    app.include_router(index_router, prefix="/api/index", tags=["index"])
    app.include_router(company_router, prefix="/api/company", tags=["company"])
    app.include_router(evaluation_router, prefix="/api/evaluation", tags=["evaluation"])
    app.include_router(notification_router, prefix="/api/notifications", tags=["notifications"])

    @app.get("/health")
    async def health():
        return {"status": "healthy"}

    return app


@pytest.fixture(scope="session")
def test_app() -> FastAPI:
    """Session-scoped test FastAPI application."""
    return _create_test_app()


# ══════════════════════════════════════════
# Async HTTP Client
# ══════════════════════════════════════════

@pytest.fixture
async def client(test_app: FastAPI):
    """Async HTTP client wired to the test app (no network)."""
    transport = httpx.ASGITransport(app=test_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ══════════════════════════════════════════
# Auth Fixtures
# ══════════════════════════════════════════

TEST_USER_ID = "test-user-00000000-0000-0000-0000-000000000001"
TEST_USER_EMAIL = "test@uteki.local"


@pytest.fixture
def auth_token() -> str:
    """Create a valid JWT token for a test user."""
    return create_access_token(
        data={
            "sub": TEST_USER_ID,
            "email": TEST_USER_EMAIL,
            "name": "Test User",
            "provider": "dev",
        }
    )


@pytest.fixture
def auth_headers(auth_token: str) -> dict:
    """Authorization headers with a valid Bearer token."""
    return {"Authorization": f"Bearer {auth_token}"}


# ══════════════════════════════════════════
# Settings Override
# ══════════════════════════════════════════

@pytest.fixture
def test_settings():
    """Patch settings for test isolation."""
    from uteki.common.config import settings

    original_env = settings.environment
    original_secret = settings.secret_key
    settings.environment = "development"
    settings.secret_key = "test-secret-key-for-testing-only"
    yield settings
    settings.environment = original_env
    settings.secret_key = original_secret
