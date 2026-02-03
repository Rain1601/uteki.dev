"""SNB交易备注数据模型 - 用户对交易的评价和笔记"""

from typing import Optional
from sqlalchemy import String, Text, BigInteger, Boolean, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args


class SnbTransactionNote(Base, UUIDMixin, TimestampMixin):
    """SNB交易备注表 - 用户对交易记录的评价和备注"""

    __tablename__ = "snb_transaction_notes"
    __table_args__ = get_table_args(
        UniqueConstraint(
            "account_id", "symbol", "trade_time", "side",
            name="uq_snb_transaction_note"
        ),
        Index("idx_snb_notes_account_symbol", "account_id", "symbol"),
        schema="snb"
    )

    account_id: Mapped[str] = mapped_column(String(50), nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    trade_time: Mapped[int] = mapped_column(BigInteger, nullable=False)
    side: Mapped[str] = mapped_column(String(10), nullable=False)
    is_reasonable: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "account_id": self.account_id,
            "symbol": self.symbol,
            "trade_time": self.trade_time,
            "side": self.side,
            "is_reasonable": self.is_reasonable,
            "notes": self.notes or "",
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
