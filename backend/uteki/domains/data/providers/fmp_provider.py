"""FMP (Financial Modeling Prep) provider — fallback for US stocks/ETFs."""

import logging
from datetime import date, timedelta
from typing import List, Optional

import httpx

from uteki.common.config import settings
from .base import BaseDataProvider, DataProvider, KlineRow

logger = logging.getLogger(__name__)

FMP_BASE_URL = "https://financialmodelingprep.com/stable"


class FMPProvider(BaseDataProvider):
    """Fetch OHLCV from FMP stable API (requires API key)."""

    provider = DataProvider.FMP

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def fetch_daily_klines(
        self,
        symbol: str,
        start: Optional[date] = None,
        end: Optional[date] = None,
    ) -> List[KlineRow]:
        if not settings.fmp_api_key:
            logger.warning("FMP API key not set, cannot fetch klines")
            return []

        if start is None:
            start = date.today() - timedelta(days=5 * 365)

        try:
            client = await self._get_client()
            params = {
                "symbol": symbol,
                "apikey": settings.fmp_api_key,
                "from": start.isoformat(),
            }
            if end:
                params["to"] = end.isoformat()

            resp = await client.get(
                f"{FMP_BASE_URL}/historical-price-eod/full",
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
            historical = data if isinstance(data, list) else data.get("historical", [])

            rows: List[KlineRow] = []
            for item in historical:
                try:
                    rows.append(KlineRow(
                        time=date.fromisoformat(str(item["date"])[:10]),
                        open=float(item["open"]),
                        high=float(item["high"]),
                        low=float(item["low"]),
                        close=float(item["close"]),
                        volume=float(item.get("volume", 0)),
                        adj_close=float(item["adjClose"]) if "adjClose" in item else None,
                    ))
                except Exception as e:
                    logger.warning(f"Skip FMP row {symbol}/{item.get('date')}: {e}")

            # FMP returns newest first, reverse to chronological
            rows.sort(key=lambda r: r.time)
            logger.info(f"FMP fetched {len(rows)} rows for {symbol}")
            return rows
        except Exception as e:
            logger.error(f"FMP fetch error for {symbol}: {e}")
            return []

    async def get_quote(self, symbol: str) -> Optional[dict]:
        if not settings.fmp_api_key:
            return None
        try:
            client = await self._get_client()
            resp = await client.get(
                f"{FMP_BASE_URL}/quote",
                params={"symbol": symbol, "apikey": settings.fmp_api_key},
            )
            resp.raise_for_status()
            data = resp.json()
            if not data:
                return None
            q = data[0] if isinstance(data, list) else data
            return {
                "symbol": symbol,
                "price": q.get("price"),
                "change_pct": q.get("changePercentage"),
                "volume": q.get("volume"),
                "market_cap": q.get("marketCap"),
                "timestamp": q.get("timestamp"),
            }
        except Exception as e:
            logger.error(f"FMP quote error for {symbol}: {e}")
            return None
