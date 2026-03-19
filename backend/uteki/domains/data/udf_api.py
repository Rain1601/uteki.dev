"""TradingView UDF-compatible datafeed API.

Serves OHLCV data from FMP with Redis caching so the self-hosted
TradingView Charting Library can display any US stock/ETF symbol.

Endpoints (all GET, mounted at /api/udf):
    /config          — server capabilities
    /symbols         — resolve a single symbol
    /search          — search symbols by keyword
    /history         — OHLCV bars in UDF array format
    /time            — current server time
"""

import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Query, Request
from starlette.responses import JSONResponse

from uteki.common.config import settings
from uteki.common.database import db_manager

logger = logging.getLogger(__name__)

router = APIRouter()

FMP_BASE = "https://financialmodelingprep.com/stable"

# Redis key prefixes and TTLs
_HISTORY_TTL = 6 * 3600      # 6 h for daily bars
_SYMBOL_TTL = 7 * 86400      # 7 days for symbol info
_SEARCH_TTL = 86400           # 1 day for search results

_http: Optional[httpx.AsyncClient] = None


async def _client() -> httpx.AsyncClient:
    global _http
    if _http is None or _http.is_closed:
        _http = httpx.AsyncClient(timeout=20.0)
    return _http


async def _redis():
    try:
        return await db_manager.get_redis()
    except Exception:
        return None


async def _cache_get(key: str) -> Optional[str]:
    r = await _redis()
    if r is None:
        return None
    try:
        val = await r.get(key)
        return val.decode() if isinstance(val, bytes) else val
    except Exception:
        return None


async def _cache_set(key: str, value: str, ttl: int):
    r = await _redis()
    if r is None:
        return
    try:
        await r.set(key, value, ex=ttl)
    except Exception:
        pass


# ── /config ──────────────────────────────────────────────────────────────────

@router.get("/config")
async def udf_config():
    return {
        "supports_search": True,
        "supports_group_request": False,
        "supports_marks": False,
        "supports_timescale_marks": False,
        "supports_time": True,
        "exchanges": [
            {"value": "", "name": "All Exchanges", "desc": ""},
            {"value": "NASDAQ", "name": "NASDAQ", "desc": "NASDAQ"},
            {"value": "NYSE", "name": "NYSE", "desc": "New York Stock Exchange"},
            {"value": "AMEX", "name": "AMEX", "desc": "NYSE American"},
        ],
        "symbols_types": [
            {"name": "All types", "value": ""},
            {"name": "Stock", "value": "stock"},
            {"name": "ETF", "value": "etf"},
        ],
        "supported_resolutions": ["D", "W", "M"],
    }


# ── /time ────────────────────────────────────────────────────────────────────

@router.get("/time")
async def udf_time():
    return int(time.time())


# ── /symbols ─────────────────────────────────────────────────────────────────

