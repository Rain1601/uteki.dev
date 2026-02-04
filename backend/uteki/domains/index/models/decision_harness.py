"""Decision Harness 模型 — 不可变决策输入快照"""

from typing import Optional
from sqlalchemy import String, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args, get_table_ref


class DecisionHarness(Base, UUIDMixin, TimestampMixin):
    """Decision Harness — 标准化的不可变决策上下文快照"""

    __tablename__ = "decision_harness"
    __table_args__ = get_table_args(schema="index")

    harness_type: Mapped[str] = mapped_column(String(50), nullable=False)  # monthly_dca / rebalance / weekly_check
    prompt_version_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey(get_table_ref("prompt_version", schema="index") + ".id"),
        nullable=False
    )
    market_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    account_state: Mapped[dict] = mapped_column(JSON, nullable=False)
    memory_summary: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    task: Mapped[dict] = mapped_column(JSON, nullable=False)
    tool_definitions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "harness_type": self.harness_type,
            "prompt_version_id": self.prompt_version_id,
            "market_snapshot": self.market_snapshot,
            "account_state": self.account_state,
            "memory_summary": self.memory_summary,
            "task": self.task,
            "tool_definitions": self.tool_definitions,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
