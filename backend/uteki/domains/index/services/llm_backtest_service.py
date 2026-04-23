"""LLM-Driven Backtest Service

每月初让 LLM 模型独立做投资决策，模拟全年组合表现，
对比不同模型 + VOO/QQQ 基准。

分析流程与 Arena 完全一致（4-skill pipeline + PromptService），
仅执行阶段不同（模拟下单 vs 真实下单）。
"""

import asyncio
import json
import logging
import statistics
import time
from datetime import date, timedelta
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4

from uteki.common.config import settings
from uteki.common.database import SupabaseRepository
from uteki.domains.agent.llm_adapter import (
    LLMAdapterFactory, LLMConfig, LLMMessage,
)
from uteki.domains.index.services.agent_skills import (
    AgentSkillRunner, ToolExecutor,
)
from uteki.domains.index.services.arena_service import (
    ArenaService, load_models_from_db,
)
from uteki.domains.index.services.market_calendar import is_trading_day
from uteki.domains.index.services.prompt_service import (
    get_prompt_service, DEFAULT_SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)

MODEL_TIMEOUT = 90  # seconds per single-shot LLM call
BENCHMARK_SYMBOLS = ["VOO", "QQQ"]


# ── Action mapping: Chinese → English ──
ACTION_MAP = {
    "买入": "BUY",
    "卖出": "SELL",
    "持有": "HOLD",
    "调仓": "REBALANCE",
    "跳过": "HOLD",
}


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────
# Price helpers
# ─────────────────────────────────────────────

def _load_prices(symbol: str, start: str, end: str) -> List[Dict[str, Any]]:
    """Load price rows from Supabase for a symbol in [start, end]."""
    repo = SupabaseRepository("index_prices")
    return repo.select_data(
        eq={"symbol": symbol.upper()},
        gte={"date": start},
        lte={"date": end},
        order="date.asc",
    )


def _price_on_date(prices: List[Dict], target: date, field: str = "close") -> Optional[float]:
    """Get the price on or before target date (latest available)."""
    target_str = target.isoformat()
    best = None
    for p in prices:
        d = str(p["date"])[:10]
        if d <= target_str:
            best = p.get(field)
        else:
            break
    return best


def _price_after_date(prices: List[Dict], target: date, field: str = "open") -> Optional[float]:
    """Get the first price strictly after target date (next trading day open)."""
    target_str = target.isoformat()
    for p in prices:
        d = str(p["date"])[:10]
        if d > target_str:
            return p.get(field)
    return None


def _get_decision_dates(year: int) -> List[date]:
    """Generate 12 monthly decision dates (first trading day of each month)."""
    dates = []
    for month in range(1, 13):
        d = date(year, month, 1)
        while not is_trading_day(d):
            d += timedelta(days=1)
        dates.append(d)
    return dates


def _compute_ma(prices: List[Dict], end_date: date, window: int) -> Optional[float]:
    """Compute simple moving average of close prices."""
    end_str = end_date.isoformat()
    closes = [p["close"] for p in prices if str(p["date"])[:10] <= end_str]
    if len(closes) < window:
        return None
    return round(statistics.mean(closes[-window:]), 2)


def _compute_rsi(prices: List[Dict], end_date: date, period: int = 14) -> Optional[float]:
    """Compute RSI ending at end_date."""
    end_str = end_date.isoformat()
    closes = [p["close"] for p in prices if str(p["date"])[:10] <= end_str]
    if len(closes) < period + 1:
        return None
    changes = [closes[i] - closes[i - 1] for i in range(-period, 0)]
    gains = [c for c in changes if c > 0]
    losses = [-c for c in changes if c < 0]
    avg_gain = sum(gains) / period if gains else 0
    avg_loss = sum(losses) / period if losses else 0.001
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def _fetch_kline_from_prices(
    prices: List[Dict], as_of: date, days: int = 20,
) -> List[Dict[str, Any]]:
    """Extract recent K-line data from pre-loaded prices (up to as_of date)."""
    as_of_str = as_of.isoformat()
    historical = [p for p in prices if str(p["date"])[:10] <= as_of_str]
    recent = historical[-days:] if len(historical) > days else historical
    return [
        {
            "date": str(r.get("date", ""))[:10],
            "open": round(r.get("open", 0), 2),
            "high": round(r.get("high", 0), 2),
            "low": round(r.get("low", 0), 2),
            "close": round(r.get("close", 0), 2),
            "volume": r.get("volume", 0),
        }
        for r in recent
    ]


