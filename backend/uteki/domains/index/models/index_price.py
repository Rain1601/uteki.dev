"""指数历史价格模型"""

from sqlalchemy import String, Float, BigInteger, Date, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from datetime import date as date_type

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args


class IndexPrice(Base, UUIDMixin, TimestampMixin):
    """指数 ETF 历史日线数据（OHLCV）"""

    __tablename__ = "index_prices"
    __table_args__ = get_table_args(
        UniqueConstraint("symbol", "date", name="uq_index_price_symbol_date"),
        Index("idx_index_price_symbol", "symbol"),
        Index("idx_index_price_date", "date"),
        schema="index"
    )

    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    open: Mapped[float] = mapped_column(Float, nullable=False)
    high: Mapped[float] = mapped_column(Float, nullable=False)
    low: Mapped[float] = mapped_column(Float, nullable=False)
    close: Mapped[float] = mapped_column(Float, nullable=False)
    volume: Mapped[int] = mapped_column(BigInteger, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "date": self.date.isoformat() if self.date else None,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
        }
