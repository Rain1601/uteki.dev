"""Pydantic schemas for the Market Data domain."""

from datetime import date, datetime
from typing import Optional, List
from enum import Enum

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class AssetType(str, Enum):
    US_STOCK = "us_stock"
    US_ETF = "us_etf"
    CRYPTO = "crypto"
    FOREX = "forex"
    HK_STOCK = "hk_stock"
    A_SHARE = "a_share"
    FUTURES = "futures"


class KlineInterval(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


# ---------------------------------------------------------------------------
# Symbol schemas
# ---------------------------------------------------------------------------

class SymbolCreate(BaseModel):
    symbol: str = Field(..., max_length=30)
    name: Optional[str] = Field(None, max_length=200)
    asset_type: AssetType
    exchange: Optional[str] = Field(None, max_length=30)
    currency: str = Field("USD", max_length=10)
    timezone: str = Field("America/New_York", max_length=40)
    data_source: Optional[str] = Field(None, max_length=20)
    is_active: bool = True
    metadata: Optional[dict] = None


class SymbolResponse(BaseModel):
    id: str
    symbol: str
    name: Optional[str] = None
    asset_type: str
    exchange: Optional[str] = None
    currency: str
    timezone: str
    data_source: Optional[str] = None
    is_active: bool
    metadata: Optional[dict] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SymbolListResponse(BaseModel):
    symbols: List[SymbolResponse]
    total: int


# ---------------------------------------------------------------------------
# K-line schemas
# ---------------------------------------------------------------------------

class KlineRecord(BaseModel):
    time: date
    symbol: str
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: Optional[float] = None
    volume: Optional[float] = None
    adj_close: Optional[float] = None
    turnover: Optional[float] = None
    source: Optional[str] = None
    quality: int = 0


class KlineResponse(BaseModel):
    symbol: str
    interval: str
    data: List[KlineRecord]
    total: int


# ---------------------------------------------------------------------------
# Ingestion schemas
# ---------------------------------------------------------------------------

class IngestionTriggerRequest(BaseModel):
    asset_types: Optional[List[AssetType]] = None  # None = all types
    symbols: Optional[List[str]] = None  # None = all active symbols


class IngestionRunResponse(BaseModel):
    id: str
    source: str
    asset_type: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    records_inserted: int = 0
    records_updated: int = 0
    records_failed: int = 0
    status: str
    error_message: Optional[str] = None


class IngestionStatusResponse(BaseModel):
    runs: List[IngestionRunResponse]
    total: int


# ---------------------------------------------------------------------------
# Quality report
# ---------------------------------------------------------------------------

class QualityIssue(BaseModel):
    id: str
    symbol: str
    check_date: date
    issue_type: str
    severity: str
    details: Optional[dict] = None
    resolved: bool


class QualityReportResponse(BaseModel):
    issues: List[QualityIssue]
    total: int
    unresolved: int
