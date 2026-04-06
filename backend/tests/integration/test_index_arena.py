"""Integration tests for Index Arena API — run/vote/tally endpoints (LLM calls mocked)."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from tests.conftest import TEST_USER_ID

from uteki.domains.index.services.arena_service import get_arena_service
from uteki.domains.index.services.data_service import get_data_service
from uteki.domains.index.services.memory_service import get_memory_service
from uteki.domains.index.services.prompt_service import get_prompt_service
from uteki.domains.index.services.score_service import get_score_service


def _make_mock_arena_service():
    svc = MagicMock()
    svc.run = AsyncMock(return_value={
        "model_ios": [
            {"id": "io1", "model_provider": "openai", "model_name": "gpt-4o",
             "status": "success", "output_structured": {"action": "BUY"}},
        ],
        "votes": [],
        "final_decision": {"winner_model_io_id": "io1", "winner_action": "BUY"},
        "pipeline_phases": {"decide": "ok", "vote": "ok", "tally": "ok"},
    })
    # Sync methods (not awaited in the API handler)
    svc.get_arena_results = MagicMock(return_value={
        "harness_id": "h-001", "model_ios": [], "final_decision": None,
    })
    svc.get_votes_for_harness = MagicMock(return_value=[
        {"voter": "openai:gpt-4o", "approve_1": "id_1"},
    ])
    # Async method
    svc.get_arena_history = AsyncMock(return_value=[])
    return svc


def _make_mock_prompt_service():
    svc = MagicMock()
    svc.get_by_id = AsyncMock(return_value={"version": "v1.0"})
    return svc


async def _passthrough_cache_get_or_set(key, fn, ttl=None):
    """Simulate cache.get_or_set by just calling the fetch function."""
    return await fn()


def _make_mock_cache():
    mock_cache = MagicMock()
    mock_cache.get_or_set = AsyncMock(side_effect=_passthrough_cache_get_or_set)
    mock_cache.delete_pattern = AsyncMock()
    return mock_cache


# ══════════════════════════════════════════
# POST /api/index/arena/run
# ══════════════════════════════════════════

class TestArenaRun:
    """Test the arena run endpoint with mocked services."""

    @patch("uteki.domains.index.api.get_cache_service")
    @patch("uteki.domains.index.api.HarnessBuilder")
    async def test_arena_run_success(
        self,
        mock_builder_cls,
        mock_cache_svc,
        test_app,
        client,
        auth_headers,
    ):
        mock_arena = _make_mock_arena_service()
        mock_prompt = _make_mock_prompt_service()

        test_app.dependency_overrides[get_arena_service] = lambda: mock_arena
        test_app.dependency_overrides[get_prompt_service] = lambda: mock_prompt
        test_app.dependency_overrides[get_data_service] = lambda: MagicMock()
        test_app.dependency_overrides[get_memory_service] = lambda: MagicMock()
        test_app.dependency_overrides[get_score_service] = lambda: MagicMock()

        builder_instance = MagicMock()
        builder_instance.build = AsyncMock(return_value={
            "id": "harness-001",
            "harness_type": "monthly_dca",
            "prompt_version_id": "prompt-v1",
        })
        mock_builder_cls.return_value = builder_instance

        mock_cache_svc.return_value = _make_mock_cache()

        try:
            resp = await client.post(
                "/api/index/arena/run",
                json={"harness_type": "monthly_dca"},
                headers=auth_headers,
            )

            assert resp.status_code == 200
            body = resp.json()
            assert body["success"] is True
            data = body["data"]
            assert data["harness_id"] == "harness-001"
            assert data["prompt_version"] == "v1.0"
            assert len(data["models"]) == 1
            assert data["final_decision"]["winner_action"] == "BUY"
        finally:
            test_app.dependency_overrides.clear()

    async def test_arena_run_requires_auth(self, client):
        resp = await client.post(
            "/api/index/arena/run",
            json={"harness_type": "monthly_dca"},
        )
        assert resp.status_code == 401


# ══════════════════════════════════════════
# GET /api/index/arena/{harness_id}
# ══════════════════════════════════════════

class TestArenaResults:
    """Test fetching arena results."""

    @patch("uteki.domains.index.api.get_cache_service")
    async def test_get_arena_results(
        self,
        mock_cache_svc,
        test_app,
        client,
    ):
        mock_arena = _make_mock_arena_service()
        test_app.dependency_overrides[get_arena_service] = lambda: mock_arena
        mock_cache_svc.return_value = _make_mock_cache()

        try:
            resp = await client.get("/api/index/arena/h-001")
            assert resp.status_code == 200
            body = resp.json()
            assert body["success"] is True
            assert body["data"]["harness_id"] == "h-001"
        finally:
            test_app.dependency_overrides.clear()


# ══════════════════════════════════════════
# GET /api/index/arena/{harness_id}/votes
# ══════════════════════════════════════════

class TestArenaVotes:
    """Test fetching arena vote details."""

    @patch("uteki.domains.index.api.get_cache_service")
    async def test_get_arena_votes(
        self,
        mock_cache_svc,
        test_app,
        client,
    ):
        mock_arena = _make_mock_arena_service()
        test_app.dependency_overrides[get_arena_service] = lambda: mock_arena
        mock_cache_svc.return_value = _make_mock_cache()

        try:
            resp = await client.get("/api/index/arena/h-001/votes")
            assert resp.status_code == 200
        finally:
            test_app.dependency_overrides.clear()


# ══════════════════════════════════════════
# GET /api/index/arena/history
# ══════════════════════════════════════════

class TestArenaHistory:
    """Test arena history listing."""

    @patch("uteki.domains.index.api.get_cache_service")
    async def test_get_arena_history(
        self,
        mock_cache_svc,
        test_app,
        client,
    ):
        mock_arena = _make_mock_arena_service()
        test_app.dependency_overrides[get_arena_service] = lambda: mock_arena
        mock_cache_svc.return_value = _make_mock_cache()

        try:
            resp = await client.get("/api/index/arena/history")
            assert resp.status_code == 200
            body = resp.json()
            assert body["success"] is True
        finally:
            test_app.dependency_overrides.clear()
