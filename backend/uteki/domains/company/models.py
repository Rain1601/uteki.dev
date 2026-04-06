"""
Company domain models — persistent storage for company analysis results.
"""

from sqlalchemy import String, Integer, Index, JSON, Float, Text, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional, Dict, Any

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args


class CompanyPromptVersion(Base, UUIDMixin, TimestampMixin):
    """
    Versioned prompts for each gate of the 7-gate pipeline.
    Enables A/B testing and prompt iteration tracking.
    """

    __tablename__ = "company_prompt_versions"
    __table_args__ = get_table_args(
        UniqueConstraint("gate_number", "version", name="uq_gate_version"),
        Index("idx_cpv_gate_active", "gate_number", "is_active"),
        schema="company",
    )

    gate_number: Mapped[int] = mapped_column(Integer, nullable=False)
    skill_name: Mapped[str] = mapped_column(String(50), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    eval_scores: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    def __repr__(self):
        return (
            f"<CompanyPromptVersion(gate={self.gate_number}, v={self.version}, "
            f"active={self.is_active})>"
        )


class CompanyAnalysis(Base, UUIDMixin, TimestampMixin):
    """
    Company analysis result — one row per pipeline run.
    Stores the full 7-gate report for history & comparison.
    """

    __tablename__ = "company_analyses"
    __table_args__ = get_table_args(
        Index("idx_ca_user", "user_id"),
        Index("idx_ca_symbol", "symbol"),
        schema="company"
    )

    # Multi-tenant isolation
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")

    # Stock info
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)

    # LLM used
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)

    # Result status: pending | running | completed | error
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="completed")

    # Pipeline progress tracking
    current_gate: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    gate_results: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON, nullable=True, default=None,
        comment="Per-gate results for reconnectable streaming: {1: {text, parsed, ...}, ...}",
    )

    # Full pipeline result (skills, verdict, trace, tool_calls)
    full_report: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)

    # Top-level verdict fields for quick filtering
    verdict_action: Mapped[str] = mapped_column(String(10), nullable=False, default="WATCH")
    verdict_conviction: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    verdict_quality: Mapped[str] = mapped_column(String(20), nullable=False, default="GOOD")

    # Performance
    total_latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Error info (when status='error')
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Sharing
    share_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    share_expires_at: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    def __repr__(self):
        return f"<CompanyAnalysis(id={self.id}, symbol={self.symbol}, provider={self.provider}, action={self.verdict_action})>"
