"""模型 I/O 记录模型 — 完整输入输出持久化"""

from typing import Optional
from sqlalchemy import String, Text, Integer, Float, JSON, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args, get_table_ref


class ModelIO(Base, UUIDMixin, TimestampMixin):
    """模型 I/O — 每次 Arena 调用中每个模型的完整输入和输出"""

    __tablename__ = "model_io"
    __table_args__ = get_table_args(
        Index("idx_model_io_harness", "harness_id"),
        Index("idx_model_io_provider", "model_provider"),
        schema="index"
    )

    harness_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey(get_table_ref("decision_harness", schema="index") + ".id"),
        nullable=False
    )
    model_provider: Mapped[str] = mapped_column(String(50), nullable=False)  # anthropic / openai / deepseek / ...
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)  # claude-sonnet-4 / gpt-4o / ...
    input_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    input_token_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    output_raw: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    output_structured: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    tool_calls: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    output_token_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cost_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    parse_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # structured / partial / raw_only / timeout / error
    status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # success / timeout / error
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "harness_id": self.harness_id,
            "model_provider": self.model_provider,
            "model_name": self.model_name,
            "input_token_count": self.input_token_count,
            "output_structured": self.output_structured,
            "output_token_count": self.output_token_count,
            "tool_calls": self.tool_calls,
            "latency_ms": self.latency_ms,
            "cost_usd": self.cost_usd,
            "parse_status": self.parse_status,
            "status": self.status,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def to_full_dict(self) -> dict:
        """Include full I/O text for detail views"""
        d = self.to_dict()
        d["input_prompt"] = self.input_prompt
        d["output_raw"] = self.output_raw
        d["error_message"] = self.error_message
        return d
