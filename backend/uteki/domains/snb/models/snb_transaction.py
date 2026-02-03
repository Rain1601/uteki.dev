"""SNB交易记录数据模型 - 持久化交易历史"""

from typing import Optional
from sqlalchemy import String, Text, BigInteger, Float, Index, UniqueConstraint, JSON
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args


class SnbTransaction(Base, UUIDMixin, TimestampMixin):
    """SNB交易记录表 - 从SNB API同步的交易数据"""

    __tablename__ = "snb_transactions"
    __table_args__ = get_table_args(
        UniqueConstraint(
            "account_id", "symbol", "trade_time", "side",
            name="uq_snb_transaction"
        ),
        Index("idx_snb_tx_account_symbol", "account_id", "symbol"),
        Index("idx_snb_tx_trade_time", "trade_time"),
        schema="snb"
    )

    account_id: Mapped[str] = mapped_column(String(50), nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    trade_time: Mapped[int] = mapped_column(BigInteger, nullable=False)
    side: Mapped[str] = mapped_column(String(10), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    commission: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    order_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    raw_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "account_id": self.account_id,
            "symbol": self.symbol,
            "trade_time": self.trade_time,
            "side": self.side,
            "quantity": self.quantity,
            "price": self.price,
            "commission": self.commission,
            "order_id": self.order_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
