"""
Company domain models — persistent storage for company analysis results.
"""

from sqlalchemy import String, Integer, Index, JSON, Float, Text
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional, Dict, Any

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args


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

    # Result status
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="completed")

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

    def __repr__(self):
        return f"<CompanyAnalysis(id={self.id}, symbol={self.symbol}, provider={self.provider}, action={self.verdict_action})>"
