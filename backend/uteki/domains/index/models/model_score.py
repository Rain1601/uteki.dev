"""模型评分模型"""

from typing import Optional
from sqlalchemy import String, Integer, Float, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args, get_table_ref


class ModelScore(Base, UUIDMixin, TimestampMixin):
    """模型评分 — 按 prompt 版本追踪各模型表现"""

    __tablename__ = "model_score"
    __table_args__ = get_table_args(
        UniqueConstraint(
            "model_provider", "model_name", "prompt_version_id",
            name="uq_model_score_provider_model_prompt"
        ),
        Index("idx_model_score_prompt", "prompt_version_id"),
        schema="index"
    )

    model_provider: Mapped[str] = mapped_column(String(50), nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_version_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey(get_table_ref("prompt_version", schema="index") + ".id"),
        nullable=False
    )
    adoption_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    win_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    loss_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_decisions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    counterfactual_win_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    counterfactual_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_return_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    rejection_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    approve_vote_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    simulated_return_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    decision_accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence_calibration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    def to_dict(self) -> dict:
        adoption_rate = (self.adoption_count / self.total_decisions * 100) if self.total_decisions > 0 else 0
        win_rate = (self.win_count / (self.win_count + self.loss_count) * 100) if (self.win_count + self.loss_count) > 0 else 0
        cf_win_rate = (self.counterfactual_win_count / self.counterfactual_total * 100) if self.counterfactual_total > 0 else 0
        approve = self.approve_vote_count or 0
        reject = self.rejection_count or 0
        model_score = approve - reject

        return {
            "id": self.id,
            "model_provider": self.model_provider,
            "model_name": self.model_name,
            "prompt_version_id": self.prompt_version_id,
            "adoption_count": self.adoption_count,
            "adoption_rate": round(adoption_rate, 1),
            "approve_vote_count": approve,
            "rejection_count": reject,
            "model_score": model_score,
            "win_count": self.win_count,
            "loss_count": self.loss_count,
            "win_rate": round(win_rate, 1),
            "total_decisions": self.total_decisions,
            "counterfactual_win_count": self.counterfactual_win_count,
            "counterfactual_total": self.counterfactual_total,
            "counterfactual_win_rate": round(cf_win_rate, 1),
            "avg_return_pct": round(self.avg_return_pct, 2),
            "simulated_return_pct": round(self.simulated_return_pct, 2) if self.simulated_return_pct is not None else None,
            "decision_accuracy": round(self.decision_accuracy, 2) if self.decision_accuracy is not None else None,
            "confidence_calibration": round(self.confidence_calibration, 2) if self.confidence_calibration is not None else None,
        }
