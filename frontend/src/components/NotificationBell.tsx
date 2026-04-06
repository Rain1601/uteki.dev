import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Popover, Box, Typography, IconButton } from '@mui/material';
import { Bell, Dices, Building2, AlertCircle } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { useUnreadCount, useNotifications, useMarkRead } from '../hooks/useNotifications';

interface Notification {
  id: string;
  type: 'arena' | 'company' | 'error';
  title: string;
  created_at: string;
  is_read: boolean;
}

function getIcon(type: string) {
  switch (type) {
    case 'arena':
      return <Dices size={16} />;
    case 'company':
      return <Building2 size={16} />;
    default:
      return <AlertCircle size={16} />;
  }
}

function getRoute(type: string) {
  switch (type) {
    case 'arena':
      return '/index-agent';
    case 'company':
      return '/company-agent';
    default:
      return null;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

export default function NotificationBell() {
  const { theme, isDark } = useTheme();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const { data: unreadData } = useUnreadCount();
  const { data: notificationsData } = useNotifications(20);
  const markRead = useMarkRead();

  const unreadCount = (unreadData as any)?.count ?? 0;
  const notifications: Notification[] = (notificationsData as any)?.items ?? [];

  const handleOpen = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleMarkAllRead = useCallback(() => {
    markRead.mutate(undefined);
  }, [markRead]);

  const handleClickItem = useCallback(
    (item: Notification) => {
      if (!item.is_read) {
        markRead.mutate([item.id]);
      }
      const route = getRoute(item.type);
      if (route) {
        navigate(route);
      }
      handleClose();
    },
    [markRead, navigate, handleClose],
  );

  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton onClick={handleOpen} size="small" sx={{ color: theme.text.muted, '&:hover': { color: theme.brand.primary } }}>
        <Badge
          badgeContent={unreadCount}
          color="error"
          max={99}
          sx={{ '& .MuiBadge-badge': { fontSize: 10, minWidth: 16, height: 16 } }}
        >
          <Bell size={16} />
        </Badge>
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              width: 320,
              maxHeight: 400,
              bgcolor: theme.background.secondary,
              border: `1px solid ${theme.border.default}`,
              borderRadius: '12px',
              boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.12)',
            },
          },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${theme.border.divider}`,
          }}
        >
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
            通知
          </Typography>
          {unreadCount > 0 && (
            <Typography
              onClick={handleMarkAllRead}
              sx={{
                fontSize: 12,
                color: theme.brand.primary,
                cursor: 'pointer',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              全部已读
            </Typography>
          )}
        </Box>

        {/* List */}
        <Box sx={{ overflowY: 'auto', maxHeight: 340 }}>
          {notifications.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography sx={{ fontSize: 13, color: theme.text.muted }}>暂无通知</Typography>
            </Box>
          ) : (
            notifications.map((item) => (
              <Box
                key={item.id}
                onClick={() => handleClickItem(item)}
                sx={{
                  px: 2,
                  py: 1.5,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.5,
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  },
                }}
              >
                <Box sx={{ color: theme.text.muted, mt: 0.25, flexShrink: 0 }}>
                  {getIcon(item.type)}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    noWrap
                    sx={{
                      fontSize: 13,
                      fontWeight: item.is_read ? 400 : 600,
                      color: theme.text.primary,
                    }}
                  >
                    {item.title}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: theme.text.muted, mt: 0.25 }}>
                    {timeAgo(item.created_at)}
                  </Typography>
                </Box>
                {!item.is_read && (
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: theme.brand.primary,
                      flexShrink: 0,
                      mt: 0.75,
                    }}
                  />
                )}
              </Box>
            ))
          )}
        </Box>
      </Popover>
    </>
  );
}
