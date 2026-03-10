"""Decision Harness 构建器 — Supabase REST API 版"""

import asyncio
import logging
from datetime import datetime, date, timezone, timedelta
from typing import Optional, Dict, Any, List
from uuid import uuid4

from uteki.common.database import SupabaseRepository, db_manager
from uteki.domains.index.services.data_service import DataService
from uteki.domains.index.services.memory_service import MemoryService
from uteki.domains.index.services.prompt_service import PromptService

logger = logging.getLogger(__name__)

HARNESS_TABLE = "decision_harness"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_id(data: dict) -> dict:
    """Ensure dict has id + timestamps for a new row."""
    if "id" not in data:
        data["id"] = str(uuid4())
    data.setdefault("created_at", _now_iso())
    data.setdefault("updated_at", _now_iso())
    return data


async def _backup_harness(rows: list):
    """Best-effort SQLite backup (failure only warns)."""
    try:
        from uteki.domains.index.models.decision_harness import DecisionHarness
        async with db_manager.get_postgres_session() as session:
            for row in rows:
                safe = {k: v for k, v in row.items() if hasattr(DecisionHarness, k)}
                await session.merge(DecisionHarness(**safe))
    except Exception as e:
        logger.warning(f"SQLite backup failed for {HARNESS_TABLE}: {e}")


