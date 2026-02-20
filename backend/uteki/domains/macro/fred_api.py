"""FRED M2 Money Supply API endpoints"""

import logging

from fastapi import APIRouter, HTTPException, Query

from uteki.domains.macro.services import get_fred_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/m2/weekly")
async def get_m2_weekly(
    limit: int = Query(52, ge=1, le=520, description="返回数据条数，默认52（约1年）"),
):
    """获取 M2 周度时序数据 (WM2NS)"""
    try:
        service = get_fred_service()
        result = await service.get_m2_weekly(limit=limit)
        return result
    except Exception as e:
        logger.error(f"获取 M2 周度数据失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/m2/monthly")
async def get_m2_monthly(
    limit: int = Query(24, ge=1, le=240, description="返回数据条数，默认24（2年）"),
):
    """获取 M2 月度时序数据 (M2SL)"""
    try:
        service = get_fred_service()
        result = await service.get_m2_monthly(limit=limit)
        return result
    except Exception as e:
        logger.error(f"获取 M2 月度数据失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/m2/summary")
async def get_m2_summary():
    """M2 汇总：最新值 + YoY/WoW 变化率 + 趋势"""
    try:
        service = get_fred_service()
        result = await service.get_m2_summary()
        return result
    except Exception as e:
        logger.error(f"获取 M2 汇总失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
