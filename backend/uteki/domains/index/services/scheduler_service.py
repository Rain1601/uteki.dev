"""决策调度器服务 — Supabase REST API 版"""

import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from uuid import uuid4

from uteki.common.database import SupabaseRepository, db_manager

logger = logging.getLogger(__name__)

TABLE = "schedule_task"

# 默认调度任务
DEFAULT_SCHEDULES = [
    {
        "name": "monthly_dca",
        "cron_expression": "0 9 1 * *",
        "task_type": "arena_analysis",
        "config": {"harness_type": "monthly_dca", "budget": 1000},
    },
    {
        "name": "weekly_check",
        "cron_expression": "0 9 * * 1",
        "task_type": "arena_analysis",
        "config": {"harness_type": "weekly_check"},
    },
    {
        "name": "monthly_reflection",
        "cron_expression": "0 18 28 * *",
        "task_type": "reflection",
        "config": {},
    },
    {
        "name": "daily_price_update",
        "cron_expression": "0 5 * * *",  # UTC 5:00 = US market close + buffer
        "task_type": "price_update",
        "config": {
            "validate_after_update": True,  # 更新后验证异常价格
            "enable_backfill": True,        # 启用智能回填（补齐漏执行的数据）
        },
    },
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_id(data: dict) -> dict:
    """Ensure dict has id + timestamps for a new row."""
    if "id" not in data:
        data["id"] = str(uuid4())
    data.setdefault("created_at", _now_iso())
    data.setdefault("updated_at", _now_iso())
    return data


async def _backup_rows(rows: list):
    """Best-effort SQLite backup (failure only warns)."""
    try:
        from uteki.domains.index.models.schedule_task import ScheduleTask
        async with db_manager.get_postgres_session() as session:
            for row in rows:
                safe = {k: v for k, v in row.items() if hasattr(ScheduleTask, k)}
                await session.merge(ScheduleTask(**safe))
    except Exception as e:
        logger.warning(f"SQLite backup failed for {TABLE}: {e}")


class SchedulerService:
    """调度任务管理 — CRUD + 执行状态追踪"""

    def __init__(self):
        self.repo = SupabaseRepository(TABLE)

    async def list_tasks(self) -> List[Dict[str, Any]]:
        return self.repo.select_data(order="created_at.asc")

    async def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        return self.repo.select_one(eq={"id": task_id})

    async def create_task(
        self,
        name: str,
        cron_expression: str,
        task_type: str,
        config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        data = _ensure_id({
            "name": name,
            "cron_expression": cron_expression,
            "task_type": task_type,
            "config": config,
            "is_enabled": True,
        })
        result = self.repo.upsert(data)
        row = result.data[0] if result.data else data
        await _backup_rows([row])
        logger.info(f"Schedule task created: {row.get('id')} name={name} cron={cron_expression}")
        return row

    async def update_task(
        self,
        task_id: str,
        cron_expression: Optional[str] = None,
        is_enabled: Optional[bool] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        existing = self.repo.select_one(eq={"id": task_id})
        if not existing:
            return None

        update_data: Dict[str, Any] = {"updated_at": _now_iso()}
        if cron_expression is not None:
            update_data["cron_expression"] = cron_expression
        if is_enabled is not None:
            update_data["is_enabled"] = is_enabled
        if config is not None:
            update_data["config"] = config

        result = self.repo.update(data=update_data, eq={"id": task_id})
        row = result.data[0] if result.data else {**existing, **update_data}
        await _backup_rows([row])
        return row

    async def delete_task(self, task_id: str) -> bool:
        existing = self.repo.select_one(eq={"id": task_id})
        if not existing:
            return False
        self.repo.delete(eq={"id": task_id})
        return True

    async def update_run_status(
        self,
        task_id: str,
        status: str,
    ) -> None:
        self.repo.update(
            data={
                "last_run_at": _now_iso(),
                "last_run_status": status,
                "updated_at": _now_iso(),
            },
            eq={"id": task_id},
        )

    async def seed_defaults(self) -> int:
        """预设默认调度任务（仅当表为空时）"""
        result = self.repo.select("*", count="exact")
        count = result.count if result.count is not None else len(result.data)
        if count > 0:
            return 0

        added = 0
        for s in DEFAULT_SCHEDULES:
            data = _ensure_id({
                "name": s["name"],
                "cron_expression": s["cron_expression"],
                "task_type": s["task_type"],
                "config": s["config"],
                "is_enabled": True,
            })
            self.repo.upsert(data)
            added += 1

        logger.info(f"Seeded {added} default schedule tasks")
        return added

    async def get_enabled_tasks(self) -> List[Dict[str, Any]]:
        """获取所有启用的调度任务（用于进程重启恢复）"""
        return self.repo.select_data(eq={"is_enabled": True}, order="created_at.asc")

    async def compute_next_run(self, task_id: str) -> Optional[str]:
        """计算下一次运行时间"""
        try:
            from croniter import croniter
            task = self.repo.select_one(eq={"id": task_id})
            if not task:
                return None

            cron = croniter(task["cron_expression"], datetime.now(timezone.utc))
            next_run = cron.get_next(datetime)
            self.repo.update(
                data={"next_run_at": next_run.isoformat(), "updated_at": _now_iso()},
                eq={"id": task_id},
            )
            return next_run.isoformat()
        except ImportError:
            logger.warning("croniter not installed — next_run computation skipped")
            return None
        except Exception as e:
            logger.error(f"Failed to compute next_run for {task_id}: {e}")
            return None


_scheduler_service: Optional[SchedulerService] = None


def get_scheduler_service() -> SchedulerService:
    global _scheduler_service
    if _scheduler_service is None:
        _scheduler_service = SchedulerService()
    return _scheduler_service
