import { Outlet, useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from 'sonner';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import HoverSidebar from './HoverSidebar';
import AnimatedPage from './animation/AnimatedPage';

const SIDEBAR_COLLAPSED_WIDTH = 54;

export default function Layout() {
  const { theme } = useTheme();
  const { isMobile, isSmallScreen } = useResponsive();
  const location = useLocation();
  const isDark = theme.mode === 'dark';

  return (
    <>
      <Toaster position="bottom-right" theme={isDark ? 'dark' : 'light'} richColors />
      <Box sx={{ display: 'flex' }}>
        <HoverSidebar />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            // 移动端不需要左边距，桌面端保留侧边栏空间
            marginLeft: isMobile || isSmallScreen ? 0 : `${SIDEBAR_COLLAPSED_WIDTH}px`,
            minHeight: '100vh',
            bgcolor: theme.background.primary,
            // 移动端使用 16px 内边距，并为顶部导航栏留出空间 (56px + 16px)
            p: isMobile || isSmallScreen ? 2 : 3,
            pt: isMobile || isSmallScreen ? '72px' : 3,
          }}
        >
          <AnimatePresence mode="wait">
            <AnimatedPage key={location.pathname}>
              <Outlet />
            </AnimatedPage>
          </AnimatePresence>
        </Box>
      </Box>
    </>
  );
}
