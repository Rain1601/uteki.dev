"""KlineService — query K-line data from PostgreSQL.

Weekly and monthly aggregations are computed on-the-fly using standard
SQL ``date_trunc`` (works on both plain PG and TimescaleDB).
"""

import logging
from datetime import date
from typing import List, Optional
from uuid import uuid4

from sqlalchemy import select, text

from uteki.common.cache import get_cache_service
from uteki.common.database import db_manager
from uteki.domains.data.models import Symbol, KlineDaily
from uteki.domains.data.schemas import KlineInterval

logger = logging.getLogger(__name__)


class KlineService:
    """Read-path: query klines (daily / weekly / monthly)."""

    # ── Symbol CRUD ──

    async def list_symbols(
        self,
        asset_type: Optional[str] = None,
        active_only: bool = True,
    ) -> List[dict]:
        async with db_manager.get_postgres_session() as session:
            stmt = select(Symbol)
            if active_only:
                stmt = stmt.where(Symbol.is_active.is_(True))
            if asset_type:
                stmt = stmt.where(Symbol.asset_type == asset_type)
            stmt = stmt.order_by(Symbol.asset_type, Symbol.symbol)

            result = await session.execute(stmt)
            return [row.to_dict() for row in result.scalars().all()]

    async def get_symbol(self, symbol: str, asset_type: Optional[str] = None) -> Optional[dict]:
        async with db_manager.get_postgres_session() as session:
            stmt = select(Symbol).where(Symbol.symbol == symbol)
            if asset_type:
                stmt = stmt.where(Symbol.asset_type == asset_type)
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            return row.to_dict() if row else None

    async def add_symbol(
        self,
        symbol: str,
        asset_type: str,
        name: Optional[str] = None,
        exchange: Optional[str] = None,
        currency: str = "USD",
        timezone: str = "America/New_York",
        data_source: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> dict:
        async with db_manager.get_postgres_session() as session:
            stmt = select(Symbol).where(
                Symbol.symbol == symbol,
                Symbol.asset_type == asset_type,
            )
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()

            if existing:
                if not existing.is_active:
                    existing.is_active = True
                return existing.to_dict()

            new_sym = Symbol(
                id=str(uuid4()),
                symbol=symbol.upper(),
                name=name,
                asset_type=asset_type,
                exchange=exchange,
                currency=currency,
                timezone=timezone,
                data_source=data_source,
                metadata_=metadata or {},
                is_active=True,
            )
            session.add(new_sym)
            await session.flush()
            return new_sym.to_dict()

    async def remove_symbol(self, symbol_id: str) -> bool:
        async with db_manager.get_postgres_session() as session:
            stmt = select(Symbol).where(Symbol.id == symbol_id)
            result = await session.execute(stmt)
            sym = result.scalar_one_or_none()
            if sym:
                sym.is_active = False
                return True
            return False

    # ── K-line queries ──

    async def get_klines(
        self,
        symbol: str,
        interval: KlineInterval = KlineInterval.DAILY,
        start: Optional[date] = None,
        end: Optional[date] = None,
        limit: int = 2000,
    ) -> List[dict]:
        """Query klines.  Weekly/Monthly aggregated via SQL date_trunc."""
        cache = get_cache_service()
        cache_key = f"uteki:data:klines:{symbol}:{interval.value}:{start}:{end}:{limit}"

        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

        if interval == KlineInterval.DAILY:
            rows = await self._query_daily(symbol, start, end, limit)
        elif interval == KlineInterval.WEEKLY:
            rows = await self._query_aggregated(symbol, "week", start, end, limit)
        elif interval == KlineInterval.MONTHLY:
            rows = await self._query_aggregated(symbol, "month", start, end, limit)
        else:
            rows = []

        await cache.set(cache_key, rows, ttl=86400)
        return rows

    async def _query_daily(
        self, symbol: str, start: Optional[date], end: Optional[date], limit: int,
    ) -> List[dict]:
        async with db_manager.get_postgres_session() as session:
            stmt = select(KlineDaily).where(KlineDaily.symbol == symbol)
            if start:
                stmt = stmt.where(KlineDaily.time >= start)
            if end:
                stmt = stmt.where(KlineDaily.time <= end)
            stmt = stmt.order_by(KlineDaily.time.asc()).limit(limit)

            result = await session.execute(stmt)
            return [row.to_dict() for row in result.scalars().all()]

    async def _query_aggregated(
        self,
        symbol: str,
        trunc: str,  # 'week' or 'month'
        start: Optional[date],
        end: Optional[date],
        limit: int,
    ) -> List[dict]:
        """Aggregate daily klines into weekly/monthly using date_trunc."""
        async with db_manager.get_postgres_session() as session:
            conditions = ["symbol = :symbol"]
            params: dict = {"symbol": symbol, "limit": limit}

            if start:
                conditions.append("time >= :start")
                params["start"] = start
            if end:
                conditions.append("time <= :end")
                params["end"] = end

            where_clause = " AND ".join(conditions)

            sql = text(f"""
                SELECT
                    date_trunc('{trunc}', time)::date AS time,
                    symbol,
                    (array_agg(open ORDER BY time))[1] AS open,
                    max(high) AS high,
                    min(low) AS low,
                    (array_agg(close ORDER BY time DESC))[1] AS close,
                    sum(volume) AS volume,
                    (array_agg(adj_close ORDER BY time DESC))[1] AS adj_close,
                    sum(turnover) AS turnover
                FROM market_data.klines_daily
                WHERE {where_clause}
                GROUP BY date_trunc('{trunc}', time), symbol
                ORDER BY time ASC
                LIMIT :limit
            """)

            result = await session.execute(sql, params)
            rows = []
            for r in result.mappings().all():
                rows.append({
                    "time": r["time"].isoformat() if r["time"] else None,
                    "symbol": r["symbol"],
                    "symbol_id": None,
                    "open": float(r["open"]) if r["open"] is not None else None,
                    "high": float(r["high"]) if r["high"] is not None else None,
                    "low": float(r["low"]) if r["low"] is not None else None,
                    "close": float(r["close"]) if r["close"] is not None else None,
                    "volume": float(r["volume"]) if r["volume"] is not None else None,
                    "adj_close": float(r["adj_close"]) if r.get("adj_close") is not None else None,
                    "turnover": float(r["turnover"]) if r.get("turnover") is not None else None,
                    "source": None,
                    "quality": 0,
                })
            return rows


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_kline_service: Optional[KlineService] = None


def get_kline_service() -> KlineService:
    global _kline_service
    if _kline_service is None:
        _kline_service = KlineService()
    return _kline_service
