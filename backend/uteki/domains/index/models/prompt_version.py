"""Prompt 版本管理模型（system / user prompt）"""

from sqlalchemy import String, Text, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args


class PromptVersion(Base, UUIDMixin, TimestampMixin):
    """Prompt 版本 — 每次修改自动创建新版本，支持 system / user 两种类型"""

    __tablename__ = "prompt_version"
    __table_args__ = get_table_args(
        Index("idx_prompt_version_type_current", "prompt_type", "is_current"),
        schema="index"
    )

    prompt_type: Mapped[str] = mapped_column(
        String(20), default="system", nullable=False, server_default="system"
    )
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "prompt_type": self.prompt_type,
            "version": self.version,
            "content": self.content,
            "description": self.description,
            "is_current": self.is_current,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
