/**
 * Arena Timeline Chart — TradingView Line-with-Markers 风格
 * 紫色折线 + 每个数据点显示圆形标记 + 选中点浮动卡片
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Box, Typography } from '@mui/material';
import {
  createChart,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineData,
  Time,
  ColorType,
  LineSeries,
  AreaSeries,
  SeriesMarker,
  LineStyle,
} from 'lightweight-charts';
import { useTheme } from '../../theme/ThemeProvider';
import { ArenaTimelinePoint } from '../../api/index';

interface ArenaTimelineChartProps {
  data: ArenaTimelinePoint[];
  selectedHarnessId: string | null;
  onSelectPoint: (harnessId: string) => void;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  BUY:  { label: 'BUY',  color: '#26a69a' },
  SELL: { label: 'SELL', color: '#ef5350' },
  HOLD: { label: 'HOLD', color: '#ffab40' },
};

function getChartTheme(isDark: boolean) {
  return isDark
    ? {
        background: '#131722',
        textColor: 'rgba(209, 212, 220, 0.5)',
        gridColor: 'rgba(42, 46, 57, 0.4)',
        crosshairColor: 'rgba(150, 150, 180, 0.3)',
        crosshairLabelBg: '#2a2e39',
        lineColor: '#a855f7',
        returnColor: '#3b82f6',
        returnAreaTop: 'rgba(59, 130, 246, 0.18)',
        returnAreaBottom: 'rgba(59, 130, 246, 0.0)',
        tooltipBg: 'rgba(19, 23, 34, 0.85)',
        tooltipBorder: 'rgba(168, 85, 247, 0.25)',
        tooltipText: 'rgba(209, 212, 220, 0.9)',
        tooltipMuted: 'rgba(209, 212, 220, 0.5)',
      }
    : {
        background: '#ffffff',
        textColor: 'rgba(80, 86, 102, 0.5)',
        gridColor: 'rgba(220, 225, 235, 0.6)',
        crosshairColor: 'rgba(120, 125, 140, 0.25)',
        crosshairLabelBg: '#f0f3fa',
        lineColor: '#7c3aed',
        returnColor: '#2563eb',
        returnAreaTop: 'rgba(37, 99, 235, 0.12)',
        returnAreaBottom: 'rgba(37, 99, 235, 0.0)',
        tooltipBg: 'rgba(255, 255, 255, 0.88)',
        tooltipBorder: 'rgba(124, 58, 237, 0.15)',
        tooltipText: 'rgba(30, 35, 50, 0.9)',
        tooltipMuted: 'rgba(80, 86, 102, 0.55)',
      };
}

interface TooltipState {
  x: number;
  y: number;
  point: ArenaTimelinePoint;
}

export default function ArenaTimelineChart({
  data,
  selectedHarnessId,
  onSelectPoint,
}: ArenaTimelineChartProps) {
  const { isDark, theme } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const returnSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const dataMapRef = useRef<Map<string, string>>(new Map());
  const timeMapRef = useRef<Map<string, Time>>(new Map());

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const chartTheme = getChartTheme(isDark);

  // Calculate tooltip position from chart coordinates
  const updateTooltipPosition = useCallback(() => {
    if (!chartRef.current || !seriesRef.current || !selectedHarnessId) {
      setTooltip(null);
      return;
    }

    const pt = data.find((p) => p.harness_id === selectedHarnessId);
    if (!pt || pt.account_total == null || pt.account_total === 0) {
      setTooltip(null);
      return;
    }

    const ts = Math.floor(new Date(pt.created_at).getTime() / 1000) as Time;
    const x = chartRef.current.timeScale().timeToCoordinate(ts);
    const y = seriesRef.current.priceToCoordinate(pt.account_total);

    if (x === null || y === null) {
      setTooltip(null);
      return;
    }

    setTooltip({ x, y, point: pt });
  }, [data, selectedHarnessId]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: chartTheme.background },
        textColor: chartTheme.textColor,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: {
          color: chartTheme.gridColor,
          style: LineStyle.Dashed,
        },
      },
      crosshair: {
        vertLine: {
          color: chartTheme.crosshairColor,
          labelBackgroundColor: chartTheme.crosshairLabelBg,
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: chartTheme.crosshairColor,
          labelBackgroundColor: chartTheme.crosshairLabelBg,
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      leftPriceScale: {
        visible: true,
        borderVisible: false,
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
        barSpacing: 28,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    // LineSeries — TradingView "Line with Markers" style
    const series = chart.addSeries(LineSeries, {
      color: chartTheme.lineColor,
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 6,
      crosshairMarkerBorderColor: chartTheme.lineColor,
      crosshairMarkerBorderWidth: 2,
      crosshairMarkerBackgroundColor: chartTheme.background,
      pointMarkersVisible: true,
      pointMarkersRadius: 4,
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineStyle: LineStyle.Dotted,
      priceLineColor: chartTheme.lineColor,
      priceLineWidth: 1,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `$${price.toLocaleString()}`,
      },
    });
    seriesRef.current = series;

    // Markers plugin (v5) — for selected point highlight
    const seriesMarkers = createSeriesMarkers(series, []);
    markersRef.current = seriesMarkers;

    // AreaSeries — return rate on left Y-axis
    const returnSeries = chart.addSeries(AreaSeries, {
      priceScaleId: 'left',
      lineColor: chartTheme.returnColor,
      topColor: chartTheme.returnAreaTop,
      bottomColor: chartTheme.returnAreaBottom,
      lineWidth: 1,
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      priceLineVisible: false,
      pointMarkersVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price >= 0 ? '+' : ''}${price.toFixed(1)}%`,
      },
    });
    returnSeriesRef.current = returnSeries;

    // Click handler
    chart.subscribeClick((param) => {
      if (!param.time) return;
      const timeStr = String(param.time);
      const harnessId = dataMapRef.current.get(timeStr);
      if (harnessId) onSelectPoint(harnessId);
    });

    // Recalculate tooltip on scroll/zoom
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      // Defer to next tick so coordinates are fresh
      requestAnimationFrame(() => updateTooltipPosition());
    });

    // Resize
    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
      requestAnimationFrame(() => updateTooltipPosition());
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      returnSeriesRef.current = null;
      markersRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update theme
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: chartTheme.background },
        textColor: chartTheme.textColor,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: chartTheme.gridColor, style: LineStyle.Dashed },
      },
      crosshair: {
        vertLine: { color: chartTheme.crosshairColor, labelBackgroundColor: chartTheme.crosshairLabelBg },
        horzLine: { color: chartTheme.crosshairColor, labelBackgroundColor: chartTheme.crosshairLabelBg },
      },
    });
    seriesRef.current?.applyOptions({
      color: chartTheme.lineColor,
      crosshairMarkerBorderColor: chartTheme.lineColor,
      crosshairMarkerBackgroundColor: chartTheme.background,
      priceLineColor: chartTheme.lineColor,
    });
    returnSeriesRef.current?.applyOptions({
      lineColor: chartTheme.returnColor,
      topColor: chartTheme.returnAreaTop,
      bottomColor: chartTheme.returnAreaBottom,
    });
  }, [chartTheme]);

  // Update data + markers + tooltip
  const updateData = useCallback(() => {
    if (!seriesRef.current || !chartRef.current || data.length === 0) return;

    const timeMap = new Map<string, string>();
    const harnessTimeMap = new Map<string, Time>();
    const lineData: LineData[] = [];
    const returnData: LineData[] = [];
    const markers: SeriesMarker<Time>[] = [];

    // Find the first valid account_total as baseline for return rate
    let baseline: number | null = null;
    for (const pt of data) {
      if (pt.account_total != null && pt.account_total > 0) {
        baseline = pt.account_total;
        break;
      }
    }

    for (const pt of data) {
      if (pt.account_total == null || pt.account_total === 0) continue;

      const ts = Math.floor(new Date(pt.created_at).getTime() / 1000) as Time;
      const timeStr = String(ts);
      timeMap.set(timeStr, pt.harness_id);
      harnessTimeMap.set(pt.harness_id, ts);

      lineData.push({ time: ts, value: pt.account_total });

      // Return rate: (current - baseline) / baseline * 100
      if (baseline) {
        const returnPct = ((pt.account_total - baseline) / baseline) * 100;
        returnData.push({ time: ts, value: returnPct });
      }

      // Selected point: larger marker in line color
      if (pt.harness_id === selectedHarnessId) {
        markers.push({
          time: ts,
          position: 'inBar',
          color: chartTheme.lineColor,
          shape: 'circle',
          size: 3,
        });
      }
    }

    dataMapRef.current = timeMap;
    timeMapRef.current = harnessTimeMap;
    seriesRef.current.setData(lineData);
    returnSeriesRef.current?.setData(returnData);
    markersRef.current?.setMarkers(markers);
    chartRef.current.timeScale().fitContent();

    // Update tooltip after data is set
    requestAnimationFrame(() => updateTooltipPosition());
  }, [data, selectedHarnessId, chartTheme.lineColor, updateTooltipPosition]);

  useEffect(() => {
    updateData();
  }, [updateData]);

  // Recalculate tooltip when selection changes
  useEffect(() => {
    updateTooltipPosition();
  }, [selectedHarnessId, updateTooltipPosition]);

  if (data.length === 0) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: isDark ? '#131722' : '#ffffff',
        }}
      >
        <Typography sx={{ fontSize: 13, color: theme.text.muted }}>
          No arena data yet
        </Typography>
      </Box>
    );
  }

  // Compute return rate for tooltip
  const tooltipReturnPct = (() => {
    if (!tooltip) return null;
    const validPts = data.filter((p) => p.account_total != null && p.account_total > 0);
    if (validPts.length === 0) return null;
    const baseline = validPts[0].account_total!;
    const current = tooltip.point.account_total;
    if (current == null || current === 0) return null;
    return ((current - baseline) / baseline) * 100;
  })();

  const actionInfo = tooltip?.point.action
    ? ACTION_LABELS[tooltip.point.action.toUpperCase()]
    : null;

  return (
    <Box sx={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
      <Box ref={chartContainerRef} sx={{ width: '100%', height: '100%' }} />

      {/* Selected point tooltip card */}
      {tooltip && (
        <Box
          sx={{
            position: 'absolute',
            // Position above the point, shift left if too close to right edge
            left: tooltip.x > 200 ? tooltip.x - 110 : tooltip.x + 16,
            top: Math.max(8, tooltip.y - 90),
            pointerEvents: 'none',
            zIndex: 10,
            minWidth: 140,
            px: 1.5,
            py: 1,
            borderRadius: '8px',
            bgcolor: chartTheme.tooltipBg,
            border: `1px solid ${chartTheme.tooltipBorder}`,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: isDark
              ? '0 4px 20px rgba(0,0,0,0.4)'
              : '0 4px 20px rgba(0,0,0,0.08)',
          }}
        >
          {/* Account total + return rate */}
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8 }}>
            <Typography
              sx={{
                fontSize: 16,
                fontWeight: 700,
                color: chartTheme.tooltipText,
                lineHeight: 1.2,
                fontFeatureSettings: '"tnum"',
              }}
            >
              ${tooltip.point.account_total?.toLocaleString()}
            </Typography>
            {tooltipReturnPct != null && (
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: tooltipReturnPct >= 0 ? '#26a69a' : '#ef5350',
                  fontFeatureSettings: '"tnum"',
                }}
              >
                {tooltipReturnPct >= 0 ? '+' : ''}{tooltipReturnPct.toFixed(1)}%
              </Typography>
            )}
          </Box>

          {/* Date */}
          <Typography
            sx={{
              fontSize: 10,
              color: chartTheme.tooltipMuted,
              mt: 0.3,
            }}
          >
            {new Date(tooltip.point.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Typography>

          {/* Action + Type row */}
          <Box sx={{ display: 'flex', gap: 0.8, mt: 0.6, alignItems: 'center' }}>
            {actionInfo && (
              <Box
                sx={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: actionInfo.color,
                  bgcolor: `${actionInfo.color}18`,
                  px: 0.8,
                  py: 0.15,
                  borderRadius: '4px',
                  letterSpacing: '0.5px',
                }}
              >
                {actionInfo.label}
              </Box>
            )}
            <Typography sx={{ fontSize: 9, color: chartTheme.tooltipMuted }}>
              {tooltip.point.harness_type.replace('_', ' ')}
            </Typography>
            <Typography sx={{ fontSize: 9, color: chartTheme.tooltipMuted }}>
              {tooltip.point.model_count} models
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}
