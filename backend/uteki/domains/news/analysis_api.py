"""新闻 AI 分析 API - 流式分析新闻和经济事件"""

import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.common.database import get_session
from uteki.domains.news.services import get_news_analysis_service

logger = logging.getLogger(__name__)
router = APIRouter()


class NewsAnalysisRequest(BaseModel):
    """新闻分析请求"""
    title: str
    content: str
    source: Optional[str] = None
    publish_date: Optional[str] = None
    article_id: Optional[str] = None


class EventAnalysisRequest(BaseModel):
    """经济事件分析请求"""
    event_title: str
    event_date: str
    event_type: Optional[str] = "economic_data"
    description: Optional[str] = None
    actual_value: Optional[str] = None
    forecast_value: Optional[str] = None
    previous_value: Optional[str] = None


@router.post("/analyze-news-stream")
async def analyze_news_stream(
    request: NewsAnalysisRequest,
    session: AsyncSession = Depends(get_session)
):
    """
    流式分析新闻内容（Server-Sent Events）

    实时返回 AI 分析结果
    """
    async def generate():
        try:
            service = get_news_analysis_service()

            async for chunk in service.analyze_news_stream(
                title=request.title,
                content=request.content,
                source=request.source,
                article_id=request.article_id,
                session=session
            ):
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

        except Exception as e:
            logger.error(f"流式分析失败: {e}", exc_info=True)
            yield f"data: {json.dumps({'error': str(e), 'done': True}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/analyze-event-stream")
async def analyze_event_stream(request: EventAnalysisRequest):
    """
    流式分析经济事件（Server-Sent Events）

    实时返回 AI 分析结果
    """
    async def generate():
        try:
            service = get_news_analysis_service()

            async for chunk in service.analyze_event_stream(
                event_title=request.event_title,
                event_date=request.event_date,
                event_type=request.event_type,
                actual_value=request.actual_value,
                forecast_value=request.forecast_value,
                previous_value=request.previous_value,
                description=request.description
            ):
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

        except Exception as e:
            logger.error(f"流式事件分析失败: {e}", exc_info=True)
            yield f"data: {json.dumps({'error': str(e), 'done': True}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
