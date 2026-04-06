import { get, post, del } from './client';

export async function fetchNotifications(limit = 50, offset = 0, unreadOnly = false) {
  return get('/api/notifications/', { params: { limit, offset, unread_only: unreadOnly } });
}

export async function fetchUnreadCount() {
  return get('/api/notifications/unread-count');
}

export async function markNotificationsRead(notificationIds?: string[]) {
  return post('/api/notifications/mark-read', { notification_ids: notificationIds || null });
}

export async function deleteNotification(id: string) {
  return del(`/api/notifications/${id}`);
}
