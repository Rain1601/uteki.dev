import { Outlet } from 'react-router-dom';
import { Box } from '@mui/material';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import Toast from './Toast';
import HoverSidebar from './HoverSidebar';

const SIDEBAR_COLLAPSED_WIDTH = 54;

export default function Layout() {
  const { theme } = useTheme();
  const { isMobile, isSmallScreen } = useResponsive();

  return (
    <>
      <Toast />
      <Box sx={{ display: 'flex' }}>
        <HoverSidebar />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            // 移动端不需要左边距，桌面端保留侧边栏空间
            marginLeft: isMobile || isSmallScreen ? 0 : `${SIDEBAR_COLLAPSED_WIDTH}px`,
            minHeight: '100vh',
            bgcolor: theme.background.deepest,
            // 移动端使用 16px 内边距，并为顶部汉堡菜单留出空间
            p: isMobile || isSmallScreen ? 2 : 3,
            pt: isMobile || isSmallScreen ? 7 : 3,
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </>
  );
}
