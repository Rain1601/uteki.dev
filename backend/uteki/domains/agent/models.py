"""
Agent domain models - Agent聊天相关数据模型
"""

from sqlalchemy import String, Text, ForeignKey, Index, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List, Dict, Any

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args, get_table_ref


class ChatConversation(Base, UUIDMixin, TimestampMixin):
    """
    聊天会话表
    存储Agent聊天的会话信息
    """

    __tablename__ = "chat_conversations"
    __table_args__ = get_table_args(
        Index("idx_chat_conversations_user", "user_id"),
        Index("idx_chat_conversations_created", "created_at"),
        schema="agent"
    )

    # 用户ID (多租户隔离)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")

    # 会话标题
    title: Mapped[str] = mapped_column(String(500), nullable=False, default="新对话")

    # 会话模式 (chat, analysis, trading)
    mode: Mapped[str] = mapped_column(String(50), nullable=False, default="chat")

    # 是否归档
    is_archived: Mapped[bool] = mapped_column(default=False, nullable=False)

    # 关联的消息
    messages: Mapped[List["ChatMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at"
    )

    def __repr__(self):
        return f"<ChatConversation(id={self.id}, title={self.title}, mode={self.mode})>"


class ChatMessage(Base, UUIDMixin, TimestampMixin):
    """
    聊天消息表
    存储Agent聊天的消息内容
    """

    __tablename__ = "chat_messages"
    __table_args__ = get_table_args(
        Index("idx_chat_messages_conversation", "conversation_id"),
        Index("idx_chat_messages_created", "created_at"),
        schema="agent"
    )

    # 关联的会话ID
    conversation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey(f"{get_table_ref('chat_conversations', 'agent')}.id", ondelete="CASCADE"),
        nullable=False
    )

    # 消息角色 (user, assistant, system)
    role: Mapped[str] = mapped_column(String(20), nullable=False)

    # 消息内容
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # LLM提供商 (记录用哪个模型生成的)
    llm_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # LLM模型
    llm_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Token消耗统计 (JSON格式存储 prompt_tokens, completion_tokens, total_tokens)
    token_usage: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # Deep Research数据 (JSON格式存储 thoughts, sources, sourceUrls)
    research_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # 关联的会话
    conversation: Mapped["ChatConversation"] = relationship(back_populates="messages")

    def __repr__(self):
        return f"<ChatMessage(id={self.id}, role={self.role}, conversation_id={self.conversation_id})>"
