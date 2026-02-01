import { useState } from 'react';
import {
  Box,
  Avatar,
  Typography,
  Menu,
  MenuItem,
  IconButton,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Logout as LogoutIcon,
  Login as LoginIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

interface UserMenuProps {
  collapsed?: boolean;
}

export default function UserMenu({ collapsed = false }: UserMenuProps) {
  const { user, isAuthenticated, logout, login } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (isAuthenticated) {
      setAnchorEl(event.currentTarget);
    } else {
      navigate('/login');
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogoutClick = () => {
    handleClose();
    setLogoutDialogOpen(true);
  };

  const handleLogoutConfirm = async () => {
    await logout();
    setLogoutDialogOpen(false);
    navigate('/login');
  };

  const handleLogoutCancel = () => {
    setLogoutDialogOpen(false);
  };

  if (!isAuthenticated) {
    // 未登录状态
    if (collapsed) {
      return (
        <IconButton onClick={() => navigate('/login')} sx={{ color: 'text.secondary' }}>
          <LoginIcon />
        </IconButton>
      );
    }

    return (
      <Button
        startIcon={<LoginIcon />}
        onClick={() => navigate('/login')}
        sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}
        fullWidth
      >
        登录
      </Button>
    );
  }

  // 已登录状态
  return (
    <>
      <Box
        onClick={handleClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          p: 1,
          borderRadius: 1,
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
      >
        <Avatar
          src={user?.avatar || undefined}
          alt={user?.name || 'User'}
          sx={{ width: 32, height: 32 }}
        >
          {user?.name?.[0] || <PersonIcon />}
        </Avatar>
        {!collapsed && (
          <Box sx={{ overflow: 'hidden', flex: 1 }}>
            <Typography variant="body2" noWrap>
              {user?.name || '用户'}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {user?.email || ''}
            </Typography>
          </Box>
        )}
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="body2" fontWeight="medium">
            {user?.name || '用户'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {user?.email || ''}
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={handleLogoutClick}>
          <LogoutIcon sx={{ mr: 1 }} fontSize="small" />
          登出
        </MenuItem>
      </Menu>

      {/* Logout Confirmation Dialog */}
      <Dialog open={logoutDialogOpen} onClose={handleLogoutCancel}>
        <DialogTitle>确认登出</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要退出登录吗？
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleLogoutCancel}>取消</Button>
          <Button onClick={handleLogoutConfirm} color="primary">
            确定
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
