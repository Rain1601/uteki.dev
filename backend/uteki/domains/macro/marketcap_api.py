"""Market Cap API — 全球资产市值排名端点"""

import logging

from fastapi import APIRouter, HTTPException, Query

from uteki.domains.macro.services.marketcap_scraper_service import get_marketcap_scraper_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
async def get_marketcap_list(
    asset_type: str = Query(None, description="Filter: company/precious_metal/cryptocurrency/etf"),
    limit: int = Query(200, ge=1, le=500, description="Max results"),
):
    """获取最新全球资产市值排名"""
    try:
        service = get_marketcap_scraper_service()
        data = await service.get_latest(asset_type=asset_type, limit=limit)
        return {"success": True, "data": data, "total": len(data)}
    except Exception as e:
        logger.error(f"Marketcap list error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary")
async def get_marketcap_summary():
    """获取各类型市值汇总"""
    try:
        service = get_marketcap_scraper_service()
        summary = await service.get_summary()
        return {"success": True, "data": summary}
    except Exception as e:
        logger.error(f"Marketcap summary error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync")
async def trigger_sync():
    """手动触发市值数据同步"""
    try:
        service = get_marketcap_scraper_service()
        count = await service.sync_to_db()
        return {"success": True, "synced": count}
    except Exception as e:
        logger.error(f"Marketcap sync error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
