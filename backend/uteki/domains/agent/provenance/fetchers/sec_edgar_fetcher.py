"""SEC EDGAR fetcher — registers recent 10-K / 10-Q filings as authoritative sources.

Why filings matter:
- 10-K and 10-Q are the most authoritative source for company segment revenue,
  risk factors, and MD&A. Filings carry an objective `filing_date` from SEC.
- For Phase γ backtesting, we only register filings whose `filing_date <= as_of`,
  preventing future-data leak.

This is a SEED-time fetcher (called once at run start), like yfinance/FMP.
It does NOT parse the actual 10-K text — it just registers the filing as a
citable landmark. The LLM can use [src:N] to point readers at the canonical
filing URL when claiming things like "per 2025 10-K, Cloud revenue was X".

Future enhancement: parse 10-K segment-revenue tables and MD&A, register each
segment number as its own DataPoint. For now: filing-as-source only.

Rate limits: SEC limits to 10 req/sec. We make 2 requests per company
(ticker→CIK lookup + recent filings), well under the limit.
User-Agent is required by SEC; we identify as our app.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

EDGAR_BASE = "https://data.sec.gov"
EDGAR_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
EDGAR_TIMEOUT = 12.0
EDGAR_USER_AGENT = "uteki-research dev@uteki.test"

# Cache the ticker→CIK map across calls (it changes infrequently)
_ticker_cik_cache: Optional[dict[str, str]] = None


async def _get_ticker_cik_map(client: httpx.AsyncClient) -> dict[str, str]:
    global _ticker_cik_cache
    if _ticker_cik_cache is not None:
        return _ticker_cik_cache
    try:
        resp = await client.get(EDGAR_TICKERS_URL, headers={"User-Agent": EDGAR_USER_AGENT})
        resp.raise_for_status()
        data = resp.json()
        # data shape: {"0": {"cik_str": 320193, "ticker": "AAPL", "title": "..."}, ...}
        out = {}
        for v in data.values():
            ticker = v.get("ticker", "").upper()
            cik = str(v.get("cik_str", "")).zfill(10)
            if ticker and cik:
                out[ticker] = cik
        _ticker_cik_cache = out
        logger.info(f"[sec_edgar_fetcher] loaded {len(out)} ticker→CIK mappings")
        return out
    except Exception as e:
        logger.warning(f"[sec_edgar_fetcher] ticker map fetch failed: {e}")
        return {}


async def _get_recent_filings(
    client: httpx.AsyncClient,
    cik: str,
) -> list[dict]:
    """Return list of recent filings as dicts with form/date/accession/primary_doc."""
    try:
        resp = await client.get(
            f"{EDGAR_BASE}/submissions/CIK{cik}.json",
            headers={"User-Agent": EDGAR_USER_AGENT},
        )
        resp.raise_for_status()
        data = resp.json()
        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", []) or []
        dates = recent.get("filingDate", []) or []
        accs = recent.get("accessionNumber", []) or []
        docs = recent.get("primaryDocument", []) or []
        out = []
        for form, date, acc, doc in zip(forms, dates, accs, docs):
            out.append({
                "form": form,
                "filing_date": date,
                "accession": acc,
                "primary_doc": doc,
            })
        return out
    except Exception as e:
        logger.warning(f"[sec_edgar_fetcher] submissions fetch for CIK {cik} failed: {e}")
        return []


def _filing_url(cik: str, accession: str, primary_doc: str) -> str:
    """Build the canonical SEC URL for a filing."""
    # Accession format like "0001652044-26-000018" → strip dashes for path
    acc_nodash = accession.replace("-", "")
    cik_int = str(int(cik))  # remove leading zeros for archive path
    return (
        f"https://www.sec.gov/Archives/edgar/data/"
        f"{cik_int}/{acc_nodash}/{primary_doc}"
    )


async def seed_from_edgar(
    catalog,
    symbol: str,
    as_of: Optional[str] = None,
    *,
    forms: tuple[str, ...] = ("10-K", "10-Q"),
    max_per_form: int = 2,
) -> list[int]:
    """Register recent SEC filings as DataPoints in the catalog.

    Args:
        symbol: ticker symbol (case insensitive)
        as_of: optional ISO date — only registers filings with filing_date <= as_of
        forms: which form types to fetch (default: 10-K and 10-Q)
        max_per_form: max number of each form type to register

    Returns list of catalog ids registered.
    """
    if not symbol:
        return []

    fetched_at = datetime.now(timezone.utc).isoformat()
    ids: list[int] = []
    sym_upper = symbol.upper()

    async with httpx.AsyncClient(timeout=EDGAR_TIMEOUT) as client:
        cik_map = await _get_ticker_cik_map(client)
        cik = cik_map.get(sym_upper)
        if not cik:
            logger.info(f"[sec_edgar_fetcher] no CIK for {sym_upper} (likely ADR or non-US listing)")
            return []

        filings = await _get_recent_filings(client, cik)
        if not filings:
            return []

    # Filter to wanted forms, respecting as_of
    seen_per_form: dict[str, int] = {f: 0 for f in forms}
    for f in filings:
        form = f.get("form", "")
        if form not in forms:
            continue
        if seen_per_form[form] >= max_per_form:
            continue
        filing_date = f.get("filing_date")
        if not filing_date:
            continue
        # Phase γ guard: skip filings published after as_of
        if as_of and filing_date[:10] > as_of[:10]:
            continue

        url = _filing_url(cik, f["accession"], f["primary_doc"])
        sid = catalog.add({
            "key": f"sec_edgar:{sym_upper}:{form}:{filing_date}",
            "value": {
                "form": form,
                "filing_date": filing_date,
                "accession": f["accession"],
                "primary_doc": f["primary_doc"],
            },
            "source_type": "sec_edgar",
            "source_url": url,
            "publisher": "SEC EDGAR",
            "published_at": filing_date,
            "fetched_at": fetched_at,
            "confidence": "high",  # filings are gold-standard
            "excerpt": (
                f"{form} ({form == '10-K' and '年报' or '季报'}) "
                f"filed by {sym_upper}, accession {f['accession']}"
            ),
        })
        if sid > 0:
            ids.append(sid)
            seen_per_form[form] += 1

    logger.info(
        f"[sec_edgar_fetcher] seeded {len(ids)} EDGAR DataPoints for {sym_upper} "
        f"(CIK {cik}, forms={list(seen_per_form.items())})"
    )
    return ids
