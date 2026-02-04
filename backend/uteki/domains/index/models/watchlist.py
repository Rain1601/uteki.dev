"""观察池标的模型"""

from typing import Optional
from sqlalchemy import String, Boolean, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args


class Watchlist(Base, UUIDMixin, TimestampMixin):
    """观察池 — 用户关注的 ETF 标的"""

    __tablename__ = "watchlist"
    __table_args__ = get_table_args(
        UniqueConstraint("symbol", name="uq_watchlist_symbol"),
        Index("idx_watchlist_active", "is_active"),
        schema="index"
    )

    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    etf_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "name": self.name,
            "etf_type": self.etf_type,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
