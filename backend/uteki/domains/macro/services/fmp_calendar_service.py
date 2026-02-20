"""FMP Economic Calendar Service - 从 Financial Modeling Prep 获取经济日历数据"""

import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import httpx
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.common.config import settings
from uteki.domains.macro.models import EconomicEvent

logger = logging.getLogger(__name__)

# DB 缓存 TTL（秒）— FMP 数据在 DB 中的有效期
CACHE_TTL_SECONDS = 3600  # 1 小时


# FOMC 会议日程表（手动维护）
FOMC_MEETINGS_2024_2025 = [
    {"date": "2024-01-30", "end_date": "2024-01-31", "has_press_conference": True, "has_sep": False, "quarter": "Q1"},
    {"date": "2024-03-19", "end_date": "2024-03-20", "has_press_conference": True, "has_sep": True, "quarter": "Q1"},
    {"date": "2024-04-30", "end_date": "2024-05-01", "has_press_conference": True, "has_sep": False, "quarter": "Q2"},
    {"date": "2024-06-11", "end_date": "2024-06-12", "has_press_conference": True, "has_sep": True, "quarter": "Q2"},
    {"date": "2024-07-30", "end_date": "2024-07-31", "has_press_conference": True, "has_sep": False, "quarter": "Q3"},
    {"date": "2024-09-17", "end_date": "2024-09-18", "has_press_conference": True, "has_sep": True, "quarter": "Q3"},
    {"date": "2024-11-06", "end_date": "2024-11-07", "has_press_conference": True, "has_sep": False, "quarter": "Q4"},
    {"date": "2024-12-17", "end_date": "2024-12-18", "has_press_conference": True, "has_sep": True, "quarter": "Q4"},
    {"date": "2025-01-28", "end_date": "2025-01-29", "has_press_conference": True, "has_sep": False, "quarter": "Q1"},
    {"date": "2025-03-18", "end_date": "2025-03-19", "has_press_conference": True, "has_sep": True, "quarter": "Q1"},
    {"date": "2025-05-06", "end_date": "2025-05-07", "has_press_conference": True, "has_sep": False, "quarter": "Q2"},
    {"date": "2025-06-17", "end_date": "2025-06-18", "has_press_conference": True, "has_sep": True, "quarter": "Q2"},
    {"date": "2025-07-29", "end_date": "2025-07-30", "has_press_conference": True, "has_sep": False, "quarter": "Q3"},
    {"date": "2025-09-16", "end_date": "2025-09-17", "has_press_conference": True, "has_sep": True, "quarter": "Q3"},
    {"date": "2025-11-05", "end_date": "2025-11-06", "has_press_conference": True, "has_sep": False, "quarter": "Q4"},
    {"date": "2025-12-16", "end_date": "2025-12-17", "has_press_conference": True, "has_sep": True, "quarter": "Q4"},
    {"date": "2026-01-27", "end_date": "2026-01-28", "has_press_conference": True, "has_sep": False, "quarter": "Q1"},
    {"date": "2026-03-17", "end_date": "2026-03-18", "has_press_conference": True, "has_sep": True, "quarter": "Q1"},
]


