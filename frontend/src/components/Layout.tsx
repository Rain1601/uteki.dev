import { Outlet, useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from 'sonner';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import { useSidebar } from '../contexts/SidebarContext';
import HoverSidebar, {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
  SIDEBAR_TRANSITION_DURATION,
  SIDEBAR_TRANSITION_EASING,
} from './HoverSidebar';
import AnimatedPage from './animation/AnimatedPage';

export default function Layout() {
  const { theme } = useTheme();
  const { isMobile, isSmallScreen } = useResponsive();
  const { expanded } = useSidebar();
  const location = useLocation();
  const isDark = theme.mode === 'dark';

  const sidebarWidth = isMobile || isSmallScreen
    ? 0
    : expanded
      ? SIDEBAR_EXPANDED_WIDTH
      : SIDEBAR_COLLAPSED_WIDTH;

  return (
    <>
      <Toaster position="bottom-right" theme={isDark ? 'dark' : 'light'} richColors />
      <Box sx={{ display: 'flex' }}>
        <HoverSidebar />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            marginLeft: `${sidebarWidth}px`,
            transition: `margin-left ${SIDEBAR_TRANSITION_DURATION} ${SIDEBAR_TRANSITION_EASING}`,
            height: '100vh',
            overflow: 'auto',
            bgcolor: theme.background.primary,
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
