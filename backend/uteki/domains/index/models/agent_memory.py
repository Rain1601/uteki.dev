"""Agent 记忆模型"""

from typing import Optional
from sqlalchemy import String, Text, JSON, Index as SaIndex
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args


class AgentMemory(Base, UUIDMixin, TimestampMixin):
    """Agent 记忆 — 决策摘要、反思、经验、观察"""

    __tablename__ = "agent_memory"
    __table_args__ = get_table_args(
        SaIndex("idx_agent_memory_user_category", "user_id", "category"),
        SaIndex("idx_agent_memory_created", "created_at"),
        schema="index"
    )

    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)  # decision / reflection / experience / observation
    content: Mapped[str] = mapped_column(Text, nullable=False)
    extra_metadata: Mapped[Optional[dict]] = mapped_column("metadata", JSON, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "category": self.category,
            "content": self.content,
            "metadata": self.extra_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
