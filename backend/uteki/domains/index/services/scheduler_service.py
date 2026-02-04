"""决策调度器服务"""

import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.domains.index.models.schedule_task import ScheduleTask

logger = logging.getLogger(__name__)

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
]


class SchedulerService:
    """调度任务管理 — CRUD + 执行状态追踪"""

    async def list_tasks(self, session: AsyncSession) -> List[Dict[str, Any]]:
        query = select(ScheduleTask).order_by(ScheduleTask.created_at.asc())
        result = await session.execute(query)
        return [t.to_dict() for t in result.scalars().all()]

    async def get_task(self, task_id: str, session: AsyncSession) -> Optional[Dict[str, Any]]:
        query = select(ScheduleTask).where(ScheduleTask.id == task_id)
        result = await session.execute(query)
        task = result.scalar_one_or_none()
        return task.to_dict() if task else None

    async def create_task(
        self,
        name: str,
        cron_expression: str,
        task_type: str,
        session: AsyncSession,
        config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        task = ScheduleTask(
            name=name,
            cron_expression=cron_expression,
            task_type=task_type,
            config=config,
            is_enabled=True,
        )
        session.add(task)
        await session.commit()
        await session.refresh(task)
        logger.info(f"Schedule task created: {task.id} name={name} cron={cron_expression}")
        return task.to_dict()

    async def update_task(
        self,
        task_id: str,
        session: AsyncSession,
        cron_expression: Optional[str] = None,
        is_enabled: Optional[bool] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        query = select(ScheduleTask).where(ScheduleTask.id == task_id)
        result = await session.execute(query)
        task = result.scalar_one_or_none()
        if not task:
            return None

        if cron_expression is not None:
            task.cron_expression = cron_expression
        if is_enabled is not None:
            task.is_enabled = is_enabled
        if config is not None:
            task.config = config

        await session.commit()
        await session.refresh(task)
        return task.to_dict()

    async def delete_task(self, task_id: str, session: AsyncSession) -> bool:
        query = select(ScheduleTask).where(ScheduleTask.id == task_id)
        result = await session.execute(query)
        task = result.scalar_one_or_none()
        if not task:
            return False
        await session.delete(task)
        await session.commit()
        return True

    async def update_run_status(
        self,
        task_id: str,
        status: str,
        session: AsyncSession,
    ) -> None:
        query = select(ScheduleTask).where(ScheduleTask.id == task_id)
        result = await session.execute(query)
        task = result.scalar_one_or_none()
        if task:
            task.last_run_at = datetime.now(timezone.utc)
            task.last_run_status = status
            await session.commit()

    async def seed_defaults(self, session: AsyncSession) -> int:
        """预设默认调度任务（仅当表为空时）"""
        query = select(func.count()).select_from(ScheduleTask)
        result = await session.execute(query)
        count = result.scalar_one()
        if count > 0:
            return 0

        added = 0
        for s in DEFAULT_SCHEDULES:
            task = ScheduleTask(
                name=s["name"],
                cron_expression=s["cron_expression"],
                task_type=s["task_type"],
                config=s["config"],
                is_enabled=True,
            )
            session.add(task)
            added += 1

        await session.commit()
        logger.info(f"Seeded {added} default schedule tasks")
        return added


    async def get_enabled_tasks(self, session: AsyncSession) -> List[Dict[str, Any]]:
        """获取所有启用的调度任务（用于进程重启恢复）"""
        query = select(ScheduleTask).where(ScheduleTask.is_enabled == True).order_by(ScheduleTask.created_at.asc())
        result = await session.execute(query)
        return [t.to_dict() for t in result.scalars().all()]

    async def compute_next_run(self, task_id: str, session: AsyncSession) -> Optional[str]:
        """计算下一次运行时间"""
        try:
            from croniter import croniter
            query = select(ScheduleTask).where(ScheduleTask.id == task_id)
            result = await session.execute(query)
            task = result.scalar_one_or_none()
            if not task:
                return None

            cron = croniter(task.cron_expression, datetime.now(timezone.utc))
            next_run = cron.get_next(datetime)
            task.next_run_at = next_run
            await session.commit()
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
