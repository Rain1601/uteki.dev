"""经济日历 API - FOMC 会议和经济事件"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from uteki.domains.macro.services import get_fmp_calendar_service

logger = logging.getLogger(__name__)
router = APIRouter()


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


@router.get("/statistics")
async def get_statistics():
    """获取事件统计信息"""
    try:
        service = get_fmp_calendar_service()
        result = await service.get_statistics()

        return result

    except Exception as e:
        logger.error(f"获取统计信息失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
