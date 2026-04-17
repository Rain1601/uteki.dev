"""
Unit tests for ConsistencyRunner — tests metric computation and report
assembly without invoking any real LLM or HTTP call.

The runner's `_run_pipeline_once` is monkeypatched to return synthetic
verdicts so we can assert on the resulting ConsistencyReport.
"""
from __future__ import annotations

import pytest

from uteki.domains.evaluation.eval_report import (
    CategoricalFieldStability,
    ConsistencyReport,
    EvalReport,
    NumericFieldStability,
)
from uteki.domains.evaluation.runners.consistency import (
    ConsistencyRunner,
    _compute_categorical_stability,
    _compute_numeric_stability,
)


# ─── Metric primitives ──────────────────────────────────────────────────


def test_compute_numeric_stability_basic():
    result = _compute_numeric_stability("foo.bar", [8.0, 8.2, 8.1, 8.3, 8.0])
    assert isinstance(result, NumericFieldStability)
    assert result.field_path == "foo.bar"
    assert 8.0 <= result.mean <= 8.3
    assert result.cv < 0.05  # very tight cluster


def test_compute_numeric_stability_ignores_non_numbers():
    result = _compute_numeric_stability("x", [1.0, 2.0, "bad", None, 3.0])
    assert result.mean == 2.0
    assert result.min_value == 1.0 and result.max_value == 3.0


def test_compute_numeric_stability_requires_two_samples():
    assert _compute_numeric_stability("x", [1.0]) is None
    assert _compute_numeric_stability("x", [None, "nope"]) is None


def test_compute_categorical_stability_mode_rate():
    result = _compute_categorical_stability(
        "position_holding.action",
        ["BUY", "BUY", "BUY", "WATCH", "BUY"],
    )
    assert isinstance(result, CategoricalFieldStability)
    assert result.mode_value == "BUY"
    assert result.mode_rate == 0.8
    assert result.distribution == {"BUY": 4, "WATCH": 1}


def test_compute_categorical_stability_skips_empty():
    assert _compute_categorical_stability("x", []) is None
    assert _compute_categorical_stability("x", [None, ""]) is None


# ─── Full runner with stubbed pipeline ──────────────────────────────────


def _make_verdict(action: str, conviction: float, total_score: float) -> dict:
    """Build a fake CompanyFullReport-shaped verdict with the fields we track."""
    return {
        "verdict": {
            "business_analysis": {"sustainability_score": 8.0, "business_quality": "excellent"},
            "fisher_qa": {"total_score": total_score, "growth_verdict": "compounder"},
            "moat_assessment": {
                "moat_width": "wide", "moat_trend": "stable", "moat_durability_years": 10.0,
            },
            "management_assessment": {
                "management_score": 8.5, "integrity_score": 9.0, "capital_allocation_score": 8.0,
            },
            "reverse_test": {"resilience_score": 7.5, "worst_case_narrative": "baseline"},
            "valuation": {
                "buy_confidence": 7.0, "price_assessment": "fair", "safety_margin": "moderate",
            },
            "position_holding": {
                "action": action, "conviction": conviction, "quality_verdict": "GOOD",
                "position_size_pct": 5.0,
            },
        }
    }


@pytest.fixture
def stable_runner(monkeypatch):
    """Build a ConsistencyRunner whose pipeline always returns identical output."""
    fixture = {"meta": {"symbol": "TSM", "name": "TSMC"}, "input": {}, "expected": {}}
    runner = ConsistencyRunner(
        skill_name="company.full",
        fixture=fixture,
        model="gpt-4.1",
        user_id="user-test",
        num_runs=5,
    )

    async def fake_run(self, run_index: int) -> dict:
        return _make_verdict(action="BUY", conviction=0.85, total_score=125.0)

    monkeypatch.setattr(ConsistencyRunner, "_run_pipeline_once", fake_run)
    return runner


async def test_consistency_report_shape_for_stable_pipeline(stable_runner):
    report = await stable_runner.run()

    assert isinstance(report, EvalReport)
    assert isinstance(report.consistency, ConsistencyReport)
    assert report.consistency.num_runs == 5
    assert report.consistency.action_agreement_rate == 1.0  # 5/5 agreed on BUY

    action_field = next(
        (f for f in report.consistency.categorical_fields if f.field_path.endswith(".action")),
        None,
    )
    assert action_field is not None
    assert action_field.mode_value == "BUY"
    assert action_field.mode_rate == 1.0

    # Zero variance → CV = 0 for the tracked numeric fields
    total_score_field = next(
        (f for f in report.consistency.numeric_fields if f.field_path == "fisher_qa.total_score"),
        None,
    )
    assert total_score_field is not None
    assert total_score_field.cv == 0.0


async def test_consistency_report_detects_drift(monkeypatch):
    fixture = {"meta": {"symbol": "TSM", "name": "TSMC"}, "input": {}, "expected": {}}
    runner = ConsistencyRunner(
        skill_name="company.full",
        fixture=fixture,
        model="gpt-4.1",
        user_id="user-test",
        num_runs=5,
    )

    # Sequence: 3× BUY, 2× WATCH — mode rate 0.6 (below the 0.8 threshold)
    actions = ["BUY", "BUY", "BUY", "WATCH", "WATCH"]

    async def fake_run(self, run_index: int) -> dict:
        return _make_verdict(
            action=actions[run_index],
            conviction=0.6 + 0.05 * run_index,  # monotonic — CV should be nonzero
            total_score=120.0 + run_index * 2,
        )

    monkeypatch.setattr(ConsistencyRunner, "_run_pipeline_once", fake_run)

    report = await runner.run()
    assert report.consistency.action_agreement_rate == 0.6
    action_field = next(
        f for f in report.consistency.categorical_fields if f.field_path.endswith(".action")
    )
    assert action_field.mode_rate == 0.6

    conviction_field = next(
        f for f in report.consistency.numeric_fields
        if f.field_path == "position_holding.conviction"
    )
    assert conviction_field.cv > 0

    # With tools_mocked=False and an agreement rate < 0.8, overall should not pass.
    assert not report.consistency.passes


def test_consistency_runner_rejects_num_runs_below_two():
    fixture = {"meta": {"symbol": "TSM"}}
    with pytest.raises(ValueError):
        ConsistencyRunner(
            skill_name="company.full",
            fixture=fixture,
            model="gpt-4.1",
            user_id="u",
            num_runs=1,
        )