class FMPCalendarService:
    """FMP 经济日历服务"""

    BASE_URL = "https://financialmodelingprep.com"

    # 事件类型映射
    EVENT_TYPE_MAPPING = {
        "CPI": "inflation",
        "PPI": "inflation",
        "Core CPI": "inflation",
        "Core PPI": "inflation",
        "Non-Farm Payrolls": "employment",
        "Unemployment Rate": "employment",
        "Initial Jobless Claims": "employment",
        "GDP": "gdp",
        "GDP Growth Rate": "gdp",
        "Retail Sales": "consumption",
        "Consumer Confidence": "consumption",
        "Consumer Spending": "consumption",
        "PMI": "economic_data",
        "ISM Manufacturing": "economic_data",
    }

    def __init__(self):
        self.api_key = settings.fmp_api_key
        if not self.api_key:
            logger.warning("FMP API 密钥未配置")
        else:
            logger.info("FMP 经济日历服务初始化完成")

    async def fetch_economic_calendar(
        self,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None
    ) -> Dict:
        """
        从 FMP 获取经济日历数据

        Args:
            from_date: 开始日期 YYYY-MM-DD
            to_date: 结束日期 YYYY-MM-DD

        Returns:
            {"success": bool, "data": List[Dict], "error": Optional[str]}
        """
        if not self.api_key:
            return {"success": False, "error": "FMP API 密钥未配置", "data": []}

        try:
            if not from_date:
                from_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            if not to_date:
                to_date = datetime.now().strftime("%Y-%m-%d")

            logger.info(f"从 FMP 获取经济日历数据: {from_date} to {to_date}")

            url = f"{self.BASE_URL}/stable/economic-calendar"
            params = {
                "apikey": self.api_key,
                "from": from_date,
                "to": to_date
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, params=params)

            if response.status_code != 200:
                logger.error(f"FMP API 请求失败: {response.status_code}")
                return {"success": False, "error": f"FMP API 错误: {response.status_code}", "data": []}

            data = response.json()

            if not isinstance(data, list):
                return {"success": False, "error": "FMP 响应格式错误", "data": []}

            logger.info(f"成功获取 {len(data)} 条经济事件")
            parsed_events = self._parse_fmp_events(data)

            return {"success": True, "data": parsed_events, "count": len(parsed_events)}

        except Exception as e:
            logger.error(f"获取经济日历失败: {e}", exc_info=True)
            return {"success": False, "error": str(e), "data": []}

    def _parse_fmp_events(self, fmp_data: List[Dict]) -> List[Dict]:
        """解析 FMP 经济事件数据"""
        parsed = []

        for event in fmp_data:
            try:
                event_datetime = datetime.strptime(event.get("date", ""), "%Y-%m-%d %H:%M:%S")
                event_name = event.get("event", "")

                # 确定事件类型
                event_type = "economic_data"
                for fmp_key, our_type in self.EVENT_TYPE_MAPPING.items():
                    if fmp_key.lower() in event_name.lower():
                        event_type = our_type
                        break

                parsed_event = {
                    "id": f"fmp_{event_datetime.strftime('%Y%m%d')}_{event_name.replace(' ', '_')[:30]}",
                    "title": event_name,
                    "event_type": event_type,
                    "start_date": event_datetime,
                    "status": "past" if event_datetime < datetime.now() else "upcoming",
                    "importance": event.get("impact", "medium").lower(),
                    "actual_value": event.get("actual"),
                    "expected_value": event.get("estimate"),
                    "previous_value": event.get("previous"),
                    "source": "fmp",
                }

                parsed.append(parsed_event)

            except Exception as e:
                logger.warning(f"解析事件失败: {event.get('event', 'Unknown')}, {e}")
                continue

        return parsed

    def get_fomc_meetings(
        self,
        year: int,
        month: Optional[int] = None
    ) -> List[Dict]:
        """
        获取 FOMC 会议日程

        Args:
            year: 年份
            month: 月份（可选，如果提供则只返回该月的会议）

        Returns:
            FOMC 会议列表
        """
        meetings = []
        now = datetime.now()

        for meeting in FOMC_MEETINGS_2024_2025:
            meeting_date = datetime.strptime(meeting["date"], "%Y-%m-%d")

            if meeting_date.year != year:
                continue

            if month and meeting_date.month != month:
                continue

            end_date = datetime.strptime(meeting["end_date"], "%Y-%m-%d")

            status = "past"
            if meeting_date > now:
                status = "upcoming"
            elif meeting_date <= now <= end_date:
                status = "ongoing"

            meetings.append({
                "id": f"fomc_{meeting_date.strftime('%Y%m%d')}",
                "title": f"FOMC Meeting ({meeting['quarter']})",
                "event_type": "fomc",
                "start_date": meeting_date,
                "end_date": end_date,
                "status": status,
                "importance": "critical",
                "has_press_conference": meeting["has_press_conference"],
                "has_economic_projections": meeting["has_sep"],
                "quarter": meeting["quarter"],
                "source": "federal_reserve",
            })

        return meetings

    async def _save_events_to_db(self, session: AsyncSession, events: List[Dict]) -> int:
        """将 FMP 事件 upsert 到 economic_events 表"""
        saved = 0
        now = datetime.utcnow()
        for event in events:
            try:
                start_date = event.get("start_date")
                if isinstance(start_date, str):
                    start_date = datetime.fromisoformat(start_date)

                db_event = EconomicEvent(
                    id=event["id"],
                    event_type=event.get("event_type", "economic_data"),
                    title=event.get("title", ""),
                    start_date=start_date,
                    status=event.get("status", "upcoming"),
                    importance=event.get("importance", "medium"),
                    actual_value=event.get("actual_value"),
                    expected_value=event.get("expected_value"),
                    previous_value=event.get("previous_value"),
                    source="fmp",
                )
                db_event.updated_at = now
                await session.merge(db_event)
                saved += 1
            except Exception as e:
                logger.warning(f"保存事件失败: {event.get('id')}, {e}")
                continue
        await session.commit()
        logger.info(f"已保存 {saved} 条 FMP 事件到 DB")
        return saved

    async def _load_events_from_db(
        self,
        session: AsyncSession,
        year: int,
        month: int,
        event_type: Optional[str] = None,
    ) -> Tuple[List[Dict], Optional[datetime]]:
        """从 DB 加载 FMP 缓存事件，返回 (events, max_updated_at)"""
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1)
        else:
            end_date = datetime(year, month + 1, 1)

        query = select(EconomicEvent).where(
            EconomicEvent.source == "fmp",
            EconomicEvent.start_date >= start_date,
            EconomicEvent.start_date < end_date,
        )

        if event_type and event_type != "all":
            if "," in event_type:
                types = event_type.split(",")
                query = query.where(EconomicEvent.event_type.in_(types))
            else:
                query = query.where(EconomicEvent.event_type == event_type)

        result = await session.execute(query)
        rows = result.scalars().all()

        if not rows:
            return [], None

        events = [row.to_dict() for row in rows]
        max_updated = max(row.updated_at for row in rows if row.updated_at)
        return events, max_updated

    async def get_monthly_events_enriched(
        self,
        session: AsyncSession,
        year: int,
        month: int,
        event_type: Optional[str] = None,
        force_refresh: bool = False,
    ) -> Dict:
        """
        获取指定月份的所有经济事件（DB 缓存优先 + FMP 数据增强）

        Returns:
            {"success": bool, "data": Dict[str, List], "fmp_status": str}
        """
        try:
            start_date = datetime(year, month, 1)
            if month == 12:
                end_date = datetime(year + 1, 1, 1)
            else:
                end_date = datetime(year, month + 1, 1)

            # 1. 获取 FOMC 会议（内存数据，无延迟）
            fomc_meetings = self.get_fomc_meetings(year, month)

            # 2. DB-first 缓存策略获取 FMP 事件
            fmp_events: List[Dict] = []
            fmp_status = "failed"
            fmp_error = None

            # 先查 DB 缓存（event_type 过滤在 DB 层做，FOMC 过滤在合并后做）
            db_events, max_updated = await self._load_events_from_db(
                session, year, month
            )

            cache_fresh = (
                max_updated is not None
                and (datetime.utcnow() - max_updated).total_seconds() < CACHE_TTL_SECONDS
            )

            if db_events and cache_fresh and not force_refresh:
                # DB 缓存有效，直接使用
                fmp_events = db_events
                fmp_status = "cached"
                logger.info(f"使用 DB 缓存: {year}-{month:02d}, {len(fmp_events)} 条事件")
            else:
                # 缓存过期或不存在，调用 FMP API
                fmp_result = await self.fetch_economic_calendar(
                    start_date.strftime("%Y-%m-%d"),
                    end_date.strftime("%Y-%m-%d")
                )

                if fmp_result["success"]:
                    fmp_events = fmp_result.get("data", [])
                    fmp_status = "success"
                    # 写入 DB 缓存
                    await self._save_events_to_db(session, fmp_events)
                elif db_events:
                    # FMP 失败但有旧缓存，使用旧数据
                    fmp_events = db_events
                    fmp_status = "cached_stale"
                    fmp_error = fmp_result.get("error")
                    logger.warning(f"FMP 失败，使用过期缓存: {fmp_error}")
                else:
                    # FMP 失败且无缓存
                    fmp_status = "failed"
                    fmp_error = fmp_result.get("error")

            # 3. 合并所有事件
            all_events = fomc_meetings + fmp_events

            # 4. 过滤事件类型
            if event_type and event_type != "all":
                if "," in event_type:
                    types = event_type.split(",")
                    all_events = [e for e in all_events if e.get("event_type") in types]
                else:
                    all_events = [e for e in all_events if e.get("event_type") == event_type]

            # 5. 按日期分组
            events_by_date: Dict[str, List] = {}
            for event in all_events:
                date = event.get("start_date")
                if isinstance(date, datetime):
                    date_str = date.strftime("%Y-%m-%d")
                else:
                    date_str = str(date)[:10]

                if date_str not in events_by_date:
                    events_by_date[date_str] = []

                # 转换 datetime 为字符串
                event_dict = dict(event)
                if isinstance(event_dict.get("start_date"), datetime):
                    event_dict["start_date"] = event_dict["start_date"].isoformat()
                if isinstance(event_dict.get("end_date"), datetime):
                    event_dict["end_date"] = event_dict["end_date"].isoformat()

                events_by_date[date_str].append(event_dict)

            return {
                "success": True,
                "data": events_by_date,
                "fmp_status": fmp_status,
                "fmp_error": fmp_error,
                "enriched_count": len(fmp_events)
            }

        except Exception as e:
            logger.error(f"获取月度事件失败: {e}", exc_info=True)
            return {
                "success": False,
                "data": {},
                "error": str(e)
            }

    async def get_statistics(self, session: AsyncSession) -> Dict:
        """获取事件统计信息（优先从 DB 聚合）"""
        try:
            current_year = datetime.now().year
            fomc_count = len([m for m in FOMC_MEETINGS_2024_2025
                            if datetime.strptime(m["date"], "%Y-%m-%d").year == current_year])

            # 尝试从 DB 聚合 FMP 事件统计
            query = (
                select(EconomicEvent.event_type, func.count())
                .where(
                    EconomicEvent.source == "fmp",
                    EconomicEvent.start_date >= datetime(current_year, 1, 1),
                    EconomicEvent.start_date < datetime(current_year + 1, 1, 1),
                )
                .group_by(EconomicEvent.event_type)
            )
            result = await session.execute(query)
            db_counts = {row[0]: row[1] for row in result.all()}

            if db_counts:
                by_type = {"fomc": fomc_count, **db_counts}
                total = fomc_count + sum(db_counts.values())
            else:
                by_type = {"fomc": fomc_count}
                total = fomc_count

            return {
                "success": True,
                "data": {
                    "total": total,
                    "by_type": by_type,
                }
            }
        except Exception as e:
            logger.error(f"获取统计信息失败: {e}")
            return {"success": False, "data": {"total": 0}}


# 全局单例
_fmp_service: Optional[FMPCalendarService] = None


def get_fmp_calendar_service() -> FMPCalendarService:
    """获取全局 FMP 日历服务实例"""
    global _fmp_service
    if _fmp_service is None:
        _fmp_service = FMPCalendarService()
    return _fmp_service
