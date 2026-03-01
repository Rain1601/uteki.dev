"""Market Data REST API router — /api/data endpoints."""

import logging
from datetime import date
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Header, Query, BackgroundTasks

from uteki.common.config import settings
from uteki.common.database import db_manager
from uteki.domains.data.schemas import (
    AssetType,
    IngestionRunResponse,
    IngestionStatusResponse,
    IngestionTriggerRequest,
    KlineInterval,
    KlineRecord,
    KlineResponse,
    SymbolCreate,
    SymbolListResponse,
    SymbolResponse,
)
from uteki.domains.data.service import get_kline_service
from uteki.domains.data.ingestion_service import get_ingestion_service

logger = logging.getLogger(__name__)

router = APIRouter()


def _verify_cron_secret(x_cron_secret: Optional[str] = Header(None)):
    """Verify the shared secret for pg_cron / scheduled calls."""
    expected = settings.secret_key
    if x_cron_secret != expected:
        raise HTTPException(status_code=403, detail="Invalid cron secret")


@router.get("/debug")
async def debug_data():
    """Debug: check market_data schema and tables."""
    from sqlalchemy import text
    info = {"schema_exists": False, "tables": [], "error": None, "db_type": settings.database_type}
    try:
        async with db_manager.get_postgres_session() as session:
            # Check schema
            r = await session.execute(text(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name = 'market_data'"
            ))
            info["schema_exists"] = r.scalar() is not None

            # Check tables
            r = await session.execute(text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'market_data'"
            ))
            info["tables"] = [row[0] for row in r.fetchall()]

            # List all schemas for reference
            r = await session.execute(text(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')"
            ))
            info["all_schemas"] = [row[0] for row in r.fetchall()]
    except Exception as e:
        info["error"] = str(e)
    return info


@router.post("/setup")
async def setup_market_data():
    """Create market_data schema and tables if they don't exist."""
    from sqlalchemy import text
    from uteki.domains.data.models import Symbol, KlineDaily, DataQualityLog, IngestionRun
    from uteki.common.base import Base

    results = {"steps": []}
    try:
        async with db_manager.postgres_engine.begin() as conn:
            # Create schema
            await conn.execute(text("CREATE SCHEMA IF NOT EXISTS market_data"))
            results["steps"].append("schema created")

            # Create tables
            await conn.run_sync(Base.metadata.create_all)
            results["steps"].append("tables created")

        # Verify
        async with db_manager.get_postgres_session() as session:
            r = await session.execute(text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'market_data'"
            ))
            results["tables"] = [row[0] for row in r.fetchall()]
            results["status"] = "ok"
    except Exception as e:
        results["error"] = str(e)
        results["status"] = "failed"
    return results


# ============================================================================
# Symbol management
# ============================================================================

@router.get("/symbols", response_model=SymbolListResponse)
async def list_symbols(
    asset_type: Optional[str] = Query(None, description="Filter by asset type"),
    active_only: bool = Query(True, description="Only return active symbols"),
):
    """List all tracked symbols."""
    svc = get_kline_service()
    symbols = await svc.list_symbols(asset_type=asset_type, active_only=active_only)
    return SymbolListResponse(symbols=symbols, total=len(symbols))


@router.post("/symbols", response_model=SymbolResponse)
async def add_symbol(
    body: SymbolCreate,
    background_tasks: BackgroundTasks,
):
    """Add a symbol to tracking. Triggers initial data load in background."""
    svc = get_kline_service()
    sym = await svc.add_symbol(
        symbol=body.symbol,
        asset_type=body.asset_type.value,
        name=body.name,
        exchange=body.exchange,
        currency=body.currency,
        timezone=body.timezone,
        data_source=body.data_source,
        metadata=body.metadata,
    )

    # Trigger initial data ingestion in background
    background_tasks.add_task(_ingest_symbol_background, sym)

    return sym


@router.delete("/symbols/{symbol_id}")
async def remove_symbol(symbol_id: str):
    """Deactivate a symbol (soft delete, data preserved)."""
    svc = get_kline_service()
    removed = await svc.remove_symbol(symbol_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Symbol not found")
    return {"status": "ok", "message": "Symbol deactivated"}


# ============================================================================
# K-line queries
# ============================================================================

@router.get("/klines/{symbol}", response_model=KlineResponse)
async def get_klines(
    symbol: str,
    interval: KlineInterval = Query(KlineInterval.DAILY, description="daily|weekly|monthly"),
    start: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    limit: int = Query(2000, ge=1, le=10000),
):
    """Query K-line data for a symbol."""
    svc = get_kline_service()
    rows = await svc.get_klines(
        symbol=symbol,
        interval=interval,
        start=start,
        end=end,
        limit=limit,
    )
    return KlineResponse(
        symbol=symbol,
        interval=interval.value,
        data=rows,
        total=len(rows),
    )


@router.get("/klines/batch", response_model=dict)
async def get_klines_batch(
    symbols: str = Query(..., description="Comma-separated symbols (e.g. VOO,QQQ,AAPL)"),
    interval: KlineInterval = Query(KlineInterval.DAILY),
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    limit: int = Query(500, ge=1, le=5000),
):
    """Batch query K-lines for multiple symbols."""
    svc = get_kline_service()
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]

    results = {}
    for sym in symbol_list:
        rows = await svc.get_klines(
            symbol=sym, interval=interval, start=start, end=end, limit=limit,
        )
        results[sym] = rows

    return {"data": results, "symbols": symbol_list}


