"""System Prompt 版本管理模型"""

from sqlalchemy import String, Text, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args


class PromptVersion(Base, UUIDMixin, TimestampMixin):
    """System Prompt 版本 — 每次修改自动创建新版本"""

    __tablename__ = "prompt_version"
    __table_args__ = get_table_args(
        Index("idx_prompt_version_current", "is_current"),
        schema="index"
    )

    version: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "version": self.version,
            "content": self.content,
            "description": self.description,
            "is_current": self.is_current,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
