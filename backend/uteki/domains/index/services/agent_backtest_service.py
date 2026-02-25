"""Agent 独立回测服务 — Supabase REST API 版

对单个 Agent 运行历史回测：
1. 用历史价格构建 mock harness
2. 运行 skill pipeline
3. 用实际后续价格计算收益
4. 输出收益曲线、准确率、Sharpe、最大回撤
"""

import logging
import math
from datetime import date, timedelta
from typing import Optional, List, Dict, Any

from uteki.common.config import settings
from uteki.common.database import SupabaseRepository, db_manager

logger = logging.getLogger(__name__)

# 前瞻窗口（天数）
FORWARD_WINDOWS = [5, 10, 20]

WATCHLIST_TABLE = "watchlist"
PRICE_TABLE = "index_prices"


class AgentBacktestService:
    """单 Agent 独立回测"""

    async def run_backtest(
        self,
        agent_key: str,
        start_date: date,
        end_date: date,
        frequency: str,  # "weekly" / "biweekly" / "monthly"
        budget: float = 10000.0,
    ) -> Dict[str, Any]:
        """执行回测

        Args:
            agent_key: "{provider}:{model}" 格式
            start_date: 回测起始日
            end_date: 回测结束日
            frequency: 决策频率
            budget: 初始预算

        Returns:
            回测结果：收益曲线、准确率、Sharpe、最大回撤、benchmark 对比
        """
        # 1. 获取 watchlist
        watchlist = await self._get_watchlist()
        if not watchlist:
            return {"error": "No watchlist available"}

        symbols = [w["symbol"] for w in watchlist]

        # 2. 生成决策日期序列
        decision_dates = self._generate_dates(start_date, end_date, frequency)
        if not decision_dates:
            return {"error": "No decision dates in range"}

        # 3. 加载所有需要的历史价格
        prices = await self._load_prices(symbols, start_date, end_date + timedelta(days=30))

        # 4. 逐个日期运行 agent
        decisions: List[Dict[str, Any]] = []
        equity_curve: List[Dict[str, Any]] = []
        benchmark_curve: List[Dict[str, Any]] = []
        current_value = budget
        benchmark_value = budget
        correct_count = 0
        total_decisions = 0

        parts = agent_key.split(":", 1)
        if len(parts) != 2:
            return {"error": f"Invalid agent_key format: {agent_key}"}
        provider, model = parts

        # 查找 API key: DB config first, then ARENA_MODELS fallback
        from uteki.domains.index.services.arena_service import load_models_from_db, ARENA_MODELS
        model_config = None

        # Try DB config
        db_models = load_models_from_db()
        for m in db_models:
            if m["provider"] == provider and m["model"] == model:
                model_config = m
                break

        # Fallback to ARENA_MODELS
        if not model_config:
            for m in ARENA_MODELS:
                if m["provider"] == provider and m["model"] == model:
                    api_key = getattr(settings, m.get("api_key_attr", ""), None)
                    if api_key:
                        model_config = {**m, "api_key": api_key}
                    break

        if not model_config:
            return {"error": f"Model not available: {agent_key}"}

        for decision_date in decision_dates:
            # 构建 mock harness
            mock_harness = self._build_mock_harness(
                symbols, prices, decision_date, budget, watchlist
            )

            if not mock_harness:
                continue

            # 运行 skill pipeline
            try:
                decision = await self._run_agent(
                    model_config, agent_key, mock_harness
                )
            except Exception as e:
                logger.error(f"Backtest agent error on {decision_date}: {e}")
                decision = {"action": "HOLD", "confidence": 0}

            action = decision.get("action", "HOLD")

            # 计算前瞻收益
            forward_returns = self._calculate_forward_returns(
                symbols, prices, decision_date
            )

            # 准确率判定
            is_correct = self._evaluate_accuracy(action, forward_returns)
            if is_correct is not None:
                total_decisions += 1
                if is_correct:
                    correct_count += 1

            # 模拟收益
            avg_5d = self._avg_return(forward_returns, 5)
            if action == "BUY":
                current_value *= (1 + avg_5d)
            elif action == "SELL":
                current_value *= (1 - avg_5d * 0.5)  # partial exit simulation

            # Benchmark: pure DCA always buys
            benchmark_value *= (1 + avg_5d)

            decisions.append({
                "date": decision_date.isoformat(),
                "action": action,
                "confidence": decision.get("confidence", 0),
                "forward_returns": forward_returns,
                "is_correct": is_correct,
            })
            equity_curve.append({
                "date": decision_date.isoformat(),
                "value": round(current_value, 2),
            })
            benchmark_curve.append({
                "date": decision_date.isoformat(),
                "value": round(benchmark_value, 2),
            })

        # 5. 计算汇总指标
        accuracy = (correct_count / total_decisions * 100) if total_decisions > 0 else 0
        total_return = ((current_value - budget) / budget * 100) if budget > 0 else 0
        benchmark_return = ((benchmark_value - budget) / budget * 100) if budget > 0 else 0
        max_drawdown = self._calculate_max_drawdown(equity_curve)
        sharpe = self._calculate_sharpe(equity_curve)

        return {
            "agent_key": agent_key,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "frequency": frequency,
            "total_decisions": total_decisions,
            "accuracy": round(accuracy, 1),
            "total_return_pct": round(total_return, 2),
            "benchmark_return_pct": round(benchmark_return, 2),
            "alpha_pct": round(total_return - benchmark_return, 2),
            "max_drawdown_pct": round(max_drawdown, 2),
            "sharpe_ratio": round(sharpe, 2),
            "equity_curve": equity_curve,
            "benchmark_curve": benchmark_curve,
            "decisions": decisions,
        }

    def _generate_dates(
        self, start: date, end: date, frequency: str
    ) -> List[date]:
        """生成决策日期序列"""
        dates = []
        current = start
        if frequency == "weekly":
            delta = timedelta(weeks=1)
        elif frequency == "biweekly":
            delta = timedelta(weeks=2)
        else:  # monthly
            delta = timedelta(days=30)

        while current <= end:
            dates.append(current)
            current += delta
        return dates

    async def _get_watchlist(self) -> List[Dict[str, Any]]:
        repo = SupabaseRepository(WATCHLIST_TABLE)
        rows = repo.select_data(eq={"is_active": True})
        return [{"symbol": w["symbol"], "name": w["name"]} for w in rows]

    async def _load_prices(
        self, symbols: List[str], start: date, end: date
    ) -> Dict[str, List[Dict[str, Any]]]:
        """加载所有标的的历史价格"""
        prices: Dict[str, List[Dict[str, Any]]] = {}
        repo = SupabaseRepository(PRICE_TABLE)
        start_str = start.isoformat()
        end_str = end.isoformat()

        for symbol in symbols:
            rows = repo.select_data(
                eq={"symbol": symbol},
                gte={"date": start_str},
                lte={"date": end_str},
                order="date.asc",
            )
            prices[symbol] = rows
        return prices

    def _build_mock_harness(
        self,
        symbols: List[str],
        prices: Dict[str, List[Dict[str, Any]]],
        target_date: date,
        budget: float,
        watchlist: List[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        """从历史价格构建 mock harness"""
        quotes = {}
        for symbol in symbols:
            symbol_prices = prices.get(symbol, [])
            # 找到 target_date 或之前最近的价格
            price_on_date = None
            for p in reversed(symbol_prices):
                p_date = p["date"]
                if isinstance(p_date, str):
                    p_date = date.fromisoformat(p_date)
                if p_date <= target_date:
                    price_on_date = p
                    break

            if not price_on_date:
                continue

            quotes[symbol] = {
                "price": price_on_date["close"],
                "pe_ratio": None,
                "ma50": None,
                "ma200": None,
                "rsi": None,
            }

        if not quotes:
            return None

        return {
            "market_snapshot": {
                "quotes": quotes,
                "valuations": {},
                "macro": {},
                "sentiment": {},
            },
            "account_state": {"cash": budget, "positions": [], "total": budget},
            "memory_summary": {},
            "task": {
                "type": "backtest",
                "budget": budget,
                "constraints": {
                    "max_holdings": 3,
                    "watchlist_only": True,
                    "max_single_position_pct": 40,
                    "risk_tolerance": "moderate",
                },
                "watchlist": symbols,
            },
            "created_at": target_date.isoformat(),
        }

    async def _run_agent(
        self,
        model_config: Dict[str, Any],
        agent_key: str,
        harness_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """运行单个 agent 的 skill pipeline"""
        from uteki.domains.index.services.agent_skills import AgentSkillRunner
        from uteki.domains.index.services.arena_service import ArenaService

        # 构建 prompt
        class FakeHarness:
            def __init__(self, data):
                self.market_snapshot = data.get("market_snapshot")
                self.account_state = data.get("account_state")
                self.memory_summary = data.get("memory_summary")
                self.task = data.get("task")
                self.harness_type = data["task"]["type"]
                self.created_at = None

        fake = FakeHarness(harness_data)
        user_prompt = ArenaService._serialize_harness(fake)

        # AgentSkillRunner may still need a session (SNB trading domain)
        async with db_manager.get_postgres_session() as agent_session:
            runner = AgentSkillRunner(
                model_config=model_config,
                harness_data=harness_data,
                agent_key=agent_key,
                session=agent_session,
            )
            result = await runner.run_pipeline(
                system_prompt="",
                user_prompt=user_prompt,
            )

        output_raw = result.get("output_raw", "")
        svc = ArenaService()
        parsed = svc._parse_structured_output(output_raw)
        parsed.pop("_parse_status", None)
        return parsed

    def _calculate_forward_returns(
        self,
        symbols: List[str],
        prices: Dict[str, List[Dict[str, Any]]],
        target_date: date,
    ) -> Dict[str, Dict[int, float]]:
        """计算各标的在 target_date 之后 5/10/20 天的收益率"""
        returns: Dict[str, Dict[int, float]] = {}

        for symbol in symbols:
            symbol_prices = prices.get(symbol, [])
            # 找 target_date 价格
            base_price = None
            base_idx = None
            for i, p in enumerate(symbol_prices):
                p_date = p["date"]
                if isinstance(p_date, str):
                    p_date = date.fromisoformat(p_date)
                if p_date >= target_date:
                    base_price = p["close"]
                    base_idx = i
                    break

            if base_price is None or base_idx is None:
                continue

            symbol_returns: Dict[int, float] = {}
            for window in FORWARD_WINDOWS:
                future_idx = base_idx + window
                if future_idx < len(symbol_prices):
                    future_price = symbol_prices[future_idx]["close"]
                    symbol_returns[window] = (future_price - base_price) / base_price
                else:
                    symbol_returns[window] = 0.0

            returns[symbol] = symbol_returns

        return returns

    @staticmethod
    def _avg_return(
        forward_returns: Dict[str, Dict[int, float]], window: int
    ) -> float:
        """计算所有标的在指定窗口的平均收益率"""
        values = [r.get(window, 0) for r in forward_returns.values() if window in r]
        return sum(values) / len(values) if values else 0.0

    @staticmethod
    def _evaluate_accuracy(
        action: str, forward_returns: Dict[str, Dict[int, float]]
    ) -> Optional[bool]:
        """评估决策准确性

        BUY 后涨 = 正确, SELL 后跌 = 正确, HOLD 且波动<2% = 正确
        """
        if not forward_returns:
            return None

        avg_5d = sum(r.get(5, 0) for r in forward_returns.values()) / len(forward_returns)

        if action == "BUY":
            return avg_5d > 0
        elif action == "SELL":
            return avg_5d < 0
        elif action == "HOLD":
            return abs(avg_5d) < 0.02
        return None

    @staticmethod
    def _calculate_max_drawdown(equity_curve: List[Dict[str, Any]]) -> float:
        """计算最大回撤 (%)"""
        if not equity_curve:
            return 0.0

        peak = equity_curve[0]["value"]
        max_dd = 0.0

        for point in equity_curve:
            value = point["value"]
            if value > peak:
                peak = value
            dd = (peak - value) / peak * 100 if peak > 0 else 0
            if dd > max_dd:
                max_dd = dd

        return max_dd

    @staticmethod
    def _calculate_sharpe(
        equity_curve: List[Dict[str, Any]], risk_free_rate: float = 0.05
    ) -> float:
        """计算年化 Sharpe Ratio"""
        if len(equity_curve) < 2:
            return 0.0

        returns = []
        for i in range(1, len(equity_curve)):
            prev = equity_curve[i - 1]["value"]
            curr = equity_curve[i]["value"]
            if prev > 0:
                returns.append((curr - prev) / prev)

        if not returns:
            return 0.0

        avg_return = sum(returns) / len(returns)
        if len(returns) < 2:
            return 0.0

        variance = sum((r - avg_return) ** 2 for r in returns) / (len(returns) - 1)
        std_dev = math.sqrt(variance) if variance > 0 else 0.001

        # Annualize (assume ~26 biweekly periods per year)
        periods_per_year = 26
        annualized_return = avg_return * periods_per_year
        annualized_std = std_dev * math.sqrt(periods_per_year)

        return (annualized_return - risk_free_rate) / annualized_std if annualized_std > 0 else 0.0


_agent_backtest_service: Optional[AgentBacktestService] = None


def get_agent_backtest_service() -> AgentBacktestService:
    global _agent_backtest_service
    if _agent_backtest_service is None:
        _agent_backtest_service = AgentBacktestService()
    return _agent_backtest_service
