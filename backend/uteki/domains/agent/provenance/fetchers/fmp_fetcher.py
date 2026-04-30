"""FMP (Financial Modeling Prep) fetcher — point-in-time financial statements.

Why this matters:
- yfinance gives us TTM-ish snapshots without filing dates. We can't time-bound
  yfinance metrics to a specific period.
- FMP returns each statement with both `date` (period end) and `filingDate`
  (when SEC published) — enabling Phase γ backtesting and giving the LLM
  precise temporal grounding.

Seed-time pattern:
- Like `yfinance_fetcher`, this is called ONCE at the start of the pipeline
- Pulls the most-recent annual income/cashflow/balance + key-metrics
- Each row → multiple DataPoints, one per metric, all sharing the same
  filingDate and period date

API key is read from `settings.fmp_api_key`. If unset, the fetcher returns
silently with 0 DataPoints — this is safe degradation.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from uteki.common.config import settings
from uteki.domains.agent.provenance.catalog import SourceCatalog

logger = logging.getLogger(__name__)

FMP_BASE_URL = "https://financialmodelingprep.com/stable"
FMP_TIMEOUT = 12.0


# Map (FMP field name) → (canonical_key, label, unit_hint)
# Only metrics that are useful for the 7-gate analysis. Period-end values, not TTM.
_INCOME_METRICS: dict[str, tuple[str, str]] = {
    "revenue":                          ("fmp_revenue",            "营收"),
    "grossProfit":                      ("fmp_gross_profit",       "毛利"),
    "operatingIncome":                  ("fmp_operating_income",   "营业利润"),
    "netIncome":                        ("fmp_net_income",         "净利润"),
    "researchAndDevelopmentExpenses":   ("fmp_rd_expense",         "研发投入"),
    "ebitda":                           ("fmp_ebitda",             "EBITDA"),
    "epsDiluted":                       ("fmp_eps_diluted",        "稀释EPS"),
}

_CASHFLOW_METRICS: dict[str, tuple[str, str]] = {
    "netCashProvidedByOperatingActivities": ("fmp_operating_cashflow", "经营现金流"),
    "freeCashFlow":                          ("fmp_free_cashflow",      "自由现金流"),
    "capitalExpenditure":                    ("fmp_capex",              "资本支出"),
    "commonStockRepurchased":                ("fmp_buybacks",           "回购金额"),
    "commonDividendsPaid":                   ("fmp_dividends_paid",     "分红支付"),
}

_BALANCE_METRICS: dict[str, tuple[str, str]] = {
    "totalAssets":         ("fmp_total_assets",       "总资产"),
    "totalDebt":           ("fmp_total_debt",         "总负债"),
    "totalStockholdersEquity": ("fmp_equity",          "股东权益"),
    "cashAndCashEquivalents": ("fmp_cash",             "现金及等价物"),
}


async def _fmp_get(client: httpx.AsyncClient, endpoint: str, **params) -> list[dict]:
    """GET an FMP endpoint, returning the response list (or empty)."""
    if not settings.fmp_api_key:
        return []
    try:
        full_params = {**params, "apikey": settings.fmp_api_key}
        resp = await client.get(f"{FMP_BASE_URL}/{endpoint}", params=full_params)
        if resp.status_code != 200:
            logger.warning(f"[fmp_fetcher] {endpoint} HTTP {resp.status_code}: {resp.text[:120]}")
            return []
        data = resp.json()
        return data if isinstance(data, list) else [data]
    except Exception as e:
        logger.warning(f"[fmp_fetcher] {endpoint} error: {e}")
        return []


def _seed_metrics(
    catalog: SourceCatalog,
    record: dict,
    metric_map: dict[str, tuple[str, str]],
    symbol: str,
    fetched_at: str,
) -> list[int]:
    """Register every named metric in `record` as a DataPoint."""
    period_end = record.get("date")          # e.g. "2025-12-31"
    filed = record.get("filingDate")          # e.g. "2026-02-05"
    fiscal_year = record.get("fiscalYear")
    period = record.get("period", "FY")

    # Source URL — link to FMP profile (best we have without SEC accession)
    src_url = f"https://site.financialmodelingprep.com/financial-statements/{symbol}"

    ids: list[int] = []
    for fmp_field, (key, label) in metric_map.items():
        value = record.get(fmp_field)
        if value is None:
            continue
        sid = catalog.add({
            "key": f"fmp:{symbol}:{key}:{fiscal_year or period_end}",
            "value": value,
            "source_type": "fmp",
            "source_url": src_url,
            "publisher": "Financial Modeling Prep",
            # Use filing date when available (more precise), fall back to period end
            "published_at": filed or period_end,
            "fetched_at": fetched_at,
            "confidence": "high",  # FMP pulls from filings — authoritative
            "excerpt": f"{label} ({period} {fiscal_year}, period end {period_end}): {value}",
        })
        if sid > 0:
            ids.append(sid)
    return ids


def _filter_by_as_of(records: list[dict], as_of: Optional[str], keep: int = 2) -> list[dict]:
    """Drop records filed after as_of, keeping the most-recent `keep` that remain.

    FMP returns newest first. When as_of is set, we walk forward and pick up
    the first `keep` records whose filingDate (or period date as fallback) is
    on or before as_of.
    """
    if not as_of:
        return records[:keep]
    cutoff = as_of[:10]
    out = []
    for r in records:
        anchor = (r.get("filingDate") or r.get("date") or "")[:10]
        if anchor and anchor <= cutoff:
            out.append(r)
            if len(out) >= keep:
                break
    return out


async def seed_from_fmp(
    catalog: SourceCatalog,
    symbol: str,
    as_of: Optional[str] = None,
    *,
    annual_periods: int = 2,
) -> list[int]:
    """Fetch FMP annual income/cashflow/balance and seed catalog.

    When `as_of` is set, fetches a wider window (10 periods) and filters in
    Python so we still get `annual_periods` worth of pre-cutoff statements.

    Returns the list of DataPoint ids registered. Returns [] silently if
    FMP API key isn't configured.
    """
    if not settings.fmp_api_key:
        logger.info("[fmp_fetcher] no FMP API key configured — skipping seed")
        return []
    if not symbol:
        return []

    fetched_at = datetime.now(timezone.utc).isoformat()
    all_ids: list[int] = []

    # When backtesting (as_of set), fetch more periods so we have something
    # pre-cutoff. Otherwise just grab the latest annual_periods.
    fetch_limit = 10 if as_of else annual_periods

    async with httpx.AsyncClient(timeout=FMP_TIMEOUT) as client:
        # Fetch the three statements in parallel
        income, cashflow, balance = await asyncio.gather(
            _fmp_get(client, "income-statement", symbol=symbol, limit=fetch_limit),
            _fmp_get(client, "cash-flow-statement", symbol=symbol, limit=fetch_limit),
            _fmp_get(client, "balance-sheet-statement", symbol=symbol, limit=fetch_limit),
            return_exceptions=False,
        )

    # Apply as_of filter (or just take the latest N when no cutoff)
    income = _filter_by_as_of(income or [], as_of, keep=annual_periods)
    cashflow = _filter_by_as_of(cashflow or [], as_of, keep=annual_periods)
    balance = _filter_by_as_of(balance or [], as_of, keep=annual_periods)

    for record in income:
        all_ids.extend(_seed_metrics(catalog, record, _INCOME_METRICS, symbol, fetched_at))
    for record in cashflow:
        all_ids.extend(_seed_metrics(catalog, record, _CASHFLOW_METRICS, symbol, fetched_at))
    for record in balance:
        all_ids.extend(_seed_metrics(catalog, record, _BALANCE_METRICS, symbol, fetched_at))

    logger.info(
        f"[fmp_fetcher] seeded {len(all_ids)} DataPoints from FMP for {symbol} "
        f"(as_of={as_of} income={len(income)} cashflow={len(cashflow)} balance={len(balance)})"
    )
    return all_ids
