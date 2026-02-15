/**
 * K-Line Chart Component using TradingView lightweight-charts@5.1.0
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Switch, FormControlLabel, Typography } from '@mui/material';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  LineData,
  Time,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
} from 'lightweight-charts';
import { useTheme } from '../../theme/ThemeProvider';
import { PricePoint, fetchHistory } from '../../api/index';
import LoadingDots from '../LoadingDots';

// ── Types ──

export type TimeInterval = 'daily' | 'weekly' | 'monthly';

export interface KlineChartProps {
  symbol: string | null;
  onError?: (error: string) => void;
}

interface ChartTheme {
  background: string;
  textColor: string;
  gridColor: string;
  borderColor: string;
  crosshairColor: string;
  upColor: string;
  downColor: string;
}

// ── Helper Functions ──

function getChartTheme(isDark: boolean): ChartTheme {
  return isDark
    ? {
        background: '#1a1a2e',
        textColor: '#d1d4dc',
        gridColor: 'rgba(255, 255, 255, 0.06)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        crosshairColor: 'rgba(255, 255, 255, 0.4)',
        upColor: '#4caf50',
        downColor: '#f44336',
      }
    : {
        background: '#ffffff',
        textColor: '#333333',
        gridColor: 'rgba(0, 0, 0, 0.06)',
        borderColor: 'rgba(0, 0, 0, 0.1)',
        crosshairColor: 'rgba(0, 0, 0, 0.4)',
        upColor: '#4caf50',
        downColor: '#f44336',
      };
}

function aggregateToWeekly(data: PricePoint[]): PricePoint[] {
  if (data.length === 0) return [];
  const weeks: Map<string, PricePoint[]> = new Map();

  for (const d of data) {
    const date = new Date(d.date);
    // Get Monday of the week
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    const weekKey = monday.toISOString().slice(0, 10);

    if (!weeks.has(weekKey)) weeks.set(weekKey, []);
    weeks.get(weekKey)!.push(d);
  }

  const result: PricePoint[] = [];
  for (const [weekStart, points] of weeks) {
    if (points.length === 0) continue;
    result.push({
      date: weekStart,
      open: points[0].open,
      high: Math.max(...points.map((p) => p.high)),
      low: Math.min(...points.map((p) => p.low)),
      close: points[points.length - 1].close,
      volume: points.reduce((sum, p) => sum + p.volume, 0),
    });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateToMonthly(data: PricePoint[]): PricePoint[] {
  if (data.length === 0) return [];
  const months: Map<string, PricePoint[]> = new Map();

  for (const d of data) {
    const monthKey = d.date.slice(0, 7); // YYYY-MM
    if (!months.has(monthKey)) months.set(monthKey, []);
    months.get(monthKey)!.push(d);
  }

  const result: PricePoint[] = [];
  for (const [month, points] of months) {
    if (points.length === 0) continue;
    result.push({
      date: `${month}-01`,
      open: points[0].open,
      high: Math.max(...points.map((p) => p.high)),
      low: Math.min(...points.map((p) => p.low)),
      close: points[points.length - 1].close,
      volume: points.reduce((sum, p) => sum + p.volume, 0),
    });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

function calculateMA(data: PricePoint[], period: number): LineData[] {
  const result: LineData[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((sum, d) => sum + d.close, 0) / period;
    result.push({ time: data[i].date as Time, value: avg });
  }
  return result;
}

function toCandlestickData(data: PricePoint[]): CandlestickData[] {
  return data.map((d) => ({
    time: d.date as Time,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
  }));
}

function toVolumeData(data: PricePoint[], upColor: string, downColor: string): HistogramData[] {
  return data.map((d) => ({
    time: d.date as Time,
    value: d.volume,
    color: d.close >= d.open ? upColor : downColor,
  }));
}

// ── Component ──

export default function KlineChart({ symbol, onError }: KlineChartProps) {
  const { isDark, theme } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ma50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const [rawData, setRawData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [interval, setInterval] = useState<TimeInterval>('daily');
  const [showMA50, setShowMA50] = useState(false);
  const [showMA200, setShowMA200] = useState(false);

  const chartTheme = getChartTheme(isDark);

  // Load data when symbol changes
  useEffect(() => {
    if (!symbol) {
      setRawData([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchHistory(symbol)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setRawData(res.data);
        } else {
          onError?.(res.error || 'Failed to fetch history');
        }
      })
      .catch((e) => {
        if (!cancelled) onError?.(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, onError]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: chartTheme.background },
        textColor: chartTheme.textColor,
      },
      grid: {
        vertLines: { color: chartTheme.gridColor },
        horzLines: { color: chartTheme.gridColor },
      },
      crosshair: {
        vertLine: { color: chartTheme.crosshairColor, labelBackgroundColor: chartTheme.background },
        horzLine: { color: chartTheme.crosshairColor, labelBackgroundColor: chartTheme.background },
      },
      rightPriceScale: { borderColor: chartTheme.borderColor },
      timeScale: { borderColor: chartTheme.borderColor },
    });

    chartRef.current = chart;

    // Candlestick series (v5 API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: chartTheme.upColor,
      downColor: chartTheme.downColor,
      borderUpColor: chartTheme.upColor,
      borderDownColor: chartTheme.downColor,
      wickUpColor: chartTheme.upColor,
      wickDownColor: chartTheme.downColor,
    });
    candleSeriesRef.current = candleSeries;

    // Volume series (v5 API)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // MA50 series (v5 API)
    const ma50Series = chart.addSeries(LineSeries, {
      color: '#2196f3',
      lineWidth: 1,
      visible: false,
    });
    ma50SeriesRef.current = ma50Series;

    // MA200 series (v5 API)
    const ma200Series = chart.addSeries(LineSeries, {
      color: '#ff9800',
      lineWidth: 1,
      visible: false,
    });
    ma200SeriesRef.current = ma200Series;

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Update theme
  useEffect(() => {
    if (!chartRef.current) return;

    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: chartTheme.background },
        textColor: chartTheme.textColor,
      },
      grid: {
        vertLines: { color: chartTheme.gridColor },
        horzLines: { color: chartTheme.gridColor },
      },
      crosshair: {
        vertLine: { color: chartTheme.crosshairColor },
        horzLine: { color: chartTheme.crosshairColor },
      },
      rightPriceScale: { borderColor: chartTheme.borderColor },
      timeScale: { borderColor: chartTheme.borderColor },
    });

    candleSeriesRef.current?.applyOptions({
      upColor: chartTheme.upColor,
      downColor: chartTheme.downColor,
      borderUpColor: chartTheme.upColor,
      borderDownColor: chartTheme.downColor,
      wickUpColor: chartTheme.upColor,
      wickDownColor: chartTheme.downColor,
    });
  }, [chartTheme]);

  // Update data when rawData or interval changes
  const updateChartData = useCallback(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    let displayData = rawData;
    if (interval === 'weekly') {
      displayData = aggregateToWeekly(rawData);
    } else if (interval === 'monthly') {
      displayData = aggregateToMonthly(rawData);
    }

    candleSeriesRef.current.setData(toCandlestickData(displayData));
    volumeSeriesRef.current.setData(toVolumeData(displayData, chartTheme.upColor, chartTheme.downColor));

    // Update MA
    if (ma50SeriesRef.current) {
      ma50SeriesRef.current.setData(showMA50 ? calculateMA(displayData, 50) : []);
      ma50SeriesRef.current.applyOptions({ visible: showMA50 });
    }
    if (ma200SeriesRef.current) {
      ma200SeriesRef.current.setData(showMA200 ? calculateMA(displayData, 200) : []);
      ma200SeriesRef.current.applyOptions({ visible: showMA200 });
    }

    chartRef.current?.timeScale().fitContent();
  }, [rawData, interval, showMA50, showMA200, chartTheme]);

  useEffect(() => {
    updateChartData();
  }, [updateChartData]);

  // Handle interval change
  const handleIntervalChange = (_: React.MouseEvent<HTMLElement>, newInterval: TimeInterval | null) => {
    if (newInterval) setInterval(newInterval);
  };

  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar — hidden when no symbol */}
      {symbol && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            px: 2,
            py: 1,
            borderBottom: `1px solid ${theme.border.subtle}`,
            flexWrap: 'wrap',
          }}
        >
          <Typography sx={{ fontWeight: 600, fontSize: 16, color: theme.text.primary }}>{symbol}</Typography>

          <ToggleButtonGroup
            value={interval}
            exclusive
            onChange={handleIntervalChange}
            size="small"
            sx={{ '& .MuiToggleButton-root': { px: 1.5, py: 0.3, fontSize: 12 } }}
          >
            <ToggleButton value="daily">Daily</ToggleButton>
            <ToggleButton value="weekly">Weekly</ToggleButton>
            <ToggleButton value="monthly">Monthly</ToggleButton>
          </ToggleButtonGroup>

          <FormControlLabel
            control={
              <Switch size="small" checked={showMA50} onChange={(e) => setShowMA50(e.target.checked)} />
            }
            label={<Typography sx={{ fontSize: 12, color: theme.text.secondary }}>MA50</Typography>}
          />
          <FormControlLabel
            control={
              <Switch size="small" checked={showMA200} onChange={(e) => setShowMA200(e.target.checked)} />
            }
            label={<Typography sx={{ fontSize: 12, color: theme.text.secondary }}>MA200</Typography>}
          />
        </Box>
      )}

      {/* Chart container — always in DOM so createChart runs on mount */}
      <Box sx={{ flex: 1, position: 'relative', minHeight: 300 }}>
        {!symbol && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.text.muted,
              zIndex: 10,
            }}
          >
            <Typography sx={{ fontSize: 14 }}>Select a symbol from the watchlist to view chart</Typography>
          </Box>
        )}
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(0,0,0,0.3)',
              zIndex: 10,
            }}
          >
            <LoadingDots text="Loading chart" fontSize={14} />
          </Box>
        )}
        <Box ref={chartContainerRef} sx={{ position: 'absolute', inset: 0 }} />
      </Box>
    </Box>
  );
}
