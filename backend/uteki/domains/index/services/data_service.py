"""指数数据服务 — FMP 为主, Alpha Vantage 为备"""

import logging
from datetime import date, datetime, timedelta
from typing import Optional, List, Dict, Any

import httpx
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.common.config import settings
from uteki.domains.index.models.index_price import IndexPrice
from uteki.domains.index.models.watchlist import Watchlist

logger = logging.getLogger(__name__)

# 预设观察池
DEFAULT_WATCHLIST = [
    {"symbol": "VOO", "name": "Vanguard S&P 500 ETF", "etf_type": "broad_market"},
    {"symbol": "IVV", "name": "iShares Core S&P 500 ETF", "etf_type": "broad_market"},
    {"symbol": "QQQ", "name": "Invesco QQQ Trust", "etf_type": "nasdaq100"},
    {"symbol": "ACWI", "name": "iShares MSCI ACWI ETF", "etf_type": "global"},
    {"symbol": "VGT", "name": "Vanguard Information Technology ETF", "etf_type": "sector_tech"},
]

FMP_BASE_URL = "https://financialmodelingprep.com/api/v3"
AV_BASE_URL = "https://www.alphavantage.co/query"


class DataService:
    """指数 ETF 数据获取与存储服务"""

    def __init__(self):
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=30.0)
        return self._http_client

    # ── Quote (real-time / near-real-time) ──

    async def get_quote(self, symbol: str, session: AsyncSession) -> Dict[str, Any]:
        """获取 ETF 实时报价，FMP 为主，AV 为备，最终 fallback 到 DB 缓存"""
        quote = await self._fetch_quote_fmp(symbol)
        if quote:
            return quote

        quote = await self._fetch_quote_av(symbol)
        if quote:
            return quote

        # Fallback: 从 DB 取最近一条价格
        return await self._get_cached_quote(symbol, session)

    async def _fetch_quote_fmp(self, symbol: str) -> Optional[Dict[str, Any]]:
        if not settings.fmp_api_key:
            return None
        try:
            client = await self._get_client()
            resp = await client.get(
                f"{FMP_BASE_URL}/quote/{symbol}",
                params={"apikey": settings.fmp_api_key},
            )
            if resp.status_code == 429:
                logger.warning("FMP rate limit exceeded, falling back to AV")
                return None
            resp.raise_for_status()
            data = resp.json()
            if not data:
                return None
            q = data[0]
            return {
                "symbol": symbol,
                "price": q.get("price"),
                "change_pct": q.get("changesPercentage"),
                "pe_ratio": q.get("pe"),
                "market_cap": q.get("marketCap"),
                "volume": q.get("volume"),
                "high_52w": q.get("yearHigh"),
                "low_52w": q.get("yearLow"),
                "ma50": q.get("priceAvg50"),
                "ma200": q.get("priceAvg200"),
                "rsi": None,  # FMP quote 不含 RSI，需从历史数据计算
                "timestamp": q.get("timestamp"),
                "stale": False,
            }
        except Exception as e:
            logger.error(f"FMP quote error for {symbol}: {e}")
            return None

    async def _fetch_quote_av(self, symbol: str) -> Optional[Dict[str, Any]]:
        if not settings.alpha_vantage_api_key:
            return None
        try:
            client = await self._get_client()
            resp = await client.get(
                AV_BASE_URL,
                params={
                    "function": "GLOBAL_QUOTE",
                    "symbol": symbol,
                    "apikey": settings.alpha_vantage_api_key,
                },
            )
            resp.raise_for_status()
            data = resp.json().get("Global Quote", {})
            if not data:
                return None
            price = float(data.get("05. price", 0))
            prev_close = float(data.get("08. previous close", 0))
            change_pct = ((price - prev_close) / prev_close * 100) if prev_close else None
            return {
                "symbol": symbol,
                "price": price,
                "change_pct": change_pct,
                "pe_ratio": None,
                "market_cap": None,
                "volume": int(data.get("06. volume", 0)),
                "high_52w": None,
                "low_52w": None,
                "ma50": None,
                "ma200": None,
                "rsi": None,
                "timestamp": data.get("07. latest trading day"),
                "stale": False,
            }
        except Exception as e:
            logger.error(f"AV quote error for {symbol}: {e}")
            return None

    async def _get_cached_quote(self, symbol: str, session: AsyncSession) -> Dict[str, Any]:
        """从 DB 取最近缓存价格"""
        query = (
            select(IndexPrice)
            .where(IndexPrice.symbol == symbol)
            .order_by(IndexPrice.date.desc())
            .limit(1)
        )
        result = await session.execute(query)
        row = result.scalar_one_or_none()
        if row:
            return {
                "symbol": symbol,
                "price": row.close,
                "change_pct": None,
                "pe_ratio": None,
                "market_cap": None,
                "volume": row.volume,
                "high_52w": None,
                "low_52w": None,
                "ma50": None,
                "ma200": None,
                "rsi": None,
                "timestamp": row.date.isoformat(),
                "stale": True,
            }
        return {"symbol": symbol, "price": None, "stale": True, "error": "No data available"}

    # ── Historical data ──

    async def get_history(
        self,
        symbol: str,
        session: AsyncSession,
        start: Optional[str] = None,
        end: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """获取历史日线数据，优先从 DB 读取"""
        query = select(IndexPrice).where(IndexPrice.symbol == symbol)
        if start:
            query = query.where(IndexPrice.date >= date.fromisoformat(start))
        if end:
            query = query.where(IndexPrice.date <= date.fromisoformat(end))
        query = query.order_by(IndexPrice.date.asc())

        result = await session.execute(query)
        rows = result.scalars().all()
        return [r.to_dict() for r in rows]

    async def fetch_and_store_history(
        self,
        symbol: str,
        session: AsyncSession,
        from_date: Optional[str] = None,
    ) -> int:
        """从 FMP 拉取历史数据并存入 DB，返回新增条数"""
        if not settings.fmp_api_key:
            logger.warning("FMP API key not set, skipping history fetch")
            return 0

        try:
            client = await self._get_client()
            params: Dict[str, Any] = {"apikey": settings.fmp_api_key}
            if from_date:
                params["from"] = from_date

            resp = await client.get(
                f"{FMP_BASE_URL}/historical-price-full/{symbol}",
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
            historical = data.get("historical", [])
            if not historical:
                return 0

            count = 0
            for item in historical:
                try:
                    price_date = date.fromisoformat(item["date"])
                    # Check if record already exists (works on both SQLite and PostgreSQL)
                    exists_q = select(IndexPrice.id).where(
                        and_(IndexPrice.symbol == symbol, IndexPrice.date == price_date)
                    )
                    existing = await session.execute(exists_q)
                    if existing.scalar_one_or_none():
                        continue  # Skip existing record

                    price = IndexPrice(
                        symbol=symbol,
                        date=price_date,
                        open=item["open"],
                        high=item["high"],
                        low=item["low"],
                        close=item["close"],
                        volume=item.get("volume", 0),
                    )
                    session.add(price)
                    count += 1
                except Exception as e:
                    logger.warning(f"Skip price row {symbol}/{item.get('date')}: {e}")

            await session.commit()
            logger.info(f"Stored {count} price records for {symbol}")
            return count
        except Exception as e:
            logger.error(f"FMP history fetch error for {symbol}: {e}")
            await session.rollback()
            return 0

    async def initial_history_load(self, symbol: str, session: AsyncSession) -> int:
        """初始加载：拉取最近 5 年历史数据"""
        five_years_ago = (date.today() - timedelta(days=5 * 365)).isoformat()
        return await self.fetch_and_store_history(symbol, session, from_date=five_years_ago)

    async def incremental_update(self, symbol: str, session: AsyncSession) -> int:
        """增量更新：只拉取缺失的日期"""
        query = (
            select(func.max(IndexPrice.date))
            .where(IndexPrice.symbol == symbol)
        )
        result = await session.execute(query)
        last_date = result.scalar_one_or_none()

        if last_date:
            from_date = (last_date + timedelta(days=1)).isoformat()
        else:
            from_date = (date.today() - timedelta(days=5 * 365)).isoformat()

        return await self.fetch_and_store_history(symbol, session, from_date=from_date)

    async def update_all_watchlist(self, session: AsyncSession) -> Dict[str, int]:
        """更新观察池内所有 active symbol 的数据"""
        query = select(Watchlist).where(Watchlist.is_active == True)
        result = await session.execute(query)
        symbols = result.scalars().all()

        results = {}
        for w in symbols:
            count = await self.incremental_update(w.symbol, session)
            results[w.symbol] = count

        return results

    # ── Data validation ──

    async def validate_prices(self, symbol: str, session: AsyncSession) -> List[Dict[str, Any]]:
        """验证价格数据：检测异常波动（>20%）"""
        query = (
            select(IndexPrice)
            .where(IndexPrice.symbol == symbol)
            .order_by(IndexPrice.date.asc())
        )
        result = await session.execute(query)
        rows = result.scalars().all()

        anomalies = []
        for i in range(1, len(rows)):
            prev_close = rows[i - 1].close
            curr_close = rows[i].close
            if prev_close > 0:
                change_pct = abs((curr_close - prev_close) / prev_close * 100)
                if change_pct > 20:
                    anomalies.append({
                        "symbol": symbol,
                        "date": rows[i].date.isoformat(),
                        "prev_close": prev_close,
                        "close": curr_close,
                        "change_pct": round(change_pct, 2),
                        "needs_review": True,
                    })
                    logger.warning(
                        f"Price anomaly: {symbol} {rows[i].date} "
                        f"changed {change_pct:.1f}% from {prev_close} to {curr_close}"
                    )
        return anomalies

    # ── Technical indicators ──

    async def get_indicators(self, symbol: str, session: AsyncSession) -> Dict[str, Any]:
        """计算技术指标：MA50, MA200, RSI(14)"""
        query = (
            select(IndexPrice)
            .where(IndexPrice.symbol == symbol)
            .order_by(IndexPrice.date.desc())
            .limit(250)  # 足够计算 MA200 + RSI
        )
        result = await session.execute(query)
        rows = list(reversed(result.scalars().all()))

        if not rows:
            return {"symbol": symbol, "ma50": None, "ma200": None, "rsi": None}

        closes = [r.close for r in rows]

        ma50 = sum(closes[-50:]) / 50 if len(closes) >= 50 else None
        ma200 = sum(closes[-200:]) / 200 if len(closes) >= 200 else None
        rsi = self._calculate_rsi(closes, 14) if len(closes) >= 15 else None

        return {
            "symbol": symbol,
            "ma50": round(ma50, 2) if ma50 else None,
            "ma200": round(ma200, 2) if ma200 else None,
            "rsi": round(rsi, 2) if rsi else None,
        }

    @staticmethod
    def _calculate_rsi(closes: List[float], period: int = 14) -> Optional[float]:
        if len(closes) < period + 1:
            return None
        gains = []
        losses = []
        for i in range(1, len(closes)):
            change = closes[i] - closes[i - 1]
            gains.append(max(change, 0))
            losses.append(max(-change, 0))

        avg_gain = sum(gains[-period:]) / period
        avg_loss = sum(losses[-period:]) / period

        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    # ── Watchlist CRUD ──

    async def get_watchlist(self, session: AsyncSession, active_only: bool = True) -> List[Dict[str, Any]]:
        query = select(Watchlist)
        if active_only:
            query = query.where(Watchlist.is_active == True)
        query = query.order_by(Watchlist.created_at.asc())
        result = await session.execute(query)
        return [w.to_dict() for w in result.scalars().all()]

    async def add_to_watchlist(
        self, symbol: str, session: AsyncSession,
        name: Optional[str] = None, etf_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """添加到观察池，触发历史数据加载"""
        # 检查是否已存在
        query = select(Watchlist).where(Watchlist.symbol == symbol.upper())
        result = await session.execute(query)
        existing = result.scalar_one_or_none()

        if existing:
            if not existing.is_active:
                existing.is_active = True
                await session.commit()
            return existing.to_dict()

        item = Watchlist(
            symbol=symbol.upper(),
            name=name,
            etf_type=etf_type,
            is_active=True,
        )
        session.add(item)
        await session.commit()
        await session.refresh(item)

        # 后台加载历史数据
        await self.initial_history_load(symbol.upper(), session)

        return item.to_dict()

    async def remove_from_watchlist(self, symbol: str, session: AsyncSession) -> bool:
        """从观察池移除（标记为 inactive，保留数据）"""
        query = select(Watchlist).where(Watchlist.symbol == symbol.upper())
        result = await session.execute(query)
        item = result.scalar_one_or_none()
        if item:
            item.is_active = False
            await session.commit()
            return True
        return False

    async def seed_default_watchlist(self, session: AsyncSession) -> int:
        """预设默认观察池（仅当池为空时）"""
        query = select(func.count()).select_from(Watchlist)
        result = await session.execute(query)
        count = result.scalar_one()
        if count > 0:
            return 0

        added = 0
        for item in DEFAULT_WATCHLIST:
            w = Watchlist(
                symbol=item["symbol"],
                name=item["name"],
                etf_type=item["etf_type"],
                is_active=True,
            )
            session.add(w)
            added += 1
        await session.commit()
        logger.info(f"Seeded {added} default watchlist items")
        return added


# Singleton
_data_service: Optional[DataService] = None


def get_data_service() -> DataService:
    global _data_service
    if _data_service is None:
        _data_service = DataService()
    return _data_service
