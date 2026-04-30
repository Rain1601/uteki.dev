"""DataPoint — canonical schema for any traceable data fact in an analysis run.

Every numeric value, segment metric, market-share figure, or qualitative claim
that the LLM should be able to cite must be wrapped in a DataPoint and
registered in the run's SourceCatalog. The catalog assigns a stable integer
`id`; the LLM uses that id in `[src:N]` markers within its output.

Design principles:
- The schema captures BOTH "when we fetched" (`fetched_at`) and "when the
  source published" (`published_at`). Confusing the two is the bug we're
  trying to prevent.
- `derived_from` lets computed values (e.g. fcf_margin = fcf / revenue) carry
  a chain back to their primary sources, so a Phase γ backtest can verify
  every leaf is on or before the as-of date.
- `confidence` is set by the fetcher, not the LLM: e.g. yfinance/SEC filings
  default to "high"; web-search snippets without a published_at default to
  "low" because we can't time-bound them.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

SourceType = Literal[
    "yfinance",       # ticker.info, financial statements
    "fmp",            # Financial Modeling Prep API
    "sec_edgar",      # 10-K / 10-Q filings
    "google_cse",     # web search result with snippet
    "computed",       # derived from other DataPoints
    "company_data",   # the prompt-injected company profile (legacy)
]

ConfidenceLevel = Literal["high", "medium", "low"]


class DataPoint(BaseModel):
    """A single piece of data with full provenance metadata."""

    id: int = Field(..., description="1-indexed within an analysis run; assigned by SourceCatalog")
    key: str = Field(..., description="Stable name like 'revenue_growth_yoy' or 'tsmc_market_share_2024'")
    value: Any = Field(..., description="The actual data — number, string, dict, or list")

    source_type: SourceType
    source_url: Optional[str] = Field(None, description="Canonical URL if web/API; None for computed")
    publisher: Optional[str] = Field(None, description="'Yahoo Finance', 'reuters.com', 'SEC EDGAR', etc.")

    # The two timestamps must NOT be confused.
    published_at: Optional[str] = Field(
        None, description="ISO timestamp the source itself reports as publication date"
    )
    fetched_at: str = Field(..., description="ISO timestamp when WE fetched the data")

    # Phase γ — backtesting anchor. None in Phase 0/β.
    as_of: Optional[str] = Field(
        None, description="ISO date the run is anchored to. Validates published_at <= as_of."
    )

    derived_from: list[int] = Field(
        default_factory=list,
        description="For computed source_type: list of catalog IDs whose values feed this one",
    )

    confidence: ConfidenceLevel = Field(
        "medium",
        description="Set by the fetcher. high=primary source, medium=secondary, low=unverified snippet",
    )

    excerpt: Optional[str] = Field(
        None,
        max_length=400,
        description="Verbatim snippet (≤400 chars) of source text supporting the value",
    )

    # ── helpers ──

    def is_grounded(self) -> bool:
        """True iff this DataPoint has a verifiable trail (URL or filing reference)."""
        if self.source_type in ("yfinance", "fmp", "sec_edgar", "google_cse"):
            return bool(self.source_url) or bool(self.publisher)
        if self.source_type == "computed":
            return bool(self.derived_from)
        return False

    def short_label(self) -> str:
        """Compact human-readable label for catalog listings, e.g.
        '[7] reuters.com (2024-03-15) — TSMC market share'."""
        pub_part = f" ({self.published_at[:10]})" if self.published_at else ""
        publisher = self.publisher or self.source_type
        return f"[{self.id}] {publisher}{pub_part} — {self.key}"
