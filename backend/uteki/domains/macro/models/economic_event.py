"""经济事件日历数据模型 - 统一FOMC会议、公司财报、经济数据发布等事件"""

from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy import String, Text, DateTime, Boolean, Float, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, get_table_args


class EconomicEvent(Base, TimestampMixin):
    """
    经济事件统一数据表
    支持多种事件类型：FOMC会议、公司财报、经济数据发布(CPI/就业)等
    """

    __tablename__ = "economic_events"
    __table_args__ = get_table_args(
        Index("idx_event_type_date", "event_type", "start_date"),
        Index("idx_event_status_date", "status", "start_date"),
        Index("idx_event_company_date", "company_symbol", "start_date"),
        Index("idx_event_importance_date", "importance", "start_date"),
        schema="macro"
    )

    # 主键 - 事件唯一ID
    id: Mapped[str] = mapped_column(String(100), primary_key=True)

    # 基础字段
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)  # fomc/earnings/economic_data/employment/inflation/consumption/gdp
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 时间字段
    start_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # 会议类事件结束时间
    publish_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # 数据发布时间

    # 状态字段
    status: Mapped[str] = mapped_column(String(20), default='upcoming')  # past/ongoing/upcoming
    importance: Mapped[str] = mapped_column(String(20), default='medium')  # low/medium/high/critical

    # 通用扩展字段（JSON存储）
    extra_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # FOMC特定字段
    has_press_conference: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    has_economic_projections: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)  # SEP
    quarter: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # Q1/Q2/Q3/Q4

    # 财报特定字段
    company_symbol: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # AAPL, TSLA
    company_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    fiscal_quarter: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # 2025Q1
    expected_eps: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_eps: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    expected_revenue: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_revenue: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # 经济数据特定字段
    indicator_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # CPI、失业率
    expected_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 预期值
    actual_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 实际值
    previous_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 前值
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # %、万人、点等

    # 数据源
    source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # fed/yahoo/fmp
    source_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    def to_dict(self) -> dict:
        """转换为字典"""
        result = {
            'id': self.id,
            'event_type': self.event_type,
            'title': self.title,
            'description': self.description,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'publish_time': self.publish_time.isoformat() if self.publish_time else None,
            'status': self.status,
            'importance': self.importance,
            'metadata': self.extra_data,
            # FOMC
            'has_press_conference': self.has_press_conference,
            'has_economic_projections': self.has_economic_projections,
            'quarter': self.quarter,
            # 财报
            'company_symbol': self.company_symbol,
            'company_name': self.company_name,
            'fiscal_quarter': self.fiscal_quarter,
            'expected_eps': self.expected_eps,
            'actual_eps': self.actual_eps,
            'expected_revenue': self.expected_revenue,
            'actual_revenue': self.actual_revenue,
            # 经济数据 - 支持多种字段名兼容前端
            'indicator_name': self.indicator_name,
            'expected_value': self.expected_value,
            'actual_value': self.actual_value,
            'previous_value': self.previous_value,
            'actual': self.actual_value,
            'forecast': self.expected_value,
            'forecast_value': self.expected_value,
            'previous': self.previous_value,
            'unit': self.unit,
            # 数据源
            'source': self.source,
            'source_url': self.source_url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        return result

    def __repr__(self):
        return f"<EconomicEvent(id={self.id}, type={self.event_type}, title={self.title})>"
