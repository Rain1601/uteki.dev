"""新闻 API - Jeff Cox 新闻相关接口"""

import logging
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.common.database import get_session
from uteki.domains.news.services import get_jeff_cox_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/jeff-cox/monthly/{year}/{month}")
async def get_monthly_news(
    year: int,
    month: int,
    category: Optional[str] = Query(None, description="分类筛选: all/important/crypto/stocks/forex"),
    session: AsyncSession = Depends(get_session)
):
    """
    获取指定月份的 Jeff Cox 新闻

    Returns:
        按日期分组的新闻字典 {"2024-01-15": [...], "2024-01-16": [...]}
    """
    try:
        service = get_jeff_cox_service()
        news_by_date = await service.get_monthly_news(session, year, month, category)

        return {
            "success": True,
            "data": news_by_date,
            "date_range": {
                "start_date": f"{year}-{month:02d}-01",
                "end_date": f"{year}-{month:02d}-28"  # 简化
            },
            "category": category
        }

    except Exception as e:
        logger.error(f"获取月度新闻失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jeff-cox/article/{article_id}")
async def get_article_detail(
    article_id: str,
    session: AsyncSession = Depends(get_session)
):
    """获取文章详情"""
    try:
        service = get_jeff_cox_service()
        article = await service.get_article_by_id(session, article_id)

        if not article:
            raise HTTPException(status_code=404, detail="文章不存在")

        return {
            "success": True,
            "data": article.to_dict()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取文章详情失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jeff-cox/latest")
async def get_latest_news(
    limit: int = Query(10, ge=1, le=100),
    session: AsyncSession = Depends(get_session)
):
    """获取最新新闻"""
    try:
        service = get_jeff_cox_service()
        articles = await service.get_latest_news(session, limit)

        return {
            "success": True,
            "data": [article.to_dict() for article in articles],
            "total_count": len(articles)
        }

    except Exception as e:
        logger.error(f"获取最新新闻失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jeff-cox/scrape")
async def trigger_scrape(
    max_news: int = Query(10, ge=1, le=50),
    session: AsyncSession = Depends(get_session)
):
    """
    手动触发新闻抓取

    Returns:
        抓取结果统计
    """
    try:
        service = get_jeff_cox_service()
        result = await service.collect_and_enrich(session, max_news)

        return result

    except Exception as e:
        logger.error(f"触发抓取失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
