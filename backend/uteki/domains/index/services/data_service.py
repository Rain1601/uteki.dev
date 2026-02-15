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
    {
        "symbol": "VOO", "name": "Vanguard S&P 500 ETF", "etf_type": "broad_market",
        "notes": "追踪标普500指数，费率0.03%，是最受欢迎的被动指数基金之一。适合作为美股核心配置，长期年化回报约10%。Vanguard旗舰产品，流动性极强。",
    },
    {
        "symbol": "IVV", "name": "iShares Core S&P 500 ETF", "etf_type": "broad_market",
        "notes": "iShares版标普500 ETF，费率0.03%，与VOO几乎相同。BlackRock旗下产品，AUM规模略大于VOO，适合作为VOO的替代选择。",
    },
    {
        "symbol": "QQQ", "name": "Invesco QQQ Trust", "etf_type": "nasdaq100",
        "notes": "追踪纳斯达克100指数，重仓科技股（苹果、微软、英伟达等），费率0.20%。波动性高于标普500，但长期回报也更高。适合看好科技板块的投资者。",
    },
    {
        "symbol": "ACWI", "name": "iShares MSCI ACWI ETF", "etf_type": "global",
        "notes": "追踪MSCI全球指数（含发达+新兴市场），约60%美股+40%国际。费率0.32%，一只ETF实现全球分散配置。适合不想只押注美股的投资者。",
    },
    {
        "symbol": "VGT", "name": "Vanguard Information Technology ETF", "etf_type": "sector_tech",
        "notes": "Vanguard信息技术板块ETF，费率0.10%，集中持有苹果、微软、英伟达等科技龙头。比QQQ更纯粹的科技板块暴露，波动性更大。",
    },
]

