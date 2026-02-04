"""决策日志模型 — 不可变记录"""

from typing import Optional
from sqlalchemy import String, Text, JSON, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args, get_table_ref


class DecisionLog(Base, UUIDMixin, TimestampMixin):
    """决策日志 — 每次决策的不可变记录（append-only）"""

    __tablename__ = "decision_log"
    __table_args__ = get_table_args(
        Index("idx_decision_log_harness", "harness_id"),
        Index("idx_decision_log_action", "user_action"),
        Index("idx_decision_log_created", "created_at"),
        schema="index"
    )

    harness_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey(get_table_ref("decision_harness", schema="index") + ".id"),
        nullable=False
    )
    adopted_model_io_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey(get_table_ref("model_io", schema="index") + ".id"),
        nullable=True
    )
    user_action: Mapped[str] = mapped_column(String(20), nullable=False)  # approved / modified / skipped / rejected
    original_allocations: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    executed_allocations: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    execution_results: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    user_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "harness_id": self.harness_id,
            "adopted_model_io_id": self.adopted_model_io_id,
            "user_action": self.user_action,
            "original_allocations": self.original_allocations,
            "executed_allocations": self.executed_allocations,
            "execution_results": self.execution_results,
            "user_notes": self.user_notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
