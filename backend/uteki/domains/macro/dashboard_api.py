"""Market Dashboard API — 宏观指标仪表盘端点"""

import logging
from datetime import date

from fastapi import APIRouter, HTTPException, Query

from uteki.common.cache import get_cache_service
from uteki.domains.macro.services.market_dashboard_service import get_market_dashboard_service

logger = logging.getLogger(__name__)
router = APIRouter()

_TTL = 86400


def _today() -> str:
    return date.today().isoformat()


@router.get("/overview")
async def get_overview():
    """全量概览：3 类指标当前值 + 信号灯（无历史，快速）"""
    cache = get_cache_service()

    async def _fetch():
        try:
            service = get_market_dashboard_service()
            return await service.get_overview()
        except Exception as e:
            logger.error(f"Dashboard overview error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    return await cache.get_or_set(
        f"uteki:dashboard:overview:{_today()}", _fetch, ttl=_TTL,
    )


@router.get("/valuation")
async def get_valuation_detail(
    limit: int = Query(52, ge=1, le=520, description="历史数据条数"),
):
    """估值详情 + 图表历史"""
    cache = get_cache_service()

    async def _fetch():
        try:
            service = get_market_dashboard_service()
            return await service.get_valuation_detail(limit=limit)
        except Exception as e:
            logger.error(f"Dashboard valuation error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    return await cache.get_or_set(
        f"uteki:dashboard:valuation:{_today()}:{limit}", _fetch, ttl=_TTL,
    )


@router.get("/liquidity")
async def get_liquidity_detail(
    limit: int = Query(52, ge=1, le=520, description="历史数据条数"),
):
    """流动性详情 + 图表历史"""
    cache = get_cache_service()

    async def _fetch():
        try:
            service = get_market_dashboard_service()
            return await service.get_liquidity_detail(limit=limit)
        except Exception as e:
            logger.error(f"Dashboard liquidity error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    return await cache.get_or_set(
        f"uteki:dashboard:liquidity:{_today()}:{limit}", _fetch, ttl=_TTL,
    )


@router.get("/flow")
async def get_flow_detail():
    """资金流向详情"""
    cache = get_cache_service()

    async def _fetch():
        try:
            service = get_market_dashboard_service()
            return await service.get_flow_detail()
        except Exception as e:
            logger.error(f"Dashboard flow error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    return await cache.get_or_set(
        f"uteki:dashboard:flow:{_today()}", _fetch, ttl=_TTL,
    )