# ============================================================================
# Ingestion control
# ============================================================================

@router.post("/ingestion/trigger")
async def trigger_ingestion(
    body: Optional[IngestionTriggerRequest] = None,
    background_tasks: BackgroundTasks = None,
    x_cron_secret: Optional[str] = Header(None),
):
    """Trigger data ingestion. Requires X-Cron-Secret header."""
    _verify_cron_secret(x_cron_secret)

    asset_types = None
    symbols = None
    if body:
        asset_types = [at.value for at in body.asset_types] if body.asset_types else None
        symbols = body.symbols

    # Run ingestion in background
    background_tasks.add_task(_run_ingestion_background, asset_types, symbols)

    return {"status": "triggered", "message": "Ingestion started in background"}


@router.get("/ingestion/status", response_model=IngestionStatusResponse)
async def get_ingestion_status(
    limit: int = Query(20, ge=1, le=100),
):
    """Get recent ingestion run status."""
    svc = get_ingestion_service()
    runs = await svc.get_recent_runs(limit=limit)
    return IngestionStatusResponse(runs=runs, total=len(runs))


# ============================================================================
# Data quality & freshness
# ============================================================================

@router.get("/quality/freshness")
async def get_freshness_report():
    """Check data freshness for all tracked symbols.

    Returns per-symbol status: ok / stale / warning / error / no_data.
    No auth required — read-only diagnostic.
    """
    from uteki.domains.data.validation.quality_checker import get_quality_checker
    checker = get_quality_checker()
    report = await checker.freshness_report()

    ok = sum(1 for r in report if r["status"] == "ok")
    stale = sum(1 for r in report if r["status"] in ("stale", "warning"))
    error = sum(1 for r in report if r["status"] in ("error", "no_data"))

    return {
        "summary": {"total": len(report), "ok": ok, "stale": stale, "error": error},
        "symbols": report,
    }


@router.post("/quality/check")
async def run_quality_check(
    background_tasks: BackgroundTasks,
    x_cron_secret: Optional[str] = Header(None),
    lookback_days: int = Query(90, ge=7, le=365),
):
    """Trigger full quality check on all symbols. Requires X-Cron-Secret."""
    _verify_cron_secret(x_cron_secret)
    background_tasks.add_task(_run_quality_check_background, lookback_days)
    return {"status": "triggered", "message": "Quality check started in background"}


@router.get("/quality/issues")
async def get_quality_issues(
    symbol: Optional[str] = Query(None),
    severity: Optional[str] = Query(None, description="info|warning|error"),
    unresolved_only: bool = Query(True),
    limit: int = Query(50, ge=1, le=200),
):
    """Get recent data quality issues."""
    from uteki.domains.data.models import DataQualityLog
    from sqlalchemy import select

    async with db_manager.get_postgres_session() as session:
        stmt = select(DataQualityLog).order_by(DataQualityLog.created_at.desc())
        if symbol:
            stmt = stmt.where(DataQualityLog.symbol == symbol)
        if severity:
            stmt = stmt.where(DataQualityLog.severity == severity)
        if unresolved_only:
            stmt = stmt.where(DataQualityLog.resolved.is_(False))
        stmt = stmt.limit(limit)

        result = await session.execute(stmt)
        issues = [row.to_dict() for row in result.scalars().all()]

    return {"issues": issues, "total": len(issues)}


async def _run_quality_check_background(lookback_days: int):
    """Background: run full quality check."""
    try:
        from uteki.domains.data.validation.quality_checker import get_quality_checker
        checker = get_quality_checker()
        result = await checker.check_all(lookback_days=lookback_days)
        logger.info(
            f"Quality check completed: {result['summary']['total_issues']} issues "
            f"across {result['summary']['total_symbols']} symbols"
        )
    except Exception as e:
        logger.error(f"Quality check failed: {e}")


# ============================================================================
# Background task helpers
# ============================================================================

async def _ingest_symbol_background(sym: dict):
    """Background: ingest klines for a newly added symbol."""
    try:
        svc = get_ingestion_service()
        result = await svc.ingest_symbol(sym)
        logger.info(f"Background ingest for {sym['symbol']}: {result}")
    except Exception as e:
        logger.error(f"Background ingest failed for {sym.get('symbol')}: {e}")


