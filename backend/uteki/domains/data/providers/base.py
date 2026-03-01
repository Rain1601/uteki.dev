"""Base data provider ABC and routing configuration."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import List, Optional


class AssetType(str, Enum):
    US_STOCK = "us_stock"
    US_ETF = "us_etf"
    CRYPTO = "crypto"
    FOREX = "forex"
    HK_STOCK = "hk_stock"
    A_SHARE = "a_share"
    FUTURES = "futures"


class DataProvider(str, Enum):
    YFINANCE = "yfinance"
    BINANCE = "binance"
    AKSHARE = "akshare"
    FMP = "fmp"


# Default provider routing per asset type
PROVIDER_ROUTING: dict[AssetType, DataProvider] = {
    AssetType.US_STOCK: DataProvider.YFINANCE,
    AssetType.US_ETF: DataProvider.YFINANCE,
    AssetType.CRYPTO: DataProvider.YFINANCE,  # BTC-USD format; switch to BINANCE for BTCUSDT
    AssetType.FOREX: DataProvider.YFINANCE,
    AssetType.HK_STOCK: DataProvider.YFINANCE,
    AssetType.A_SHARE: DataProvider.AKSHARE,
    AssetType.FUTURES: DataProvider.YFINANCE,
}


@dataclass
class KlineRow:
    """Single K-line data point returned by providers."""
    time: date
    open: float
    high: float
    low: float
    close: float
    volume: float
    adj_close: Optional[float] = None
    turnover: Optional[float] = None


class BaseDataProvider(ABC):
    """Abstract base class for all market data providers."""

    provider: DataProvider

    @abstractmethod
    async def fetch_daily_klines(
        self,
        symbol: str,
        start: Optional[date] = None,
        end: Optional[date] = None,
    ) -> List[KlineRow]:
        """Fetch daily OHLCV data for a symbol.

        Args:
            symbol: Ticker symbol (e.g. "AAPL", "BTC-USDT", "600519.SH")
            start: Start date (inclusive). None = provider default (e.g. 5 years).
            end: End date (inclusive). None = today.

        Returns:
            List of KlineRow sorted by date ascending.
        """
        ...

    @abstractmethod
    async def get_quote(self, symbol: str) -> Optional[dict]:
        """Fetch a real-time or near-real-time quote.

        Returns dict with at minimum: price, change_pct, volume, timestamp.
        None if unavailable.
        """
        ...


class DataProviderFactory:
    """Factory to create the correct provider for an asset type."""

    _instances: dict[DataProvider, BaseDataProvider] = {}

    @classmethod
    def get_provider(cls, asset_type: AssetType) -> BaseDataProvider:
        provider_enum = PROVIDER_ROUTING.get(asset_type)
        if provider_enum is None:
            raise ValueError(f"No provider configured for asset type: {asset_type}")

        if provider_enum not in cls._instances:
            cls._instances[provider_enum] = cls._create_provider(provider_enum)

        return cls._instances[provider_enum]

    @classmethod
    def _create_provider(cls, provider: DataProvider) -> BaseDataProvider:
        if provider == DataProvider.YFINANCE:
            from .yfinance_provider import YFinanceProvider
            return YFinanceProvider()
        elif provider == DataProvider.BINANCE:
            from .binance_provider import BinanceProvider
            return BinanceProvider()
        elif provider == DataProvider.AKSHARE:
            from .akshare_provider import AkShareProvider
            return AkShareProvider()
        elif provider == DataProvider.FMP:
            from .fmp_provider import FMPProvider
            return FMPProvider()
        else:
            raise ValueError(f"Unsupported data provider: {provider}")

    @classmethod
    def reset(cls):
        """Reset cached instances (useful for testing)."""
        cls._instances.clear()
