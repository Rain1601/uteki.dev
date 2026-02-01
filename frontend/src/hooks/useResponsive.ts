import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

/**
 * Hook for responsive design
 * Returns boolean flags for different screen sizes
 */
export function useResponsive() {
  const theme = useTheme();

  // MUI default breakpoints:
  // xs: 0px
  // sm: 600px
  // md: 900px
  // lg: 1200px
  // xl: 1536px

  const isMobile = useMediaQuery(theme.breakpoints.down('sm')); // < 600px
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md')); // 600-899px
  const isDesktop = useMediaQuery(theme.breakpoints.up('md')); // >= 900px

  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md')); // < 900px

  return {
    isMobile,
    isTablet,
    isDesktop,
    isSmallScreen,
  };
}

/**
 * Hook for keyboard visibility detection on mobile
 * Uses visualViewport API to detect virtual keyboard
 */
export function useKeyboardVisibility() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const handleResize = useCallback(() => {
    if (typeof window !== 'undefined' && window.visualViewport) {
      const viewport = window.visualViewport;
      const windowHeight = window.innerHeight;
      const viewportHeight = viewport.height;

      // 如果 viewport 高度明显小于窗口高度，说明键盘弹出
      const heightDiff = windowHeight - viewportHeight;
      const keyboardThreshold = 150; // 键盘最小高度阈值

      if (heightDiff > keyboardThreshold) {
        setIsKeyboardVisible(true);
        setKeyboardHeight(heightDiff);
      } else {
        setIsKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.visualViewport) {
      const viewport = window.visualViewport;

      viewport.addEventListener('resize', handleResize);
      viewport.addEventListener('scroll', handleResize);

      // 初始检查
      handleResize();

      return () => {
        viewport.removeEventListener('resize', handleResize);
        viewport.removeEventListener('scroll', handleResize);
      };
    }
  }, [handleResize]);

  return {
    isKeyboardVisible,
    keyboardHeight,
  };
}
