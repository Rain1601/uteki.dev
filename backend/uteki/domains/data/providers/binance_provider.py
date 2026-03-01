"""Binance provider — cryptocurrency daily klines (Phase 2)."""

import logging
from datetime import date
from typing import List, Optional

from .base import BaseDataProvider, DataProvider, KlineRow

logger = logging.getLogger(__name__)


class BinanceProvider(BaseDataProvider):
    """Fetch crypto OHLCV from Binance public API."""

    provider = DataProvider.BINANCE

    async def fetch_daily_klines(
        self,
        symbol: str,
        start: Optional[date] = None,
        end: Optional[date] = None,
    ) -> List[KlineRow]:
        # Phase 2 implementation
        logger.warning("BinanceProvider.fetch_daily_klines not yet implemented")
        return []

    async def get_quote(self, symbol: str) -> Optional[dict]:
        logger.warning("BinanceProvider.get_quote not yet implemented")
        return None
