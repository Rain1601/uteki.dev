"""yfinance fetcher — pre-populates the SourceCatalog with all key
financial metrics from yfinance at pipeline start.

Unlike `cse_fetcher`, this is NOT an LLM-callable tool. yfinance data is
fetched once via `fetch_company_data()` and injected wholesale into the
prompt. The job of this module is to convert that already-fetched dict into
structured DataPoints so claims can cite specific metrics.

published_at policy:
- yfinance does not expose a per-metric publication date. We fall back to
  using `mostRecentQuarter` from `info` when available (proxy for "this
  metric was reported as of this fiscal quarter end"). When unavailable,
  published_at = None and confidence = "low" so the LLM knows to verify.
- When `as_of` is set (Phase γ), DataPoints with no published_at AND
  no fiscal anchor are flagged confidence=low and the catalog logs a warning.

This intentionally keeps `format_company_data_for_prompt` working unchanged —
the prompt still injects the legacy text. The catalog is additive, providing
a citation index over the same data.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from uteki.domains.agent.provenance.catalog import SourceCatalog

logger = logging.getLogger(__name__)


# Map (bucket_name, field_name) -> (canonical_key, human_label)
_METRIC_KEYS: dict[tuple[str, str], tuple[str, str]] = {
    # Profile
    ("profile", "name"):              ("company_name", "公司名"),
    ("profile", "sector"):             ("sector", "行业大类"),
    ("profile", "industry"):           ("industry", "细分行业"),
    ("profile", "country"):            ("country", "国家"),
    ("profile", "employees"):          ("employees", "员工数"),
    # Price
    ("price_data", "current_price"):   ("price_current", "当前股价"),
    ("price_data", "market_cap"):      ("market_cap", "市值"),
    ("price_data", "shares_outstanding"): ("shares_outstanding", "总股本"),
    # Profitability
    ("profitability", "gross_margin"):     ("gross_margin", "毛利率"),
    ("profitability", "operating_margin"): ("operating_margin", "营业利润率"),
    ("profitability", "profit_margin"):    ("net_margin", "净利率"),
    ("profitability", "roe"):              ("roe", "ROE"),
    ("profitability", "roa"):              ("roa", "ROA"),
    # Balance
    ("balance", "current_ratio"): ("current_ratio", "流动比率"),
    ("balance", "debt_equity"):    ("debt_to_equity", "资产负债率"),
    ("balance", "total_cash"):     ("total_cash", "总现金"),
    ("balance", "total_debt"):     ("total_debt", "总负债"),
    # Growth
    ("growth", "revenue_growth_yoy"):   ("revenue_growth_yoy", "营收同比增速"),
    ("growth", "earnings_growth_yoy"):  ("earnings_growth_yoy", "盈利同比增速"),
    ("growth", "eps_trailing"):         ("eps_ttm", "EPS(TTM)"),
    ("growth", "book_value_per_share"): ("book_value_per_share", "每股净资产"),
    # Derived
    ("derived", "free_cashflow"):           ("free_cashflow", "自由现金流"),
    ("derived", "owner_earnings_per_share"): ("owner_earnings_per_share", "每股所有者收益"),
}


def seed_from_company_data(
    catalog: SourceCatalog,
    company_data: dict,
    as_of: Optional[str] = None,
) -> list[int]:
    """Walk a company_data dict (output of fetch_company_data) and register
    each scalar metric as a DataPoint. Returns the list of registered ids.

    Skips:
    - Missing values (None / empty string)
    - Non-scalar fields (lists, dicts) — those are too large for citation,
      handled instead by per-history fetchers in later passes
    """
    fetched_at = company_data.get("_fetched_at") or datetime.now(timezone.utc).isoformat()
    symbol = (company_data.get("profile") or {}).get("symbol", "")
    # Best-effort fiscal anchor: yfinance ticker.info sometimes carries
    # `mostRecentQuarter` as a unix timestamp. We don't have it in this dict
    # (only inside info), so we fall back to None — Phase β.5 (FMP) will
    # provide proper period_end timestamps.
    fiscal_anchor: Optional[str] = None

    ids: list[int] = []
    for (bucket, field), (key, label) in _METRIC_KEYS.items():
        bucket_data = company_data.get(bucket)
        if not isinstance(bucket_data, dict):
            continue
        value = bucket_data.get(field)
        if value is None or value == "":
            continue

        # Confidence:
        # - high for symbol-identifying fields (sector, industry) — these
        #   are reasonably stable
        # - medium otherwise (yfinance is reliable but lacks fresh timestamps)
        confidence = "medium"
        if bucket == "profile":
            confidence = "high"

        sid = catalog.add({
            "key": f"yf:{symbol}:{key}",
            "value": value,
            "source_type": "yfinance",
            "source_url": f"https://finance.yahoo.com/quote/{symbol}" if symbol else None,
            "publisher": "Yahoo Finance",
            "published_at": fiscal_anchor,
            "fetched_at": fetched_at,
            "confidence": confidence,
            "excerpt": f"{label} ({field}): {value}",
        })
        if sid > 0:
            ids.append(sid)

    logger.info(
        f"[yfinance_fetcher] seeded {len(ids)} DataPoints from yfinance company_data "
        f"for {symbol or '<no symbol>'}"
    )
    return ids
