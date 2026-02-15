"""Decision Harness 构建器"""

import logging
from typing import Optional, Dict, Any, List

from sqlalchemy.ext.asyncio import AsyncSession

from uteki.domains.index.models.decision_harness import DecisionHarness
from uteki.domains.index.services.data_service import DataService
from uteki.domains.index.services.memory_service import MemoryService
from uteki.domains.index.services.prompt_service import PromptService

logger = logging.getLogger(__name__)


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
        session: AsyncSession,
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
        watchlist = await self.data_service.get_watchlist(session)
        watchlist_symbols = [item["symbol"] for item in watchlist]

        quotes = {}
        for item in watchlist:
            symbol = item["symbol"]
            quote = await self.data_service.get_quote(symbol, session)
            indicators = await self.data_service.get_indicators(symbol, session)
            quotes[symbol] = {
                **quote,
                "ma50": indicators.get("ma50"),
                "ma200": indicators.get("ma200"),
                "rsi": indicators.get("rsi"),
            }

        # 估值数据（数据源待接入，先预留 null）
        valuations = {}
        for symbol in watchlist_symbols:
            q = quotes.get(symbol, {})
            pe = q.get("pe_ratio")
            valuations[symbol] = {
                "pe_ratio": pe,
                "pe_percentile_5y": None,  # TODO: data source
                "shiller_cape": None,      # TODO: data source (大盘指数)
                "dividend_yield": None,    # TODO: data source
                "earnings_yield": round(1.0 / pe, 4) if pe and pe > 0 else None,
                "equity_risk_premium": None,  # TODO: earnings_yield - 10Y treasury yield
            }

        # 宏观经济数据（数据源待接入，先预留 null）
        macro = {
            "fed_funds_rate": None,
            "fed_rate_direction": None,
            "cpi_yoy": None,
            "core_pce_yoy": None,
            "gdp_growth_qoq": None,
            "unemployment_rate": None,
            "ism_manufacturing_pmi": None,
            "ism_services_pmi": None,
            "yield_curve_2y10y": None,
            "vix": None,
            "dxy": None,
        }

        # 情绪数据（数据源待接入，先预留 null）
        sentiment = {
            "fear_greed_index": None,
            "aaii_bull_ratio": None,
            "aaii_bear_ratio": None,
            "put_call_ratio": None,
            "news_sentiment_score": None,
            "news_key_events": [],
        }

        market_snapshot = {
            "quotes": quotes,
            "valuations": valuations,
            "macro": macro,
            "sentiment": sentiment,
        }

        # 2. 账户状态 (从 SNB 获取，如果不可用则用空状态)
        account_state = await self._get_account_state()

        # 3. 记忆摘要
        memory_summary = await self.memory_service.get_summary(user_id, session)

        # 4. 当前 prompt 版本
        prompt_version = await self.prompt_service.get_current(session)
        prompt_version_id = prompt_version["id"] if prompt_version else None

        if not prompt_version_id:
            raise ValueError("No prompt version available")

        # 5. 组装任务定义
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

        # 6. 持久化
        harness = DecisionHarness(
            harness_type=harness_type,
            prompt_version_id=prompt_version_id,
            market_snapshot=market_snapshot,
            account_state=account_state,
            memory_summary=memory_summary,
            task=task,
            tool_definitions=tool_definitions,
        )
        session.add(harness)
        await session.commit()
        await session.refresh(harness)

        logger.info(f"Harness built: {harness.id} type={harness_type}")
        return harness.to_dict()

    async def build_preview_data(
        self,
        session: AsyncSession,
        user_id: str = "default",
        budget: Optional[float] = None,
        constraints: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """构建预览数据（不写 DB），用于 user prompt 模板预览"""
        import json
        from datetime import datetime

        watchlist = await self.data_service.get_watchlist(session)
        watchlist_symbols = [item["symbol"] for item in watchlist]

        quotes = {}
        for item in watchlist:
            symbol = item["symbol"]
            quote = await self.data_service.get_quote(symbol, session)
            indicators = await self.data_service.get_indicators(symbol, session)
            quotes[symbol] = {
                **quote,
                "ma50": indicators.get("ma50"),
                "ma200": indicators.get("ma200"),
                "rsi": indicators.get("rsi"),
            }

        valuations = {}
        for symbol in watchlist_symbols:
            q = quotes.get(symbol, {})
            pe = q.get("pe_ratio")
            valuations[symbol] = {
                "pe_ratio": pe,
                "pe_percentile_5y": None,
                "shiller_cape": None,
                "dividend_yield": None,
                "earnings_yield": round(1.0 / pe, 4) if pe and pe > 0 else None,
                "equity_risk_premium": None,
            }

        macro = {
            "fed_funds_rate": None, "fed_rate_direction": None,
            "cpi_yoy": None, "core_pce_yoy": None,
            "gdp_growth_qoq": None, "unemployment_rate": None,
            "ism_manufacturing_pmi": None, "ism_services_pmi": None,
            "yield_curve_2y10y": None, "vix": None, "dxy": None,
        }
        sentiment = {
            "fear_greed_index": None, "aaii_bull_ratio": None,
            "aaii_bear_ratio": None, "put_call_ratio": None,
            "news_sentiment_score": None, "news_key_events": [],
        }

        account_state = await self._get_account_state()
        memory_summary = await self.memory_service.get_summary(user_id, session)

        default_constraints = {
            "max_holdings": 3,
            "watchlist_only": True,
            "max_single_position_pct": 40,
            "risk_tolerance": "moderate",
        }
        merged_constraints = {**default_constraints, **(constraints or {})}

        cash = account_state.get("cash", 0)
        total = account_state.get("total", 0) or cash
        available_cash = cash
        effective_budget = budget or available_cash

        task = {
            "type": "monthly_dca",
            "budget": effective_budget,
            "constraints": merged_constraints,
            "watchlist": watchlist_symbols,
        }

        return {
            "harness_type": "monthly_dca",
            "created_at": datetime.now().isoformat(),
            "market_snapshot": {
                "quotes": quotes,
                "valuations": valuations,
                "macro": macro,
                "sentiment": sentiment,
            },
            "account_state": account_state,
            "memory_summary": memory_summary,
            "task": task,
        }

    async def _get_account_state(self) -> Dict[str, Any]:
        """从 SNB 获取账户状态"""
        try:
            from uteki.domains.snb.api import _require_client
            client = _require_client()
            balance = await client.get_balance()
            positions = await client.get_positions()
            return {
                "cash": balance.get("data", {}).get("cash", 0) if balance.get("success") else 0,
                "positions": positions.get("data", []) if positions.get("success") else [],
                "total": balance.get("data", {}).get("total_value", 0) if balance.get("success") else 0,
            }
        except Exception as e:
            logger.warning(f"Failed to get SNB account state: {e}")
            return {"cash": 0, "positions": [], "total": 0, "error": str(e)}
