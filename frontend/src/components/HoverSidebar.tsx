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
  LineChart,
  LayoutDashboard,
  Building2,
  Boxes,
  LayoutGrid,
  User,
} from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import { useSidebar } from '../contexts/SidebarContext';
import { useAuth } from '../hooks/useAuth';
import NotificationBell from './NotificationBell';

export const SIDEBAR_COLLAPSED_WIDTH = 54;
export const SIDEBAR_EXPANDED_WIDTH = 240;

// Hover highlight opacity for collapsed sidebar
// HOVER_HIGHLIGHT was used for theme-derived hover bg; now editorial design
// uses a fixed warm tint. Kept exported (referenced via void below) to avoid
// breaking any downstream import.
const HOVER_HIGHLIGHT = 0.04;
void HOVER_HIGHLIGHT;

// Shared timing — must match Layout.tsx transition exactly
export const SIDEBAR_TRANSITION_DURATION = '360ms';
export const SIDEBAR_TRANSITION_EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1.0)';
const TRANSITION = `width ${SIDEBAR_TRANSITION_DURATION} ${SIDEBAR_TRANSITION_EASING}`;

// Fixed icon column: ensures icons stay at the same position in both modes
const NAV_MX = 6;  // px — consistent button margin
const ICON_COL_W = SIDEBAR_COLLAPSED_WIDTH - NAV_MX * 2;  // 42px

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
      { text: 'Dashboard', icon: <LayoutGrid size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/dashboard' },
      { text: '账户', icon: <TrendingUp size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/trading/snb' },
    ],
  },
  {
    category: '',
    items: [
      { text: 'AI Agent', icon: <Bot size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/agent' },
      { text: '新闻时间线', icon: <FileText size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/news-timeline' },
    ],
  },
  {
    category: 'AGENT',
    items: [
      { text: '指数投资', icon: <LineChart size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/index-agent' },
      { text: '公司投资', icon: <Building2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/company-agent' },
    ],
  },
  {
    category: 'MARKET',
    items: [
      { text: '宏观仪表盘', icon: <LayoutDashboard size={ICON_SIZE} strokeWidth={ICON_STROKE} />, path: '/macro/market-dashboard' },
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
            <img src="/logo-uteki.svg" alt="uteki" style={{ width: 28, height: 28 }} />
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
              <img src="/logo-uteki.svg" alt="uteki" style={{ width: 32, height: 32 }} />
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
                  <Box sx={{ height: 1, mx: 2, my: 1.5, bgcolor: '#2A2620' }} />
                )}
                <Typography
                  sx={{
                    padding: '10px 16px 6px',
                    color: '#5C5750',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.28em',
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
                          margin: '1px 8px',
                          borderRadius: 0,  // Editorial: hard edges, not rounded
                          color: isActive ? '#F4ECDF' : '#A8A097',
                          backgroundColor: 'transparent',
                          minHeight: 38,
                          position: 'relative',
                          transition: 'color 180ms, background-color 180ms',
                          '&:hover': {
                            backgroundColor: 'rgba(244,236,223,0.04)',
                            color: '#F4ECDF',
                          },
                          ...(isActive && {
                            '&::before': {
                              content: '""',
                              position: 'absolute',
                              left: 0,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: 2,
                              height: 16,
                              backgroundColor: '#F4ECDF',
                            },
                          }),
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            minWidth: 30,
                            color: isActive ? '#F4ECDF' : '#5C5750',
                            transition: 'color 180ms',
                          }}
                        >
                          {item.icon}
                        </ListItemIcon>
                        <ListItemText
                          primary={item.text}
                          primaryTypographyProps={{
                            sx: {
                              fontFamily: "'Fraunces', '宋体', Georgia, serif",
                              fontStyle: 'italic',
                              fontSize: 14,
                              fontWeight: isActive ? 600 : 400,
                              letterSpacing: '-0.005em',
                              color: 'inherit',
                              fontVariationSettings: '"opsz" 36, "SOFT" 50',
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, mb: 1.5 }}>
              <NotificationBell />
              <Typography sx={{ flex: 1, fontSize: 13, color: theme.text.secondary }}>
                通知
              </Typography>
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
        // Editorial finance — slightly raised warm dark, hairline divider, paper grain
        bgcolor: !expanded && hovered
          ? 'rgba(244,236,223,0.04)'
          : '#1B1814',
        backgroundImage: `repeating-linear-gradient(0deg, rgba(255,255,255,0.005) 0 1px, transparent 1px 3px)`,
        borderRight: `1px solid #2A2620`,
        boxShadow: expanded
          ? '6px 0 28px rgba(0,0,0,0.45)'
          : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        cursor: expanded ? 'default' : 'pointer',
        fontFamily: "'Newsreader', '宋体', Georgia, serif",
        transition: `${TRANSITION}, box-shadow ${SIDEBAR_TRANSITION_DURATION} ${SIDEBAR_TRANSITION_EASING}, background-color 200ms ease`,
      }}
    >
      {/* Avatar + Logo area */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 56,
          pl: `${(SIDEBAR_COLLAPSED_WIDTH - 28) / 2}px`,  // 13px — centres avatar in collapsed width
          gap: 1,
          borderBottom: `1px solid #2A2620`,
          flexShrink: 0,
          overflow: 'hidden',
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
        <Box sx={{
          overflow: 'hidden',
          flex: 1,
          opacity: expanded ? 1 : 0,
          transition: `opacity 250ms ${SIDEBAR_TRANSITION_EASING}`,
          transitionDelay: expanded ? '100ms' : '0ms',
        }}>
          <Typography
            noWrap
            sx={{
              fontFamily: "'Fraunces', '宋体', Georgia, serif",
              fontStyle: 'italic',
              fontSize: 14,
              fontWeight: 500,
              color: '#F4ECDF',
              lineHeight: 1.2,
              letterSpacing: '-0.005em',
              fontVariationSettings: '"opsz" 36',
            }}
          >
            {user?.name || '用户'}
          </Typography>
          <Typography
            noWrap
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9.5,
              color: '#5C5750',
              lineHeight: 1.3,
              letterSpacing: '0.04em',
            }}
          >
            {user?.email || ''}
          </Typography>
        </Box>
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
              <Divider sx={{
                mx: `${NAV_MX}px`,
                my: expanded ? 0.5 : 1,
                borderColor: theme.border.divider,
                transition: `margin ${SIDEBAR_TRANSITION_DURATION} ${SIDEBAR_TRANSITION_EASING}`,
              }} />
            )}
            <Typography
              noWrap
              sx={{
                px: `${NAV_MX + 8}px`,
                color: theme.text.disabled,
                fontSize: '0.65rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '1.2px',
                opacity: expanded ? 1 : 0,
                maxHeight: expanded ? '24px' : '0px',
                py: expanded ? 0.75 : 0,
                overflow: 'hidden',
                transition: `opacity 200ms ease, max-height ${SIDEBAR_TRANSITION_DURATION} ${SIDEBAR_TRANSITION_EASING}, padding ${SIDEBAR_TRANSITION_DURATION} ${SIDEBAR_TRANSITION_EASING}`,
                transitionDelay: expanded ? '60ms' : '0ms',
              }}
            >
              {category.category}
            </Typography>
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
                      mx: `${NAV_MX}px`,
                      px: 0,
                      borderRadius: '8px',
                      position: 'relative',
                      overflow: 'hidden',
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
                        width: ICON_COL_W,
                        minWidth: ICON_COL_W,
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: isActive ? theme.brand.primary : theme.text.muted,
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{
                        noWrap: true,
                        sx: {
                          fontSize: 13,
                          fontWeight: isActive ? 600 : 500,
                          color: isActive ? theme.text.primary : theme.text.secondary,
                          opacity: expanded ? 1 : 0,
                          transition: `opacity 250ms ${SIDEBAR_TRANSITION_EASING}`,
                          transitionDelay: expanded ? '100ms' : '0ms',
                        },
                      }}
                    />
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

      {/* Bottom: notification + theme toggle */}
      <Box
        sx={{
          borderTop: `1px solid ${theme.border.divider}`,
          py: 1,
          px: 0,
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {/* Notification Bell */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
          <Tooltip title={!expanded ? '通知' : ''} placement="right" arrow>
            <Box sx={{
              width: SIDEBAR_COLLAPSED_WIDTH,
              minWidth: SIDEBAR_COLLAPSED_WIDTH,
              display: 'flex',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <NotificationBell />
            </Box>
          </Tooltip>
          <Typography noWrap sx={{
            flex: 1,
            fontSize: 12,
            color: theme.text.muted,
            opacity: expanded ? 1 : 0,
            transition: `opacity 250ms ${SIDEBAR_TRANSITION_EASING}`,
            transitionDelay: expanded ? '100ms' : '0ms',
          }}>
            通知
          </Typography>
        </Box>

        {/* Theme Toggle */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title={!expanded ? (isDark ? '深色模式' : '浅色模式') : ''} placement="right" arrow>
            <Box sx={{
              width: SIDEBAR_COLLAPSED_WIDTH,
              minWidth: SIDEBAR_COLLAPSED_WIDTH,
              display: 'flex',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <IconButton
                onClick={toggleTheme}
                size="small"
                sx={{ color: theme.text.muted, '&:hover': { color: theme.brand.primary } }}
              >
                {isDark ? <Moon size={16} /> : <Sun size={16} />}
              </IconButton>
            </Box>
          </Tooltip>
          <Typography noWrap sx={{
            flex: 1,
            fontSize: 12,
            color: theme.text.muted,
            opacity: expanded ? 1 : 0,
            transition: `opacity 250ms ${SIDEBAR_TRANSITION_EASING}`,
            transitionDelay: expanded ? '100ms' : '0ms',
          }}>
            {isDark ? '深色模式' : '浅色模式'}
          </Typography>
          <Switch
            checked={isDark}
            onChange={toggleTheme}
            size="small"
            sx={{
              mr: 1,
              opacity: expanded ? 1 : 0,
              transition: `opacity 250ms ${SIDEBAR_TRANSITION_EASING}`,
              transitionDelay: expanded ? '100ms' : '0ms',
              '& .MuiSwitch-switchBase.Mui-checked': { color: theme.brand.primary },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: theme.brand.primary },
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}
