"""指数投资智能体 — Pydantic 请求/响应模型"""

from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from datetime import datetime


# ── Watchlist ──

class WatchlistAddRequest(BaseModel):
    symbol: str = Field(..., description="ETF symbol, e.g. VOO")
    name: Optional[str] = Field(None, description="Display name")
    etf_type: Optional[str] = Field(None, description="ETF type, e.g. broad_market / sector")


class WatchlistItem(BaseModel):
    id: str
    symbol: str
    name: Optional[str] = None
    etf_type: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None


# ── Quotes & History ──

class QuoteResponse(BaseModel):
    symbol: str
    price: Optional[float] = None
    change_pct: Optional[float] = None
    pe_ratio: Optional[float] = None
    market_cap: Optional[float] = None
    volume: Optional[int] = None
    high_52w: Optional[float] = None
    low_52w: Optional[float] = None
    ma50: Optional[float] = None
    ma200: Optional[float] = None
    rsi: Optional[float] = None
    timestamp: Optional[str] = None
    stale: bool = False


class PricePoint(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int


# ── Backtest ──

class BacktestRequest(BaseModel):
    symbol: str = Field(..., description="ETF symbol")
    start: str = Field(..., description="Start date YYYY-MM")
    end: str = Field(..., description="End date YYYY-MM")
    initial_capital: float = Field(10000, gt=0)
    monthly_dca: float = Field(0, ge=0)


class BacktestCompareRequest(BaseModel):
    symbols: List[str] = Field(..., min_length=1, max_length=10)
    start: str
    end: str
    initial_capital: float = Field(10000, gt=0)
    monthly_dca: float = Field(0, ge=0)


class BacktestResult(BaseModel):
    symbol: str
    total_return_pct: float
    annualized_return_pct: float
    max_drawdown_pct: float
    sharpe_ratio: float
    final_value: float
    total_invested: float
    monthly_values: List[Dict[str, Any]]


# ── System Prompt ──

class PromptUpdateRequest(BaseModel):
    content: str = Field(..., min_length=10)
    description: str = Field(..., min_length=1, description="Change description")


class PromptVersionResponse(BaseModel):
    id: str
    version: str
    content: str
    description: str
    is_current: bool
    created_at: Optional[datetime] = None


# ── Memory ──

class MemoryWriteRequest(BaseModel):
    category: str = Field(..., description="decision / reflection / experience / observation")
    content: str = Field(..., min_length=1)
    metadata: Optional[Dict[str, Any]] = None


class MemoryResponse(BaseModel):
    id: str
    category: str
    content: str
    metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None


# ── Arena ──

class ArenaRunRequest(BaseModel):
    harness_type: str = Field("monthly_dca", description="monthly_dca / rebalance / weekly_check")
    budget: Optional[float] = Field(None, gt=0)
    constraints: Optional[Dict[str, Any]] = None


class ModelIOSummary(BaseModel):
    id: str
    model_provider: str
    model_name: str
    action: Optional[str] = None
    confidence: Optional[float] = None
    allocations: Optional[List[Dict[str, Any]]] = None
    reasoning: Optional[str] = None
    latency_ms: Optional[int] = None
    cost_usd: Optional[float] = None
    parse_status: Optional[str] = None


class ArenaResultResponse(BaseModel):
    harness_id: str
    harness_type: str
    prompt_version: str
    created_at: Optional[datetime] = None
    models: List[ModelIOSummary]


# ── Decision ──

class DecisionAdoptRequest(BaseModel):
    model_io_id: str = Field(..., description="ID of the model_io to adopt")


class DecisionApproveRequest(BaseModel):
    totp_code: str = Field(..., min_length=6, max_length=6)
    allocations: Optional[List[Dict[str, Any]]] = None
    notes: Optional[str] = None


class DecisionSkipRequest(BaseModel):
    notes: Optional[str] = None


class DecisionRejectRequest(BaseModel):
    notes: Optional[str] = None


# ── Agent Chat ──

class AgentChatRequest(BaseModel):
    message: str = Field(..., min_length=1)


class AgentChatResponse(BaseModel):
    response: str
    tool_calls: Optional[List[Dict[str, Any]]] = None
    decision_card: Optional[Dict[str, Any]] = None


# ── Schedule ──

class ScheduleCreateRequest(BaseModel):
    name: str = Field(..., min_length=1)
    cron_expression: str = Field(..., description="Cron expression, e.g. '0 9 1 * *'")
    task_type: str = Field(..., description="arena_analysis / reflection")
    config: Optional[Dict[str, Any]] = None


class ScheduleUpdateRequest(BaseModel):
    cron_expression: Optional[str] = None
    is_enabled: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None


class ScheduleResponse(BaseModel):
    id: str
    name: str
    cron_expression: str
    task_type: str
    config: Optional[Dict[str, Any]] = None
    is_enabled: bool
    last_run_at: Optional[datetime] = None
    last_run_status: Optional[str] = None
    next_run_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


# ── Generic ──

class IndexResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    message: Optional[str] = None
