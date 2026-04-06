"""Integration tests for Company Agent M2 features — prompt management, share, compare, A/B test, dashboard."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone, timedelta

from tests.conftest import TEST_USER_ID


# ══════════════════════════════════════════
# Prompt Management — GET/POST /api/company/prompts
# ══════════════════════════════════════════

class TestPromptManagement:

    @patch("uteki.domains.company.api.CompanyPromptRepository")
    async def test_list_prompts_empty(self, mock_repo, client, auth_headers):
        mock_repo.list_by_gate = AsyncMock(return_value=[])

        resp = await client.get("/api/company/prompts", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    @patch("uteki.domains.company.api.CompanyPromptRepository")
    async def test_create_prompt(self, mock_repo, client, auth_headers):
        mock_repo.create = AsyncMock(return_value={
            "id": "prompt-001",
            "gate_number": 1,
            "skill_name": "business_analysis",
            "version": 1,
            "system_prompt": "You are an analyst.",
            "description": "Test prompt v1",
            "is_active": False,
            "eval_scores": None,
            "created_at": "2026-04-01T00:00:00+00:00",
            "updated_at": "2026-04-01T00:00:00+00:00",
        })

        resp = await client.post(
            "/api/company/prompts",
            json={
                "gate_number": 1,
                "system_prompt": "You are an analyst.",
                "description": "Test prompt v1",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == "prompt-001"
        assert body["gate_number"] == 1
        assert body["skill_name"] == "business_analysis"
        assert body["version"] == 1

        # Verify skill_name was injected before calling create
        call_args = mock_repo.create.call_args[0][0]
        assert call_args["skill_name"] == "business_analysis"

    @patch("uteki.domains.company.api.CompanyPromptRepository")
    async def test_create_multiple_prompts_same_gate(self, mock_repo, client, auth_headers):
        """Version numbers should auto-increment (handled by repo)."""
        mock_repo.create = AsyncMock(side_effect=[
            {
                "id": "p1", "gate_number": 3, "skill_name": "moat_assessment",
                "version": 1, "system_prompt": "v1", "description": "",
                "is_active": False, "eval_scores": None,
                "created_at": "2026-04-01T00:00:00+00:00",
                "updated_at": "2026-04-01T00:00:00+00:00",
            },
            {
                "id": "p2", "gate_number": 3, "skill_name": "moat_assessment",
                "version": 2, "system_prompt": "v2", "description": "",
                "is_active": False, "eval_scores": None,
                "created_at": "2026-04-01T00:00:01+00:00",
                "updated_at": "2026-04-01T00:00:01+00:00",
            },
        ])

        resp1 = await client.post(
            "/api/company/prompts",
            json={"gate_number": 3, "system_prompt": "v1"},
            headers=auth_headers,
        )
        resp2 = await client.post(
            "/api/company/prompts",
            json={"gate_number": 3, "system_prompt": "v2"},
            headers=auth_headers,
        )

        assert resp1.status_code == 200
        assert resp2.status_code == 200
        assert resp1.json()["version"] == 1
        assert resp2.json()["version"] == 2

    @patch("uteki.domains.company.api.CompanyPromptRepository")
    async def test_list_prompts_filter_by_gate(self, mock_repo, client, auth_headers):
        mock_repo.list_by_gate = AsyncMock(return_value=[
            {"id": "p1", "gate_number": 2, "version": 1, "skill_name": "fisher_qa"},
        ])

        resp = await client.get("/api/company/prompts?gate=2", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["gate_number"] == 2

        # Verify gate param was passed to the repo
        mock_repo.list_by_gate.assert_awaited_once_with(2)


# ══════════════════════════════════════════
# Prompt Activation — PUT /api/company/prompts/{id}/activate
# ══════════════════════════════════════════

class TestPromptActivation:

    @patch("uteki.domains.company.api.CompanyPromptRepository")
    async def test_activate_prompt(self, mock_repo, client, auth_headers):
        mock_repo.activate = AsyncMock(return_value={
            "id": "p1", "gate_number": 1, "version": 2,
            "skill_name": "business_analysis", "is_active": True,
            "system_prompt": "activated", "description": "",
            "eval_scores": None,
            "created_at": "2026-04-01T00:00:00+00:00",
            "updated_at": "2026-04-01T00:00:01+00:00",
        })

        resp = await client.put("/api/company/prompts/p1/activate", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True
        mock_repo.activate.assert_awaited_once_with("p1")

    @patch("uteki.domains.company.api.CompanyPromptRepository")
    async def test_activate_nonexistent(self, mock_repo, client, auth_headers):
        mock_repo.activate = AsyncMock(return_value=None)

        resp = await client.put(
            "/api/company/prompts/nonexistent/activate", headers=auth_headers,
        )
        assert resp.status_code == 404


# ══════════════════════════════════════════
# Share — POST /analyses/{id}/share, GET /shared/{token}
# ══════════════════════════════════════════

class TestShare:

    @patch("uteki.domains.company.api.CompanyAnalysisRepository")
    async def test_create_share_link(self, mock_repo, client, auth_headers):
        mock_repo.get_by_id = AsyncMock(return_value={
            "id": "a1", "symbol": "AAPL", "share_token": None, "share_expires_at": None,
        })
        mock_repo.update = AsyncMock(return_value=None)

        resp = await client.post("/api/company/analyses/a1/share", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert "share_url" in body
        assert body["share_url"].startswith("/shared/")
        assert "expires_at" in body

        # Verify update was called with token
        mock_repo.update.assert_awaited_once()
        update_args = mock_repo.update.call_args
        assert "share_token" in update_args[0][1]
        assert "share_expires_at" in update_args[0][1]

    @patch("uteki.domains.company.api.CompanyAnalysisRepository")
    async def test_create_share_link_reuses_existing(self, mock_repo, client, auth_headers):
        existing_token = "existing-token-abc"
        existing_expires = (datetime.now(timezone.utc) + timedelta(days=15)).isoformat()
        mock_repo.get_by_id = AsyncMock(return_value={
            "id": "a1", "symbol": "AAPL",
            "share_token": existing_token,
            "share_expires_at": existing_expires,
        })

        resp = await client.post("/api/company/analyses/a1/share", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["share_url"] == f"/shared/{existing_token}"
        # update should NOT be called since token already exists
        mock_repo.update.assert_not_called()

    @patch("uteki.domains.company.api.CompanyAnalysisRepository")
    async def test_get_shared_analysis(self, mock_repo, client):
        future_expiry = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
        mock_repo.get_by_share_token = AsyncMock(return_value={
            "id": "a1", "symbol": "AAPL",
            "full_report": {"verdict": {"action": "BUY"}},
            "share_token": "valid-token",
            "share_expires_at": future_expiry,
        })

        # No auth_headers — public endpoint
        resp = await client.get("/api/company/shared/valid-token")
        assert resp.status_code == 200
        body = resp.json()
        assert body["symbol"] == "AAPL"
        mock_repo.get_by_share_token.assert_awaited_once_with("valid-token")

    @patch("uteki.domains.company.api.CompanyAnalysisRepository")
    async def test_get_shared_nonexistent(self, mock_repo, client):
        mock_repo.get_by_share_token = AsyncMock(return_value=None)

        resp = await client.get("/api/company/shared/bad-token")
        assert resp.status_code == 404

    @patch("uteki.domains.company.api.CompanyAnalysisRepository")
    async def test_create_share_link_analysis_not_found(self, mock_repo, client, auth_headers):
        mock_repo.get_by_id = AsyncMock(return_value=None)

        resp = await client.post("/api/company/analyses/nonexistent/share", headers=auth_headers)
        assert resp.status_code == 404


# ══════════════════════════════════════════
# Quality Dashboard — GET /api/evaluation/company/dashboard
# ══════════════════════════════════════════

class TestQualityDashboard:

    @patch("uteki.domains.evaluation.api.GateScoreRepository")
    async def test_quality_dashboard_empty(self, mock_repo, client):
        mock_repo.get_dashboard_data = AsyncMock(return_value={
            "gate_averages": [],
            "recent_scores": [],
            "weakest_gate": None,
            "total_evaluations": 0,
        })

        resp = await client.get("/api/evaluation/company/dashboard")
        assert resp.status_code == 200
        body = resp.json()
        assert body["gate_averages"] == []
        assert body["total_evaluations"] == 0

    @patch("uteki.domains.evaluation.api.GateScoreRepository")
    async def test_quality_dashboard_with_data(self, mock_repo, client):
        mock_repo.get_dashboard_data = AsyncMock(return_value={
            "gate_averages": [
                {
                    "gate_number": 1, "skill_name": "business_analysis",
                    "avg_accuracy": 7.5, "avg_depth": 8.0,
                    "avg_consistency": 7.0, "avg_overall": 7.5, "count": 10,
                },
                {
                    "gate_number": 2, "skill_name": "fisher_qa",
                    "avg_accuracy": 6.0, "avg_depth": 6.5,
                    "avg_consistency": 5.5, "avg_overall": 6.0, "count": 8,
                },
            ],
            "recent_scores": [],
            "weakest_gate": {
                "gate_number": 2, "skill_name": "fisher_qa", "avg_overall": 6.0,
            },
            "total_evaluations": 18,
        })

        resp = await client.get("/api/evaluation/company/dashboard?symbol=AAPL")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["gate_averages"]) == 2
        assert body["total_evaluations"] == 18
        assert body["weakest_gate"]["gate_number"] == 2

        mock_repo.get_dashboard_data.assert_awaited_once_with(symbol="AAPL", limit=20)


# ══════════════════════════════════════════
# Compare — POST /api/company/analyze/compare
# ══════════════════════════════════════════

class TestCompare:

    async def test_compare_requires_auth(self, client):
        resp = await client.post(
            "/api/company/analyze/compare",
            json={"symbol": "AAPL", "models": ["gpt-4o", "claude-sonnet-4-20250514"]},
        )
        assert resp.status_code == 401

    @patch("uteki.domains.company.api.CompanyPromptRepository")
    @patch("uteki.domains.company.api.fetch_company_data")
    async def test_compare_invalid_symbol(
        self, mock_fetch, mock_prompt_repo, client, auth_headers,
    ):
        mock_fetch.return_value = None

        resp = await client.post(
            "/api/company/analyze/compare",
            json={"symbol": "XYZNOTREAL", "models": ["gpt-4o", "deepseek-chat"]},
            headers=auth_headers,
        )
        assert resp.status_code == 400


# ══════════════════════════════════════════
# A/B Test — POST /api/company/prompts/ab-test
# ══════════════════════════════════════════

class TestABTest:

    @patch("uteki.domains.company.api.CompanyPromptRepository")
    async def test_ab_test_nonexistent_prompts(self, mock_repo, client, auth_headers):
        mock_repo.get_by_id = AsyncMock(return_value=None)

        resp = await client.post(
            "/api/company/prompts/ab-test",
            json={
                "symbol": "AAPL",
                "gate_number": 1,
                "version_a_id": "nonexistent-a",
                "version_b_id": "nonexistent-b",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 404

    @patch("uteki.domains.company.api.CompanyPromptRepository")
    async def test_ab_test_wrong_gate(self, mock_repo, client, auth_headers):
        """Both prompts exist but their gate_number doesn't match the request gate."""
        mock_repo.get_by_id = AsyncMock(side_effect=[
            {
                "id": "pa", "gate_number": 2, "version": 1,
                "system_prompt": "prompt a", "skill_name": "fisher_qa",
            },
            {
                "id": "pb", "gate_number": 2, "version": 2,
                "system_prompt": "prompt b", "skill_name": "fisher_qa",
            },
        ])

        resp = await client.post(
            "/api/company/prompts/ab-test",
            json={
                "symbol": "AAPL",
                "gate_number": 1,  # mismatch: prompts are gate 2
                "version_a_id": "pa",
                "version_b_id": "pb",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "gate" in resp.json()["detail"].lower()
