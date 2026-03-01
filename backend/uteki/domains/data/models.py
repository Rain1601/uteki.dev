"""Market Data domain — SQLAlchemy models.

Tables live in the ``market_data`` schema.  ``klines_daily`` is a TimescaleDB
hypertable (created via init-postgres.sql), but from SQLAlchemy's perspective
it is just a regular table.
"""

from datetime import date as date_type, datetime
from typing import Optional

from sqlalchemy import (
    Boolean, Date, DateTime, Index, Integer, Numeric, SmallInteger,
    String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, get_table_args

SCHEMA = "market_data"


# ---------------------------------------------------------------------------
# Symbol registry
# ---------------------------------------------------------------------------

class Symbol(Base):
    """Unified symbol registry for all asset types."""

    __tablename__ = "symbols"
    __table_args__ = get_table_args(
        UniqueConstraint("symbol", "asset_type", name="uq_symbol_asset_type"),
        Index("idx_symbols_asset_type", "asset_type"),
        Index("idx_symbols_active", "is_active"),
        schema=SCHEMA,
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True,
        server_default=func.gen_random_uuid().cast(String),
    )
    symbol: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    asset_type: Mapped[str] = mapped_column(String(20), nullable=False)
    exchange: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), server_default="USD")
    timezone: Mapped[str] = mapped_column(String(40), server_default="America/New_York")
    data_source: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    metadata_: Mapped[Optional[dict]] = mapped_column(
        "metadata", JSONB, server_default="{}",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "name": self.name,
            "asset_type": self.asset_type,
            "exchange": self.exchange,
            "currency": self.currency,
            "timezone": self.timezone,
            "data_source": self.data_source,
            "is_active": self.is_active,
            "metadata": self.metadata_,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ---------------------------------------------------------------------------
# Daily K-line (TimescaleDB hypertable)
# ---------------------------------------------------------------------------

class KlineDaily(Base):
    """Daily OHLCV data — TimescaleDB hypertable with composite PK (time, symbol)."""

    __tablename__ = "klines_daily"
    __table_args__ = get_table_args(
        Index("idx_klines_daily_symbol", "symbol", "time"),
        Index("idx_klines_daily_symbol_id", "symbol_id", "time"),
        schema=SCHEMA,
    )

    time: Mapped[date_type] = mapped_column(Date, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(30), primary_key=True)
    symbol_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    open: Mapped[Optional[float]] = mapped_column(Numeric(18, 8), nullable=True)
    high: Mapped[Optional[float]] = mapped_column(Numeric(18, 8), nullable=True)
    low: Mapped[Optional[float]] = mapped_column(Numeric(18, 8), nullable=True)
    close: Mapped[Optional[float]] = mapped_column(Numeric(18, 8), nullable=True)
    volume: Mapped[Optional[float]] = mapped_column(Numeric(24, 4), nullable=True)
    adj_close: Mapped[Optional[float]] = mapped_column(Numeric(18, 8), nullable=True)
    turnover: Mapped[Optional[float]] = mapped_column(Numeric(24, 4), nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    quality: Mapped[int] = mapped_column(SmallInteger, server_default="0")

    def to_dict(self) -> dict:
        return {
            "time": self.time.isoformat() if self.time else None,
            "symbol": self.symbol,
            "symbol_id": self.symbol_id,
            "open": float(self.open) if self.open is not None else None,
            "high": float(self.high) if self.high is not None else None,
            "low": float(self.low) if self.low is not None else None,
            "close": float(self.close) if self.close is not None else None,
            "volume": float(self.volume) if self.volume is not None else None,
            "adj_close": float(self.adj_close) if self.adj_close is not None else None,
            "turnover": float(self.turnover) if self.turnover is not None else None,
            "source": self.source,
            "quality": self.quality,
        }


# ---------------------------------------------------------------------------
# Data quality log
# ---------------------------------------------------------------------------

class DataQualityLog(Base):
    """Tracks data quality issues (gaps, anomalies, splits, stale data)."""

    __tablename__ = "data_quality_log"
    __table_args__ = get_table_args(
        Index("idx_quality_log_symbol", "symbol", "check_date"),
        Index("idx_quality_log_unresolved", "resolved"),
        schema=SCHEMA,
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True,
        server_default=func.gen_random_uuid().cast(String),
    )
    symbol: Mapped[str] = mapped_column(String(30), nullable=False)
    symbol_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    check_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    issue_type: Mapped[str] = mapped_column(String(30), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), server_default="info")
    details: Mapped[Optional[dict]] = mapped_column(JSONB, server_default="{}")
    resolved: Mapped[bool] = mapped_column(Boolean, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "check_date": self.check_date.isoformat() if self.check_date else None,
            "issue_type": self.issue_type,
            "severity": self.severity,
            "details": self.details,
            "resolved": self.resolved,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------------------------------------------------------------------------
# Ingestion run log
# ---------------------------------------------------------------------------

class IngestionRun(Base):
    """Tracks each data ingestion execution."""

    __tablename__ = "ingestion_runs"
    __table_args__ = get_table_args(
        Index("idx_ingestion_runs_status", "status", "started_at"),
        schema=SCHEMA,
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True,
        server_default=func.gen_random_uuid().cast(String),
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(200), nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    records_inserted: Mapped[int] = mapped_column(Integer, server_default="0")
    records_updated: Mapped[int] = mapped_column(Integer, server_default="0")
    records_failed: Mapped[int] = mapped_column(Integer, server_default="0")
    status: Mapped[str] = mapped_column(String(20), server_default="running")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column(
        "metadata", JSONB, server_default="{}",
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "source": self.source,
            "asset_type": self.asset_type,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "records_inserted": self.records_inserted,
            "records_updated": self.records_updated,
            "records_failed": self.records_failed,
            "status": self.status,
            "error_message": self.error_message,
            "metadata": self.metadata_,
        }
