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
        # 1. 市场数据快照
        market_snapshot = {}
        watchlist = await self.data_service.get_watchlist(session)
        for item in watchlist:
            symbol = item["symbol"]
            quote = await self.data_service.get_quote(symbol, session)
            indicators = await self.data_service.get_indicators(symbol, session)
            market_snapshot[symbol] = {
                **quote,
                "ma50": indicators.get("ma50"),
                "ma200": indicators.get("ma200"),
                "rsi": indicators.get("rsi"),
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
        task = {
            "type": harness_type,
            "budget": budget,
            "constraints": constraints or {"max_holdings": 3, "watchlist_only": True},
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
