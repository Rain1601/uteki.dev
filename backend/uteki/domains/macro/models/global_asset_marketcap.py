"""全球资产市值数据模型"""

from datetime import date, datetime
from typing import Optional

from sqlalchemy import String, Float, Integer, Date, Index
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args


class GlobalAssetMarketCap(Base, UUIDMixin, TimestampMixin):
    """全球资产市值排名表"""

    __tablename__ = "global_asset_marketcap"
    __table_args__ = get_table_args(
        Index("idx_gam_date_type", "data_date", "asset_type"),
        Index("idx_gam_date_rank", "data_date", "rank"),
        schema="macro",
    )

    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    symbol: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    asset_type: Mapped[str] = mapped_column(String(50), nullable=False)  # company / precious_metal / cryptocurrency / etf
    market_cap: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    change_today: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 24h change %
    change_30d: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    data_date: Mapped[date] = mapped_column(Date, nullable=False)

    def to_dict(self) -> dict:
        return {
            "rank": self.rank,
            "name": self.name,
            "symbol": self.symbol,
            "asset_type": self.asset_type,
            "market_cap": self.market_cap,
            "price": self.price,
            "change_today": self.change_today,
            "change_30d": self.change_30d,
            "country": self.country,
            "data_date": self.data_date.isoformat() if self.data_date else None,
        }
