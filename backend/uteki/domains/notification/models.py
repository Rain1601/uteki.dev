"""
Notification domain models — in-app notification storage.
"""

from sqlalchemy import String, Integer, Index, JSON, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional, Dict, Any

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args


class Notification(Base, UUIDMixin, TimestampMixin):
    """
    In-app notification for a user.
    Types: arena_complete, company_complete, company_error, system
    """

    __tablename__ = "notifications"
    __table_args__ = get_table_args(
        Index("idx_notif_user_read", "user_id", "is_read"),
        schema="notification",
    )

    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    extra_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    def __repr__(self):
        return f"<Notification(id={self.id}, type={self.type}, read={self.is_read})>"
