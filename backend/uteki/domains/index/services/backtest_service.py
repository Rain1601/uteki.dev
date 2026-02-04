"""回测引擎 — 指数 ETF 收益评估"""

import logging
from datetime import date, timedelta
from typing import Optional, List, Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.domains.index.models.index_price import IndexPrice

logger = logging.getLogger(__name__)


class BacktestService:
    """回测引擎 — 评估指数 ETF 在给定时间段的收益表现"""

    async def run(
        self,
        symbol: str,
        start: str,
        end: str,
        initial_capital: float,
        monthly_dca: float,
        session: AsyncSession,
    ) -> Dict[str, Any]:
        """执行单个指数的回测

        Args:
            symbol: ETF symbol
            start: YYYY-MM format
            end: YYYY-MM format
            initial_capital: 初始资金
            monthly_dca: 每月定投金额
            session: DB session
        """
        start_date = date.fromisoformat(f"{start}-01")
        # end 取月末
        end_parts = end.split("-")
        end_year, end_month = int(end_parts[0]), int(end_parts[1])
        if end_month == 12:
            end_date = date(end_year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(end_year, end_month + 1, 1) - timedelta(days=1)

        # 获取历史价格
        query = (
            select(IndexPrice)
            .where(
                IndexPrice.symbol == symbol.upper(),
                IndexPrice.date >= start_date,
                IndexPrice.date <= end_date,
            )
            .order_by(IndexPrice.date.asc())
        )
        result = await session.execute(query)
        prices = result.scalars().all()

        if not prices:
            # 检查最早可用日期
            earliest_query = (
                select(IndexPrice.date)
                .where(IndexPrice.symbol == symbol.upper())
                .order_by(IndexPrice.date.asc())
                .limit(1)
            )
            earliest_result = await session.execute(earliest_query)
            earliest = earliest_result.scalar_one_or_none()
            if earliest:
                return {
                    "error": f"Insufficient data for {symbol} in range {start} to {end}. "
                             f"Earliest available: {earliest.isoformat()}",
                }
            return {"error": f"No historical data for {symbol}"}

        # 模拟
        shares = 0.0
        cash = initial_capital
        total_invested = initial_capital
        monthly_values: List[Dict[str, Any]] = []
        max_value = 0.0
        max_drawdown = 0.0
        current_month = None

        # 初始买入（第一个交易日）
        first_price = prices[0].close
        if initial_capital > 0:
            shares = initial_capital / first_price
            cash = 0.0

        daily_returns: List[float] = []
        prev_value = initial_capital

        for p in prices:
            p_month = p.date.strftime("%Y-%m")

            # DCA: 每月第一个交易日买入
            if monthly_dca > 0 and p_month != current_month and current_month is not None:
                new_shares = monthly_dca / p.close
                shares += new_shares
                total_invested += monthly_dca

            current_month = p_month
            portfolio_value = shares * p.close

            # Max drawdown
            if portfolio_value > max_value:
                max_value = portfolio_value
            if max_value > 0:
                dd = (max_value - portfolio_value) / max_value * 100
                max_drawdown = max(max_drawdown, dd)

            # Daily return for Sharpe
            if prev_value > 0:
                daily_ret = (portfolio_value - prev_value) / prev_value
                daily_returns.append(daily_ret)
            prev_value = portfolio_value

            # 记录月末值（每月最后一条）
            if (not monthly_values or monthly_values[-1]["month"] != p_month):
                monthly_values.append({
                    "month": p_month,
                    "date": p.date.isoformat(),
                    "value": round(portfolio_value, 2),
                    "shares": round(shares, 4),
                    "price": p.close,
                    "invested": round(total_invested, 2),
                })
            else:
                monthly_values[-1].update({
                    "date": p.date.isoformat(),
                    "value": round(portfolio_value, 2),
                    "shares": round(shares, 4),
                    "price": p.close,
                    "invested": round(total_invested, 2),
                })

        final_value = shares * prices[-1].close
        total_return_pct = ((final_value - total_invested) / total_invested * 100) if total_invested > 0 else 0

        # 年化收益
        days = (prices[-1].date - prices[0].date).days
        years = days / 365.25 if days > 0 else 1
        annualized = ((final_value / total_invested) ** (1 / years) - 1) * 100 if total_invested > 0 and years > 0 else 0

        # Sharpe ratio (假设无风险利率 4%)
        sharpe = 0.0
        if daily_returns and len(daily_returns) > 1:
            import statistics
            avg_daily = statistics.mean(daily_returns)
            std_daily = statistics.stdev(daily_returns)
            if std_daily > 0:
                risk_free_daily = 0.04 / 252
                sharpe = (avg_daily - risk_free_daily) / std_daily * (252 ** 0.5)

        return {
            "symbol": symbol.upper(),
            "total_return_pct": round(total_return_pct, 2),
            "annualized_return_pct": round(annualized, 2),
            "max_drawdown_pct": round(max_drawdown, 2),
            "sharpe_ratio": round(sharpe, 2),
            "final_value": round(final_value, 2),
            "total_invested": round(total_invested, 2),
            "monthly_values": monthly_values,
        }

    async def compare(
        self,
        symbols: List[str],
        start: str,
        end: str,
        initial_capital: float,
        monthly_dca: float,
        session: AsyncSession,
    ) -> List[Dict[str, Any]]:
        """多指数对比回测"""
        results = []
        for symbol in symbols:
            result = await self.run(symbol, start, end, initial_capital, monthly_dca, session)
            results.append(result)
        return results


    async def replay_decision(
        self,
        harness_id: str,
        session: AsyncSession,
    ) -> Dict[str, Any]:
        """决策重放 — 使用历史 Harness 重新调用所有模型，对比输出差异"""
        from uteki.domains.index.services.arena_service import ArenaService, get_arena_service
        from uteki.domains.index.models.decision_harness import DecisionHarness
        from uteki.domains.index.models.model_io import ModelIO

        # 1. 获取原始 Harness
        harness_q = select(DecisionHarness).where(DecisionHarness.id == harness_id)
        harness_r = await session.execute(harness_q)
        harness = harness_r.scalar_one_or_none()
        if not harness:
            return {"error": f"Harness not found: {harness_id}"}

        # 2. 获取原始模型输出
        original_io_q = (
            select(ModelIO)
            .where(ModelIO.harness_id == harness_id)
            .order_by(ModelIO.model_provider, ModelIO.model_name)
        )
        original_io_r = await session.execute(original_io_q)
        originals = {
            f"{m.model_provider}/{m.model_name}": m.to_dict()
            for m in original_io_r.scalars().all()
        }

        # 3. 重新运行 Arena（相同 Harness）
        arena = get_arena_service()
        new_results = await arena.run(harness_id, session)

        # 4. 对比差异
        comparisons = []
        for new_io in new_results:
            key = f"{new_io['model_provider']}/{new_io['model_name']}"
            original = originals.get(key)

            original_action = (original or {}).get("output_structured", {}).get("action") if original else None
            new_action = (new_io.get("output_structured") or {}).get("action")

            original_allocs = (original or {}).get("output_structured", {}).get("allocations", []) if original else []
            new_allocs = (new_io.get("output_structured") or {}).get("allocations", [])

            comparisons.append({
                "model": key,
                "original_action": original_action,
                "replay_action": new_action,
                "action_changed": original_action != new_action,
                "original_allocations": original_allocs,
                "replay_allocations": new_allocs,
                "original_parse_status": original.get("parse_status") if original else None,
                "replay_parse_status": new_io.get("parse_status"),
            })

        return {
            "harness_id": harness_id,
            "harness_type": harness.harness_type,
            "models_compared": len(comparisons),
            "comparisons": comparisons,
        }


# Singleton
_backtest_service: Optional[BacktestService] = None


def get_backtest_service() -> BacktestService:
    global _backtest_service
    if _backtest_service is None:
        _backtest_service = BacktestService()
    return _backtest_service
