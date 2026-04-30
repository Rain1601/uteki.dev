"""经济日历 API - FOMC 会议和经济事件"""

import logging
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from uteki.common.cache import get_cache_service
from uteki.domains.macro.services import get_fmp_calendar_service

logger = logging.getLogger(__name__)
router = APIRouter()

_TTL = 86400

IMPORTANCE_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1, "none": 0}


def _today() -> str:
    return date.today().isoformat()


@router.get("/events/monthly/{year}/{month}/enriched")
async def get_monthly_events_enriched(
    year: int,
    month: int,
    event_type: Optional[str] = Query(None, description="事件类型: all/fomc/employment/inflation/consumption,gdp"),
    refresh: Optional[bool] = Query(None, description="强制刷新缓存"),
):
    """
    获取指定月份的经济事件（包含 FMP 数据增强，Supabase 缓存优先）

    Returns:
        按日期分组的事件字典，包含 actual/forecast/previous 数据
    """
    cache = get_cache_service()
    cache_key = f"uteki:macro:events:{_today()}:{year}:{month}:{event_type}"

    if refresh:
        await cache.delete(cache_key)

    async def _fetch():
        try:
            service = get_fmp_calendar_service()
            result = await service.get_monthly_events_enriched(
                year, month, event_type,
                force_refresh=bool(refresh),
            )
            return result
        except Exception as e:
            logger.error(f"获取月度事件失败: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    return await cache.get_or_set(cache_key, _fetch, ttl=_TTL)


@router.get("/events/weekly")
async def get_weekly_events(
    start: str = Query(..., description="周开始日期 YYYY-MM-DD"),
    end: str = Query(..., description="周结束日期 YYYY-MM-DD"),
    min_importance: str = Query("medium", description="最低重要性: low/medium/high/critical"),
    country: str = Query("US", description="国家过滤，逗号分隔，空字符串=全部"),
    event_type: Optional[str] = Query(None, description="事件类型过滤"),
):
    """
    按周加载经济事件，支持重要性和国家过滤。
    前端按周分页请求，减少单次数据量。
    """
    cache = get_cache_service()
    cache_key = f"uteki:macro:weekly:{_today()}:{start}:{end}:{min_importance}:{country}:{event_type}"

    min_rank = IMPORTANCE_RANK.get(min_importance, 2)

    async def _fetch():
        try:
            start_dt = datetime.strptime(start, "%Y-%m-%d")
            end_dt = datetime.strptime(end, "%Y-%m-%d")
            year = start_dt.year
            month = start_dt.month

            # Also fetch next month if week spans month boundary
            months_to_fetch = {(start_dt.year, start_dt.month)}
            if end_dt.month != start_dt.month or end_dt.year != start_dt.year:
                months_to_fetch.add((end_dt.year, end_dt.month))

            service = get_fmp_calendar_service()

            all_events = []
            for y, m in months_to_fetch:
                result = await service.get_monthly_events_enriched(y, m, event_type)
                if result.get("success"):
                    for dt_str, events in result["data"].items():
                        all_events.extend(events)

            # Filter by date range
            filtered = []
            for e in all_events:
                e_date = str(e.get("start_date", ""))[:10]
                if e_date < start or e_date > end:
                    continue

                # Filter by importance
                imp = e.get("importance", "medium").lower()
                if IMPORTANCE_RANK.get(imp, 0) < min_rank:
                    continue

                # Filter by country (if specified)
                if country:
                    countries = {c.strip().upper() for c in country.split(",")}
                    e_country = (e.get("country") or "").strip().upper()
                    # FOMC and fed events always pass
                    if e.get("event_type") == "fomc" or e.get("source") == "federal_reserve":
                        pass
                    elif e_country and e_country not in countries:
                        continue
                    elif not e_country:
                        # No country info — allow if high+ importance
                        if IMPORTANCE_RANK.get(imp, 0) < 3:
                            continue

                filtered.append(e)

            # Sort by date, then importance desc
            filtered.sort(
                key=lambda e: (
                    str(e.get("start_date", ""))[:10],
                    -IMPORTANCE_RANK.get(e.get("importance", "medium"), 0),
                ),
            )

            # Group by date
            events_by_date = {}
            for e in filtered:
                d = str(e.get("start_date", ""))[:10]
                events_by_date.setdefault(d, []).append(e)

            return {
                "success": True,
                "data": events_by_date,
                "total": len(filtered),
                "range": {"start": start, "end": end},
            }
        except Exception as e:
            logger.error(f"获取周事件失败: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    return await cache.get_or_set(cache_key, _fetch, ttl=_TTL)


@router.get("/statistics")
async def get_statistics():
    """获取事件统计信息"""
    cache = get_cache_service()

    async def _fetch():
        try:
            service = get_fmp_calendar_service()
            result = await service.get_statistics()
            return result
        except Exception as e:
            logger.error(f"获取统计信息失败: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    return await cache.get_or_set(
        f"uteki:macro:statistics:{_today()}", _fetch, ttl=_TTL,
    )