@router.get("/symbols")
async def udf_symbols(symbol: str = Query(...)):
    cache_key = f"udf:sym:{symbol}"
    cached = await _cache_get(cache_key)
    if cached:
        return json.loads(cached)

    client = await _client()
    try:
        resp = await client.get(
            f"{FMP_BASE}/profile",
            params={"symbol": symbol, "apikey": settings.fmp_api_key},
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return {"s": "error", "errmsg": f"unknown_symbol {symbol}"}

        p = data[0] if isinstance(data, list) else data
        exchange = p.get("exchangeShortName") or p.get("exchange") or "NYSE"

        info = {
            "name": symbol,
            "ticker": symbol,
            "description": p.get("companyName", symbol),
            "type": "stock",
            "exchange-traded": exchange,
            "exchange-listed": exchange,
            "timezone": "America/New_York",
            "session": "0930-1600",
            "minmov": 1,
            "minmov2": 0,
            "pricescale": 100,
            "pointvalue": 1,
            "has_intraday": False,
            "has_daily": True,
            "has_weekly_and_monthly": True,
            "supported_resolutions": ["D", "W", "M"],
            "visible_plots_set": "ohlcv",
            "currency_code": p.get("currency", "USD"),
            "logo_urls": [p["image"]] if p.get("image") else [],
        }

        await _cache_set(cache_key, json.dumps(info), _SYMBOL_TTL)
        return info
    except Exception as e:
        logger.error(f"UDF symbols error for {symbol}: {e}")
        return {"s": "error", "errmsg": str(e)}


# ── /search ──────────────────────────────────────────────────────────────────

@router.get("/search")
async def udf_search(
    query: str = Query(""),
    type: str = Query(""),
    exchange: str = Query(""),
    limit: int = Query(30),
):
    if not query:
        return []

    cache_key = f"udf:search:{query}:{limit}"
    cached = await _cache_get(cache_key)
    if cached:
        return json.loads(cached)

    client = await _client()
    try:
        resp = await client.get(
            f"{FMP_BASE}/search-name",
            params={"query": query, "apikey": settings.fmp_api_key, "limit": limit},
        )
        resp.raise_for_status()
        raw = resp.json() or []

        results = [
            {
                "symbol": item["symbol"],
                "full_name": item["symbol"],
                "description": item.get("name", ""),
                "exchange": item.get("exchange", ""),
                "ticker": item["symbol"],
                "type": "stock",
            }
            for item in raw
        ]

        await _cache_set(cache_key, json.dumps(results), _SEARCH_TTL)
        return results
    except Exception as e:
        logger.error(f"UDF search error: {e}")
        return []


# ── /history ─────────────────────────────────────────────────────────────────

@router.get("/history")
async def udf_history(request: Request):
    """Return OHLCV bars in UDF columnar format {s, t, o, h, l, c, v}."""
    qp = request.query_params
    symbol = qp.get("symbol", "")
    from_ts = int(qp.get("from", "0"))
    to_ts = int(qp.get("to", str(int(time.time()))))

    if not symbol:
        return JSONResponse({"s": "error", "errmsg": "missing symbol"})

    start_date = datetime.fromtimestamp(from_ts, tz=timezone.utc).strftime("%Y-%m-%d")
    end_date = datetime.fromtimestamp(to_ts, tz=timezone.utc).strftime("%Y-%m-%d")

    cache_key = f"udf:hist:{symbol}:{start_date}:{end_date}"
    cached = await _cache_get(cache_key)
    if cached:
        return JSONResponse(json.loads(cached))

    client = await _client()
    try:
        resp = await client.get(
            f"{FMP_BASE}/historical-price-eod/full",
            params={
                "symbol": symbol,
                "apikey": settings.fmp_api_key,
                "from": start_date,
                "to": end_date,
            },
        )
        resp.raise_for_status()
        raw = resp.json()
        historical = raw if isinstance(raw, list) else raw.get("historical", [])

        if not historical:
            return JSONResponse({"s": "no_data"})

        # FMP returns newest-first; reverse to chronological
        historical.sort(key=lambda x: x["date"])

        t_arr, o_arr, h_arr, l_arr, c_arr, v_arr = [], [], [], [], [], []
        for bar in historical:
            try:
                dt = datetime.strptime(bar["date"][:10], "%Y-%m-%d").replace(
                    tzinfo=timezone.utc
                )
                t_arr.append(int(dt.timestamp()))
                o_arr.append(float(bar["open"]))
                h_arr.append(float(bar["high"]))
                l_arr.append(float(bar["low"]))
                c_arr.append(float(bar["close"]))
                v_arr.append(float(bar.get("volume", 0)))
            except (KeyError, ValueError):
                continue

        result = {
            "s": "ok",
            "t": t_arr,
            "o": o_arr,
            "h": h_arr,
            "l": l_arr,
            "c": c_arr,
            "v": v_arr,
        }
        await _cache_set(cache_key, json.dumps(result), _HISTORY_TTL)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"UDF history error for {symbol}: {e}")
        return JSONResponse({"s": "error", "errmsg": str(e)})
