"""
Agent domain repository - 数据访问层
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from typing import List, Optional, Tuple

from uteki.domains.agent.models import ChatConversation, ChatMessage


class ChatConversationRepository:
    """聊天会话仓储"""

    @staticmethod
    async def create(session: AsyncSession, conversation: ChatConversation) -> ChatConversation:
        """创建会话"""
        session.add(conversation)
        await session.commit()
        await session.refresh(conversation)
        return conversation

    @staticmethod
    async def get_by_id(
        session: AsyncSession, conversation_id: str
    ) -> Optional[ChatConversation]:
        """根据ID获取会话"""
        stmt = select(ChatConversation).where(ChatConversation.id == conversation_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_by_user(
        session: AsyncSession,
        user_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
        include_archived: bool = False
    ) -> Tuple[List[ChatConversation], int]:
        """列出用户的会话"""
        # 构建查询
        query = select(ChatConversation)

        # 用户过滤
        if user_id is not None:
            query = query.where(ChatConversation.user_id == user_id)
        else:
            # 如果没有user_id，查询所有未关联用户的会话
            query = query.where(ChatConversation.user_id.is_(None))

        # 归档过滤
        if not include_archived:
            query = query.where(ChatConversation.is_archived == False)

        # 按创建时间降序排列
        query = query.order_by(ChatConversation.created_at.desc())

        # 总数查询
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await session.execute(count_query)
        total = total_result.scalar() or 0

        # 分页查询
        query = query.offset(skip).limit(limit)
        result = await session.execute(query)
        items = list(result.scalars().all())

        return items, total

    @staticmethod
    async def update(
        session: AsyncSession, conversation_id: str, **kwargs
    ) -> Optional[ChatConversation]:
        """更新会话"""
        stmt = (
            update(ChatConversation)
            .where(ChatConversation.id == conversation_id)
            .values(**kwargs)
            .returning(ChatConversation)
        )
        result = await session.execute(stmt)
        await session.commit()
        return result.scalar_one_or_none()

    @staticmethod
    async def delete(session: AsyncSession, conversation_id: str) -> bool:
        """删除会话"""
        stmt = delete(ChatConversation).where(ChatConversation.id == conversation_id)
        result = await session.execute(stmt)
        await session.commit()
        return result.rowcount > 0


class ChatMessageRepository:
    """聊天消息仓储"""

    @staticmethod
    async def create(session: AsyncSession, message: ChatMessage) -> ChatMessage:
        """创建消息"""
        session.add(message)
        await session.commit()
        await session.refresh(message)
        return message

    @staticmethod
    async def get_by_id(session: AsyncSession, message_id: str) -> Optional[ChatMessage]:
        """根据ID获取消息"""
        stmt = select(ChatMessage).where(ChatMessage.id == message_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_by_conversation(
        session: AsyncSession,
        conversation_id: str,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[List[ChatMessage], int]:
        """列出会话的消息"""
        # 总数查询
        count_stmt = select(func.count()).where(
            ChatMessage.conversation_id == conversation_id
        )
        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        # 消息查询（按创建时间升序）
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at.asc())
            .offset(skip)
            .limit(limit)
        )
        result = await session.execute(stmt)
        items = list(result.scalars().all())

        return items, total

    @staticmethod
    async def get_conversation_messages(
        session: AsyncSession, conversation_id: str
    ) -> List[ChatMessage]:
        """获取会话的所有消息（不分页）"""
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at.asc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def delete_by_conversation(
        session: AsyncSession, conversation_id: str
    ) -> bool:
        """删除会话的所有消息"""
        stmt = delete(ChatMessage).where(ChatMessage.conversation_id == conversation_id)
        result = await session.execute(stmt)
        await session.commit()
        return result.rowcount > 0
