"""风控层 — 可插拔规则接口

在 Phase 3 采纳决策前执行风控检查。
当前为 pass-through 实现，不修改任何决策。
"""

import logging
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class RiskCheckResult:
    """风控检查结果"""

    status: str  # "approved" / "modified" / "blocked"
    modified_allocations: Optional[List[Dict[str, Any]]] = None
    reasons: List[str] = field(default_factory=list)


class RiskGuard:
    """风控规则执行器 — 聚合所有规则并执行"""

    def __init__(self):
        self.rules: List["BaseRule"] = [
            MaxPositionSizeRule(),
            ConcentrationRule(),
            DrawdownCircuitBreaker(),
            OvertradeRule(),
        ]

    async def check(
        self,
        decision: Dict[str, Any],
        portfolio_state: Dict[str, Any],
    ) -> RiskCheckResult:
        """依次执行所有规则，返回聚合结果"""
        all_reasons: List[str] = []

        for rule in self.rules:
            result = await rule.evaluate(decision, portfolio_state)
            if result.status == "blocked":
                return result
            if result.reasons:
                all_reasons.extend(result.reasons)

        return RiskCheckResult(
            status="approved",
            reasons=all_reasons,
        )


class BaseRule:
    """规则基类"""

    async def evaluate(
        self,
        decision: Dict[str, Any],
        portfolio_state: Dict[str, Any],
    ) -> RiskCheckResult:
        return RiskCheckResult(status="approved")


class MaxPositionSizeRule(BaseRule):
    """单次交易 ≤ 总资产 X%"""
    pass


class ConcentrationRule(BaseRule):
    """单一 ETF ≤ 总资产 Y%"""
    pass


class DrawdownCircuitBreaker(BaseRule):
    """回撤 > Z% 暂停交易"""
    pass


class OvertradeRule(BaseRule):
    """每日交易次数限制"""
    pass


_risk_guard: Optional[RiskGuard] = None


def get_risk_guard() -> RiskGuard:
    global _risk_guard
    if _risk_guard is None:
        _risk_guard = RiskGuard()
    return _risk_guard