class HarnessBuilder:
    """构建不可变的 Decision Harness"""

    def __init__(
        self,
        data_service: DataService,
        memory_service: MemoryService,
        prompt_service: PromptService,
    ):
        self.data_service = data_service
        self.memory_service = memory_service
        self.prompt_service = prompt_service

    async def build(
        self,
        harness_type: str,
        user_id: str = "default",
        budget: Optional[float] = None,
        constraints: Optional[Dict[str, Any]] = None,
        tool_definitions: Optional[List[Dict]] = None,
    ) -> Dict[str, Any]:
        """构建 Harness 并持久化

        步骤:
        1. 获取市场数据快照（观察池所有标的）
        2. 获取账户状态（SNB 余额 + 持仓）
        3. 获取记忆摘要
        4. 获取当前 prompt 版本
        5. 组装并写入 DB
        """
        # 1. 市场数据快照（行情 + 技术指标 + 估值 + 宏观 + 情绪）
        watchlist = self.data_service.get_watchlist()
        watchlist_symbols = [item["symbol"] for item in watchlist]

        quotes = {}
        for item in watchlist:
            symbol = item["symbol"]
            quote = await self.data_service.get_quote(symbol)
            indicators = self.data_service.get_indicators(symbol)
            quotes[symbol] = {
                **quote,
                "ma50": indicators.get("ma50"),
                "ma200": indicators.get("ma200"),
                "rsi": indicators.get("rsi"),
            }

        # K 线走势（近 20 天日线）
        price_history = self._fetch_price_history(watchlist_symbols, days=20)

        # ETF 估值数据（FMP: dividend yield + 52w range from quotes）
        etf_vals = await self._fetch_etf_valuations(watchlist_symbols, quotes)

        # 市场级估值（Dashboard: PE, ERP）
        market_pe = None
        market_erp = None
        try:
            from uteki.domains.macro.services.market_dashboard_service import get_market_dashboard_service
            dashboard = get_market_dashboard_service()
            _pe_res, _erp_res = await asyncio.gather(
                dashboard._get_market_pe(),
                dashboard._get_equity_risk_premium(),
                return_exceptions=True,
            )
            if not isinstance(_pe_res, Exception) and _pe_res:
                market_pe = round(_pe_res, 1)
            if not isinstance(_erp_res, Exception) and isinstance(_erp_res, dict):
                market_erp = _erp_res.get("value")
        except Exception as e:
            logger.warning(f"Failed to fetch market valuation data: {e}")

        valuations = {}
        for symbol in watchlist_symbols:
            q = quotes.get(symbol, {})
            ev = etf_vals.get(symbol, {})
            pe = q.get("pe_ratio")
            div_yield = ev.get("dividend_yield")
            valuations[symbol] = {
                "pe_ratio": pe,
                "dividend_yield": div_yield,
                "pct_in_52w_range": ev.get("pct_in_52w_range"),
            }

        # 宏观经济 + 情绪数据（从 FRED / FMP 实时获取）
        macro, sentiment = await self._fetch_macro_data()
        # Add market-level valuation to macro (not per-ETF)
        if market_pe:
            macro["market_pe"] = market_pe
        if market_erp is not None:
            macro["equity_risk_premium"] = market_erp

        market_snapshot = {
            "quotes": quotes,
            "valuations": valuations,
            "price_history": price_history,
            "macro": macro,
            "sentiment": sentiment,
        }

        # 数据新鲜度检查
        data_warnings = await self._check_data_freshness(watchlist_symbols)
        if data_warnings:
            market_snapshot["data_quality_warnings"] = data_warnings

        # 2. 账户状态 (从 SNB 获取，按 watchlist 过滤)
        account_state = await self._get_index_account_info(watchlist_symbols)

        # 3. 如果 budget 未指定，从 agent_config 读取 monthly_dca_budget
        if budget is None:
            agent_config = await self._get_agent_config(user_id)
            budget = agent_config.get("monthly_dca_budget")

        # 4. 记忆摘要
        memory_summary = await self.memory_service.get_summary(user_id)

        # 5. 当前 prompt 版本
        prompt_version = await self.prompt_service.get_current()
        prompt_version_id = prompt_version["id"] if prompt_version else None

        if not prompt_version_id:
            raise ValueError("No prompt version available")

        # 6. 组装任务定义
        default_constraints = {
            "max_holdings": 3,
            "watchlist_only": True,
            "max_single_position_pct": 40,
            "risk_tolerance": "moderate",
        }
        merged_constraints = {**default_constraints, **(constraints or {})}
        task = {
            "type": harness_type,
            "budget": budget,
            "constraints": merged_constraints,
            "watchlist": watchlist_symbols,
        }

        # 7. 持久化
        harness_data = _ensure_id({
            "harness_type": harness_type,
            "prompt_version_id": prompt_version_id,
            "market_snapshot": market_snapshot,
            "account_state": account_state,
            "memory_summary": memory_summary,
            "task": task,
            "tool_definitions": tool_definitions,
        })
        repo = SupabaseRepository(HARNESS_TABLE)
        result = repo.upsert(harness_data)
        row = result.data[0] if result.data else harness_data
        await _backup_harness([row])

        logger.info(f"Harness built: {row.get('id')} type={harness_type}")
        return row

    async def build_preview_data(
        self,
        user_id: str = "default",
        budget: Optional[float] = None,
        constraints: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """构建预览数据（不写 DB），用于 user prompt 模板预览"""
        import json
        from datetime import datetime

        watchlist = self.data_service.get_watchlist()
        watchlist_symbols = [item["symbol"] for item in watchlist]

        quotes = {}
        for item in watchlist:
            symbol = item["symbol"]
            quote = await self.data_service.get_quote(symbol)
            indicators = self.data_service.get_indicators(symbol)
            quotes[symbol] = {
                **quote,
                "ma50": indicators.get("ma50"),
                "ma200": indicators.get("ma200"),
                "rsi": indicators.get("rsi"),
            }

        # K 线走势 + ETF 估值 (same as build())
        price_history = self._fetch_price_history(watchlist_symbols, days=20)
        etf_vals = await self._fetch_etf_valuations(watchlist_symbols, quotes)

        # 市场级估值（Dashboard: PE, ERP）
        market_pe = None
        market_erp = None
        try:
            from uteki.domains.macro.services.market_dashboard_service import get_market_dashboard_service
            dashboard = get_market_dashboard_service()
            _pe_res, _erp_res = await asyncio.gather(
                dashboard._get_market_pe(),
                dashboard._get_equity_risk_premium(),
                return_exceptions=True,
            )
            if not isinstance(_pe_res, Exception) and _pe_res:
                market_pe = round(_pe_res, 1)
            if not isinstance(_erp_res, Exception) and isinstance(_erp_res, dict):
                market_erp = _erp_res.get("value")
        except Exception:
            pass

        valuations = {}
        for symbol in watchlist_symbols:
            q = quotes.get(symbol, {})
            ev = etf_vals.get(symbol, {})
            pe = q.get("pe_ratio")
            div_yield = ev.get("dividend_yield")
            valuations[symbol] = {
                "pe_ratio": pe,
                "dividend_yield": div_yield,
                "pct_in_52w_range": ev.get("pct_in_52w_range"),
            }

        macro, sentiment = await self._fetch_macro_data()
        # Add market-level valuation to macro (not per-ETF)
        if market_pe:
            macro["market_pe"] = market_pe
        if market_erp is not None:
            macro["equity_risk_premium"] = market_erp

        account_state = await self._get_index_account_info(watchlist_symbols)
        memory_summary = await self.memory_service.get_summary(user_id)

        # 如果 budget 未指定，从 agent_config 读取
        if budget is None:
            agent_config = await self._get_agent_config(user_id)
            budget = agent_config.get("monthly_dca_budget")

        default_constraints = {
            "max_holdings": 3,
            "watchlist_only": True,
            "max_single_position_pct": 40,
            "risk_tolerance": "moderate",
        }
        merged_constraints = {**default_constraints, **(constraints or {})}

        cash = account_state.get("cash", 0)
        available_cash = account_state.get("available_for_index", cash)
        effective_budget = budget or available_cash

        task = {
            "type": "monthly_dca",
            "budget": effective_budget,
            "constraints": merged_constraints,
            "watchlist": watchlist_symbols,
        }

        # 数据新鲜度检查
        data_warnings = await self._check_data_freshness(watchlist_symbols)

        snapshot = {
            "quotes": quotes,
            "valuations": valuations,
            "price_history": price_history,
            "macro": macro,
            "sentiment": sentiment,
        }
        if data_warnings:
            snapshot["data_quality_warnings"] = data_warnings

        return {
            "harness_type": "monthly_dca",
            "created_at": datetime.now().isoformat(),
            "market_snapshot": snapshot,
            "account_state": account_state,
            "memory_summary": memory_summary,
            "task": task,
        }

    async def _fetch_macro_data(self) -> tuple[Dict[str, Any], Dict[str, Any]]:
        """从 FRED / FMP 获取宏观经济数据和情绪/事件数据。

        返回 (macro_dict, sentiment_dict)，任何外部调用失败均 fallback 为 None，不阻断流程。
        """
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
        }
        sentiment = {
            "fear_greed_index": None,
            "aaii_bull_ratio": None,
            "aaii_bear_ratio": None,
            "put_call_ratio": None,
            "news_sentiment_score": None,
            "news_key_events": [],
        }

        # ── FRED macro indicators ──
        try:
            from uteki.domains.macro.services.market_dashboard_service import get_market_dashboard_service
            dashboard = get_market_dashboard_service()

            # Batch fetch: existing 4 + new series (CPI, PCE, GDP, unemployment, fed rate history)
            (
                fed_rate, vix, yield_curve, dxy,
                cpi_res, pce_res, gdp_res, unrate_res,
                fed_hist, buffett_res,
            ) = await asyncio.gather(
                dashboard._get_fed_funds_rate(),
                dashboard._get_vix(),
                dashboard._get_yield_curve(),
                dashboard._get_dxy(),
                dashboard._fetch_fred("CPIAUCSL", limit=14),    # CPI index, 14 months for YoY
                dashboard._fetch_fred("PCEPILFE", limit=14),    # Core PCE index, 14 months for YoY
                dashboard._fetch_fred("A191RL1Q225SBEA", limit=2),  # Real GDP growth (annualized %)
                dashboard._fetch_fred("UNRATE", limit=2),       # Unemployment rate
                dashboard._fetch_fred("FEDFUNDS", limit=4),     # Fed rate history for direction
                dashboard._get_buffett_indicator(),              # Buffett Indicator (S&P500/GDP)
                return_exceptions=True,
            )

            if not isinstance(fed_rate, Exception) and fed_rate.get("value") is not None:
                macro["fed_funds_rate"] = fed_rate["value"]
            if not isinstance(vix, Exception) and vix.get("value") is not None:
                macro["vix"] = vix["value"]
            if not isinstance(yield_curve, Exception) and yield_curve.get("value") is not None:
                macro["yield_curve_2y10y"] = yield_curve["value"]
            if not isinstance(dxy, Exception) and dxy.get("value") is not None:
                macro["dxy"] = dxy["value"]

            # CPI YoY: (latest / 12-months-ago - 1) * 100
            if not isinstance(cpi_res, Exception):
                cpi_data = cpi_res.get("data", [])
                if len(cpi_data) >= 13:
                    latest = cpi_data[-1]["value"]
                    year_ago = cpi_data[-13]["value"]
                    if year_ago and year_ago > 0:
                        macro["cpi_yoy"] = round((latest / year_ago - 1) * 100, 2)

            # Core PCE YoY: same calculation
            if not isinstance(pce_res, Exception):
                pce_data = pce_res.get("data", [])
                if len(pce_data) >= 13:
                    latest = pce_data[-1]["value"]
                    year_ago = pce_data[-13]["value"]
                    if year_ago and year_ago > 0:
                        macro["core_pce_yoy"] = round((latest / year_ago - 1) * 100, 2)

            # GDP Growth QoQ (already annualized rate from FRED)
            if not isinstance(gdp_res, Exception):
                gdp_data = gdp_res.get("data", [])
                if gdp_data:
                    macro["gdp_growth_qoq"] = gdp_data[-1]["value"]

            # Unemployment Rate
            if not isinstance(unrate_res, Exception):
                unrate_data = unrate_res.get("data", [])
                if unrate_data:
                    macro["unemployment_rate"] = unrate_data[-1]["value"]

            # Fed Rate Direction: compare latest vs 3 months ago
            if not isinstance(fed_hist, Exception):
                fh_data = fed_hist.get("data", [])
                if len(fh_data) >= 3:
                    latest_rate = fh_data[-1]["value"]
                    prev_rate = fh_data[-3]["value"]
                    diff = latest_rate - prev_rate
                    if diff < -0.1:
                        macro["fed_rate_direction"] = "降息"
                    elif diff > 0.1:
                        macro["fed_rate_direction"] = "加息"
                    else:
                        macro["fed_rate_direction"] = "持平"

            # Buffett Indicator (S&P 500 market cap / GDP)
            if not isinstance(buffett_res, Exception) and isinstance(buffett_res, dict):
                bi_val = buffett_res.get("value")
                if bi_val is not None:
                    signal = buffett_res.get("signal", "")
                    macro["buffett_indicator"] = f"{bi_val}% ({signal})"

            # Note: ISM PMI is proprietary (not on FRED); available via FMP calendar events
        except Exception as e:
            logger.warning(f"Failed to fetch FRED macro data: {e}")

        # ── FMP Calendar events → sentiment.news_key_events ──
        try:
            from uteki.domains.macro.services.fmp_calendar_service import get_fmp_calendar_service
            fmp_svc = get_fmp_calendar_service()
            now = datetime.now(timezone.utc)
            events_result = await fmp_svc.get_monthly_events_enriched(now.year, now.month)
            if events_result.get("success"):
                recent_events = []
                for _date_key, evts in events_result.get("data", {}).items():
                    for evt in evts:
                        if evt.get("importance") in ("high", "critical"):
                            recent_events.append({
                                "title": evt.get("title"),
                                "date": evt.get("start_date", "")[:10],
                                "actual": evt.get("actual_value"),
                                "expected": evt.get("expected_value"),
                                "previous": evt.get("previous_value"),
                            })
                # 按日期排序，取最近 10 条
                recent_events.sort(key=lambda x: x.get("date", ""), reverse=True)
                sentiment["news_key_events"] = recent_events[:10]
        except Exception as e:
            logger.warning(f"Failed to fetch FMP calendar events: {e}")

        return macro, sentiment

    async def _get_index_account_info(self, watchlist_symbols: List[str]) -> Dict[str, Any]:
        """从 SNB 获取账户状态，按 watchlist 过滤持仓，返回 index 专属视图"""
        empty = {
            "cash": 0,
            "total_value": 0,
            "index_positions": [],
            "index_market_value": 0,
            "non_index_value": 0,
            "available_for_index": 0,
        }
        try:
            from uteki.domains.snb.api import _require_client
            client = await _require_client()
            balance_res, positions_res = await asyncio.gather(
                client.get_balance(),
                client.get_positions(),
            )

            # --- Balance ---
            if not balance_res.get("success"):
                logger.warning(f"SNB get_balance failed: {balance_res.get('error')}")
                return {**empty, "error": balance_res.get("error", "balance failed")}

            bal = balance_res["data"]
            total_value = bal.get("total_value", 0) or bal.get("net_liquidation_value", 0) or 0
            # SNB 没有直接的 cash 字段；cash = 总资产 - 持仓市值
            positions_market_value = bal.get("market_value", 0) or bal.get("securities_gross_position_value", 0) or 0
            cash = total_value - positions_market_value

            # --- Positions ---
            all_positions = positions_res.get("data", []) if positions_res.get("success") else []
            watchlist_set = {s.upper() for s in watchlist_symbols}

            index_positions = []
            index_market_value = 0.0
            non_index_value = 0.0

            for pos in all_positions:
                symbol = (pos.get("symbol") or "").upper()
                mv = pos.get("market_value", 0) or 0
                if symbol in watchlist_set:
                    index_positions.append({
                        "symbol": symbol,
                        "quantity": pos.get("quantity", 0),
                        "avg_price": round(pos.get("average_price", 0), 2),
                        "market_price": round(pos.get("market_price", 0), 2),
                        "market_value": round(mv, 2),
                        "unrealized_pnl": round(pos.get("unrealized_pnl", 0), 2),
                    })
                    index_market_value += mv
                else:
                    non_index_value += mv

            return {
                "cash": round(cash, 2),
                "total_value": round(total_value, 2),
                "index_positions": index_positions,
                "index_market_value": round(index_market_value, 2),
                "non_index_value": round(non_index_value, 2),
                "available_for_index": round(cash, 2),
            }
        except Exception as e:
            logger.warning(f"Failed to get SNB account state: {e}")
            return {**empty, "error": str(e)}

    async def _get_agent_config(self, user_id: str) -> Dict[str, Any]:
        """从 agent_memory 读取 agent_config (category=agent_config, agent_key=system)"""
        try:
            memories = await self.memory_service.read(
                user_id, category="agent_config", limit=1, agent_key="system",
            )
            if memories:
                import json
                return json.loads(memories[0].get("content", "{}"))
        except Exception as e:
            logger.warning(f"Failed to read agent config: {e}")
        return {}

    def _fetch_price_history(self, symbols: List[str], days: int = 20) -> Dict[str, list]:
        """获取每只 ETF 近 N 天的日线 OHLCV 数据"""
        end = date.today().isoformat()
        start = (date.today() - timedelta(days=days + 10)).isoformat()  # 多取几天防周末缺数据
        result = {}
        for symbol in symbols:
            try:
                rows = self.data_service.get_history(symbol, start=start, end=end)
                # 取最近 N 条
                recent = rows[-days:] if len(rows) > days else rows
                result[symbol] = [
                    {
                        "date": r.get("date", "")[:10] if isinstance(r.get("date"), str) else str(r.get("date", ""))[:10],
                        "open": round(r.get("open", 0), 2),
                        "high": round(r.get("high", 0), 2),
                        "low": round(r.get("low", 0), 2),
                        "close": round(r.get("close", 0), 2),
                        "volume": r.get("volume", 0),
                    }
                    for r in recent
                ]
            except Exception as e:
                logger.warning(f"Failed to fetch price history for {symbol}: {e}")
                result[symbol] = []
        return result

    async def _fetch_etf_valuations(
        self, watchlist_symbols: List[str], quotes: Dict[str, dict],
    ) -> Dict[str, dict]:
        """从 FMP 获取 ETF 估值数据（替代 yfinance）

        - dividend_yield: FMP /stable/ratios-ttm → dividendYieldTTM
        - pct_in_52w_range: 从 quotes dict 的 high_52w / low_52w 计算
        """
        # Batch fetch dividend yields concurrently
        div_tasks = {
            symbol: self._fetch_dividend_yield(symbol)
            for symbol in watchlist_symbols
        }
        div_results = await asyncio.gather(
            *div_tasks.values(), return_exceptions=True,
        )
        div_map = {}
        for symbol, result in zip(div_tasks.keys(), div_results):
            if isinstance(result, Exception):
                logger.warning(f"Dividend yield fetch failed for {symbol}: {result}")
                div_map[symbol] = None
            else:
                div_map[symbol] = result

        results = {}
        for symbol in watchlist_symbols:
            q = quotes.get(symbol, {})
            price = q.get("price", 0)
            high52 = q.get("high_52w")
            low52 = q.get("low_52w")
            pct_in_52w = None
            if high52 and low52 and high52 > low52 and price:
                pct_in_52w = round((price - low52) / (high52 - low52) * 100, 1)
            results[symbol] = {
                "dividend_yield": div_map.get(symbol),
                "pct_in_52w_range": pct_in_52w,
            }
        return results

    async def _fetch_dividend_yield(self, symbol: str) -> Optional[float]:
        """从 FMP /stable/ratios-ttm 获取 dividendYieldTTM，转为百分比"""
        import httpx
        from uteki.common.config import settings
        if not settings.fmp_api_key:
            return None
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    "https://financialmodelingprep.com/stable/ratios-ttm",
                    params={"symbol": symbol, "apikey": settings.fmp_api_key},
                )
            if resp.status_code != 200:
                return None
            data = resp.json()
            if not data:
                return None
            row = data[0] if isinstance(data, list) else data
            dy = row.get("dividendYieldTTM")
            if dy and dy > 0:
                return round(dy * 100, 2)  # 转为百分比
            return None
        except Exception as e:
            logger.warning(f"FMP ratios-ttm error for {symbol}: {e}")
            return None

    async def _check_data_freshness(self, symbols: List[str]) -> List[str]:
        """检查 watchlist 标的的数据新鲜度，返回警告列表（不阻断流程）"""
        warnings = []
        try:
            from uteki.domains.data.validation.quality_checker import QualityChecker
            checker = QualityChecker()
            report = await checker.freshness_report()
            watchlist_set = {s.upper() for s in symbols}
            for entry in report:
                sym = entry.get("symbol", "").upper()
                if sym not in watchlist_set:
                    continue
                status = entry.get("status", "ok")
                days = entry.get("days_behind", 0)
                if status in ("stale", "warning", "error"):
                    warnings.append(f"{sym} 数据延迟 {days} 个交易日")
                elif status == "no_data":
                    warnings.append(f"{sym} 无历史数据")
        except Exception as e:
            logger.warning(f"Data freshness check failed: {e}")
        return warnings
