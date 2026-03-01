"""IngestionService — batch ingestion of K-line data from multiple providers."""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional
from uuid import uuid4

from sqlalchemy import select, text

from uteki.common.cache import get_cache_service
from uteki.common.database import db_manager
from uteki.domains.data.models import Symbol, KlineDaily, IngestionRun
from uteki.domains.data.providers.base import (
    AssetType, DataProvider, DataProviderFactory, KlineRow, PROVIDER_ROUTING,
)

logger = logging.getLogger(__name__)


class IngestionService:
    """Write-path: fetch klines from providers and upsert into TimescaleDB."""

    async def ingest_symbol(
        self,
        symbol_record: dict,
        start: Optional[date] = None,
        end: Optional[date] = None,
    ) -> Dict:
        """Ingest daily klines for a single symbol.

        Returns: {"symbol": ..., "inserted": N, "updated": N, "status": "success"|"failed"}
        """
        sym = symbol_record["symbol"]
        asset_type = symbol_record["asset_type"]
        symbol_id = symbol_record["id"]

        try:
            provider = DataProviderFactory.get_provider(AssetType(asset_type))
        except (ValueError, KeyError):
            logger.warning(f"No provider for {sym} (asset_type={asset_type})")
            return {"symbol": sym, "inserted": 0, "updated": 0, "status": "skipped"}

        # Determine start date: last date in DB + 1 day, or 5 years ago
        if start is None:
            start = await self._get_incremental_start(sym)

        try:
            rows = await provider.fetch_daily_klines(sym, start=start, end=end)
        except Exception as e:
            logger.error(f"Provider fetch failed for {sym}: {e}")
            return {"symbol": sym, "inserted": 0, "updated": 0, "status": "failed", "error": str(e)}

        if not rows:
            return {"symbol": sym, "inserted": 0, "updated": 0, "status": "success"}

        inserted, updated = await self._upsert_klines(
            rows, sym, symbol_id, provider.provider.value,
        )

        # Invalidate cache for this symbol
        cache = get_cache_service()
        await cache.delete_pattern(f"uteki:data:klines:{sym}:")

        return {"symbol": sym, "inserted": inserted, "updated": updated, "status": "success"}

    async def ingest_all(
        self,
        asset_types: Optional[List[str]] = None,
        symbols: Optional[List[str]] = None,
    ) -> Dict:
        """Ingest klines for all active symbols, optionally filtered.

        Returns: summary dict with per-symbol results.
        """
        symbol_records = await self._get_active_symbols(asset_types, symbols)
        if not symbol_records:
            return {"total": 0, "results": []}

        # Create ingestion run log
        run_id = str(uuid4())
        source = "multi"
        asset_type_str = ",".join(set(s["asset_type"] for s in symbol_records))

        await self._create_run_log(run_id, source, asset_type_str)

        results = []
        total_inserted = 0
        total_updated = 0
        total_failed = 0

        for sym_rec in symbol_records:
            result = await self.ingest_symbol(sym_rec)
            results.append(result)

            if result["status"] == "success":
                total_inserted += result.get("inserted", 0)
                total_updated += result.get("updated", 0)
            elif result["status"] == "failed":
                total_failed += 1

        # Finalize run log
        status = "success"
        if total_failed > 0 and total_failed < len(symbol_records):
            status = "partial_failure"
        elif total_failed == len(symbol_records):
            status = "failed"

        await self._finalize_run_log(
            run_id, status, total_inserted, total_updated, total_failed,
        )

        # Post-ingestion quality check
        quality_issues = 0
        try:
            from uteki.domains.data.validation.quality_checker import get_quality_checker
            checker = get_quality_checker()
            for sym_rec in symbol_records:
                issues = await checker.check_symbol(
                    sym_rec["symbol"], sym_rec["asset_type"], sym_rec["id"],
                    lookback_days=30,
                )
                quality_issues += len(issues)
            if quality_issues:
                logger.warning(f"Post-ingestion quality: {quality_issues} issue(s) across {len(symbol_records)} symbols")
        except Exception as e:
            logger.error(f"Post-ingestion quality check failed: {e}")

        return {
            "run_id": run_id,
            "total": len(symbol_records),
            "inserted": total_inserted,
            "updated": total_updated,
            "failed": total_failed,
            "status": status,
            "quality_issues": quality_issues,
            "results": results,
        }

    # ── Internal helpers ──

    async def _get_incremental_start(self, symbol: str) -> date:
        """Find last date in klines_daily for this symbol, return next day."""
        async with db_manager.get_postgres_session() as session:
            result = await session.execute(
                text("""
                    SELECT max(time) FROM market_data.klines_daily
                    WHERE symbol = :symbol
                """),
                {"symbol": symbol},
            )
            last_date = result.scalar()

        if last_date:
            return last_date + timedelta(days=1)
        return date.today() - timedelta(days=5 * 365)

    async def _upsert_klines(
        self,
        rows: List[KlineRow],
        symbol: str,
        symbol_id: str,
        source: str,
    ) -> tuple[int, int]:
        """Bulk upsert kline rows using PostgreSQL ON CONFLICT."""
        if not rows:
            return 0, 0

        async with db_manager.get_postgres_session() as session:
            values = []
            for r in rows:
                values.append({
                    "time": r.time,
                    "symbol": symbol,
                    "symbol_id": symbol_id,
                    "open": r.open,
                    "high": r.high,
                    "low": r.low,
                    "close": r.close,
                    "volume": r.volume,
                    "adj_close": r.adj_close,
                    "turnover": r.turnover,
                    "source": source,
                    "quality": 0,
                })

            # Use raw SQL for ON CONFLICT upsert (TimescaleDB hypertable)
            sql = text("""
                INSERT INTO market_data.klines_daily
                    (time, symbol, symbol_id, open, high, low, close,
                     volume, adj_close, turnover, source, quality)
                VALUES
                    (:time, :symbol, :symbol_id, :open, :high, :low, :close,
                     :volume, :adj_close, :turnover, :source, :quality)
                ON CONFLICT (time, symbol) DO UPDATE SET
                    open = EXCLUDED.open,
                    high = EXCLUDED.high,
                    low = EXCLUDED.low,
                    close = EXCLUDED.close,
                    volume = EXCLUDED.volume,
                    adj_close = EXCLUDED.adj_close,
                    turnover = EXCLUDED.turnover,
                    source = EXCLUDED.source
            """)

            # Execute in batches of 500
            inserted = 0
            batch_size = 500
            for i in range(0, len(values), batch_size):
                batch = values[i:i + batch_size]
                for v in batch:
                    await session.execute(sql, v)
                inserted += len(batch)

            logger.info(f"Upserted {inserted} kline rows for {symbol}")
            return inserted, 0  # PostgreSQL ON CONFLICT doesn't report update vs insert separately

    async def _get_active_symbols(
        self,
        asset_types: Optional[List[str]] = None,
        symbols: Optional[List[str]] = None,
    ) -> List[dict]:
        async with db_manager.get_postgres_session() as session:
            stmt = select(Symbol).where(Symbol.is_active.is_(True))
            if asset_types:
                stmt = stmt.where(Symbol.asset_type.in_(asset_types))
            if symbols:
                stmt = stmt.where(Symbol.symbol.in_(symbols))

            result = await session.execute(stmt)
            return [row.to_dict() for row in result.scalars().all()]

    async def _create_run_log(self, run_id: str, source: str, asset_type: str):
        async with db_manager.get_postgres_session() as session:
            run = IngestionRun(
                id=run_id,
                source=source,
                asset_type=asset_type,
            )
            session.add(run)

    async def _finalize_run_log(
        self,
        run_id: str,
        status: str,
        inserted: int,
        updated: int,
        failed: int,
    ):
        async with db_manager.get_postgres_session() as session:
            stmt = select(IngestionRun).where(IngestionRun.id == run_id)
            result = await session.execute(stmt)
            run = result.scalar_one_or_none()
            if run:
                run.finished_at = datetime.now(timezone.utc)
                run.records_inserted = inserted
                run.records_updated = updated
                run.records_failed = failed
                run.status = status

    async def get_recent_runs(self, limit: int = 20) -> List[dict]:
        async with db_manager.get_postgres_session() as session:
            stmt = (
                select(IngestionRun)
                .order_by(IngestionRun.started_at.desc())
                .limit(limit)
            )
            result = await session.execute(stmt)
            return [run.to_dict() for run in result.scalars().all()]


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_ingestion_service: Optional[IngestionService] = None


def get_ingestion_service() -> IngestionService:
    global _ingestion_service
    if _ingestion_service is None:
        _ingestion_service = IngestionService()
    return _ingestion_service
