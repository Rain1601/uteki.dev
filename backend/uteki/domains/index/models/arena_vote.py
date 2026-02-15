"""Arena 投票记录模型"""

from typing import Optional
from sqlalchemy import String, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args, get_table_ref


class ArenaVote(Base, UUIDMixin, TimestampMixin):
    """Arena 投票 — 记录每个 Agent 对其他 Agent 方案的投票"""

    __tablename__ = "arena_vote"
    __table_args__ = get_table_args(
        Index("idx_arena_vote_harness", "harness_id"),
        Index("idx_arena_vote_voter", "voter_model_io_id"),
        Index("idx_arena_vote_target", "target_model_io_id"),
        schema="index"
    )

    harness_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey(get_table_ref("decision_harness", schema="index") + ".id"),
        nullable=False
    )
    voter_model_io_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey(get_table_ref("model_io", schema="index") + ".id"),
        nullable=False
    )
    target_model_io_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey(get_table_ref("model_io", schema="index") + ".id"),
        nullable=False
    )
    vote_type: Mapped[str] = mapped_column(String(20), nullable=False)  # approve / reject
    reasoning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "harness_id": self.harness_id,
            "voter_model_io_id": self.voter_model_io_id,
            "target_model_io_id": self.target_model_io_id,
            "vote_type": self.vote_type,
            "reasoning": self.reasoning,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
