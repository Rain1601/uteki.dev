"""FRED (Federal Reserve Economic Data) Service — M2 货币供应量数据"""

import csv
import io
import logging
from typing import Dict, List, Optional

import httpx

from uteki.common.cache import get_cache_service
from uteki.common.config import settings

logger = logging.getLogger(__name__)

# 缓存 TTL（秒）
CACHE_TTL = 3600  # 1 小时

# Series 元数据
SERIES_META = {
    "WM2NS": {
        "title": "M2 Money Stock (Weekly, Not Seasonally Adjusted)",
        "units": "Billions of Dollars",
        "frequency": "Weekly",
    },
    "M2SL": {
        "title": "M2 Money Stock (Monthly, Seasonally Adjusted)",
        "units": "Billions of Dollars",
        "frequency": "Monthly",
    },
}


class FredService:
    """FRED 数据服务 — 双通道: JSON API (有 key) → CSV fallback (无 key)"""

    API_BASE = "https://api.stlouisfed.org/fred"
    CSV_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv"

    def __init__(self):
        self.api_key = settings.fred_api_key
        if self.api_key:
            logger.info("FRED 服务初始化完成 (JSON API 模式)")
        else:
            logger.info("FRED 服务初始化完成 (CSV fallback 模式, 无 API key)")

    async def fetch_series(
        self,
        series_id: str,
        start: Optional[str] = None,
        limit: int = 52,
    ) -> Dict:
        """
        获取任意 FRED series 数据

        Args:
            series_id: FRED series ID (e.g. WM2NS, M2SL)
            start: 起始日期 YYYY-MM-DD（可选）
            limit: 返回最近 N 条数据

        Returns:
            {"success": bool, "series_id": str, "data": [...], "meta": {...}}
        """
        cache = get_cache_service()
        cache_key = f"uteki:fred:{series_id}:{limit}:{start or ''}"

        cached = await cache.get(cache_key)
        if cached:
            return cached

        if self.api_key:
            result = await self._fetch_via_api(series_id, start, limit)
        else:
            result = await self._fetch_via_csv(series_id, start, limit)

        if result["success"]:
            await cache.set(cache_key, result, ttl=CACHE_TTL)

        return result

    async def _fetch_via_api(
        self, series_id: str, start: Optional[str], limit: int
    ) -> Dict:
        """通过 FRED JSON API 获取数据"""
        try:
            params = {
                "series_id": series_id,
                "api_key": self.api_key,
                "file_type": "json",
                "sort_order": "desc",
                "limit": limit,
            }
            if start:
                params["observation_start"] = start

            url = f"{self.API_BASE}/series/observations"

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, params=params)

            if response.status_code != 200:
                logger.warning(
                    f"FRED API 请求失败 ({response.status_code}), 尝试 CSV fallback"
                )
                return await self._fetch_via_csv(series_id, start, limit)

            body = response.json()
            observations = body.get("observations", [])

            data = []
            for obs in observations:
                val = obs.get("value", ".")
                if val == ".":
                    continue
                data.append({
                    "date": obs["date"],
                    "value": float(val),
                })

            # API 返回 desc 排序，反转为升序（时间正序）
            data.reverse()

            meta = SERIES_META.get(series_id, {
                "title": series_id,
                "units": "Unknown",
                "frequency": "Unknown",
            })

            return {
                "success": True,
                "series_id": series_id,
                "data": data,
                "meta": {**meta, "source": "fred_api"},
            }

        except Exception as e:
            logger.warning(f"FRED API 异常: {e}, 尝试 CSV fallback")
            return await self._fetch_via_csv(series_id, start, limit)

    async def _fetch_via_csv(
        self, series_id: str, start: Optional[str], limit: int
    ) -> Dict:
        """通过 FRED CSV endpoint 获取数据（无需 API key）"""
        try:
            params = {"id": series_id}
            if start:
                params["cosd"] = start  # chart observation start date

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(self.CSV_BASE, params=params)

            if response.status_code != 200:
                return {
                    "success": False,
                    "series_id": series_id,
                    "data": [],
                    "meta": {},
                    "error": f"FRED CSV 请求失败: {response.status_code}",
                }

            reader = csv.DictReader(io.StringIO(response.text))
            all_rows: List[Dict] = []
            for row in reader:
                val = row.get(series_id, ".")
                if val == ".":
                    continue
                # FRED CSV uses "observation_date" as date column
                date_val = row.get("observation_date") or row.get("DATE", "")
                all_rows.append({
                    "date": date_val,
                    "value": float(val),
                })

            # 取最近 limit 条（CSV 返回升序）
            data = all_rows[-limit:] if len(all_rows) > limit else all_rows

            meta = SERIES_META.get(series_id, {
                "title": series_id,
                "units": "Unknown",
                "frequency": "Unknown",
            })

            return {
                "success": True,
                "series_id": series_id,
                "data": data,
                "meta": {**meta, "source": "fred_csv"},
            }

        except Exception as e:
            logger.error(f"FRED CSV 获取失败: {e}", exc_info=True)
            return {
                "success": False,
                "series_id": series_id,
                "data": [],
                "meta": {},
                "error": str(e),
            }

    async def get_m2_weekly(self, limit: int = 52) -> Dict:
        """获取 M2 周度数据 (WM2NS)，默认最近 1 年"""
        return await self.fetch_series("WM2NS", limit=limit)

    async def get_m2_monthly(self, limit: int = 24) -> Dict:
        """获取 M2 月度数据 (M2SL)，默认最近 2 年"""
        return await self.fetch_series("M2SL", limit=limit)

    async def get_m2_summary(self) -> Dict:
        """
        M2 汇总：最新值、同比变化率、环比变化率、趋势

        Returns:
            {"success": bool, "latest": {...}, "yoy_change": float, "mom_change": float, "trend": str}
        """
        try:
            # 周度数据取 60 周（保证有 52 周以上做 YoY）
            weekly = await self.fetch_series("WM2NS", limit=60)
            if not weekly["success"] or len(weekly["data"]) < 2:
                return {
                    "success": False,
                    "error": "数据不足",
                    "data": {},
                }

            data = weekly["data"]
            latest = data[-1]
            previous = data[-2]

            # 环比 (WoW)
            wow_change = (
                (latest["value"] - previous["value"]) / previous["value"] * 100
                if previous["value"]
                else 0
            )

            # 同比 (YoY) — 找约 52 周前的数据点
            yoy_change = None
            if len(data) >= 52:
                year_ago = data[-52]
                if year_ago["value"]:
                    yoy_change = (
                        (latest["value"] - year_ago["value"])
                        / year_ago["value"]
                        * 100
                    )

            # 趋势：比较最近 4 周均值与前 4 周均值
            trend = "stable"
            if len(data) >= 8:
                recent_avg = sum(d["value"] for d in data[-4:]) / 4
                prior_avg = sum(d["value"] for d in data[-8:-4]) / 4
                diff_pct = (recent_avg - prior_avg) / prior_avg * 100
                if diff_pct > 0.1:
                    trend = "expanding"
                elif diff_pct < -0.1:
                    trend = "contracting"

            return {
                "success": True,
                "data": {
                    "latest": latest,
                    "wow_change_pct": round(wow_change, 4),
                    "yoy_change_pct": round(yoy_change, 4) if yoy_change is not None else None,
                    "trend": trend,
                    "series_id": "WM2NS",
                    "source": weekly["meta"].get("source", "unknown"),
                },
            }

        except Exception as e:
            logger.error(f"M2 汇总计算失败: {e}", exc_info=True)
            return {"success": False, "error": str(e), "data": {}}


# 全局单例
_fred_service: Optional[FredService] = None


def get_fred_service() -> FredService:
    """获取全局 FRED 服务实例"""
    global _fred_service
    if _fred_service is None:
        _fred_service = FredService()
    return _fred_service
