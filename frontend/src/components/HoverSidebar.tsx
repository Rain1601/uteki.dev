import { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Typography,
  Switch,
  IconButton,
  SwipeableDrawer,
} from '@mui/material';
import {
  Menu,
  TrendingUp,
  BarChart3,
  Bot,
  Moon,
  Sun,
  X,
  FileText,
  Calendar,
  LineChart,
  LayoutDashboard,
} from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import { useSidebar } from '../contexts/SidebarContext';
import UserMenu from './UserMenu';

const SIDEBAR_COLLAPSED_WIDTH = 54;
const SIDEBAR_EXPANDED_WIDTH = 280;

interface MenuItem {
  text: string;
  icon: JSX.Element;
  path: string;
  disabled?: boolean;
}

interface MenuCategory {
  category: string;
  items: MenuItem[];
}

const menuItems: MenuCategory[] = [
  {
    category: 'MAIN',
    items: [
      { text: 'AI Agent', icon: <Bot size={20} />, path: '/agent' },
      { text: '新闻时间线', icon: <FileText size={20} />, path: '/news-timeline' },
    ],
  },
  {
    category: 'TRADING',
    items: [
      { text: '宏观仪表盘', icon: <LayoutDashboard size={20} />, path: '/macro/market-dashboard' },
      { text: '经济日历', icon: <Calendar size={20} />, path: '/macro/fomc-calendar' },
      { text: '雪盈证券', icon: <TrendingUp size={20} />, path: '/trading/snb' },
      { text: '指数投资', icon: <LineChart size={20} />, path: '/index-agent' },
      { text: '数据分析', icon: <BarChart3 size={20} />, path: '/analytics', disabled: true },
    ],
  },
];

