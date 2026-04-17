"""
ConsistencyRunner — Dimension 1: fixed input, stable output.

Strategy:
  1. Pick the fixture's target symbol, fetch company data once.
  2. Run the Company 7-gate pipeline N times using temperature=0 by default
     (temperature comes from model_config; we don't override here yet).
  3. Extract key numeric / categorical fields from each run's verdict.
  4. Compute CV for numeric fields, mode-agreement for categorical fields.
  5. Build a ConsistencyReport.

Limitations (documented in the report via `tools_mocked=False`):
  * web_search and compare_peers tools are called live — their responses
    change between runs, which inflates observed variance.
  * Cohen's kappa and tool-call-sequence Levenshtein are deferred to a
    follow-up (see ADR §1).
"""
from __future__ import annotations

import asyncio
import logging
import statistics
from collections import Counter
from datetime import datetime
from typing import Any

from uteki.domains.evaluation.eval_report import (
    CategoricalFieldStability,
    ConsistencyReport,
    EvalReport,
    NumericFieldStability,
)
from uteki.domains.evaluation.runners.base import BaseRunner

logger = logging.getLogger(__name__)


# Fields we track for consistency. Keyed by dotted path into the verdict dict.
# Each entry is a tuple (section, field) where section is the top-level key in
# CompanyFullReport (i.e. one of the 7 output sections).
_NUMERIC_PATHS: list[tuple[str, str]] = [
    ("business_analysis", "sustainability_score"),
    ("fisher_qa", "total_score"),
    ("moat_assessment", "moat_durability_years"),
    ("management_assessment", "management_score"),
    ("management_assessment", "integrity_score"),
    ("management_assessment", "capital_allocation_score"),
    ("reverse_test", "resilience_score"),
    ("valuation", "buy_confidence"),
    ("position_holding", "conviction"),
    ("position_holding", "position_size_pct"),
]

_CATEGORICAL_PATHS: list[tuple[str, str]] = [
    ("business_analysis", "business_quality"),
    ("fisher_qa", "growth_verdict"),
    ("moat_assessment", "moat_width"),
    ("moat_assessment", "moat_trend"),
    ("reverse_test", "worst_case_narrative"),  # string field; rough
    ("valuation", "price_assessment"),
    ("valuation", "safety_margin"),
    ("position_holding", "action"),
    ("position_holding", "quality_verdict"),
]


def _extract(verdict: dict, section: str, field: str) -> Any:
    node = verdict.get(section)
    if not isinstance(node, dict):
        return None
    return node.get(field)


def _compute_numeric_stability(
    path: str, values: list[float],
) -> NumericFieldStability | None:
    clean = [float(v) for v in values if isinstance(v, (int, float))]
    if len(clean) < 2:
        return None
    mean = statistics.mean(clean)
    stdev = statistics.stdev(clean)
    cv = stdev / mean if mean else 0.0
    return NumericFieldStability(
        field_path=path,
        mean=round(mean, 4),
        stdev=round(stdev, 4),
        cv=round(cv, 4),
        min_value=round(min(clean), 4),
        max_value=round(max(clean), 4),
    )


def _compute_categorical_stability(
    path: str, values: list[str],
) -> CategoricalFieldStability | None:
    clean = [v for v in values if isinstance(v, str) and v]
    if not clean:
        return None
    counter = Counter(clean)
    mode_value, mode_count = counter.most_common(1)[0]
    return CategoricalFieldStability(
        field_path=path,
        mode_value=mode_value,
        mode_rate=round(mode_count / len(clean), 4),
        distribution=dict(counter),
    )


class ConsistencyRunner(BaseRunner):
    dimension = "consistency"

    def __init__(self, *, num_runs: int = 10, **kwargs) -> None:
        super().__init__(**kwargs)
        if num_runs < 2:
            raise ValueError("num_runs must be >= 2 for consistency measurement")
        self.num_runs = num_runs

    async def run(self) -> EvalReport:
        started_at = datetime.utcnow()
        verdicts: list[dict] = []
        failed = 0

        # Sequential for now. Parallel with asyncio.gather would speed up but
        # can trigger rate limits — leave as a later optimization.
        for i in range(self.num_runs):
            try:
                result = await self._run_pipeline_once(run_index=i)
                verdicts.append(result.get("verdict") or {})
            except Exception:
                failed += 1

        if not verdicts:
            raise RuntimeError(
                f"All {self.num_runs} consistency runs failed — "
                "check LLM key validity and upstream errors."
            )

        numeric_fields: list[NumericFieldStability] = []
        for section, field in _NUMERIC_PATHS:
            values = [_extract(v, section, field) for v in verdicts]
            stability = _compute_numeric_stability(f"{section}.{field}", values)
            if stability:
                numeric_fields.append(stability)

        categorical_fields: list[CategoricalFieldStability] = []
        for section, field in _CATEGORICAL_PATHS:
            values = [_extract(v, section, field) for v in verdicts]
            stability = _compute_categorical_stability(f"{section}.{field}", values)
            if stability:
                categorical_fields.append(stability)

        action_values = [
            _extract(v, "position_holding", "action") for v in verdicts
        ]
        action_clean = [a for a in action_values if isinstance(a, str) and a]
        action_agreement_rate = None
        if action_clean:
            counter = Counter(action_clean)
            action_agreement_rate = round(
                counter.most_common(1)[0][1] / len(action_clean), 4
            )

        report = ConsistencyReport(
            num_runs=len(verdicts),
            temperature=0.0,
            tools_mocked=False,  # TODO: mock infrastructure arrives with Credibility Runner
            model_version_pinned=False,  # Caller pins via explicit model name only
            numeric_fields=numeric_fields,
            categorical_fields=categorical_fields,
            tool_call_sequence_levenshtein=None,  # deferred
            action_agreement_rate=action_agreement_rate,
            cross_session_drift_detected=False,
        )

        finished_at = datetime.utcnow()
        self.on_progress({
            "type": "done",
            "successful_runs": len(verdicts),
            "failed_runs": failed,
            "passes": report.passes,
        })

        return EvalReport(
            skill_name=self.skill_name,
            skill_version="unknown",  # TODO: resolve from git SHA when skill-system lands
            model=self.model,
            dataset_name=self.fixture.get("meta", {}).get("symbol", "unknown"),
            dataset_size=1,
            triggered_by="manual",
            started_at=started_at,
            finished_at=finished_at,
            consistency=report,
        )
