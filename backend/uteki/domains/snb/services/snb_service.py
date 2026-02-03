"""SNB业务逻辑服务 - 交易记录同步与备注管理"""

import logging
from typing import Optional, List, Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.common.config import settings

def _get_insert():
    """Get the appropriate insert function for the current database."""
    if settings.database_type == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    else:
        from sqlalchemy.dialects.postgresql import insert
    return insert

from uteki.domains.snb.models import SnbTransaction, SnbTransactionNote

logger = logging.getLogger(__name__)


class SnbService:
    """SNB交易服务"""

    async def sync_transactions(
        self,
        session: AsyncSession,
        account_id: str,
        transactions: List[Dict[str, Any]],
    ) -> int:
        """将SNB API返回的交易记录upsert到数据库

        Returns:
            同步的记录数
        """
        if not transactions:
            return 0

        records = []
        for tx in transactions:
            records.append({
                "account_id": account_id,
                "symbol": tx.get("symbol", ""),
                "trade_time": tx.get("trade_time", tx.get("time", 0)),
                "side": tx.get("side", ""),
                "quantity": tx.get("quantity", 0),
                "price": tx.get("price", 0),
                "commission": tx.get("commission"),
                "order_id": tx.get("order_id"),
                "raw_data": tx,
            })

        insert = _get_insert()
        stmt = insert(SnbTransaction).values(records)
        if settings.database_type == "sqlite":
            stmt = stmt.on_conflict_do_update(
                index_elements=["account_id", "symbol", "trade_time", "side"],
                set_={
                    "quantity": stmt.excluded.quantity,
                    "price": stmt.excluded.price,
                    "commission": stmt.excluded.commission,
                    "order_id": stmt.excluded.order_id,
                    "raw_data": stmt.excluded.raw_data,
                },
            )
        else:
            stmt = stmt.on_conflict_do_update(
                constraint="uq_snb_transaction",
                set_={
                    "quantity": stmt.excluded.quantity,
                    "price": stmt.excluded.price,
                    "commission": stmt.excluded.commission,
                    "order_id": stmt.excluded.order_id,
                    "raw_data": stmt.excluded.raw_data,
                },
            )
        await session.execute(stmt)
        await session.commit()

        logger.info(f"同步交易记录: {len(records)} 条")
        return len(records)

    async def get_transactions(
        self,
        session: AsyncSession,
        account_id: str,
        symbol: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """查询持久化的交易记录，附带备注信息"""
        query = (
            select(SnbTransaction, SnbTransactionNote)
            .outerjoin(
                SnbTransactionNote,
                (SnbTransaction.account_id == SnbTransactionNote.account_id)
                & (SnbTransaction.symbol == SnbTransactionNote.symbol)
                & (SnbTransaction.trade_time == SnbTransactionNote.trade_time)
                & (SnbTransaction.side == SnbTransactionNote.side),
            )
            .where(SnbTransaction.account_id == account_id)
            .order_by(SnbTransaction.trade_time.desc())
            .limit(limit)
        )

        if symbol:
            query = query.where(SnbTransaction.symbol == symbol)

        result = await session.execute(query)
        rows = result.all()

        transactions = []
        for tx, note in rows:
            tx_dict = tx.to_dict()
            if note:
                tx_dict["note"] = note.to_dict()
            else:
                tx_dict["note"] = None
            transactions.append(tx_dict)

        return transactions

    async def upsert_note(
        self,
        session: AsyncSession,
        account_id: str,
        symbol: str,
        trade_time: int,
        side: str,
        is_reasonable: Optional[bool],
        notes: str,
    ) -> Dict[str, Any]:
        """创建或更新交易备注"""
        insert = _get_insert()
        stmt = insert(SnbTransactionNote).values(
            account_id=account_id,
            symbol=symbol,
            trade_time=trade_time,
            side=side,
            is_reasonable=is_reasonable,
            notes=notes,
        )
        if settings.database_type == "sqlite":
            stmt = stmt.on_conflict_do_update(
                index_elements=["account_id", "symbol", "trade_time", "side"],
                set_={
                    "is_reasonable": stmt.excluded.is_reasonable,
                    "notes": stmt.excluded.notes,
                },
            )
        else:
            stmt = stmt.on_conflict_do_update(
                constraint="uq_snb_transaction_note",
                set_={
                    "is_reasonable": stmt.excluded.is_reasonable,
                    "notes": stmt.excluded.notes,
                },
            )
        await session.execute(stmt)
        await session.commit()

        # 查询返回更新后的记录
        query = select(SnbTransactionNote).where(
            SnbTransactionNote.account_id == account_id,
            SnbTransactionNote.symbol == symbol,
            SnbTransactionNote.trade_time == trade_time,
            SnbTransactionNote.side == side,
        )
        result = await session.execute(query)
        note = result.scalar_one()

        logger.info(f"备注已保存: {symbol} {side} @ {trade_time}")
        return note.to_dict()


# Singleton
_snb_service: Optional[SnbService] = None


def get_snb_service() -> SnbService:
    global _snb_service
    if _snb_service is None:
        _snb_service = SnbService()
    return _snb_service
