"""Integration tests for Company Agent API — 7-gate pipeline endpoint (LLM calls mocked)."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from tests.conftest import TEST_USER_ID


# ══════════════════════════════════════════
# POST /api/company/analyze
# ══════════════════════════════════════════

class TestCompanyAnalyze:
    """Test the synchronous company analysis endpoint."""

    @patch("uteki.domains.company.api.CompanyAnalysisRepository")
    @patch("uteki.domains.company.api.CompanySkillRunner")
    @patch("uteki.domains.company.api.fetch_company_data")
    @patch("uteki.domains.company.api._resolve_model")
    async def test_analyze_success(
        self,
        mock_resolve,
        mock_fetch,
        mock_runner_cls,
        mock_repo,
        client,
        auth_headers,
    ):
        mock_resolve.return_value = {
            "provider": "openai",
            "model": "gpt-4o",
            "api_key": "test-key",
            "base_url": "https://api.openai.com/v1",
        }

        mock_fetch.return_value = {
            "profile": {"name": "Apple Inc.", "sector": "Technology", "industry": "Consumer Electronics"},
            "price_data": {"current_price": 195.50},
            "_cache_meta": {"cached": False, "fetched_at": "2026-04-01T00:00:00"},
        }

        mock_runner = MagicMock()
        mock_runner.run_pipeline = AsyncMock(return_value={
            "skills": {"gate1": {"gate": "business_analysis", "parsed": {}}},
            "verdict": {
                "action": "BUY",
                "conviction": 0.75,
                "quality_verdict": "GOOD",
            },
            "total_latency_ms": 3200,
            "trace": [],
            "tool_calls": [],
        })
        mock_runner_cls.return_value = mock_runner

        mock_repo.create = AsyncMock(return_value={"id": "analysis-001"})

        resp = await client.post(
            "/api/company/analyze",
            json={"symbol": "AAPL"},
            headers=auth_headers,
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["symbol"] == "AAPL"
        assert body["company_name"] == "Apple Inc."
        assert body["verdict"]["action"] == "BUY"
        assert body["model_used"] == "openai/gpt-4o"

    @patch("uteki.domains.company.api._resolve_model")
    async def test_analyze_no_model_returns_503(
        self,
        mock_resolve,
        client,
        auth_headers,
    ):
        mock_resolve.return_value = None

        resp = await client.post(
            "/api/company/analyze",
            json={"symbol": "AAPL"},
            headers=auth_headers,
        )
        assert resp.status_code == 503

    @patch("uteki.domains.company.api.fetch_company_data")
    @patch("uteki.domains.company.api._resolve_model")
    async def test_analyze_invalid_symbol_returns_400(
        self,
        mock_resolve,
        mock_fetch,
        client,
        auth_headers,
    ):
        mock_resolve.return_value = {
            "provider": "openai",
            "model": "gpt-4o",
            "api_key": "key",
            "base_url": None,
        }
        mock_fetch.return_value = {"error": "Symbol not found"}

        resp = await client.post(
            "/api/company/analyze",
            json={"symbol": "XYZNOTREAL"},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_analyze_requires_auth(self, client):
        resp = await client.post(
            "/api/company/analyze",
            json={"symbol": "AAPL"},
        )
        assert resp.status_code == 401

    async def test_analyze_missing_symbol(self, client, auth_headers):
        resp = await client.post(
            "/api/company/analyze",
            json={},
            headers=auth_headers,
        )
        assert resp.status_code == 422  # Pydantic validation


# ══════════════════════════════════════════
# GET /api/company/analyses
# ══════════════════════════════════════════

class TestCompanyAnalysesList:
    """Test listing analysis records."""

    @patch("uteki.domains.company.api.CompanyAnalysisRepository")
    async def test_list_analyses(self, mock_repo, client, auth_headers):
        mock_repo.list_by_user = AsyncMock(return_value=(
            [
                {"id": "a1", "symbol": "AAPL", "status": "completed"},
                {"id": "a2", "symbol": "TSLA", "status": "completed"},
            ],
            2,
        ))

        resp = await client.get("/api/company/analyses", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 2
        assert len(body["analyses"]) == 2

    async def test_list_analyses_requires_auth(self, client):
        resp = await client.get("/api/company/analyses")
        assert resp.status_code == 401


# ══════════════════════════════════════════
# GET /api/company/analyses/{id}
# ══════════════════════════════════════════

class TestCompanyAnalysisDetail:
    """Test fetching a single analysis record."""

    @patch("uteki.domains.company.api.CompanyAnalysisRepository")
    async def test_get_analysis_found(self, mock_repo, client, auth_headers):
        mock_repo.get_by_id = AsyncMock(return_value={
            "id": "a1",
            "symbol": "AAPL",
            "full_report": {"verdict": {"action": "BUY"}},
        })

        resp = await client.get("/api/company/analyses/a1", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["symbol"] == "AAPL"

    @patch("uteki.domains.company.api.CompanyAnalysisRepository")
    async def test_get_analysis_not_found(self, mock_repo, client, auth_headers):
        mock_repo.get_by_id = AsyncMock(return_value=None)

        resp = await client.get("/api/company/analyses/nonexistent", headers=auth_headers)
        assert resp.status_code == 404


# ══════════════════════════════════════════
# DELETE /api/company/analyses/{id}
# ══════════════════════════════════════════

class TestCompanyAnalysisDelete:
    """Test deleting an analysis record."""

    @patch("uteki.domains.company.api.CompanyAnalysisRepository")
    async def test_delete_analysis_success(self, mock_repo, client, auth_headers):
        mock_repo.delete = AsyncMock(return_value=True)

        resp = await client.delete("/api/company/analyses/a1", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    @patch("uteki.domains.company.api.CompanyAnalysisRepository")
    async def test_delete_analysis_not_found(self, mock_repo, client, auth_headers):
        mock_repo.delete = AsyncMock(return_value=False)

        resp = await client.delete("/api/company/analyses/nonexistent", headers=auth_headers)
        assert resp.status_code == 404


# ══════════════════════════════════════════
# DELETE /api/company/cache/{symbol}
# ══════════════════════════════════════════

class TestCompanyCacheInvalidation:
    """Test cache invalidation endpoint."""

    @patch("uteki.domains.company.api.invalidate_company_cache")
    async def test_invalidate_cache(self, mock_invalidate, client, auth_headers):
        mock_invalidate.return_value = None

        resp = await client.delete("/api/company/cache/AAPL", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["symbol"] == "AAPL"
        mock_invalidate.assert_awaited_once_with("AAPL")
