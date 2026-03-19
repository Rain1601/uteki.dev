import { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '../../theme/ThemeProvider';

interface TradingViewChartProps {
  symbol: string | null;
}

declare global {
  interface Window {
    TradingView: any;
    Datafeeds: any;
  }
}

const LIBRARY_PATH = '/charting_library/';
const UDF_DATAFEED_URL = '/api/udf';   // our backend UDF adapter

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function TradingViewChart({ symbol }: TradingViewChartProps) {
  const { isDark, theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    if (!symbol || !containerRef.current) return;

    let cancelled = false;

    (async () => {
      await loadScript(`${LIBRARY_PATH}charting_library.standalone.js`);
      await loadScript('/datafeeds/udf/dist/bundle.js');
      if (cancelled) return;

      // Tear down previous widget
      if (widgetRef.current) {
        try { widgetRef.current.remove(); } catch { /* noop */ }
        widgetRef.current = null;
      }

      const containerId = 'tv_chart_container';
      containerRef.current!.id = containerId;

      const widget = new window.TradingView.widget({
        container: containerId,
        symbol,
        interval: 'D',
        timezone: 'America/New_York',
        theme: isDark ? 'dark' : 'light',
        style: '1',
        locale: 'zh_CN',
        library_path: LIBRARY_PATH,
        datafeed: new window.Datafeeds.UDFCompatibleDatafeed(UDF_DATAFEED_URL, undefined, {
          maxResponseLength: 1000,
          expectedOrder: 'latestFirst',
        }),
        autosize: true,
        disabled_features: [
          'use_localstorage_for_settings',
          'header_symbol_search',
        ],
        enabled_features: ['study_templates'],
        studies_overrides: {
          'volume.volume.color.0': '#26a69a',
          'volume.volume.color.1': '#ef5350',
        },
      });

      widgetRef.current = widget;

      widget.onChartReady(() => {
        const chart = widget.activeChart();
        chart.createStudy('Moving Average Exponential', false, false, { length: 20 });
        chart.createStudy('Moving Average Exponential', false, false, { length: 50 });
      });
    })();

    return () => { cancelled = true; };
  }, [symbol, isDark]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (widgetRef.current) {
        try { widgetRef.current.remove(); } catch { /* noop */ }
        widgetRef.current = null;
      }
    };
  }, []);

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
