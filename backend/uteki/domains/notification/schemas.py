"""
Notification domain schemas.
"""

from pydantic import BaseModel
from typing import Optional


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    type: str
    title: str
    message: str
    is_read: bool
    extra_data: Optional[dict] = None
    created_at: str


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int


class MarkReadRequest(BaseModel):
    notification_ids: Optional[list[str]] = None  # None = mark all read
