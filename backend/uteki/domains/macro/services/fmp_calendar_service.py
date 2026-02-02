"""FMP Economic Calendar Service - 从 Financial Modeling Prep 获取经济日历数据"""

import logging
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.common.config import settings
from uteki.domains.macro.models import EconomicEvent

logger = logging.getLogger(__name__)


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

    async def get_monthly_events_enriched(
        self,
        session: AsyncSession,
        year: int,
        month: int,
        event_type: Optional[str] = None
    ) -> Dict:
        """
        获取指定月份的所有经济事件（包含 FMP 数据增强）

        Returns:
            {"success": bool, "data": Dict[str, List], "fmp_status": str}
        """
        try:
            start_date = datetime(year, month, 1)
            if month == 12:
                end_date = datetime(year + 1, 1, 1)
            else:
                end_date = datetime(year, month + 1, 1)

            # 1. 获取 FOMC 会议
            fomc_meetings = self.get_fomc_meetings(year, month)

            # 2. 获取 FMP 经济数据
            fmp_result = await self.fetch_economic_calendar(
                start_date.strftime("%Y-%m-%d"),
                end_date.strftime("%Y-%m-%d")
            )

            fmp_events = fmp_result.get("data", []) if fmp_result["success"] else []
            fmp_status = "success" if fmp_result["success"] else "failed"

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
                "fmp_error": fmp_result.get("error") if not fmp_result["success"] else None,
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
        """获取事件统计信息"""
        try:
            # 简单统计：FOMC 会议数和当前年份
            current_year = datetime.now().year
            fomc_count = len([m for m in FOMC_MEETINGS_2024_2025
                            if datetime.strptime(m["date"], "%Y-%m-%d").year == current_year])

            return {
                "success": True,
                "data": {
                    "total": fomc_count,
                    "by_type": {
                        "fomc": fomc_count,
                    }
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
