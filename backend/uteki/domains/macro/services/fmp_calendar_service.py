"""FMP Economic Calendar Service - 从 Financial Modeling Prep 获取经济日历数据"""

import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import httpx

from uteki.common.config import settings
from uteki.common.database import SupabaseRepository, db_manager

logger = logging.getLogger(__name__)

# DB 缓存 TTL（秒）— FMP 数据在 DB 中的有效期
CACHE_TTL_SECONDS = 3600  # 1 小时

# Supabase table name
EVENTS_TABLE = "economic_events"


def _get_events_repo() -> SupabaseRepository:
    return SupabaseRepository(EVENTS_TABLE)


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
        """从 FMP 获取经济日历数据"""
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
                    "start_date": event_datetime.isoformat(),
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
        """获取 FOMC 会议日程"""
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
                "start_date": meeting_date.isoformat(),
                "end_date": end_date.isoformat(),
                "status": status,
                "importance": "critical",
                "has_press_conference": meeting["has_press_conference"],
                "has_economic_projections": meeting["has_sep"],
                "quarter": meeting["quarter"],
                "source": "federal_reserve",
            })

        return meetings

    async def _save_events_to_db(self, events: List[Dict]) -> int:
        """将 FMP 事件 upsert 到 Supabase + SQLite 备份"""
        saved = 0
        now = datetime.utcnow().isoformat()
        repo = _get_events_repo()

        rows = []
        for event in events:
            try:
                rows.append({
                    "id": event["id"],
                    "event_type": event.get("event_type", "economic_data"),
                    "title": event.get("title", ""),
                    "start_date": event.get("start_date"),
                    "status": event.get("status", "upcoming"),
                    "importance": event.get("importance", "medium"),
                    "actual_value": event.get("actual_value"),
                    "expected_value": event.get("expected_value"),
                    "previous_value": event.get("previous_value"),
                    "source": "fmp",
                    "updated_at": now,
                })
                saved += 1
            except Exception as e:
                logger.warning(f"准备事件失败: {event.get('id')}, {e}")
                continue

        if rows:
            try:
                repo.upsert(rows)
                logger.info(f"已保存 {saved} 条 FMP 事件到 Supabase")

                # SQLite 备份
                try:
                    from uteki.domains.macro.models import EconomicEvent
                    async with db_manager.get_postgres_session() as session:
                        for row in rows:
                            db_event = EconomicEvent(**row)
                            await session.merge(db_event)
                except Exception as e:
                    logger.warning(f"SQLite backup failed for economic_events: {e}")
            except Exception as e:
                logger.warning(f"Supabase upsert failed: {e}")

        return saved

    async def _load_events_from_db(
        self,
        year: int,
        month: int,
        event_type: Optional[str] = None,
    ) -> Tuple[List[Dict], Optional[str]]:
        """从 Supabase 加载 FMP 缓存事件，返回 (events, max_updated_at)"""
        start_date = datetime(year, month, 1).isoformat()
        if month == 12:
            end_date = datetime(year + 1, 1, 1).isoformat()
        else:
            end_date = datetime(year, month + 1, 1).isoformat()

        repo = _get_events_repo()

        try:
            eq_filters: Dict[str, Any] = {"source": "fmp"}
            if event_type and event_type != "all" and "," not in event_type:
                eq_filters["event_type"] = event_type

            rows = repo.select_data(
                eq=eq_filters,
                gte={"start_date": start_date},
                lt={"start_date": end_date},
            )

            if event_type and event_type != "all" and "," in event_type:
                types = event_type.split(",")
                rows = [r for r in rows if r.get("event_type") in types]

            if not rows:
                return [], None

            max_updated = max(
                (r.get("updated_at", "") for r in rows if r.get("updated_at")),
                default=None
            )
            return rows, max_updated

        except Exception as e:
            logger.warning(f"Failed to load events from Supabase: {e}")
            return [], None

    async def get_monthly_events_enriched(
        self,
        year: int,
        month: int,
        event_type: Optional[str] = None,
        force_refresh: bool = False,
    ) -> Dict:
        """获取指定月份的所有经济事件（Supabase 缓存优先 + FMP 数据增强）"""
        try:
            start_date = datetime(year, month, 1)
            if month == 12:
                end_date = datetime(year + 1, 1, 1)
            else:
                end_date = datetime(year, month + 1, 1)

            # 1. 获取 FOMC 会议（内存数据，无延迟）
            fomc_meetings = self.get_fomc_meetings(year, month)

            # 2. Supabase-first 缓存策略获取 FMP 事件
            fmp_events: List[Dict] = []
            fmp_status = "failed"
            fmp_error = None

            db_events, max_updated = await self._load_events_from_db(year, month)

            cache_fresh = False
            if max_updated:
                try:
                    updated_dt = datetime.fromisoformat(max_updated.replace("Z", "+00:00").replace("+00:00", ""))
                    cache_fresh = (datetime.utcnow() - updated_dt).total_seconds() < CACHE_TTL_SECONDS
                except (ValueError, TypeError):
                    pass

            if db_events and cache_fresh and not force_refresh:
                fmp_events = db_events
                fmp_status = "cached"
                logger.info(f"使用 Supabase 缓存: {year}-{month:02d}, {len(fmp_events)} 条事件")
            else:
                fmp_result = await self.fetch_economic_calendar(
                    start_date.strftime("%Y-%m-%d"),
                    end_date.strftime("%Y-%m-%d")
                )

                if fmp_result["success"]:
                    fmp_events = fmp_result.get("data", [])
                    fmp_status = "success"
                    await self._save_events_to_db(fmp_events)
                elif db_events:
                    fmp_events = db_events
                    fmp_status = "cached_stale"
                    fmp_error = fmp_result.get("error")
                    logger.warning(f"FMP 失败，使用过期缓存: {fmp_error}")
                else:
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
                date = event.get("start_date", "")
                date_str = str(date)[:10]

                if date_str not in events_by_date:
                    events_by_date[date_str] = []

                events_by_date[date_str].append(event)

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

    async def get_statistics(self) -> Dict:
        """获取事件统计信息"""
        try:
            current_year = datetime.now().year
            fomc_count = len([m for m in FOMC_MEETINGS_2024_2025
                            if datetime.strptime(m["date"], "%Y-%m-%d").year == current_year])

            # 从 Supabase 聚合 FMP 事件统计
            repo = _get_events_repo()
            start_of_year = datetime(current_year, 1, 1).isoformat()
            end_of_year = datetime(current_year + 1, 1, 1).isoformat()

            try:
                rows = repo.select_data(
                    eq={"source": "fmp"},
                    gte={"start_date": start_of_year},
                    lt={"start_date": end_of_year},
                )

                # 手动按 event_type 分组计数
                db_counts: Dict[str, int] = {}
                for row in rows:
                    et = row.get("event_type", "other")
                    db_counts[et] = db_counts.get(et, 0) + 1

                if db_counts:
                    by_type = {"fomc": fomc_count, **db_counts}
                    total = fomc_count + sum(db_counts.values())
                else:
                    by_type = {"fomc": fomc_count}
                    total = fomc_count
            except Exception:
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
