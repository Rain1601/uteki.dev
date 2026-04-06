"""
Notification domain service — business logic + typed notification helpers.
"""

import logging
from typing import Optional

from uteki.domains.notification.repository import NotificationRepository

logger = logging.getLogger(__name__)


class NotificationService:

    def __init__(self):
        self.repo = NotificationRepository()

    async def list_notifications(
        self, user_id: str, limit: int = 50, offset: int = 0, unread_only: bool = False
    ) -> dict:
        items = await self.repo.list_for_user(user_id, limit, offset, unread_only)
        unread_count = await self.repo.count_unread(user_id)
        return {"items": items, "unread_count": unread_count}

    async def get_unread_count(self, user_id: str) -> int:
        return await self.repo.count_unread(user_id)

    async def mark_read(self, user_id: str, notification_ids: Optional[list[str]] = None) -> int:
        if notification_ids:
            return await self.repo.mark_read(user_id, notification_ids)
        return await self.repo.mark_all_read(user_id)

    async def delete_notification(self, user_id: str, notification_id: str) -> bool:
        return await self.repo.delete(user_id, notification_id)

    # -- Typed notification helpers --

    async def notify_arena_complete(
        self, user_id: str, harness_id: str, winner_model: str, winner_action: str
    ):
        await self.repo.create(
            user_id=user_id,
            type="arena_complete",
            title=f"Arena 完成: {winner_action}",
            message=f"模型 {winner_model} 胜出，建议操作: {winner_action}",
            extra_data={"harness_id": harness_id, "winner_model": winner_model, "action": winner_action},
        )

    async def notify_company_complete(
        self, user_id: str, analysis_id: str, symbol: str, verdict_action: str, conviction: float
    ):
        await self.repo.create(
            user_id=user_id,
            type="company_complete",
            title=f"{symbol} 分析完成: {verdict_action}",
            message=f"置信度 {conviction:.0%}",
            extra_data={"analysis_id": analysis_id, "symbol": symbol, "action": verdict_action},
        )

    async def notify_company_error(self, user_id: str, symbol: str, error_message: str):
        await self.repo.create(
            user_id=user_id,
            type="company_error",
            title=f"{symbol} 分析失败",
            message=error_message[:500],
            extra_data={"symbol": symbol},
        )


# Singleton
_service: Optional[NotificationService] = None


def get_notification_service() -> NotificationService:
    global _service
    if _service is None:
        _service = NotificationService()
    return _service
