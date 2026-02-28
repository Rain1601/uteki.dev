import { useEffect, useRef, useCallback } from 'react';
import { Box } from '@mui/material';

interface Props {
  theme: any;
  isDark: boolean;
  source: string;
}

export default function TradingViewHeatmap({ isDark, source }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const renderWidget = useCallback(() => {
    if (!containerRef.current) return;

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

    const isCrypto = source === 'CRYPTO';

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;

    if (isCrypto) {
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-crypto-coins-heatmap.js';
      script.textContent = JSON.stringify({
        dataSource: 'Crypto',
        blockSize: 'market_cap_calc',
        blockColor: '24h_close_change|5',
        locale: 'en',
        symbolUrl: '',
        colorTheme: 'dark',
        hasTopBar: false,
        isDataSet498: false,
        isZoomEnabled: true,
        hasSymbolTooltip: true,
        width: '100%',
        height: '100%',
      });
    } else {
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js';
      script.textContent = JSON.stringify({
        exchanges: [],
        dataSource: source,
        grouping: 'sector',
        blockSize: 'market_cap_basic',
        blockColor: 'change',
        locale: 'en',
        symbolUrl: '',
        colorTheme: 'dark',
        hasTopBar: false,
        isDataSetEnabled: false,
        isZoomEnabled: true,
        hasSymbolTooltip: true,
        width: '100%',
        height: '100%',
      });
    }

    wrapper.appendChild(script);
    containerRef.current.appendChild(wrapper);
  }, [source]);

  useEffect(() => {
    renderWidget();
  }, [renderWidget]);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%', height: '100%', borderRadius: 1.5, overflow: 'hidden',
        bgcolor: isDark ? '#131722' : '#fff',
      }}
    />
  );
}
