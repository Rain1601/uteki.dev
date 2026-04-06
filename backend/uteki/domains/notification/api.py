"""
Notification API — in-app notification CRUD.

GET    /                   — list notifications
GET    /unread-count       — unread badge count
POST   /mark-read          — mark specific or all as read
DELETE /{notification_id}  — delete single notification
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from uteki.domains.auth.deps import get_current_user
from uteki.domains.notification.service import get_notification_service
from uteki.domains.notification.schemas import MarkReadRequest

router = APIRouter()


def _uid(user: dict) -> str:
    return user.get("user_id", "default")


@router.get("/")
async def list_notifications(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    user: dict = Depends(get_current_user),
):
    svc = get_notification_service()
    return await svc.list_notifications(_uid(user), limit, offset, unread_only)


@router.get("/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    svc = get_notification_service()
    count = await svc.get_unread_count(_uid(user))
    return {"unread_count": count}


@router.post("/mark-read")
async def mark_read(
    req: MarkReadRequest,
    user: dict = Depends(get_current_user),
):
    svc = get_notification_service()
    updated = await svc.mark_read(_uid(user), req.notification_ids)
    return {"updated": updated}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    user: dict = Depends(get_current_user),
):
    svc = get_notification_service()
    ok = await svc.delete_notification(_uid(user), notification_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "ok", "id": notification_id}
