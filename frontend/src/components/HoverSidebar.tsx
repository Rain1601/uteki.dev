import { useState, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Typography,
  Tooltip,
  Switch,
  Drawer,
  IconButton,
  SwipeableDrawer,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Settings as SettingsIcon,
  TrendingUp as TrendingUpIcon,
  Assessment as AssessmentIcon,
  SmartToy as SmartToyIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
  Close as CloseIcon,
  Article as ArticleIcon,
  Event as EventIcon,
  ShowChart as IndexIcon,
} from '@mui/icons-material';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import { useSidebar } from '../contexts/SidebarContext';
import UserMenu from './UserMenu';

// Gemini风格的配置
const SIDEBAR_COLLAPSED_WIDTH = 54;
const SIDEBAR_EXPANDED_WIDTH = 280;
const HOVER_DELAY_IN = 150;
const HOVER_DELAY_OUT = 300;

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
      { text: '演示页面', icon: <DashboardIcon />, path: '/' },
      { text: 'Admin 管理', icon: <SettingsIcon />, path: '/admin' },
      { text: 'AI Agent', icon: <SmartToyIcon />, path: '/agent' },
      { text: '新闻时间线', icon: <ArticleIcon />, path: '/news-timeline' },
    ],
  },
  {
    category: 'TRADING',
    items: [
      { text: '经济日历', icon: <EventIcon />, path: '/macro/fomc-calendar' },
      { text: '雪盈证券', icon: <TrendingUpIcon />, path: '/trading/snb' },
      { text: '指数投资', icon: <IndexIcon />, path: '/index-agent' },
      { text: '数据分析', icon: <AssessmentIcon />, path: '/analytics', disabled: true },
    ],
  },
];

