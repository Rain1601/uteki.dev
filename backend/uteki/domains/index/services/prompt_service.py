"""System Prompt 版本管理服务"""

import logging
from typing import Optional, List, Dict, Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.domains.index.models.prompt_version import PromptVersion

logger = logging.getLogger(__name__)

DEFAULT_SYSTEM_PROMPT = """你是一个专业的指数 ETF 投资顾问 (Index Investment Agent)。

你的职责：
1. 分析市场数据（价格、估值、技术指标）为用户提供指数 ETF 投资建议
2. 在每次决策中，基于 Decision Harness 提供的完整上下文做出分析
3. 输出结构化的投资决策，包括操作类型、ETF 分配、信心度、推理过程

约束条件：
- 最多持有 3 只指数 ETF
- 仅投资观察池内的标的
- 所有买卖建议需要包含具体金额和比例
- 必须提供决策理由和风险评估
- 当不确定时，建议保持现状 (HOLD)

输出格式要求 (JSON):
{
  "action": "ALLOCATE | REBALANCE | HOLD | SKIP",
  "allocations": [{"etf": "VOO", "amount": 600, "percentage": 60, "reason": "..."}],
  "confidence": 0.85,
  "reasoning": "简要决策理由",
  "chain_of_thought": "完整思考过程...",
  "risk_assessment": "风险评估",
  "invalidation": "什么情况下此建议无效"
}
"""


class PromptService:
    """System Prompt 版本管理"""

    async def get_current(self, session: AsyncSession) -> Optional[Dict[str, Any]]:
        """获取当前激活的 prompt 版本"""
        query = select(PromptVersion).where(PromptVersion.is_current == True)
        result = await session.execute(query)
        version = result.scalar_one_or_none()
        if version:
            return version.to_dict()

        # 自动创建默认版本
        return await self._create_default(session)

    async def update_prompt(
        self, content: str, description: str, session: AsyncSession
    ) -> Dict[str, Any]:
        """更新 prompt — 创建新版本"""
        # 获取当前版本号
        query = (
            select(PromptVersion)
            .where(PromptVersion.is_current == True)
        )
        result = await session.execute(query)
        current = result.scalar_one_or_none()

        if current:
            # 递增版本号
            new_version = self._increment_version(current.version)
            # 标记旧版本为非当前
            current.is_current = False
        else:
            new_version = "v1.0"

        version = PromptVersion(
            version=new_version,
            content=content,
            description=description,
            is_current=True,
        )
        session.add(version)
        await session.commit()
        await session.refresh(version)
        logger.info(f"Created prompt version {new_version}: {description}")
        return version.to_dict()

    async def get_history(self, session: AsyncSession) -> List[Dict[str, Any]]:
        """获取所有版本历史"""
        query = select(PromptVersion).order_by(PromptVersion.created_at.desc())
        result = await session.execute(query)
        return [v.to_dict() for v in result.scalars().all()]

    async def get_by_id(self, version_id: str, session: AsyncSession) -> Optional[Dict[str, Any]]:
        query = select(PromptVersion).where(PromptVersion.id == version_id)
        result = await session.execute(query)
        version = result.scalar_one_or_none()
        return version.to_dict() if version else None

    async def _create_default(self, session: AsyncSession) -> Dict[str, Any]:
        version = PromptVersion(
            version="v1.0",
            content=DEFAULT_SYSTEM_PROMPT,
            description="Initial default system prompt",
            is_current=True,
        )
        session.add(version)
        await session.commit()
        await session.refresh(version)
        logger.info("Created default prompt version v1.0")
        return version.to_dict()

    @staticmethod
    def _increment_version(version: str) -> str:
        """v1.0 -> v1.1, v1.9 -> v1.10"""
        if not version.startswith("v"):
            return "v1.0"
        parts = version[1:].split(".")
        if len(parts) == 2:
            major, minor = int(parts[0]), int(parts[1])
            return f"v{major}.{minor + 1}"
        return f"v{int(parts[0]) + 1}.0"


_prompt_service: Optional[PromptService] = None


def get_prompt_service() -> PromptService:
    global _prompt_service
    if _prompt_service is None:
        _prompt_service = PromptService()
    return _prompt_service
