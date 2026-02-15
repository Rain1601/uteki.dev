"""Tests for Risk Guard — rule execution and pass-through behavior."""

import pytest
from uteki.domains.index.services.risk_guard import (
    RiskGuard,
    RiskCheckResult,
    BaseRule,
    MaxPositionSizeRule,
    ConcentrationRule,
    DrawdownCircuitBreaker,
    OvertradeRule,
    get_risk_guard,
)


class TestRiskCheckResult:
    """Test RiskCheckResult dataclass."""

    def test_default_values(self):
        r = RiskCheckResult(status="approved")
        assert r.status == "approved"
        assert r.modified_allocations is None
        assert r.reasons == []

    def test_with_reasons(self):
        r = RiskCheckResult(
            status="blocked",
            reasons=["Position too large", "Concentration too high"],
        )
        assert r.status == "blocked"
        assert len(r.reasons) == 2

    def test_with_modified_allocations(self):
        allocs = [{"etf": "SPY", "amount": 50, "percentage": 25}]
        r = RiskCheckResult(status="modified", modified_allocations=allocs)
        assert r.modified_allocations == allocs


class TestBaseRule:
    """Test that base rule returns approved."""

    @pytest.mark.asyncio
    async def test_base_rule_approves(self):
        rule = BaseRule()
        result = await rule.evaluate(
            decision={"action": "BUY", "allocations": []},
            portfolio_state={"total_value": 100000},
        )
        assert result.status == "approved"


class TestRuleSlots:
    """Test that all rule slots are pass-through (inherit BaseRule behavior)."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("rule_class", [
        MaxPositionSizeRule,
        ConcentrationRule,
        DrawdownCircuitBreaker,
        OvertradeRule,
    ])
    async def test_rule_pass_through(self, rule_class):
        rule = rule_class()
        result = await rule.evaluate(
            decision={"action": "BUY", "allocations": [{"etf": "SPY", "amount": 50000}]},
            portfolio_state={"total_value": 100000},
        )
        assert result.status == "approved"
        assert result.reasons == []


class TestRiskGuard:
    """Test RiskGuard aggregation."""

    @pytest.mark.asyncio
    async def test_all_rules_pass(self):
        guard = RiskGuard()
        result = await guard.check(
            decision={"action": "BUY", "allocations": [{"etf": "SPY", "amount": 1000}]},
            portfolio_state={"total_value": 100000},
        )
        assert result.status == "approved"

    def test_has_4_rules(self):
        guard = RiskGuard()
        assert len(guard.rules) == 4

    def test_rule_types(self):
        guard = RiskGuard()
        types = [type(r).__name__ for r in guard.rules]
        assert "MaxPositionSizeRule" in types
        assert "ConcentrationRule" in types
        assert "DrawdownCircuitBreaker" in types
        assert "OvertradeRule" in types


class TestGetRiskGuard:
    """Test singleton factory."""

    def test_returns_risk_guard(self):
        guard = get_risk_guard()
        assert isinstance(guard, RiskGuard)

    def test_singleton(self):
        g1 = get_risk_guard()
        g2 = get_risk_guard()
        assert g1 is g2
