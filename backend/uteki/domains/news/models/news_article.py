"""新闻文章数据模型"""

from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, Float, Boolean, Index, JSON
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, get_table_args


class NewsArticle(Base, TimestampMixin):
    """新闻文章数据表"""

    __tablename__ = "news_articles"
    __table_args__ = get_table_args(
        Index("idx_news_source_published", "source", "published_at"),
        Index("idx_news_published", "published_at"),
        Index("idx_news_source", "source"),
        schema="news"
    )

    # 主键 - 使用URL hash作为ID
    id: Mapped[str] = mapped_column(String(50), primary_key=True)

    # 基础字段
    source: Mapped[str] = mapped_column(String(50), nullable=False)  # cnbc, reuters等
    title: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    url: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    author: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    published_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    # 扩展字段
    symbols: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON格式，关联股票代码
    sentiment_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 情感分数 -1到1
    sentiment_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # bullish/bearish/neutral
    category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    keywords: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # 关键词（逗号分隔）
    tags: Mapped[Optional[List]] = mapped_column(JSON, default=list, nullable=True)  # 标签数组

    # 完整内容字段
    content_full: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # 完整正文（网页爬取）
    summary_keypoints: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Key Points摘要
    is_full_content: Mapped[bool] = mapped_column(Boolean, default=False)  # 是否已爬取完整内容
    scraped_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # LLM摘要
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # LLM生成的智能摘要

    # 翻译字段（中文）
    title_zh: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_zh: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_full_zh: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary_keypoints_zh: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    translation_status: Mapped[str] = mapped_column(String(20), default='pending')  # pending/completed/failed
    translated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    translation_model: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # AI分析字段
    ai_analysis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_impact: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # positive/negative/neutral
    ai_analysis_status: Mapped[str] = mapped_column(String(20), default='pending')  # pending/completed/failed
    ai_analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ai_analysis_model: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # 反馈字段
    ai_feedback_like_count: Mapped[int] = mapped_column(default=0)
    ai_feedback_dislike_count: Mapped[int] = mapped_column(default=0)
    ai_feedback_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # 重要性标记
    important: Mapped[bool] = mapped_column(Boolean, default=False)

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "id": self.id,
            "source": self.source,
            "title": self.title,
            "title_zh": self.title_zh,
            "content": self.content,
            "content_zh": self.content_zh,
            "summary": self.summary,
            "url": self.url,
            "author": self.author,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "publish_time": self.published_at.isoformat() if self.published_at else None,
            "time": self.published_at.strftime("%H:%M") if self.published_at else None,
            "date": self.published_at.strftime("%Y-%m-%d") if self.published_at else None,
            "headline": self.title,
            "symbols": self.symbols,
            "sentiment_score": self.sentiment_score,
            "sentiment_type": self.sentiment_type,
            "category": self.category,
            "keywords": self.keywords.split(',') if self.keywords else [],
            "tags": self.tags or [],
            "important": self.important,
            "content_full": self.content_full,
            "content_full_zh": self.content_full_zh,
            "ai_analysis": self.ai_analysis,
            "ai_impact": self.ai_impact,
            "ai_analysis_status": self.ai_analysis_status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f"<NewsArticle(id={self.id}, source={self.source}, title={self.title[:30]}...)>"
