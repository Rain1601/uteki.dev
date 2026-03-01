"""AkShare provider — A-share (China mainland) daily klines (Phase 2)."""

import logging
from datetime import date
from typing import List, Optional

from .base import BaseDataProvider, DataProvider, KlineRow

logger = logging.getLogger(__name__)


class AkShareProvider(BaseDataProvider):
    """Fetch A-share OHLCV from AkShare open-source library."""

    provider = DataProvider.AKSHARE

    async def fetch_daily_klines(
        self,
        symbol: str,
        start: Optional[date] = None,
        end: Optional[date] = None,
    ) -> List[KlineRow]:
        # Phase 2 implementation
        logger.warning("AkShareProvider.fetch_daily_klines not yet implemented")
        return []

    async def get_quote(self, symbol: str) -> Optional[dict]:
        logger.warning("AkShareProvider.get_quote not yet implemented")
        return None