export default function HoverSidebar() {
  const { theme, isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const { isMobile, isSmallScreen } = useResponsive();
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useSidebar();
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (isMobile || isSmallScreen) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(true);
    }, HOVER_DELAY_IN);
  }, [isMobile, isSmallScreen]);

  const handleMouseLeave = useCallback(() => {
    if (isMobile || isSmallScreen) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(false);
    }, HOVER_DELAY_OUT);
  }, [isMobile, isSmallScreen]);

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

  const isPathActive = (path: string) => {
    return location.pathname === path;
  };

  // 移动端使用 SwipeableDrawer
  if (isMobile || isSmallScreen) {
    return (
      <>
        {/* 移动端顶部导航栏 */}
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 56,
            zIndex: 1200,
            bgcolor: theme.background.deepest,
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
              '&:hover': {
                bgcolor: theme.background.tertiary,
              },
              minWidth: 48,
              minHeight: 48,
            }}
          >
            <MenuIcon />
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
              background: theme.background.deepest,
              borderRight: `1px solid ${theme.border.default}`,
            },
          }}
        >
          {/* 抽屉头部 */}
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
              sx={{
                color: theme.text.secondary,
                minWidth: 44,
                minHeight: 44,
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>

          {/* 菜单列表 */}
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              py: 1,
            }}
          >
            {menuItems.map((category, index) => (
              <Box key={category.category}>
                {index > 0 && (
                  <Divider
                    sx={{
                      margin: '12px 16px',
                      borderColor: theme.border.subtle,
                    }}
                  />
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
                          transition: 'all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)',
                          color: theme.text.primary,
                          backgroundColor: isActive
                            ? 'rgba(100, 149, 237, 0.15)'
                            : 'transparent',
                          border: `1px solid ${
                            isActive ? 'rgba(100, 149, 237, 0.3)' : 'transparent'
                          }`,
                          // 增加触摸区域
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
                          sx={{
                            minWidth: '40px',
                            color: isActive ? theme.brand.primary : theme.text.secondary,
                          }}
                        >
                          {item.icon}
                        </ListItemIcon>
                        <ListItemText
                          primary={item.text}
                          secondary={item.disabled ? '开发中' : null}
                          primaryTypographyProps={{
                            sx: {
                              fontSize: '0.9rem',
                              fontWeight: 500,
                            },
                          }}
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
              </Box>
            ))}
          </Box>

          {/* 底部区域：用户菜单和主题切换 */}
          <Box
            sx={{
              borderTop: `1px solid ${theme.border.subtle}`,
              p: 2,
            }}
          >
            {/* 用户菜单 */}
            <Box sx={{ mb: 2 }}>
              <UserMenu collapsed={false} />
            </Box>

            {/* 主题切换 */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
              }}
            >
              <Box sx={{ color: theme.text.secondary }}>
                {isDark ? <DarkModeIcon /> : <LightModeIcon />}
              </Box>
              <Typography
                sx={{
                  flex: 1,
                  fontSize: '0.9rem',
                  color: theme.text.secondary,
                }}
              >
                {isDark ? '深色模式' : '浅色模式'}
              </Typography>
              <Switch
                checked={isDark}
                onChange={toggleTheme}
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: theme.brand.primary,
                  },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: theme.brand.primary,
                  },
                }}
              />
            </Box>
          </Box>
        </SwipeableDrawer>
      </>
    );
  }

  // 桌面端使用原有的悬浮侧边栏
  return (
    <>
      {/* 毛玻璃遮罩层 - 覆盖主内容区域 */}
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: SIDEBAR_COLLAPSED_WIDTH,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.06)',
          backdropFilter: 'blur(2px)',
          opacity: isHovered ? 1 : 0,
          pointerEvents: isHovered ? 'auto' : 'none',
          transition: 'opacity 0.35s cubic-bezier(0.23, 1, 0.32, 1)',
          zIndex: 1299,
        }}
        onClick={() => setIsHovered(false)}
      />
      <Box
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100vh',
          zIndex: 1300,
        }}
      >
      {/* 触发区域 */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${SIDEBAR_COLLAPSED_WIDTH + 10}px`,
          height: '100%',
          zIndex: 1302,
          backgroundColor: 'transparent',
          cursor: 'pointer',
        }}
      />

      {/* 收起状态的极简设计 */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${SIDEBAR_COLLAPSED_WIDTH}px`,
          height: '100%',
          background: theme.background.primary,
          borderRight: `1px solid ${theme.border.subtle}`,
          transition: 'background 0.3s ease, border-color 0.3s ease',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '20px',
          zIndex: 1301,
          '&:hover': {
            borderRight: `1px solid ${theme.border.default}`,
            background: theme.background.hover,
            '& .menu-icon': {
              color: theme.brand.primary,
              transform: 'scale(1.1)',
            },
          },
        }}
      >
        <Tooltip title="展开菜单" placement="right">
          <MenuIcon
            className="menu-icon"
            sx={{
              fontSize: '2.5rem',
              color: theme.text.muted,
              transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
              cursor: 'pointer',
              padding: 1.5,
              borderRadius: '8px',
              border: '1px solid transparent',
              '&:hover': {
                backgroundColor: theme.background.hover,
                borderColor: theme.border.default,
                color: theme.text.primary,
                transform: 'scale(1.05)',
                boxShadow: theme.effects.shadow.sm,
              },
            }}
          />
        </Tooltip>
      </Box>

      {/* 展开状态的完整侧边栏 */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${SIDEBAR_EXPANDED_WIDTH}px`,
          height: '100%',
          background: `${theme.background.deepest}f2`, // 半透明
          backdropFilter: 'blur(16px) saturate(1.2)',
          borderRight: `1px solid ${theme.border.default}`,
          boxShadow: '4px 0 16px rgba(0, 0, 0, 0.15)',
          transform: isHovered ? 'translateX(0)' : 'translateX(-100%)',
          opacity: isHovered ? 1 : 0,
          transition: 'transform 0.35s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.3s cubic-bezier(0.23, 1, 0.32, 1)',
          zIndex: 1301,
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
          },
        }}
      >
        {/* Logo区域 */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            borderBottom: `1px solid ${theme.border.subtle}`,
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
            }}
          >
            U
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: theme.text.primary }}>
            uteki.open
          </Typography>
        </Box>

        {/* 菜单列表 */}
        <Box
          sx={{
            height: 'calc(100% - 200px)',
            overflowY: 'auto',
            overflowX: 'hidden',
            py: 1,
            '&::-webkit-scrollbar': {
              width: '4px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'rgba(100, 149, 237, 0.3)',
              borderRadius: '2px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: 'rgba(100, 149, 237, 0.5)',
            },
          }}
        >
          {menuItems.map((category, index) => (
            <Box key={category.category}>
              {index > 0 && (
                <Divider
                  sx={{
                    margin: '12px 16px',
                    borderColor: theme.border.subtle,
                  }}
                />
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
                      sx={{
                        margin: '4px 8px',
                        borderRadius: '8px',
                        transition: 'all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)',
                        color: theme.text.primary,
                        backgroundColor: isActive
                          ? 'rgba(100, 149, 237, 0.15)'
                          : 'transparent',
                        border: `1px solid ${
                          isActive ? 'rgba(100, 149, 237, 0.3)' : 'transparent'
                        }`,
                        position: 'relative',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                          borderColor: 'rgba(255, 255, 255, 0.12)',
                          color: theme.text.primary,
                          transform: 'translateX(4px)',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                          '& .MuiListItemIcon-root': {
                            color: theme.brand.primary,
                            transform: 'scale(1.1)',
                          },
                        },
                        ...(isActive && {
                          boxShadow:
                            'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.2)',
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
                          minWidth: '40px',
                          color: isActive ? theme.brand.primary : theme.text.secondary,
                          transition: 'all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)',
                          '& .MuiSvgIcon-root': {
                            fontSize: '1.3rem',
                          },
                        }}
                      >
                        {item.icon}
                      </ListItemIcon>
                      <ListItemText
                        primary={item.text}
                        secondary={item.disabled ? '开发中' : null}
                        primaryTypographyProps={{
                          sx: {
                            fontSize: '0.9rem',
                            fontWeight: 500,
                            letterSpacing: '0.25px',
                          },
                        }}
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            </Box>
          ))}
        </Box>

        {/* 底部区域：用户菜单和主题切换 */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            borderTop: `1px solid ${theme.border.subtle}`,
            p: 2,
          }}
        >
          {/* 用户菜单 */}
          <Box sx={{ mb: 2 }}>
            <UserMenu collapsed={false} />
          </Box>

          {/* 主题切换 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1,
            }}
          >
            <Box sx={{ color: theme.text.secondary }}>
              {isDark ? <DarkModeIcon /> : <LightModeIcon />}
            </Box>
            <Typography
              sx={{
                flex: 1,
                fontSize: '0.9rem',
                color: theme.text.secondary,
              }}
            >
              {isDark ? '深色模式' : '浅色模式'}
            </Typography>
            <Switch
              checked={isDark}
              onChange={toggleTheme}
              size="small"
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': {
                  color: theme.brand.primary,
                },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                  backgroundColor: theme.brand.primary,
                },
              }}
            />
          </Box>
        </Box>
      </Box>
    </Box>
    </>
  );
}
