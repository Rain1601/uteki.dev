"""市值爬虫服务 — 从 companiesmarketcap.com 抓取全球资产市值数据"""

import logging
import random
import time
from datetime import date, datetime
from typing import List, Dict, Optional

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select, delete

from uteki.common.database import db_manager
from uteki.domains.macro.models.global_asset_marketcap import GlobalAssetMarketCap

logger = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1 hour

USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
]

PRECIOUS_METALS = {"gold", "silver", "platinum", "palladium"}
CRYPTO_KEYWORDS = {
    "bitcoin", "ethereum", "tether", "bnb", "solana", "xrp", "usdc",
    "cardano", "dogecoin", "avalanche", "polkadot", "chainlink",
    "tron", "polygon", "shiba", "litecoin", "uniswap", "dai",
    "stellar", "monero", "cosmos", "filecoin", "aptos", "sui",
}
ETF_KEYWORDS = {"etf", "vanguard", "ishares", "spdr", "invesco"}


class MarketCapScraperService:
    BASE_URL = "https://companiesmarketcap.com/assets-by-market-cap/"

    def __init__(self):
        self._cache: Optional[List[Dict]] = None
        self._cache_time: float = 0

    # ─── parsing helpers ───

    @staticmethod
    def _parse_market_cap(text: str) -> Optional[float]:
        if not text:
            return None
        text = text.strip().replace("$", "").replace(",", "")
        for suffix, mul in [("T", 1e12), ("B", 1e9), ("M", 1e6), ("K", 1e3)]:
            if suffix in text:
                try:
                    return float(text.replace(suffix, "")) * mul
                except ValueError:
                    return None
        try:
            return float(text)
        except ValueError:
            return None

    @staticmethod
    def _parse_price(text: str) -> Optional[float]:
        if not text:
            return None
        try:
            return float(text.strip().replace("$", "").replace(",", ""))
        except ValueError:
            return None

    @staticmethod
    def _parse_pct(text: str) -> Optional[float]:
        if not text:
            return None
        try:
            return float(text.strip().replace("%", "").replace(",", ""))
        except ValueError:
            return None

    @staticmethod
    def _determine_asset_type(name: str) -> str:
        lower = name.lower()
        if any(m in lower for m in PRECIOUS_METALS):
            return "precious_metal"
        if any(k in lower for k in CRYPTO_KEYWORDS):
            return "cryptocurrency"
        if any(k in lower for k in ETF_KEYWORDS):
            return "etf"
        return "company"

    # ─── scraping ───

    async def fetch_data(self, limit: int = 200) -> List[Dict]:
        """Scrape top assets from companiesmarketcap.com."""
        headers = {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(self.BASE_URL, headers=headers)
                resp.raise_for_status()
        except Exception as e:
            logger.error(f"Scrape request failed: {e}")
            return []

        try:
            soup = BeautifulSoup(resp.text, "html.parser")
            table = soup.find("table")
            if not table:
                logger.error("No table found on page")
                return []
            tbody = table.find("tbody")
            if not tbody:
                logger.error("No tbody found")
                return []

            results: List[Dict] = []
            for row in tbody.find_all("tr"):
                cols = row.find_all("td")
                if len(cols) < 4:
                    continue
                try:
                    rank_text = cols[0].get_text(strip=True)
                    rank = int(rank_text) if rank_text.isdigit() else None

                    name_cell = cols[1]
                    name_div = name_cell.find("div", class_="company-name")
                    code_div = name_cell.find("div", class_="company-code")
                    name = name_div.get_text(strip=True) if name_div else name_cell.get_text(strip=True)
                    symbol = code_div.get_text(strip=True) if code_div else None

                    market_cap = self._parse_market_cap(cols[2].get_text(strip=True))
                    price = self._parse_price(cols[3].get_text(strip=True)) if len(cols) > 3 else None
                    change_today = self._parse_pct(cols[4].get_text(strip=True)) if len(cols) > 4 else None
                    change_30d = self._parse_pct(cols[5].get_text(strip=True)) if len(cols) > 5 else None

                    country = None
                    if len(cols) > 6:
                        span = cols[6].find("span", class_="responsive-hidden")
                        if span:
                            country = span.get_text(strip=True)

                    if rank and name and market_cap:
                        results.append({
                            "rank": rank,
                            "name": name,
                            "symbol": symbol,
                            "asset_type": self._determine_asset_type(name),
                            "market_cap": market_cap,
                            "price": price,
                            "change_today": change_today,
                            "change_30d": change_30d,
                            "country": country,
                        })
                except Exception as e:
                    logger.warning(f"Row parse error: {e}")
                    continue

                if len(results) >= limit:
                    break

            logger.info(f"Scraped {len(results)} assets")
            return results
        except Exception as e:
            logger.error(f"HTML parse error: {e}", exc_info=True)
            return []

    # ─── DB persistence ───

    async def _ensure_table(self):
        """Create table if not exists (for SQLite dev)."""
        from uteki.common.base import Base
        async with db_manager.get_postgres_session() as session:
            conn = await session.connection()
            await conn.run_sync(Base.metadata.create_all, tables=[GlobalAssetMarketCap.__table__])

    async def sync_to_db(self) -> int:
        """Scrape and save to DB. Returns count saved."""
        data = await self.fetch_data()
        if not data:
            return 0

        await self._ensure_table()
        today = date.today()
        async with db_manager.get_postgres_session() as session:
            # Delete today's old data
            await session.execute(
                delete(GlobalAssetMarketCap).where(GlobalAssetMarketCap.data_date == today)
            )
            # Insert new
            for item in data:
                session.add(GlobalAssetMarketCap(
                    rank=item["rank"],
                    name=item["name"],
                    symbol=item.get("symbol"),
                    asset_type=item["asset_type"],
                    market_cap=item["market_cap"],
                    price=item.get("price"),
                    change_today=item.get("change_today"),
                    change_30d=item.get("change_30d"),
                    country=item.get("country"),
                    data_date=today,
                ))
            await session.commit()

        # Invalidate cache
        self._cache = None
        self._cache_time = 0
        logger.info(f"Synced {len(data)} assets to DB")
        return len(data)

    # ─── query with cache ───

    async def get_latest(self, asset_type: Optional[str] = None, limit: int = 200) -> List[Dict]:
        """Get latest market cap data, cached 1h."""
        now = time.time()
        if self._cache and (now - self._cache_time) < CACHE_TTL:
            filtered = self._cache
            if asset_type:
                filtered = [r for r in filtered if r["asset_type"] == asset_type]
            return filtered[:limit]

        # Query DB (handle missing table)
        try:
            return await self._query_db(asset_type, limit)
        except Exception as e:
            logger.warning(f"DB query failed (table may not exist): {e}")
            return []

    async def _query_db(self, asset_type: Optional[str], limit: int) -> List[Dict]:
        async with db_manager.get_postgres_session() as session:
            # Find latest date
            stmt = select(GlobalAssetMarketCap.data_date).order_by(
                GlobalAssetMarketCap.data_date.desc()
            ).limit(1)
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            if not row:
                return []

            latest_date = row
            stmt = (
                select(GlobalAssetMarketCap)
                .where(GlobalAssetMarketCap.data_date == latest_date)
                .order_by(GlobalAssetMarketCap.rank.asc())
            )
            result = await session.execute(stmt)
            records = result.scalars().all()

        all_data = [r.to_dict() for r in records]
        self._cache = all_data
        self._cache_time = time.time()

        filtered = all_data
        if asset_type:
            filtered = [r for r in filtered if r["asset_type"] == asset_type]
        return filtered[:limit]

    async def get_summary(self) -> Dict:
        """Get aggregated summary by asset type."""
        all_data = await self.get_latest(limit=500)
        summary: Dict = {}
        for item in all_data:
            at = item["asset_type"]
            if at not in summary:
                summary[at] = {"count": 0, "total_market_cap": 0}
            summary[at]["count"] += 1
            summary[at]["total_market_cap"] += item.get("market_cap", 0)

        return {
            "by_type": summary,
            "total_assets": len(all_data),
            "data_date": all_data[0]["data_date"] if all_data else None,
        }


# ─── singleton ───
_service: Optional[MarketCapScraperService] = None


def get_marketcap_scraper_service() -> MarketCapScraperService:
    global _service
    if _service is None:
        _service = MarketCapScraperService()
    return _service
