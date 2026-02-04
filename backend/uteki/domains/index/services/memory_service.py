"""Agent 记忆服务"""

import logging
from typing import Optional, List, Dict, Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.domains.index.models.agent_memory import AgentMemory

logger = logging.getLogger(__name__)


class MemoryService:
    """Agent 记忆读写 — V1 基础版（分类存储 + 时间倒序）"""

    async def write(
        self,
        user_id: str,
        category: str,
        content: str,
        session: AsyncSession,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """写入一条记忆"""
        memory = AgentMemory(
            user_id=user_id,
            category=category,
            content=content,
            extra_metadata=metadata,
        )
        session.add(memory)
        await session.commit()
        await session.refresh(memory)
        return memory.to_dict()

    async def read(
        self,
        user_id: str,
        session: AsyncSession,
        category: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """读取记忆，按 category 过滤 + 时间倒序"""
        query = select(AgentMemory).where(AgentMemory.user_id == user_id)
        if category:
            query = query.where(AgentMemory.category == category)
        query = query.order_by(AgentMemory.created_at.desc()).limit(limit)

        result = await session.execute(query)
        return [m.to_dict() for m in result.scalars().all()]

    async def get_summary(
        self, user_id: str, session: AsyncSession
    ) -> Dict[str, Any]:
        """获取 Harness 构建所需的记忆摘要

        返回:
        - recent_decisions: 最近 3 条 decision
        - recent_reflection: 最近 1 条 reflection
        - experiences: 所有 experience (通常 < 20)
        """
        decisions = await self.read(user_id, session, category="decision", limit=3)
        reflections = await self.read(user_id, session, category="reflection", limit=1)
        experiences = await self.read(user_id, session, category="experience", limit=50)

        return {
            "recent_decisions": decisions,
            "recent_reflection": reflections[0] if reflections else None,
            "experiences": experiences,
        }


_memory_service: Optional[MemoryService] = None


def get_memory_service() -> MemoryService:
    global _memory_service
    if _memory_service is None:
        _memory_service = MemoryService()
    return _memory_service