# ─────────────────────────────────────────────
# Portfolio simulator
# ─────────────────────────────────────────────

class Portfolio:
    """Simulated portfolio tracking cash + positions."""

    def __init__(self, cash: float):
        self.cash = cash
        self.positions: Dict[str, float] = {}   # symbol → shares (fractional)
        self.avg_prices: Dict[str, float] = {}  # symbol → average cost basis

    def value(self, prices_by_symbol: Dict[str, List[Dict]], as_of: date) -> float:
        """Total portfolio value as of a date."""
        total = self.cash
        for symbol, shares in self.positions.items():
            price = _price_on_date(prices_by_symbol.get(symbol, []), as_of)
            if price:
                total += shares * price
        return total

    def execute(
        self,
        allocations: Dict[str, float],
        prices_by_symbol: Dict[str, List[Dict]],
        execution_date: date,
    ):
        """Execute allocation change. allocations = {symbol: target_pct_of_total}.

        Uses the first available price on/after execution_date (open price).
        """
        total = self.cash
        exec_prices: Dict[str, float] = {}
        for symbol, shares in self.positions.items():
            p = _price_after_date(prices_by_symbol.get(symbol, []), execution_date - timedelta(days=1), "open")
            if p is None:
                p = _price_on_date(prices_by_symbol.get(symbol, []), execution_date)
            if p:
                exec_prices[symbol] = p
                total += shares * p

        if total <= 0:
            return

        # Sell all current positions first (full rebalance)
        for symbol, shares in list(self.positions.items()):
            price = exec_prices.get(symbol)
            if price and shares > 0:
                self.cash += shares * price
        self.positions.clear()
        self.avg_prices.clear()

        # Buy according to new allocations
        for symbol, pct in allocations.items():
            if pct <= 0:
                continue
            target_value = total * (pct / 100.0)
            price = _price_after_date(
                prices_by_symbol.get(symbol, []),
                execution_date - timedelta(days=1),
                "open",
            )
            if price is None:
                price = _price_on_date(prices_by_symbol.get(symbol, []), execution_date)
            if price and price > 0:
                shares = target_value / price
                self.positions[symbol] = shares
                self.avg_prices[symbol] = price
                self.cash -= shares * price

        if self.cash < 0:
            self.cash = 0

    def snapshot(self) -> Dict[str, Any]:
        return {
            "cash": round(self.cash, 2),
            "positions": {s: round(sh, 4) for s, sh in self.positions.items()},
        }


# ─────────────────────────────────────────────
# Backtest Tool Executor (historical data)
# ─────────────────────────────────────────────