FMP_BASE_URL = "https://financialmodelingprep.com/stable"
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
                f"{FMP_BASE_URL}/quote",
                params={"symbol": symbol, "apikey": settings.fmp_api_key},
            )
            if resp.status_code == 429:
                logger.warning("FMP rate limit exceeded, falling back to AV")
                return None
            resp.raise_for_status()
            data = resp.json()
            if not data:
                return None
            q = data[0] if isinstance(data, list) else data
            return {
                "symbol": symbol,
                "price": q.get("price"),
                "change_pct": q.get("changePercentage"),
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
                "today_open": q.get("open"),
                "today_high": q.get("dayHigh"),
                "today_low": q.get("dayLow"),
                "previous_close": q.get("previousClose"),
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
                # AV GLOBAL_QUOTE includes open/high/low
                "today_open": float(data.get("02. open", 0)) or None,
                "today_high": float(data.get("03. high", 0)) or None,
                "today_low": float(data.get("04. low", 0)) or None,
                "previous_close": prev_close or None,
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
                # Cached data has OHLC from DB
                "today_open": row.open,
                "today_high": row.high,
                "today_low": row.low,
                "previous_close": None,
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
        """从 FMP stable 拉取历史数据并存入 DB，返回新增条数"""
        if not settings.fmp_api_key:
            logger.warning("FMP API key not set, skipping history fetch")
            return 0

        try:
            client = await self._get_client()
            params: Dict[str, Any] = {
                "symbol": symbol,
                "apikey": settings.fmp_api_key,
            }
            if from_date:
                params["from"] = from_date

            resp = await client.get(
                f"{FMP_BASE_URL}/historical-price-eod/full",
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
            # Stable endpoint returns flat array (not nested under "historical")
            historical = data if isinstance(data, list) else data.get("historical", [])
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

    async def incremental_update_with_retry(
        self, symbol: str, session: AsyncSession, max_retries: int = 3
    ) -> Dict[str, Any]:
        """带重试的增量更新"""
        import asyncio

        last_error = None
        for attempt in range(max_retries):
            try:
                count = await self.incremental_update(symbol, session)
                return {"symbol": symbol, "status": "success", "records": count}
            except Exception as e:
                last_error = str(e)
                logger.warning(f"Retry {attempt + 1}/{max_retries} for {symbol}: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff

        logger.error(f"Failed to update {symbol} after {max_retries} retries: {last_error}")
        return {"symbol": symbol, "status": "failed", "error": last_error}

    async def smart_backfill(
        self, symbol: str, session: AsyncSession, lookback_days: int = 30
    ) -> Dict[str, Any]:
        """
        智能回填：检测最近 N 天内的缺失交易日并补齐
        用于处理：任务漏执行、同步失败等场景
        """
        # 1. 验证数据连续性
        validation = await self.validate_data_continuity(symbol, session)

        if not validation.get("last_date"):
            # 无数据，执行初始加载
            count = await self.initial_history_load(symbol, session)
            return {
                "symbol": symbol,
                "action": "initial_load",
                "records": count,
            }

        # 2. 检查是否有缺失日期（仅看最近 lookback_days 天）
        last_date = date.fromisoformat(validation["last_date"])
        cutoff_date = date.today() - timedelta(days=lookback_days)
        recent_missing = [
            d for d in validation.get("missing_dates", [])
            if date.fromisoformat(d) >= cutoff_date
        ]

        # 3. 检查是否落后于当前日期（排除周末和今天）
        today = date.today()
        days_behind = 0
        check_date = last_date + timedelta(days=1)
        while check_date < today:
            if check_date.weekday() < 5:  # 非周末
                days_behind += 1
            check_date += timedelta(days=1)

        # 4. 执行回填
        if recent_missing or days_behind > 0:
            # 从缺失日期的最早一天开始重新拉取
            if recent_missing:
                earliest_missing = min(date.fromisoformat(d) for d in recent_missing)
                from_date = (earliest_missing - timedelta(days=1)).isoformat()
            else:
                from_date = last_date.isoformat()

            count = await self.fetch_and_store_history(symbol, session, from_date=from_date)
            return {
                "symbol": symbol,
                "action": "backfill",
                "records": count,
                "missing_filled": len(recent_missing),
                "days_behind": days_behind,
            }

        return {
            "symbol": symbol,
            "action": "up_to_date",
            "records": 0,
        }

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

    async def robust_update_all(
        self, session: AsyncSession, validate: bool = True, backfill: bool = True
    ) -> Dict[str, Any]:
        """
        健壮的全量更新：带重试、回填、验证
        用于调度任务，处理各种异常场景
        """
        query = select(Watchlist).where(Watchlist.is_active == True)
        result = await session.execute(query)
        symbols = result.scalars().all()

        results = {
            "success": [],
            "failed": [],
            "backfilled": [],
            "anomalies": [],
            "total_records": 0,
        }

        for w in symbols:
            symbol = w.symbol

            # 1. 智能回填（检测并补齐缺失数据）
            if backfill:
                backfill_result = await self.smart_backfill(symbol, session)
                if backfill_result["action"] == "backfill":
                    results["backfilled"].append(backfill_result)
                    results["total_records"] += backfill_result.get("records", 0)
                    logger.info(
                        f"Backfilled {symbol}: {backfill_result.get('records', 0)} records, "
                        f"filled {backfill_result.get('missing_filled', 0)} missing days"
                    )
                    continue  # 已回填，跳过增量更新

            # 2. 带重试的增量更新
            update_result = await self.incremental_update_with_retry(symbol, session)

            if update_result["status"] == "success":
                results["success"].append(symbol)
                results["total_records"] += update_result.get("records", 0)
            else:
                results["failed"].append({
                    "symbol": symbol,
                    "error": update_result.get("error"),
                })

            # 3. 数据验证（检测异常价格）
            if validate and update_result["status"] == "success":
                anomalies = await self.validate_prices(symbol, session)
                if anomalies:
                    results["anomalies"].extend(anomalies)

        # 汇总日志
        logger.info(
            f"Robust update completed: "
            f"{len(results['success'])} success, "
            f"{len(results['failed'])} failed, "
            f"{len(results['backfilled'])} backfilled, "
            f"{len(results['anomalies'])} anomalies detected, "
            f"{results['total_records']} total records"
        )

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

    # ── Data Continuity Validation ──

    async def validate_data_continuity(
        self, symbol: str, session: AsyncSession
    ) -> Dict[str, Any]:
        """
        验证数据连续性：检测缺失的交易日（排除周末）
        Returns: {symbol, is_valid, missing_dates, first_date, last_date, total_records}
        """
        query = (
            select(IndexPrice.date)
            .where(IndexPrice.symbol == symbol)
            .order_by(IndexPrice.date.asc())
        )
        result = await session.execute(query)
        dates = [row[0] for row in result.fetchall()]

        if not dates:
            return {
                "symbol": symbol,
                "is_valid": False,
                "missing_dates": [],
                "first_date": None,
                "last_date": None,
                "total_records": 0,
                "error": "No data available",
            }

        missing_dates = []
        first_date = dates[0]
        last_date = dates[-1]
        date_set = set(dates)

        # Check each day between first and last date
        current = first_date
        while current <= last_date:
            # Skip weekends (Saturday=5, Sunday=6)
            if current.weekday() < 5 and current not in date_set:
                missing_dates.append(current.isoformat())
                logger.warning(f"Missing trading day for {symbol}: {current.isoformat()}")
            current += timedelta(days=1)

        is_valid = len(missing_dates) == 0

        return {
            "symbol": symbol,
            "is_valid": is_valid,
            "missing_dates": missing_dates,
            "first_date": first_date.isoformat(),
            "last_date": last_date.isoformat(),
            "total_records": len(dates),
        }

    async def validate_all_watchlist(
        self, session: AsyncSession
    ) -> Dict[str, Dict[str, Any]]:
        """验证观察池内所有 symbol 的数据连续性"""
        query = select(Watchlist).where(Watchlist.is_active == True)
        result = await session.execute(query)
        symbols = result.scalars().all()

        results = {}
        for w in symbols:
            validation = await self.validate_data_continuity(w.symbol, session)
            results[w.symbol] = validation
            if not validation["is_valid"]:
                logger.warning(
                    f"Data gaps detected for {w.symbol}: {len(validation['missing_dates'])} missing days"
                )

        return results

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
                notes=item.get("notes"),
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
