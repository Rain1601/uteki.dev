"""Agent 记忆服务"""

import logging
from typing import Optional, List, Dict, Any

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.domains.index.models.agent_memory import AgentMemory

logger = logging.getLogger(__name__)


class MemoryService:
    """Agent 记忆读写 — 支持 per-agent 私有记忆 + 共享记忆"""

    async def write(
        self,
        user_id: str,
        category: str,
        content: str,
        session: AsyncSession,
        metadata: Optional[Dict[str, Any]] = None,
        agent_key: str = "shared",
    ) -> Dict[str, Any]:
        """写入一条记忆"""
        memory = AgentMemory(
            user_id=user_id,
            category=category,
            content=content,
            extra_metadata=metadata,
            agent_key=agent_key,
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
        agent_key: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """读取记忆，按 category + agent_key 过滤 + 时间倒序

        Args:
            agent_key: None=不过滤, "shared"=仅共享, 具体key=仅该agent
        """
        query = select(AgentMemory).where(AgentMemory.user_id == user_id)
        if category:
            query = query.where(AgentMemory.category == category)
        if agent_key is not None:
            query = query.where(AgentMemory.agent_key == agent_key)
        query = query.order_by(AgentMemory.created_at.desc()).limit(limit)

        result = await session.execute(query)
        return [m.to_dict() for m in result.scalars().all()]

    async def get_summary(
        self,
        user_id: str,
        session: AsyncSession,
        agent_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """获取 Harness 构建所需的记忆摘要

        Args:
            agent_key: 如果指定，返回 shared 记忆 + 该 agent 的私有记忆 + 最近投票获胜方案

        返回:
        - recent_decisions: 最近 3 条 decision
        - recent_reflection: 最近 1 条 reflection
        - experiences: 所有 experience (通常 < 20)
        - recent_voting_winners: 最近 3 条投票获胜方案
        - agent_private_memories: 该 agent 的私有记忆（如果 agent_key 指定）
        """
        # 共享记忆（所有 agent 共用）
        decisions = await self.read(
            user_id, session, category="decision", limit=3, agent_key="shared"
        )
        reflections = await self.read(
            user_id, session, category="reflection", limit=1, agent_key="shared"
        )
        experiences = await self.read(
            user_id, session, category="experience", limit=50, agent_key="shared"
        )

        # 投票获胜方案（共享记忆中的 arena_learning 类别）
        voting_winners = await self.read(
            user_id, session, category="arena_learning", limit=3, agent_key="shared"
        )
        recent_voting_winners = [w.get("content", "")[:200] for w in voting_winners]

        summary: Dict[str, Any] = {
            "recent_decisions": decisions,
            "recent_reflection": reflections[0] if reflections else None,
            "experiences": experiences,
            "recent_voting_winners": recent_voting_winners,
        }

        # Per-agent 私有记忆
        if agent_key and agent_key != "shared":
            private_memories = await self.read(
                user_id, session, limit=10, agent_key=agent_key
            )
            summary["agent_private_memories"] = private_memories

        return summary

    async def delete(
        self,
        memory_id: str,
        user_id: str,
        session: AsyncSession,
    ) -> bool:
        """删除一条记忆"""
        query = select(AgentMemory).where(
            AgentMemory.id == memory_id,
            AgentMemory.user_id == user_id,
        )
        result = await session.execute(query)
        memory = result.scalar_one_or_none()
        if not memory:
            return False
        await session.delete(memory)
        await session.commit()
        return True

    async def write_arena_learning(
        self,
        user_id: str,
        session: AsyncSession,
        winner_summary: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """写入投票获胜方案到共享记忆"""
        return await self.write(
            user_id=user_id,
            category="arena_learning",
            content=winner_summary,
            session=session,
            metadata=metadata,
            agent_key="shared",
        )

    async def write_vote_reasoning(
        self,
        user_id: str,
        agent_key: str,
        session: AsyncSession,
        reasoning: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """写入 agent 的投票理由到私有记忆"""
        return await self.write(
            user_id=user_id,
            category="arena_vote_reasoning",
            content=reasoning,
            session=session,
            metadata=metadata,
            agent_key=agent_key,
        )


_memory_service: Optional[MemoryService] = None


def get_memory_service() -> MemoryService:
    global _memory_service
    if _memory_service is None:
        _memory_service = MemoryService()
    return _memory_service