async def _run_ingestion_background(
    asset_types: Optional[List[str]], symbols: Optional[List[str]],
):
    """Background: run full ingestion."""
    try:
        svc = get_ingestion_service()
        result = await svc.ingest_all(asset_types=asset_types, symbols=symbols)
        logger.info(f"Background ingestion completed: {result.get('status')}")
    except Exception as e:
        logger.error(f"Background ingestion failed: {e}")


# ============================================================================
# Seed default symbols
# ============================================================================

# Representative symbols across asset types
DEFAULT_SYMBOLS = [
    # US ETFs (from existing watchlist)
    {"symbol": "VOO", "name": "Vanguard S&P 500 ETF", "asset_type": "us_etf", "exchange": "NYSE", "data_source": "yfinance"},
    {"symbol": "IVV", "name": "iShares Core S&P 500 ETF", "asset_type": "us_etf", "exchange": "NYSE", "data_source": "yfinance"},
    {"symbol": "QQQ", "name": "Invesco QQQ Trust", "asset_type": "us_etf", "exchange": "NASDAQ", "data_source": "yfinance"},
    {"symbol": "ACWI", "name": "iShares MSCI ACWI ETF", "asset_type": "us_etf", "exchange": "NASDAQ", "data_source": "yfinance"},
    {"symbol": "VGT", "name": "Vanguard Information Technology ETF", "asset_type": "us_etf", "exchange": "NYSE", "data_source": "yfinance"},
    # US Stocks
    {"symbol": "AAPL", "name": "Apple Inc.", "asset_type": "us_stock", "exchange": "NASDAQ", "data_source": "yfinance"},
    {"symbol": "MSFT", "name": "Microsoft Corporation", "asset_type": "us_stock", "exchange": "NASDAQ", "data_source": "yfinance"},
    {"symbol": "NVDA", "name": "NVIDIA Corporation", "asset_type": "us_stock", "exchange": "NASDAQ", "data_source": "yfinance"},
    {"symbol": "GOOGL", "name": "Alphabet Inc.", "asset_type": "us_stock", "exchange": "NASDAQ", "data_source": "yfinance"},
    {"symbol": "AMZN", "name": "Amazon.com Inc.", "asset_type": "us_stock", "exchange": "NASDAQ", "data_source": "yfinance"},
    {"symbol": "TSLA", "name": "Tesla Inc.", "asset_type": "us_stock", "exchange": "NASDAQ", "data_source": "yfinance"},
    {"symbol": "META", "name": "Meta Platforms Inc.", "asset_type": "us_stock", "exchange": "NASDAQ", "data_source": "yfinance"},
    # Crypto
    {"symbol": "BTC-USD", "name": "Bitcoin USD", "asset_type": "crypto", "exchange": "CRYPTO", "currency": "USD", "data_source": "yfinance"},
    {"symbol": "ETH-USD", "name": "Ethereum USD", "asset_type": "crypto", "exchange": "CRYPTO", "currency": "USD", "data_source": "yfinance"},
    # Forex
    {"symbol": "EURUSD=X", "name": "EUR/USD", "asset_type": "forex", "exchange": "FOREX", "currency": "USD", "data_source": "yfinance"},
    {"symbol": "USDJPY=X", "name": "USD/JPY", "asset_type": "forex", "exchange": "FOREX", "currency": "JPY", "data_source": "yfinance"},
    # Futures
    {"symbol": "GC=F", "name": "Gold Futures", "asset_type": "futures", "exchange": "COMEX", "currency": "USD", "data_source": "yfinance"},
    {"symbol": "CL=F", "name": "Crude Oil Futures", "asset_type": "futures", "exchange": "NYMEX", "currency": "USD", "data_source": "yfinance"},
    # HK Stocks
    {"symbol": "0700.HK", "name": "Tencent Holdings", "asset_type": "hk_stock", "exchange": "HKEX", "currency": "HKD", "timezone": "Asia/Hong_Kong", "data_source": "yfinance"},
    {"symbol": "9988.HK", "name": "Alibaba Group", "asset_type": "hk_stock", "exchange": "HKEX", "currency": "HKD", "timezone": "Asia/Hong_Kong", "data_source": "yfinance"},
]


@router.post("/symbols/seed")
async def seed_default_symbols(
    x_cron_secret: Optional[str] = Header(None),
):
    """Seed default symbols across all asset types. Requires X-Cron-Secret header."""
    _verify_cron_secret(x_cron_secret)

    svc = get_kline_service()
    added = []
    skipped = []

    for s in DEFAULT_SYMBOLS:
        sym = await svc.add_symbol(
            symbol=s["symbol"],
            asset_type=s["asset_type"],
            name=s.get("name"),
            exchange=s.get("exchange"),
            currency=s.get("currency", "USD"),
            timezone=s.get("timezone", "America/New_York"),
            data_source=s.get("data_source"),
        )
        if sym.get("symbol") == s["symbol"].upper():
            added.append(s["symbol"])
        else:
            skipped.append(s["symbol"])

    return {
        "status": "ok",
        "added": len(added),
        "skipped": len(skipped),
        "symbols": added,
    }
