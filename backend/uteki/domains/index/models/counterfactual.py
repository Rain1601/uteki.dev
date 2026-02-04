"""反事实追踪模型"""

from sqlalchemy import String, Integer, Float, Boolean, JSON, ForeignKey, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from uteki.common.base import Base, UUIDMixin, get_table_args, get_table_ref


class Counterfactual(Base, UUIDMixin):
    """反事实追踪 — 模型建议的假设收益计算"""

    __tablename__ = "counterfactual"
    __table_args__ = get_table_args(
        Index("idx_cf_decision_log", "decision_log_id"),
        Index("idx_cf_model_io", "model_io_id"),
        Index("idx_cf_tracking_days", "tracking_days"),
        schema="index"
    )

    decision_log_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey(get_table_ref("decision_log", schema="index") + ".id"),
        nullable=False
    )
    model_io_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey(get_table_ref("model_io", schema="index") + ".id"),
        nullable=False
    )
    was_adopted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    tracking_days: Mapped[int] = mapped_column(Integer, nullable=False)  # 7 / 30 / 90
    hypothetical_return_pct: Mapped[float] = mapped_column(Float, nullable=False)
    actual_prices: Mapped[dict] = mapped_column(JSON, nullable=False)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "decision_log_id": self.decision_log_id,
            "model_io_id": self.model_io_id,
            "was_adopted": self.was_adopted,
            "tracking_days": self.tracking_days,
            "hypothetical_return_pct": self.hypothetical_return_pct,
            "actual_prices": self.actual_prices,
            "calculated_at": self.calculated_at.isoformat() if self.calculated_at else None,
        }
