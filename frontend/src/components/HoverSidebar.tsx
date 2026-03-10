import { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  Tooltip,
  Avatar,
} from '@mui/material';
import {
  Menu,
  TrendingUp,
  Bot,
  Moon,
  Sun,
  X,
  FileText,
  Calendar,
  LineChart,
  LayoutDashboard,
  Building2,

  Gauge,
  User,
} from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import { useSidebar } from '../contexts/SidebarContext';
import { useAuth } from '../hooks/useAuth';

export const SIDEBAR_COLLAPSED_WIDTH = 54;
export const SIDEBAR_EXPANDED_WIDTH = 240;

// Hover highlight opacity for collapsed sidebar
const HOVER_HIGHLIGHT = 0.04;

// Shared timing — must match Layout.tsx transition exactly
export const SIDEBAR_TRANSITION_DURATION = '360ms';
export const SIDEBAR_TRANSITION_EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1.0)';
const TRANSITION = `width ${SIDEBAR_TRANSITION_DURATION} ${SIDEBAR_TRANSITION_EASING}`;

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

const ICON_SIZE = 20;
const ICON_STROKE = 1.75;

const menuItems: MenuCategory[] = [
  {
    category: 'MAIN',
    items: [
      { text: 'AI Agent', icon: <Bot size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/agent' },
      { text: '新闻时间线', icon: <FileText size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/news-timeline' },
    ],
  },
  {
    category: 'AGENT',
    items: [
      { text: 'Agent 总览', icon: <Gauge size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/agent-dashboard' },
      { text: '指数投资', icon: <LineChart size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/index-agent' },
      { text: '公司投资', icon: <Building2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/company-agent' },

    ],
  },
  {
    category: 'TRADING',
    items: [
      { text: '宏观仪表盘', icon: <LayoutDashboard size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/macro/market-dashboard' },
      { text: '经济日历', icon: <Calendar size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/macro/fomc-calendar' },
      { text: '雪盈证券', icon: <TrendingUp size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/trading/snb' },
    ],
  },
];

export default function HoverSidebar() {
  const { theme, isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile, isSmallScreen } = useResponsive();
  const { sidebarOpen, setSidebarOpen, toggleSidebar, expanded, setExpanded } = useSidebar();
  const { user, isAuthenticated } = useAuth();

  const [hovered, setHovered] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
  }, []);

  const handleSidebarClick = useCallback((e: React.MouseEvent) => {
    // Only toggle when clicking the sidebar background, not nav items
    if ((e.target as HTMLElement).closest('a, button, [role="button"]')) return;
    setExpanded(!expanded);
  }, [expanded, setExpanded]);

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

  // ─── Mobile: SwipeableDrawer ───
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
            borderBottom: `1px solid ${theme.border.divider}`,
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
              uteki
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
              border: 'none',
              boxShadow: '4px 0 20px rgba(0,0,0,0.15)',
            },
          }}
        >
          <Box
            sx={{
              p: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: `1px solid ${theme.border.divider}`,
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
                uteki
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
                  <Divider sx={{ margin: '12px 16px', borderColor: theme.border.divider }} />
                )}
                <Typography
                  sx={{
                    padding: '8px 16px',
                    color: theme.text.muted,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
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
                          margin: '2px 8px',
                          borderRadius: '8px',
                          color: isActive ? theme.text.primary : theme.text.secondary,
                          backgroundColor: isActive ? `${theme.brand.primary}18` : 'transparent',
                          minHeight: 44,
                          position: 'relative',
                          '&:hover': {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                          },
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
                          sx={{ minWidth: '36px', color: isActive ? theme.brand.primary : theme.text.muted }}
                        >
                          {item.icon}
                        </ListItemIcon>
                        <ListItemText
                          primary={item.text}
                          primaryTypographyProps={{
                            sx: {
                              fontSize: 13,
                              fontWeight: isActive ? 600 : 500,
                              color: isActive ? theme.text.primary : theme.text.secondary,
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

          <Box sx={{ borderTop: `1px solid ${theme.border.divider}`, p: 2 }}>
            <Box
              onClick={() => navigate('/admin')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 2,
                p: 1,
                borderRadius: 1,
                cursor: 'pointer',
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
              }}
            >
              <Avatar
                src={user?.avatar || undefined}
                alt={user?.name || 'User'}
                sx={{ width: 24, height: 24, fontSize: 12 }}
              >
                {user?.name?.[0] || <User size={14} />}
              </Avatar>
              <Box sx={{ overflow: 'hidden', flex: 1 }}>
                <Typography noWrap sx={{ fontSize: 13, fontWeight: 500, color: theme.text.primary }}>
                  {user?.name || '用户'}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
              <Box sx={{ color: theme.text.secondary }}>
                {isDark ? <Moon size={18} /> : <Sun size={18} />}
              </Box>
              <Typography sx={{ flex: 1, fontSize: 13, color: theme.text.secondary }}>
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

  // ─── Desktop: Hover auto-expand ───
  const width = expanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

  return (
    <Box
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleSidebarClick}
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        width,
        height: '100vh',
        zIndex: 1300,
        bgcolor: !expanded && hovered
          ? isDark
            ? `rgba(255,255,255,${HOVER_HIGHLIGHT})`
            : `rgba(0,0,0,${HOVER_HIGHLIGHT})`
          : theme.background.secondary,
        boxShadow: expanded
          ? '4px 0 16px rgba(0,0,0,0.12)'
          : '1px 0 3px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        cursor: expanded ? 'default' : 'pointer',
        transition: `${TRANSITION}, box-shadow ${SIDEBAR_TRANSITION_DURATION} ${SIDEBAR_TRANSITION_EASING}, background-color 200ms ease`,
      }}
    >
      {/* Avatar + Logo area */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 56,
          px: expanded ? 2 : 0,
          justifyContent: expanded ? 'flex-start' : 'center',
          gap: 1,
          borderBottom: `1px solid ${theme.border.divider}`,
          flexShrink: 0,
        }}
      >
        <Tooltip title={!expanded ? (user?.name || '设置') : ''} placement="right" arrow>
          <Avatar
            src={user?.avatar || undefined}
            alt={user?.name || 'User'}
            onClick={() => navigate('/admin')}
            sx={{
              width: 28,
              height: 28,
              fontSize: 12,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'opacity 150ms ease',
              '&:hover': { opacity: 0.8 },
            }}
          >
            {user?.name?.[0] || <User size={14} />}
          </Avatar>
        </Tooltip>
        {expanded && (
          <Box sx={{ overflow: 'hidden', flex: 1 }}>
            <Typography
              noWrap
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: theme.text.primary,
                lineHeight: 1.3,
              }}
            >
              {user?.name || '用户'}
            </Typography>
            <Typography
              noWrap
              sx={{
                fontSize: 11,
                color: theme.text.muted,
                lineHeight: 1.3,
              }}
            >
              {user?.email || ''}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Spacer between avatar and nav */}
      <Box sx={{ height: 8, flexShrink: 0 }} />

      {/* Menu */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          py: 0.5,
          '&::-webkit-scrollbar': { width: '3px' },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': { background: 'rgba(128,128,128,0.2)', borderRadius: '2px' },
        }}
      >
        {menuItems.map((category, index) => (
          <Box key={category.category}>
            {index > 0 && (
              <Divider sx={{ mx: expanded ? 2 : 1, my: 1, borderColor: theme.border.divider }} />
            )}
            {expanded && (
              <Typography
                noWrap
                sx={{
                  px: 2,
                  py: 0.75,
                  color: theme.text.disabled,
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '1.2px',
                }}
              >
                {category.category}
              </Typography>
            )}
            <List component="div" disablePadding>
              {category.items.map((item) => {
                const isActive = isPathActive(item.path);

                const button = (
                  <ListItemButton
                    key={item.text}
                    component={Link}
                    to={item.path}
                    disabled={item.disabled}
                    onClick={() => { if (expanded) setExpanded(false); }}
                    sx={{
                      minHeight: 40,
                      mx: expanded ? 1 : 0.5,
                      px: expanded ? 1.5 : 0,
                      justifyContent: expanded ? 'flex-start' : 'center',
                      borderRadius: '8px',
                      position: 'relative',
                      color: isActive ? theme.text.primary : theme.text.secondary,
                      backgroundColor: isActive ? `${theme.brand.primary}18` : 'transparent',
                      transition: 'background-color 150ms ease',
                      '&:hover': {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                      },
                      ...(isActive && {
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          left: 0,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '3px',
                          height: '18px',
                          backgroundColor: theme.brand.primary,
                          borderRadius: '0 2px 2px 0',
                        },
                      }),
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: expanded ? 36 : 0,
                        justifyContent: 'center',
                        color: isActive ? theme.brand.primary : theme.text.muted,
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    {expanded && (
                      <ListItemText
                        primary={item.text}
                        primaryTypographyProps={{
                          noWrap: true,
                          sx: {
                            fontSize: 13,
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? theme.text.primary : theme.text.secondary,
                          },
                        }}
                      />
                    )}
                  </ListItemButton>
                );

                return expanded ? (
                  <Box key={item.text}>{button}</Box>
                ) : (
                  <Tooltip key={item.text} title={item.text} placement="right" arrow>
                    {button}
                  </Tooltip>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      {/* Bottom: theme toggle */}
      <Box
        sx={{
          borderTop: `1px solid ${theme.border.divider}`,
          p: expanded ? 1.5 : 0.75,
          flexShrink: 0,
        }}
      >
        {expanded ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5 }}>
            <IconButton
              onClick={toggleTheme}
              size="small"
              sx={{
                color: theme.text.muted,
                flexShrink: 0,
                '&:hover': { color: theme.brand.primary },
              }}
            >
              {isDark ? <Moon size={16} /> : <Sun size={16} />}
            </IconButton>
            <Typography noWrap sx={{ flex: 1, fontSize: 12, color: theme.text.muted }}>
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
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Tooltip title={isDark ? '深色模式' : '浅色模式'} placement="right" arrow>
              <IconButton
                onClick={toggleTheme}
                size="small"
                sx={{ color: theme.text.muted, '&:hover': { color: theme.brand.primary } }}
              >
                {isDark ? <Moon size={16} /> : <Sun size={16} />}
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
    </Box>
  );
}
