"""
Agent domain repository - Supabase REST API 数据访问层
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from uuid import uuid4

from uteki.common.database import SupabaseRepository, db_manager

logger = logging.getLogger(__name__)

# ORM models — only imported for SQLite backup
from uteki.domains.agent.models import ChatConversation, ChatMessage


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


async def _backup_rows(table: str, model_class, rows: list):
    """Best-effort SQLite backup (failure only warns)."""
    try:
        async with db_manager.get_postgres_session() as session:
            for row in rows:
                safe = {k: v for k, v in row.items() if hasattr(model_class, k)}
                await session.merge(model_class(**safe))
    except Exception as e:
        logger.warning(f"SQLite backup failed for {table}: {e}")


# ---------------------------------------------------------------------------
# ChatConversationRepository
# ---------------------------------------------------------------------------

class ChatConversationRepository:
    """聊天会话仓储"""
    TABLE = "chat_conversations"

    @staticmethod
    async def create(data: dict) -> dict:
        """创建会话"""
        _ensure_id(data)
        result = SupabaseRepository(ChatConversationRepository.TABLE).upsert(data)
        row = result.data[0] if result.data else data
        await _backup_rows(ChatConversationRepository.TABLE, ChatConversation, [row])
        return row

    @staticmethod
    async def get_by_id(conversation_id: str) -> Optional[dict]:
        """根据ID获取会话"""
        return SupabaseRepository(ChatConversationRepository.TABLE).select_one(
            eq={"id": conversation_id}
        )

    @staticmethod
    async def list_by_user(
        user_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
        include_archived: bool = False,
    ) -> Tuple[List[dict], int]:
        """列出用户的会话"""
        eq = {}
        is_ = {}

        # 用户过滤
        if user_id is not None:
            eq["user_id"] = user_id
        else:
            # 如果没有user_id，查询所有未关联用户的会话
            is_["user_id"] = "null"

        # 归档过滤
        if not include_archived:
            eq["is_archived"] = False

        result = SupabaseRepository(ChatConversationRepository.TABLE).select(
            "*",
            count="exact",
            eq=eq if eq else None,
            is_=is_ if is_ else None,
            order="created_at.desc",
            offset=skip,
            limit=limit,
        )
        return result.data, result.count or 0

    @staticmethod
    async def update(conversation_id: str, **kwargs) -> Optional[dict]:
        """更新会话"""
        kwargs["updated_at"] = _now_iso()
        result = SupabaseRepository(ChatConversationRepository.TABLE).update(
            data=kwargs, eq={"id": conversation_id}
        )
        if result.data:
            await _backup_rows(ChatConversationRepository.TABLE, ChatConversation, result.data)
            return result.data[0]
        return None

    @staticmethod
    async def delete(conversation_id: str) -> bool:
        """删除会话"""
        # 先删除关联消息
        SupabaseRepository(ChatMessageRepository.TABLE).delete(
            eq={"conversation_id": conversation_id}
        )
        # 再删除会话
        result = SupabaseRepository(ChatConversationRepository.TABLE).delete(
            eq={"id": conversation_id}
        )
        return bool(result.data)


# ---------------------------------------------------------------------------
# ChatMessageRepository
# ---------------------------------------------------------------------------

class ChatMessageRepository:
    """聊天消息仓储"""
    TABLE = "chat_messages"

    @staticmethod
    async def create(data: dict) -> dict:
        """创建消息"""
        _ensure_id(data)
        result = SupabaseRepository(ChatMessageRepository.TABLE).upsert(data)
        row = result.data[0] if result.data else data
        await _backup_rows(ChatMessageRepository.TABLE, ChatMessage, [row])
        return row

    @staticmethod
    async def get_by_id(message_id: str) -> Optional[dict]:
        """根据ID获取消息"""
        return SupabaseRepository(ChatMessageRepository.TABLE).select_one(
            eq={"id": message_id}
        )

    @staticmethod
    async def list_by_conversation(
        conversation_id: str,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[dict], int]:
        """列出会话的消息"""
        result = SupabaseRepository(ChatMessageRepository.TABLE).select(
            "*",
            count="exact",
            eq={"conversation_id": conversation_id},
            order="created_at.asc",
            offset=skip,
            limit=limit,
        )
        return result.data, result.count or 0

    @staticmethod
    async def get_conversation_messages(conversation_id: str) -> List[dict]:
        """获取会话的所有消息（不分页）"""
        return SupabaseRepository(ChatMessageRepository.TABLE).select_data(
            eq={"conversation_id": conversation_id},
            order="created_at.asc",
        )

    @staticmethod
    async def delete_by_conversation(conversation_id: str) -> bool:
        """删除会话的所有消息"""
        result = SupabaseRepository(ChatMessageRepository.TABLE).delete(
            eq={"conversation_id": conversation_id}
        )
        return bool(result.data)
