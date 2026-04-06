"""Integration tests for M3 — Notification system API."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from tests.conftest import TEST_USER_ID


# ══════════════════════════════════════════
# GET /api/notifications/ — list notifications
# ══════════════════════════════════════════

class TestListNotifications:

    @patch("uteki.domains.notification.api.get_notification_service")
    async def test_list_empty(self, mock_get_svc, client, auth_headers):
        svc = MagicMock()
        svc.list_notifications = AsyncMock(return_value={"items": [], "unread_count": 0})
        mock_get_svc.return_value = svc

        resp = await client.get("/api/notifications/", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"] == []
        assert body["unread_count"] == 0

    @patch("uteki.domains.notification.api.get_notification_service")
    async def test_list_with_items(self, mock_get_svc, client, auth_headers):
        svc = MagicMock()
        svc.list_notifications = AsyncMock(return_value={
            "items": [
                {
                    "id": "n-001",
                    "user_id": TEST_USER_ID,
                    "type": "arena_complete",
                    "title": "Arena 完成: BUY",
                    "message": "模型 Claude 3.5 胜出",
                    "is_read": False,
                    "extra_data": {"harness_id": "h-001"},
                    "created_at": "2026-04-06T00:00:00+00:00",
                }
            ],
            "unread_count": 1,
        })
        mock_get_svc.return_value = svc

        resp = await client.get("/api/notifications/", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["items"]) == 1
        assert body["items"][0]["type"] == "arena_complete"
        assert body["unread_count"] == 1

    @patch("uteki.domains.notification.api.get_notification_service")
    async def test_list_with_query_params(self, mock_get_svc, client, auth_headers):
        svc = MagicMock()
        svc.list_notifications = AsyncMock(return_value={"items": [], "unread_count": 0})
        mock_get_svc.return_value = svc

        resp = await client.get(
            "/api/notifications/?limit=10&offset=5&unread_only=true",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        svc.list_notifications.assert_called_once()
        args = svc.list_notifications.call_args
        assert args[0][1] == 10   # limit
        assert args[0][2] == 5    # offset
        assert args[0][3] is True  # unread_only

    async def test_list_requires_auth(self, client):
        resp = await client.get("/api/notifications/")
        assert resp.status_code in (401, 403)


# ══════════════════════════════════════════
# GET /api/notifications/unread-count
# ══════════════════════════════════════════

class TestUnreadCount:

    @patch("uteki.domains.notification.api.get_notification_service")
    async def test_unread_count_zero(self, mock_get_svc, client, auth_headers):
        svc = MagicMock()
        svc.get_unread_count = AsyncMock(return_value=0)
        mock_get_svc.return_value = svc

        resp = await client.get("/api/notifications/unread-count", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == {"unread_count": 0}

    @patch("uteki.domains.notification.api.get_notification_service")
    async def test_unread_count_nonzero(self, mock_get_svc, client, auth_headers):
        svc = MagicMock()
        svc.get_unread_count = AsyncMock(return_value=7)
        mock_get_svc.return_value = svc

        resp = await client.get("/api/notifications/unread-count", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == {"unread_count": 7}

    async def test_unread_count_requires_auth(self, client):
        resp = await client.get("/api/notifications/unread-count")
        assert resp.status_code in (401, 403)


# ══════════════════════════════════════════
# POST /api/notifications/mark-read
# ══════════════════════════════════════════

class TestMarkRead:

    @patch("uteki.domains.notification.api.get_notification_service")
    async def test_mark_specific_read(self, mock_get_svc, client, auth_headers):
        svc = MagicMock()
        svc.mark_read = AsyncMock(return_value=2)
        mock_get_svc.return_value = svc

        resp = await client.post(
            "/api/notifications/mark-read",
            json={"notification_ids": ["n-001", "n-002"]},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == {"updated": 2}
        svc.mark_read.assert_called_once()
        args = svc.mark_read.call_args[0]
        assert args[1] == ["n-001", "n-002"]

    @patch("uteki.domains.notification.api.get_notification_service")
    async def test_mark_all_read(self, mock_get_svc, client, auth_headers):
        svc = MagicMock()
        svc.mark_read = AsyncMock(return_value=5)
        mock_get_svc.return_value = svc

        resp = await client.post(
            "/api/notifications/mark-read",
            json={"notification_ids": None},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == {"updated": 5}

    @patch("uteki.domains.notification.api.get_notification_service")
    async def test_mark_all_read_empty_body(self, mock_get_svc, client, auth_headers):
        svc = MagicMock()
        svc.mark_read = AsyncMock(return_value=3)
        mock_get_svc.return_value = svc

        resp = await client.post(
            "/api/notifications/mark-read",
            json={},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == {"updated": 3}

    async def test_mark_read_requires_auth(self, client):
        resp = await client.post(
            "/api/notifications/mark-read",
            json={"notification_ids": ["n-001"]},
        )
        assert resp.status_code in (401, 403)


# ══════════════════════════════════════════
# DELETE /api/notifications/{id}
# ══════════════════════════════════════════

class TestDeleteNotification:

    @patch("uteki.domains.notification.api.get_notification_service")
    async def test_delete_success(self, mock_get_svc, client, auth_headers):
        svc = MagicMock()
        svc.delete_notification = AsyncMock(return_value=True)
        mock_get_svc.return_value = svc

        resp = await client.delete("/api/notifications/n-001", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "id": "n-001"}

    @patch("uteki.domains.notification.api.get_notification_service")
    async def test_delete_not_found(self, mock_get_svc, client, auth_headers):
        svc = MagicMock()
        svc.delete_notification = AsyncMock(return_value=False)
        mock_get_svc.return_value = svc

        resp = await client.delete("/api/notifications/nonexistent", headers=auth_headers)
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    async def test_delete_requires_auth(self, client):
        resp = await client.delete("/api/notifications/n-001")
        assert resp.status_code in (401, 403)


# ══════════════════════════════════════════
# Service — typed notification helpers
# ══════════════════════════════════════════

class TestNotificationServiceHelpers:

    @patch("uteki.domains.notification.service.NotificationRepository")
    async def test_notify_arena_complete(self, mock_repo_cls):
        mock_repo_cls.return_value.create = AsyncMock(return_value={"id": "n-100"})

        from uteki.domains.notification.service import NotificationService
        svc = NotificationService()
        svc.repo = mock_repo_cls.return_value

        await svc.notify_arena_complete(
            user_id="u-1", harness_id="h-1", winner_model="Claude", winner_action="BUY"
        )
        svc.repo.create.assert_called_once()
        call_kwargs = svc.repo.create.call_args[1]
        assert call_kwargs["type"] == "arena_complete"
        assert "BUY" in call_kwargs["title"]
        assert call_kwargs["extra_data"]["harness_id"] == "h-1"

    @patch("uteki.domains.notification.service.NotificationRepository")
    async def test_notify_company_complete(self, mock_repo_cls):
        mock_repo_cls.return_value.create = AsyncMock(return_value={"id": "n-101"})

        from uteki.domains.notification.service import NotificationService
        svc = NotificationService()
        svc.repo = mock_repo_cls.return_value

        await svc.notify_company_complete(
            user_id="u-1", analysis_id="a-1", symbol="AAPL",
            verdict_action="BUY", conviction=0.85,
        )
        svc.repo.create.assert_called_once()
        call_kwargs = svc.repo.create.call_args[1]
        assert call_kwargs["type"] == "company_complete"
        assert "AAPL" in call_kwargs["title"]
        assert call_kwargs["extra_data"]["symbol"] == "AAPL"

    @patch("uteki.domains.notification.service.NotificationRepository")
    async def test_notify_company_error(self, mock_repo_cls):
        mock_repo_cls.return_value.create = AsyncMock(return_value={"id": "n-102"})

        from uteki.domains.notification.service import NotificationService
        svc = NotificationService()
        svc.repo = mock_repo_cls.return_value

        await svc.notify_company_error(
            user_id="u-1", symbol="TSLA", error_message="API timeout"
        )
        svc.repo.create.assert_called_once()
        call_kwargs = svc.repo.create.call_args[1]
        assert call_kwargs["type"] == "company_error"
        assert "TSLA" in call_kwargs["title"]
        assert "timeout" in call_kwargs["message"].lower()

    @patch("uteki.domains.notification.service.NotificationRepository")
    async def test_notify_company_error_truncates_long_message(self, mock_repo_cls):
        mock_repo_cls.return_value.create = AsyncMock(return_value={"id": "n-103"})

        from uteki.domains.notification.service import NotificationService
        svc = NotificationService()
        svc.repo = mock_repo_cls.return_value

        long_msg = "x" * 1000
        await svc.notify_company_error(user_id="u-1", symbol="X", error_message=long_msg)
        call_kwargs = svc.repo.create.call_args[1]
        assert len(call_kwargs["message"]) == 500


# ══════════════════════════════════════════
# Service — mark_read routing
# ══════════════════════════════════════════

class TestNotificationServiceMarkRead:

    @patch("uteki.domains.notification.service.NotificationRepository")
    async def test_mark_read_with_ids_calls_mark_read(self, mock_repo_cls):
        mock_repo_cls.return_value.mark_read = AsyncMock(return_value=2)

        from uteki.domains.notification.service import NotificationService
        svc = NotificationService()
        svc.repo = mock_repo_cls.return_value

        result = await svc.mark_read("u-1", ["n-1", "n-2"])
        assert result == 2
        svc.repo.mark_read.assert_called_once_with("u-1", ["n-1", "n-2"])

    @patch("uteki.domains.notification.service.NotificationRepository")
    async def test_mark_read_without_ids_calls_mark_all(self, mock_repo_cls):
        mock_repo_cls.return_value.mark_all_read = AsyncMock(return_value=5)

        from uteki.domains.notification.service import NotificationService
        svc = NotificationService()
        svc.repo = mock_repo_cls.return_value

        result = await svc.mark_read("u-1", None)
        assert result == 5
        svc.repo.mark_all_read.assert_called_once_with("u-1")
