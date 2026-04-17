"""
BaseRunner — shared scaffolding for all evaluation runners.

Responsibilities:
  - Resolve the model config (user-scoped aggregator key → env fallback)
  - Fetch company data once (runners that iterate re-use the snapshot)
  - Build a CompanySkillRunner invocation
  - Emit structured progress events for SSE streaming
"""
from __future__ import annotations

import abc
import logging
import time
from typing import Any, Callable, Optional

from uteki.domains.company.financials import fetch_company_data
from uteki.domains.company.skill_runner import CompanySkillRunner
from uteki.domains.evaluation.eval_report import EvalReport

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[dict], None]


class BaseRunner(abc.ABC):
    """Abstract base for evaluation runners.

    Each subclass populates a single dimension on the returned EvalReport.
    """

    dimension: str  # one of: consistency | credibility | logic | effectiveness

    def __init__(
        self,
        *,
        skill_name: str,
        fixture: dict,
        model: str,
        user_id: str,
        on_progress: Optional[ProgressCallback] = None,
    ) -> None:
        self.skill_name = skill_name
        self.fixture = fixture
        self.model = model
        self.user_id = user_id
        self.on_progress = on_progress or (lambda _: None)

        self._company_data: Optional[dict] = None
        self._model_config: Optional[dict] = None

    # ─── Subclass entry point ────────────────────────────────────────────

    @abc.abstractmethod
    async def run(self) -> EvalReport:
        """Execute the evaluation and return an EvalReport."""

    # ─── Shared helpers ──────────────────────────────────────────────────

    async def _ensure_model_config(self) -> dict:
        """Lazy-resolve model_config using the caller's user_id.

        Priority: user's aggregator key (DB) → env AIHUBMIX_API_KEY →
        provider-specific env keys. Matches the runtime path used by
        /api/company/analyze.
        """
        if self._model_config is not None:
            return self._model_config

        from uteki.domains.admin.aggregator_service import resolve_unified_provider

        resolved = await resolve_unified_provider(user_id=self.user_id)
        if not resolved:
            raise RuntimeError(
                "No LLM key available for this user. "
                "Configure AIHubMix or OpenRouter in Settings → Interface For LLMs."
            )
        _agg, api_key, base_url = resolved
        self._model_config = {
            "provider": "openai",
            "model": self.model,
            "api_key": api_key,
            "base_url": base_url,
        }
        return self._model_config

    async def _ensure_company_data(self) -> dict:
        """Fetch company data once from the fixture's symbol."""
        if self._company_data is not None:
            return self._company_data

        symbol = self.fixture.get("meta", {}).get("symbol")
        if not symbol:
            raise ValueError("fixture missing meta.symbol")

        data = await fetch_company_data(symbol)
        if "error" in data:
            raise RuntimeError(f"fetch_company_data failed: {data['error']}")
        self._company_data = data
        return data

    async def _run_pipeline_once(self, run_index: int) -> dict:
        """Run the 7-gate pipeline once; return the raw result dict.

        Emits two progress events: run_start and run_complete.
        Caller is responsible for timing / success flagging in its metric code.
        """
        model_config = await self._ensure_model_config()
        company_data = await self._ensure_company_data()

        self.on_progress({
            "type": "run_start",
            "run": run_index,
            "symbol": company_data.get("profile", {}).get("symbol"),
        })

        started = time.time()
        runner = CompanySkillRunner(model_config, company_data)
        try:
            result = await runner.run_pipeline()
            elapsed_ms = int((time.time() - started) * 1000)
            self.on_progress({
                "type": "run_complete",
                "run": run_index,
                "status": "success",
                "elapsed_ms": elapsed_ms,
            })
            return result
        except Exception as e:
            elapsed_ms = int((time.time() - started) * 1000)
            logger.warning(f"[eval] run #{run_index} failed: {e}")
            self.on_progress({
                "type": "run_complete",
                "run": run_index,
                "status": "error",
                "error": str(e),
                "elapsed_ms": elapsed_ms,
            })
            raise