class BacktestToolExecutor(ToolExecutor):
    """Override tool execution for backtest context.

    - get_symbol_detail: uses pre-loaded historical prices instead of live data
    - web_search: disabled (no future data allowed)
    - read_memory: returns empty (no agent memory in backtest)
    """

    def __init__(
        self,
        harness_data: Dict[str, Any],
        prices_by_symbol: Dict[str, List[Dict]],
        as_of_date: date,
        agent_key: str = "backtest",
        user_id: str = "default",
    ):
        super().__init__(harness_data, agent_key, user_id)
        self.prices_by_symbol = prices_by_symbol
        self.as_of_date = as_of_date

    async def _get_symbol_detail(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Return historical data from pre-loaded prices."""
        symbol = args.get("symbol", "").upper()
        prices = self.prices_by_symbol.get(symbol, [])
        close = _price_on_date(prices, self.as_of_date)
        ma50 = _compute_ma(prices, self.as_of_date, 50)
        ma200 = _compute_ma(prices, self.as_of_date, 200)
        rsi = _compute_rsi(prices, self.as_of_date)

        one_year_ago = self.as_of_date - timedelta(days=365)
        year_prices = [
            p["close"] for p in prices
            if one_year_ago.isoformat() <= str(p["date"])[:10] <= self.as_of_date.isoformat()
        ]
        return {
            "symbol": symbol,
            "quote": {
                "price": close,
                "high_52w": max(year_prices) if year_prices else None,
                "low_52w": min(year_prices) if year_prices else None,
            },
            "indicators": {"ma50": ma50, "ma200": ma200, "rsi": rsi},
        }

    async def _read_memory(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Return empty — no agent memory in backtest."""
        return {
            "category": args.get("category"),
            "agent_key": self.agent_key,
            "shared_memories": [],
            "private_memories": [],
            "note": "回测模式下无历史记忆。",
        }

    async def _web_search(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Disabled in backtest to prevent future data leakage."""
        return {
            "error": "回测模式下禁用联网搜索，防止未来数据泄露。",
            "query": args.get("query", ""),
        }


# ─────────────────────────────────────────────
# Main service
# ─────────────────────────────────────────────

class LLMBacktestService:
    """LLM-driven backtest: models make monthly decisions over a full year.

    分析流程与 Arena 完全一致（4-skill pipeline + PromptService），
    仅执行阶段不同（模拟下单 vs 真实下单）。
    """

    def __init__(self):
        self._arena = ArenaService()

    async def run_backtest(
        self,
        year: int,
        initial_capital: float,
        monthly_contribution: float,
        model_keys: List[str],
        user_id: str,
        on_progress: Optional[Callable] = None,
    ) -> Dict[str, Any]:
        """Main entry: run a full-year LLM backtest."""
        run_id = str(uuid4())

        # Get watchlist symbols
        watchlist_rows = SupabaseRepository("watchlist").select_data(eq={"is_active": True})
        watchlist_symbols = [w["symbol"] for w in watchlist_rows]
        if not watchlist_symbols:
            raise ValueError("No symbols in watchlist. Add ETFs before running backtest.")

        all_symbols = list(set(watchlist_symbols + BENCHMARK_SYMBOLS))

        # Pre-load ALL price data for the year (plus lookback for indicators)
        lookback_start = date(year - 1, 1, 1).isoformat()
        year_end = date(year, 12, 31).isoformat()

        if on_progress:
            on_progress({"type": "status", "message": "Loading price data..."})

        prices_by_symbol: Dict[str, List[Dict]] = {}
        for sym in all_symbols:
            prices_by_symbol[sym] = _load_prices(sym, lookback_start, year_end)

        for sym in watchlist_symbols:
            if not prices_by_symbol.get(sym):
                raise ValueError(f"No price data for {sym} in {year}. Run data sync first.")

        decision_dates = _get_decision_dates(year)

        # Persist run record
        run_repo = SupabaseRepository("llm_backtest_runs")
        run_data = {
            "id": run_id,
            "user_id": user_id,
            "year": year,
            "initial_capital": float(initial_capital),
            "monthly_contribution": float(monthly_contribution),
            "model_keys": model_keys,
            "status": "running",
            "created_at": _now_iso(),
        }
        run_repo.insert(run_data)

        # Resolve model configs from model_keys
        all_models = load_models_from_db()
        model_configs = []
        for key in model_keys:
            parts = key.split(":", 1)
            if len(parts) != 2:
                continue
            provider, model = parts
            for m in all_models:
                if m["provider"] == provider and m["model"] == model:
                    model_configs.append(m)
                    break

        if not model_configs:
            raise ValueError("No valid models found for the given model_keys")

        if on_progress:
            on_progress({
                "type": "phase_start",
                "phase": "models",
                "total_models": len(model_configs),
            })

        tasks = [
            self._run_single_model(
                run_id=run_id,
                model_config=mc,
                decision_dates=decision_dates,
                prices_by_symbol=prices_by_symbol,
                initial_capital=initial_capital,
                monthly_contribution=monthly_contribution,
                watchlist_symbols=watchlist_symbols,
                user_id=user_id,
                on_progress=on_progress,
            )
            for mc in model_configs
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        model_results = []
        for r in results:
            if isinstance(r, Exception):
                logger.error(f"Model backtest error: {r}")
            elif r:
                model_results.append(r)

        if on_progress:
            on_progress({"type": "status", "message": "Computing benchmarks..."})

        benchmarks = {}
        for bsym in BENCHMARK_SYMBOLS:
            benchmarks[bsym] = self._compute_benchmark(
                bsym, year, initial_capital, monthly_contribution,
                prices_by_symbol.get(bsym, []),
                decision_dates,
            )

        run_repo.update(
            {"benchmarks": benchmarks, "status": "completed"},
            eq={"id": run_id},
        )

        if on_progress:
            on_progress({"type": "status", "message": "Backtest complete!"})

        return {
            "id": run_id,
            "year": year,
            "initial_capital": initial_capital,
            "monthly_contribution": monthly_contribution,
            "model_results": model_results,
            "benchmarks": benchmarks,
            "created_at": run_data["created_at"],
        }

    # ─────────────────────────────────────────
    # Single model loop
    # ─────────────────────────────────────────

    async def _run_single_model(
        self,
        run_id: str,
        model_config: Dict[str, Any],
        decision_dates: List[date],
        prices_by_symbol: Dict[str, List[Dict]],
        initial_capital: float,
        monthly_contribution: float,
        watchlist_symbols: List[str],
        user_id: str,
        on_progress: Optional[Callable] = None,
    ) -> Dict[str, Any]:
        """Run 12 monthly decisions for a single model."""
        provider_name = model_config["provider"]
        model_name = model_config["model"]
        model_key = f"{provider_name}:{model_name}"

        portfolio = Portfolio(initial_capital)
        steps = []
        monthly_values = []
        total_cost = 0.0
        step_repo = SupabaseRepository("llm_backtest_steps")

        for i, dec_date in enumerate(decision_dates):
            month = i + 1

            if on_progress:
                on_progress({
                    "type": "model_progress",
                    "model": model_key,
                    "month": month,
                    "total": 12,
                })

            # Add monthly contribution (except month 1 — that's initial capital)
            if month > 1 and monthly_contribution > 0:
                portfolio.cash += monthly_contribution

            # Build full harness (same format as Arena)
            harness_data = self._build_backtest_harness(
                as_of_date=dec_date,
                watchlist_symbols=watchlist_symbols,
                prices_by_symbol=prices_by_symbol,
                portfolio=portfolio,
                monthly_contribution=monthly_contribution,
            )

            # Call LLM with skill pipeline (same as Arena)
            start_time = time.time()
            try:
                decision, raw_output, cost = await self._call_llm_with_pipeline(
                    model_config=model_config,
                    harness_data=harness_data,
                    prices_by_symbol=prices_by_symbol,
                    as_of_date=dec_date,
                    user_id=user_id,
                    on_progress=on_progress,
                )
                latency_ms = int((time.time() - start_time) * 1000)
            except Exception as e:
                logger.error(f"LLM pipeline failed for {model_key} month {month}: {e}")
                latency_ms = int((time.time() - start_time) * 1000)
                decision = {"action": "HOLD", "allocations": {}, "reasoning": f"LLM error: {e}"}
                raw_output = str(e)
                cost = 0.0

            total_cost += cost

            # Execute decision (next trading day open price)
            action = decision.get("action", "HOLD").upper()
            allocations = decision.get("allocations", {})

            if action in ("BUY", "REBALANCE") and allocations:
                portfolio.execute(allocations, prices_by_symbol, dec_date)

            port_value = portfolio.value(prices_by_symbol, dec_date)
            monthly_values.append(port_value)

            step_data = {
                "month": month,
                "date": dec_date.isoformat(),
                "action": action,
                "allocations": allocations,
                "reasoning": decision.get("reasoning"),
                "portfolio_value": round(port_value, 2),
                "cash": round(portfolio.cash, 2),
                "cost_usd": round(cost, 4),
            }
            steps.append(step_data)

            # Persist step
            step_repo.insert({
                "id": str(uuid4()),
                "run_id": run_id,
                "model_key": model_key,
                "month": month,
                "decision_date": dec_date.isoformat(),
                "action": action,
                "allocations": allocations,
                "reasoning": decision.get("reasoning"),
                "portfolio_value": round(port_value, 2),
                "cash": round(portfolio.cash, 2),
                "positions": portfolio.snapshot()["positions"],
                "cost_usd": round(cost, 4),
                "latency_ms": latency_ms,
                "raw_output": raw_output[:5000] if raw_output else None,
                "created_at": _now_iso(),
            })

        # Final value: use last trading day of year
        year_end = date(decision_dates[0].year, 12, 31)
        final_value = portfolio.value(prices_by_symbol, year_end)

        total_invested = initial_capital + monthly_contribution * 11
        total_return_pct = ((final_value - total_invested) / total_invested * 100) if total_invested > 0 else 0
        max_dd = self._compute_max_drawdown(monthly_values)
        sharpe = self._compute_sharpe(monthly_values)

        if on_progress:
            on_progress({
                "type": "model_complete",
                "model": model_key,
                "final_value": round(final_value, 2),
                "return_pct": round(total_return_pct, 2),
            })

        return {
            "model_key": model_key,
            "final_value": round(final_value, 2),
            "total_return_pct": round(total_return_pct, 2),
            "max_drawdown_pct": round(max_dd, 2),
            "sharpe_ratio": round(sharpe, 2),
            "total_cost_usd": round(total_cost, 4),
            "steps": steps,
        }

    # ─────────────────────────────────────────
    # Harness building (Arena-compatible format)
    # ─────────────────────────────────────────

    def _build_backtest_harness(
        self,
        as_of_date: date,
        watchlist_symbols: List[str],
        prices_by_symbol: Dict[str, List[Dict]],
        portfolio: Portfolio,
        monthly_contribution: float,
    ) -> Dict[str, Any]:
        """Build full harness_data in the same format as Arena's HarnessBuilder.

        Uses only historical data available up to as_of_date.
        No future data leakage.
        """
        # 1. Market snapshot — quotes + technicals + K-line + valuations
        quotes = {}
        valuations = {}
        price_history = {}

        for sym in watchlist_symbols:
            prices = prices_by_symbol.get(sym, [])
            close = _price_on_date(prices, as_of_date)
            if close is None:
                continue

            ma50 = _compute_ma(prices, as_of_date, 50)
            ma200 = _compute_ma(prices, as_of_date, 200)
            rsi = _compute_rsi(prices, as_of_date)

            one_year_ago = as_of_date - timedelta(days=365)
            year_prices = [
                p["close"] for p in prices
                if one_year_ago.isoformat() <= str(p["date"])[:10] <= as_of_date.isoformat()
            ]
            high_52w = max(year_prices) if year_prices else None
            low_52w = min(year_prices) if year_prices else None

            quotes[sym] = {
                "price": close,
                "ma50": ma50,
                "ma200": ma200,
                "rsi": rsi,
                "high_52w": high_52w,
                "low_52w": low_52w,
            }

            # Valuations (price-based; PE/dividend not available in backtest)
            pct_in_52w = None
            if high_52w and low_52w and high_52w > low_52w:
                pct_in_52w = round((close - low_52w) / (high_52w - low_52w) * 100, 1)
            valuations[sym] = {
                "pe_ratio": None,
                "dividend_yield": None,
                "pct_in_52w_range": pct_in_52w,
            }

            # K-line history (20 days)
            price_history[sym] = _fetch_kline_from_prices(prices, as_of_date, days=20)

        # Macro data — not available for historical dates in backtest
        macro = {
            "fed_funds_rate": None,
            "fed_rate_direction": None,
            "cpi_yoy": None,
            "core_pce_yoy": None,
            "gdp_growth_qoq": None,
            "unemployment_rate": None,
            "yield_curve_2y10y": None,
            "vix": None,
            "dxy": None,
            "buffett_indicator": None,
            "market_pe": None,
            "equity_risk_premium": None,
        }

        # Sentiment — not available for historical dates
        sentiment = {"news_key_events": []}

        market_snapshot = {
            "quotes": quotes,
            "valuations": valuations,
            "price_history": price_history,
            "macro": macro,
            "sentiment": sentiment,
            "data_quality_warnings": ["回测模式：宏观经济数据不可用，仅基于价格和技术指标分析"],
        }

        # 2. Account state (Arena-compatible format)
        account_state = self._build_account_state(portfolio, prices_by_symbol, as_of_date)

        # 3. Memory summary (empty in backtest — no historical agent memory)
        memory_summary = {}

        # 4. Task
        budget = portfolio.cash
        task = {
            "type": "monthly_dca",
            "budget": budget,
            "constraints": {
                "max_holdings": 3,
                "watchlist_only": True,
                "max_single_position_pct": 40,
                "risk_tolerance": "moderate",
            },
            "watchlist": watchlist_symbols,
        }

        return {
            "harness_type": "monthly_dca",
            "created_at": as_of_date.isoformat(),
            "market_snapshot": market_snapshot,
            "account_state": account_state,
            "memory_summary": memory_summary,
            "task": task,
        }

    @staticmethod
    def _build_account_state(
        portfolio: Portfolio,
        prices_by_symbol: Dict[str, List[Dict]],
        as_of: date,
    ) -> Dict[str, Any]:
        """Build account state in Arena-compatible format."""
        index_positions = []
        index_market_value = 0.0
        total = portfolio.cash

        for sym, shares in portfolio.positions.items():
            price = _price_on_date(prices_by_symbol.get(sym, []), as_of)
            mv = shares * price if price else 0
            avg_price = portfolio.avg_prices.get(sym, 0)
            pnl = (price - avg_price) * shares if price and avg_price else 0
            total += mv
            index_market_value += mv

            index_positions.append({
                "symbol": sym,
                "quantity": round(shares, 4),
                "avg_price": round(avg_price, 2),
                "market_price": round(price, 2) if price else 0,
                "market_value": round(mv, 2),
                "unrealized_pnl": round(pnl, 2),
            })

        return {
            "cash": round(portfolio.cash, 2),
            "total_value": round(total, 2),
            "index_positions": index_positions,
            "index_market_value": round(index_market_value, 2),
            "non_index_value": 0,
            "available_for_index": round(portfolio.cash, 2),
        }

    # ─────────────────────────────────────────
    # LLM call with skill pipeline
    # ─────────────────────────────────────────

    async def _call_llm_with_pipeline(
        self,
        model_config: Dict[str, Any],
        harness_data: Dict[str, Any],
        prices_by_symbol: Dict[str, List[Dict]],
        as_of_date: date,
        user_id: str,
        on_progress: Optional[Callable] = None,
    ) -> tuple[Dict[str, Any], str, float]:
        """Call LLM using the same 4-skill pipeline as Arena.

        Falls back to single-shot if pipeline fails.
        Returns (parsed_decision, raw_output, cost_usd).
        """
        provider_name = model_config["provider"]
        model_name = model_config["model"]
        agent_key = f"{provider_name}:{model_name}"

        # Get prompts from PromptService (same as Arena)
        prompt_service = get_prompt_service()
        system_prompt_row = await prompt_service.get_current(prompt_type="system")
        system_prompt = system_prompt_row["content"] if system_prompt_row else DEFAULT_SYSTEM_PROMPT
        user_prompt = await prompt_service.render_user_prompt(harness_data)

        # Create skill runner (same as Arena)
        runner = AgentSkillRunner(
            model_config=model_config,
            harness_data=harness_data,
            agent_key=agent_key,
            user_id=user_id,
        )

        # Override: use backtest tool executor (historical data, no web search)
        runner.tool_executor = BacktestToolExecutor(
            harness_data=harness_data,
            prices_by_symbol=prices_by_symbol,
            as_of_date=as_of_date,
            agent_key=agent_key,
            user_id=user_id,
        )
        runner.web_search_enabled = False

        # Run the 4-skill pipeline
        pipeline_result = await runner.run_pipeline(
            system_prompt, user_prompt, on_progress,
        )

        raw_output = pipeline_result.get("output_raw", "")
        pipeline_status = pipeline_result.get("status", "")

        if pipeline_status == "pipeline_failed" or not raw_output.strip():
            logger.warning(f"Pipeline failed for {agent_key}, falling back to single-shot")
            raw_output = await self._single_shot_fallback(
                model_config, system_prompt, user_prompt,
            )

        # Parse structured output (handles Chinese keys from skill pipeline)
        parsed = self._arena._parse_structured_output(raw_output)
        parsed.pop("_parse_status", None)

        # Normalize to backtest execution format
        decision = self._normalize_decision(parsed)

        # Estimate cost (4 skills × input/output)
        input_tokens = len(user_prompt) // 4 * 4
        output_tokens = len(raw_output) // 4 * 4
        cost = self._arena._estimate_cost(provider_name, model_name, input_tokens, output_tokens)

        # Annotate raw_output with pipeline summary
        pipeline_steps = pipeline_result.get("pipeline_steps", [])
        if pipeline_steps:
            summary = [f"=== Pipeline ({pipeline_status}) ==="]
            for step in pipeline_steps:
                skill = step.get("skill", "unknown")
                latency = step.get("latency_ms", 0)
                error = step.get("error")
                summary.append(f"[{skill}] {latency}ms" + (f" ERROR: {error}" if error else ""))
            summary.append(f"\n=== Final Output ===\n{raw_output}")
            raw_output = "\n".join(summary)

        return decision, raw_output, cost

    async def _single_shot_fallback(
        self,
        model_config: Dict[str, Any],
        system_prompt: str,
        user_prompt: str,
    ) -> str:
        """Single-shot LLM call as fallback when pipeline fails."""
        model_name = model_config["model"]

        adapter = await LLMAdapterFactory.create_unified(
            model=model_name,
            config=LLMConfig(temperature=0, max_tokens=4096),
        )

        messages = [
            LLMMessage(role="system", content=system_prompt),
            LLMMessage(role="user", content=user_prompt),
        ]

        async def _collect():
            text = ""
            async for chunk in adapter.chat(messages, stream=False):
                text += chunk
            return text

        return await asyncio.wait_for(_collect(), timeout=MODEL_TIMEOUT)

    @staticmethod
    def _normalize_decision(parsed: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize parsed LLM output to backtest execution format.

        Handles both Chinese (pipeline) and English (fallback) output formats.
        """
        # Action mapping
        raw_action = parsed.get("action") or parsed.get("操作") or "HOLD"
        action = ACTION_MAP.get(raw_action, raw_action.upper())

        # Allocations: normalize from array or dict
        raw_alloc = parsed.get("allocations") or parsed.get("分配") or {}
        allocations = {}

        if isinstance(raw_alloc, list):
            # Chinese format: [{"标的": "VOO", "比例": 60}, ...]
            # After _parse_structured_output: [{"etf": "VOO", "percentage": 40}, ...]
            for item in raw_alloc:
                if not isinstance(item, dict):
                    continue
                symbol = item.get("标的") or item.get("etf") or item.get("symbol") or ""
                pct = item.get("比例") or item.get("percentage") or item.get("pct") or 0
                if symbol and pct:
                    try:
                        allocations[symbol.upper()] = float(pct)
                    except (ValueError, TypeError):
                        pass
        elif isinstance(raw_alloc, dict):
            # English format: {"VOO": 60, "QQQ": 30}
            for k, v in raw_alloc.items():
                try:
                    allocations[k.upper()] = float(v)
                except (ValueError, TypeError):
                    pass

        reasoning = parsed.get("reasoning") or parsed.get("决策理由") or ""
        confidence = parsed.get("confidence") or parsed.get("信心度") or 0

        return {
            "action": action,
            "allocations": allocations,
            "reasoning": reasoning,
            "confidence": confidence,
        }

    # ─────────────────────────────────────────
    # Benchmark
    # ─────────────────────────────────────────

    @staticmethod
    def _compute_benchmark(
        symbol: str,
        year: int,
        initial_capital: float,
        monthly_contribution: float,
        prices: List[Dict],
        decision_dates: List[date],
    ) -> Dict[str, Any]:
        """Compute DCA benchmark: buy at each decision date with same capital schedule."""
        if not prices:
            return {"final_value": 0, "return_pct": 0}

        total_shares = 0.0
        total_invested = 0.0

        for i, dec_date in enumerate(decision_dates):
            amount = initial_capital if i == 0 else monthly_contribution
            if amount <= 0 and i > 0:
                continue

            price = _price_after_date(prices, dec_date - timedelta(days=1), "open")
            if price is None:
                price = _price_on_date(prices, dec_date)
            if price and price > 0:
                total_shares += amount / price
                total_invested += amount

        year_end = date(year, 12, 31)
        final_price = _price_on_date(prices, year_end)
        final_value = total_shares * final_price if final_price else 0

        return_pct = ((final_value - total_invested) / total_invested * 100) if total_invested > 0 else 0

        return {
            "final_value": round(final_value, 2),
            "return_pct": round(return_pct, 2),
            "total_invested": round(total_invested, 2),
        }

    # ─────────────────────────────────────────
    # Metrics
    # ─────────────────────────────────────────

    @staticmethod
    def _compute_max_drawdown(monthly_values: List[float]) -> float:
        if not monthly_values:
            return 0.0
        peak = monthly_values[0]
        max_dd = 0.0
        for v in monthly_values:
            if v > peak:
                peak = v
            if peak > 0:
                dd = (peak - v) / peak * 100
                max_dd = max(max_dd, dd)
        return max_dd

    @staticmethod
    def _compute_sharpe(monthly_values: List[float], risk_free_annual: float = 0.04) -> float:
        if len(monthly_values) < 2:
            return 0.0
        monthly_returns = [
            (monthly_values[i] - monthly_values[i - 1]) / monthly_values[i - 1]
            for i in range(1, len(monthly_values))
            if monthly_values[i - 1] > 0
        ]
        if not monthly_returns or len(monthly_returns) < 2:
            return 0.0
        avg = statistics.mean(monthly_returns)
        std = statistics.stdev(monthly_returns)
        if std == 0:
            return 0.0
        rf_monthly = risk_free_annual / 12
        return round((avg - rf_monthly) / std * (12 ** 0.5), 2)

    # ─────────────────────────────────────────
    # Query methods (history)
    # ─────────────────────────────────────────

    @staticmethod
    def get_runs(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        repo = SupabaseRepository("llm_backtest_runs")
        # Single-user mode: don't filter by user_id for now
        return repo.select_data(
            order="created_at.desc",
            limit=limit,
        )

    @staticmethod
    def get_run_detail(run_id: str) -> Optional[Dict[str, Any]]:
        run_repo = SupabaseRepository("llm_backtest_runs")
        run = run_repo.select_one(eq={"id": run_id})
        if not run:
            return None

        step_repo = SupabaseRepository("llm_backtest_steps")
        steps = step_repo.select_data(
            eq={"run_id": run_id},
            order="model_key.asc,month.asc",
        )

        # Group steps by model_key
        model_steps: Dict[str, List] = {}
        for s in steps:
            key = s["model_key"]
            if key not in model_steps:
                model_steps[key] = []
            model_steps[key].append({
                "month": s["month"],
                "date": str(s["decision_date"]),
                "action": s["action"],
                "allocations": s.get("allocations"),
                "reasoning": s.get("reasoning"),
                "portfolio_value": s.get("portfolio_value"),
                "cash": s.get("cash"),
                "cost_usd": s.get("cost_usd", 0),
            })

        model_results = []
        for key, step_list in model_steps.items():
            monthly_values = [s["portfolio_value"] for s in step_list if s.get("portfolio_value")]
            final_value = monthly_values[-1] if monthly_values else 0
            total_invested = run["initial_capital"] + run.get("monthly_contribution", 0) * 11
            total_return_pct = ((final_value - total_invested) / total_invested * 100) if total_invested > 0 else 0
            total_cost = sum(s.get("cost_usd", 0) for s in step_list)

            model_results.append({
                "model_key": key,
                "final_value": round(final_value, 2),
                "total_return_pct": round(total_return_pct, 2),
                "max_drawdown_pct": round(LLMBacktestService._compute_max_drawdown(monthly_values), 2),
                "sharpe_ratio": round(LLMBacktestService._compute_sharpe(monthly_values), 2),
                "total_cost_usd": round(total_cost, 4),
                "steps": step_list,
            })

        return {
            "id": run["id"],
            "year": run["year"],
            "initial_capital": run["initial_capital"],
            "monthly_contribution": run.get("monthly_contribution", 0),
            "model_results": model_results,
            "benchmarks": run.get("benchmarks", {}),
            "status": run.get("status"),
            "created_at": str(run.get("created_at", "")),
        }


# Singleton
_service: Optional[LLMBacktestService] = None


def get_llm_backtest_service() -> LLMBacktestService:
    global _service
    if _service is None:
        _service = LLMBacktestService()
    return _service
