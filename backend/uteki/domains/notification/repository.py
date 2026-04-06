"""
Notification domain repository — async SQLAlchemy data access.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from sqlalchemy import select, delete as sa_delete, func, update

from uteki.common.database import db_manager
from uteki.domains.notification.models import Notification

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _row_to_dict(row) -> dict:
    if hasattr(row, "__dict__"):
        d = {k: v for k, v in row.__dict__.items() if not k.startswith("_")}
    else:
        d = dict(row._mapping)
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


class NotificationRepository:

    @staticmethod
    async def create(
        user_id: str,
        type: str,
        title: str,
        message: str = "",
        extra_data: dict | None = None,
    ) -> dict:
        async with db_manager.get_postgres_session() as session:
            obj = Notification(
                id=str(uuid4()),
                user_id=user_id,
                type=type,
                title=title,
                message=message,
                extra_data=extra_data,
                created_at=_now(),
                updated_at=_now(),
            )
            session.add(obj)
            await session.flush()
            return _row_to_dict(obj)

    @staticmethod
    async def list_for_user(
        user_id: str,
        limit: int = 50,
        offset: int = 0,
        unread_only: bool = False,
    ) -> List[dict]:
        async with db_manager.get_postgres_session() as session:
            q = (
                select(Notification)
                .where(Notification.user_id == user_id)
                .order_by(Notification.created_at.desc())
                .offset(offset)
                .limit(limit)
            )
            if unread_only:
                q = q.where(Notification.is_read == False)  # noqa: E712
            rows = (await session.execute(q)).scalars().all()
            return [_row_to_dict(r) for r in rows]

    @staticmethod
    async def count_unread(user_id: str) -> int:
        async with db_manager.get_postgres_session() as session:
            q = (
                select(func.count())
                .select_from(Notification)
                .where(Notification.user_id == user_id)
                .where(Notification.is_read == False)  # noqa: E712
            )
            return (await session.execute(q)).scalar() or 0

    @staticmethod
    async def mark_read(user_id: str, notification_ids: list[str]) -> int:
        async with db_manager.get_postgres_session() as session:
            q = (
                update(Notification)
                .where(Notification.user_id == user_id)
                .where(Notification.id.in_(notification_ids))
                .values(is_read=True, updated_at=_now())
            )
            result = await session.execute(q)
            return result.rowcount

    @staticmethod
    async def mark_all_read(user_id: str) -> int:
        async with db_manager.get_postgres_session() as session:
            q = (
                update(Notification)
                .where(Notification.user_id == user_id)
                .where(Notification.is_read == False)  # noqa: E712
                .values(is_read=True, updated_at=_now())
            )
            result = await session.execute(q)
            return result.rowcount

    @staticmethod
    async def delete(user_id: str, notification_id: str) -> bool:
        async with db_manager.get_postgres_session() as session:
            q = (
                sa_delete(Notification)
                .where(Notification.id == notification_id)
                .where(Notification.user_id == user_id)
            )
            result = await session.execute(q)
            return result.rowcount > 0
