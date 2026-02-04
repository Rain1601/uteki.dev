"""调度任务模型"""

from typing import Optional
from sqlalchemy import String, Boolean, JSON, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args


class ScheduleTask(Base, UUIDMixin, TimestampMixin):
    """调度任务 — APScheduler 任务配置持久化"""

    __tablename__ = "schedule_task"
    __table_args__ = get_table_args(
        Index("idx_schedule_task_enabled", "is_enabled"),
        schema="index"
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    cron_expression: Mapped[str] = mapped_column(String(100), nullable=False)
    task_type: Mapped[str] = mapped_column(String(50), nullable=False)  # arena_analysis / reflection
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_run_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # success / error / pending_user_action
    next_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "cron_expression": self.cron_expression,
            "task_type": self.task_type,
            "config": self.config,
            "is_enabled": self.is_enabled,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "last_run_status": self.last_run_status,
            "next_run_at": self.next_run_at.isoformat() if self.next_run_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