export default function HoverSidebar() {
  const { theme, isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const { isMobile, isSmallScreen } = useResponsive();
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useSidebar();

  const handleDrawerClose = useCallback(() => {
    setSidebarOpen(false);
  }, [setSidebarOpen]);

  const handleDrawerOpen = useCallback(() => {
    setSidebarOpen(true);
  }, [setSidebarOpen]);

  const handleNavClick = useCallback(() => {
    if (isMobile || isSmallScreen) {
      setSidebarOpen(false);
    }
  }, [isMobile, isSmallScreen, setSidebarOpen]);

  const isPathActive = (path: string) => location.pathname === path;

  // ─── 移动端：SwipeableDrawer ───
  if (isMobile || isSmallScreen) {
    return (
      <>
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 56,
            zIndex: 1200,
            bgcolor: theme.background.primary,
            borderBottom: `1px solid ${theme.border.subtle}`,
            display: 'flex',
            alignItems: 'center',
            px: 1,
          }}
        >
          <IconButton
            onClick={toggleSidebar}
            sx={{
              color: theme.text.primary,
              '&:hover': { bgcolor: theme.background.tertiary },
              minWidth: 48,
              minHeight: 48,
            }}
          >
            <Menu size={24} />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1 }}>
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: '6px',
                background: `linear-gradient(135deg, ${theme.brand.primary} 0%, ${theme.brand.accent} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: '1rem',
              }}
            >
              U
            </Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.text.primary }}>
              uteki.open
            </Typography>
          </Box>
        </Box>

        <SwipeableDrawer
          anchor="left"
          open={sidebarOpen}
          onClose={handleDrawerClose}
          onOpen={handleDrawerOpen}
          disableBackdropTransition={false}
          disableDiscovery={false}
          swipeAreaWidth={20}
          sx={{
            '& .MuiDrawer-paper': {
              width: SIDEBAR_EXPANDED_WIDTH,
              background: theme.background.secondary,
              borderRight: `1px solid ${theme.border.default}`,
            },
          }}
        >
          <Box
            sx={{
              p: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: `1px solid ${theme.border.subtle}`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  background: `linear-gradient(135deg, ${theme.brand.primary} 0%, ${theme.brand.accent} 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '1.2rem',
                }}
              >
                U
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: theme.text.primary }}>
                uteki.open
              </Typography>
            </Box>
            <IconButton
              onClick={handleDrawerClose}
              sx={{ color: theme.text.secondary, minWidth: 44, minHeight: 44 }}
            >
              <X size={24} />
            </IconButton>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 1 }}>
            {menuItems.map((category, index) => (
              <Box key={category.category}>
                {index > 0 && (
                  <Divider sx={{ margin: '12px 16px', borderColor: theme.border.subtle }} />
                )}
                <Typography
                  sx={{
                    padding: '8px 16px',
                    color: theme.text.muted,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    opacity: 0.8,
                  }}
                >
                  {category.category}
                </Typography>
                <List component="div" disablePadding>
                  {category.items.map((item) => {
                    const isActive = isPathActive(item.path);
                    return (
                      <ListItemButton
                        key={item.text}
                        component={Link}
                        to={item.path}
                        disabled={item.disabled}
                        onClick={handleNavClick}
                        sx={{
                          margin: '4px 8px',
                          borderRadius: '8px',
                          color: theme.text.primary,
                          backgroundColor: isActive ? 'rgba(100, 149, 237, 0.15)' : 'transparent',
                          border: `1px solid ${isActive ? 'rgba(100, 149, 237, 0.3)' : 'transparent'}`,
                          minHeight: 48,
                          position: 'relative',
                          ...(isActive && {
                            '&::before': {
                              content: '""',
                              position: 'absolute',
                              left: 0,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '3px',
                              height: '20px',
                              backgroundColor: theme.brand.primary,
                              borderRadius: '0 2px 2px 0',
                            },
                          }),
                        }}
                      >
                        <ListItemIcon
                          sx={{ minWidth: '40px', color: isActive ? theme.brand.primary : theme.text.secondary }}
                        >
                          {item.icon}
                        </ListItemIcon>
                        <ListItemText
                          primary={item.text}
                          secondary={item.disabled ? '开发中' : null}
                          primaryTypographyProps={{ sx: { fontSize: '0.9rem', fontWeight: 500 } }}
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
              </Box>
            ))}
          </Box>

          <Box sx={{ borderTop: `1px solid ${theme.border.subtle}`, p: 2 }}>
            <Box sx={{ mb: 2 }}>
              <UserMenu collapsed={false} />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
              <Box sx={{ color: theme.text.secondary }}>
                {isDark ? <Moon size={20} /> : <Sun size={20} />}
              </Box>
              <Typography sx={{ flex: 1, fontSize: '0.9rem', color: theme.text.secondary }}>
                {isDark ? '深色模式' : '浅色模式'}
              </Typography>
              <Switch
                checked={isDark}
                onChange={toggleTheme}
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: theme.brand.primary },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: theme.brand.primary },
                }}
              />
            </Box>
          </Box>
        </SwipeableDrawer>
      </>
    );
  }

  // ─── 桌面端：纯 CSS hover + translateX 滑动 ───
  // 收起时：sidebar 完全隐藏在屏幕外（translateX(-100%)），54px 触发区域空白
  // 展开时：sidebar 从左侧平滑滑入（translateX(0)）
  // 悬停子元素（sidebar）会保持父元素的 :hover 状态，所以鼠标移到 sidebar 上不会收起

  // 菜单内容（桌面端和移动端共用的渲染逻辑）
  const sidebarContent = (
    <>
      {/* Logo */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 64,
          px: 2,
          gap: 1,
          borderBottom: `1px solid ${theme.border.subtle}`,
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: '8px',
            background: `linear-gradient(135deg, ${theme.brand.primary} 0%, ${theme.brand.accent} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: '1.2rem',
            flexShrink: 0,
          }}
        >
          U
        </Box>
        <Typography variant="h6" noWrap sx={{ fontWeight: 600, color: theme.text.primary }}>
          uteki.open
        </Typography>
      </Box>

      {/* 菜单 */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          py: 1,
          '&::-webkit-scrollbar': { width: '4px' },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': { background: 'rgba(100, 149, 237, 0.3)', borderRadius: '2px' },
        }}
      >
        {menuItems.map((category, index) => (
          <Box key={category.category}>
            {index > 0 && (
              <Divider sx={{ mx: 2, my: 1.5, borderColor: theme.border.subtle }} />
            )}
            <Typography
              noWrap
              sx={{
                px: 2,
                py: 1,
                color: theme.text.muted,
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                opacity: 0.8,
              }}
            >
              {category.category}
            </Typography>
            <List component="div" disablePadding>
              {category.items.map((item) => {
                const isActive = isPathActive(item.path);
                return (
                  <ListItemButton
                    key={item.text}
                    component={Link}
                    to={item.path}
                    disabled={item.disabled}
                    sx={{
                      minHeight: 44,
                      mx: 1,
                      px: 1.5,
                      borderRadius: '8px',
                      color: theme.text.primary,
                      backgroundColor: isActive ? 'rgba(100, 149, 237, 0.15)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(100, 149, 237, 0.3)' : 'transparent'}`,
                      position: 'relative',
                      '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      },
                      ...(isActive && {
                        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.2)',
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          left: 0,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '3px',
                          height: '20px',
                          backgroundColor: theme.brand.primary,
                          borderRadius: '0 2px 2px 0',
                        },
                      }),
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 40,
                        color: isActive ? theme.brand.primary : theme.text.secondary,
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.text}
                      secondary={item.disabled ? '开发中' : null}
                      primaryTypographyProps={{
                        noWrap: true,
                        sx: { fontSize: '0.9rem', fontWeight: 500, letterSpacing: '0.25px' },
                      }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      {/* 底部 */}
      <Box
        sx={{
          borderTop: `1px solid ${theme.border.subtle}`,
          p: 1.5,
          flexShrink: 0,
        }}
      >
        <Box sx={{ mb: 1 }}>
          <UserMenu collapsed={false} />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5 }}>
          <IconButton
            onClick={toggleTheme}
            size="small"
            sx={{
              color: theme.text.secondary,
              flexShrink: 0,
              '&:hover': { color: theme.brand.primary },
            }}
          >
            {isDark ? <Moon size={18} /> : <Sun size={18} />}
          </IconButton>
          <Typography noWrap sx={{ flex: 1, fontSize: '0.9rem', color: theme.text.secondary }}>
            {isDark ? '深色模式' : '浅色模式'}
          </Typography>
          <Switch
            checked={isDark}
            onChange={toggleTheme}
            size="small"
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': { color: theme.brand.primary },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: theme.brand.primary },
            }}
          />
        </Box>
      </Box>
    </>
  );

  return (
    <>
      {/* 动画 CSS：绕过 Emotion，用原生 CSS 确保 transition 生效 */}
      <style>{`
        .uteki-sidebar-panel {
          transform: translateX(-100%);
          transition: transform 300ms cubic-bezier(0.2, 0, 0, 1) 300ms,
                      box-shadow 300ms ease 300ms;
          box-shadow: none;
        }
        .uteki-sidebar-trigger:hover .uteki-sidebar-panel {
          transform: translateX(0) !important;
          box-shadow: 4px 0 20px rgba(0, 0, 0, 0.25) !important;
          transition: transform 300ms cubic-bezier(0.2, 0, 0, 1) 100ms,
                      box-shadow 300ms ease 100ms !important;
        }
      `}</style>

      {/* 54px 触发区域 */}
      <Box
        className="uteki-sidebar-trigger"
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: SIDEBAR_COLLAPSED_WIDTH,
          height: '100vh',
          zIndex: 1300,
          bgcolor: theme.background.secondary,
          borderRight: `1px solid ${theme.border.subtle}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pt: '18px',
        }}
      >
        <Menu size={24} style={{ color: theme.text.muted }} />

        {/* Sidebar 面板 */}
        <Box
          className="uteki-sidebar-panel"
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: SIDEBAR_EXPANDED_WIDTH,
            height: '100%',
            background: theme.background.secondary,
            borderRight: `1px solid ${theme.border.default}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {sidebarContent}
        </Box>
      </Box>
    </>
  );
}
