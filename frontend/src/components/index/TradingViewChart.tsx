import { useEffect, useRef, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '../../theme/ThemeProvider';

interface TradingViewChartProps {
  symbol: string | null;
}

export default function TradingViewChart({ symbol }: TradingViewChartProps) {
  const { isDark, theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !symbol) return;

    // Clear previous widget
    containerRef.current.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'tradingview-widget-container';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.width = '100%';
    widgetDiv.style.height = '100%';
    wrapper.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.textContent = JSON.stringify({
      symbol: symbol.includes(':') ? symbol : symbol,
      interval: 'D',
      timezone: 'Etc/UTC',
      theme: isDark ? 'dark' : 'light',
      style: '1',
      locale: 'zh_CN',
      allow_symbol_change: false,
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      studies: ['MASimple@tv-basicstudies'],
      width: '100%',
      height: '100%',
    });

    wrapper.appendChild(script);
    containerRef.current.appendChild(wrapper);
  }, [symbol, isDark]);

  useEffect(() => {
    renderWidget();
  }, [renderWidget]);

  if (!symbol) {
    return (
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography sx={{ fontSize: 14, color: theme.text.muted }}>
          Select a symbol from the watchlist to view chart
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        bgcolor: isDark ? '#131722' : '#fff',
      }}
    />
  );
}
