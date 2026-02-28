import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import * as echarts from 'echarts/core';
import { TreemapChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { getMarketCapList } from '../../api/marketDashboard';
import type { MarketCapAsset } from '../../types/marketDashboard';
import LoadingDots from '../LoadingDots';

echarts.use([TreemapChart, TooltipComponent, CanvasRenderer]);

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'company', label: 'Stocks' },
  { key: 'cryptocurrency', label: 'Crypto' },
  { key: 'precious_metal', label: 'Metals' },
  { key: 'etf', label: 'ETF' },
];

function getChangeColor(pct: number): string {
  if (pct > 3) return '#22ab94';
  if (pct > 1) return '#26a69a';
  if (pct > 0) return '#4db6ac';
  if (pct > -1) return '#ef5350';
  if (pct > -3) return '#f44336';
  return '#d32f2f';
}

function fmtCap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

interface Props {
  theme: any;
  isDark: boolean;
}

export default function AssetsTreemap({ theme, isDark }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [assets, setAssets] = useState<MarketCapAsset[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await getMarketCapList(filter || undefined, 200);
    if (res.success) setAssets(res.data);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Render chart
  useEffect(() => {
    if (!chartRef.current || loading || !assets.length) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const treeData = assets.map(a => ({
      name: a.symbol || a.name,
      value: a.market_cap,
      itemStyle: { color: getChangeColor(a.change_today ?? 0) },
      _raw: a,
    }));

    chartInstance.current.setOption({
      tooltip: {
        formatter: (params: any) => {
          const r = params.data._raw as MarketCapAsset;
          if (!r) return '';
          const chg = r.change_today != null ? `${r.change_today >= 0 ? '+' : ''}${r.change_today.toFixed(2)}%` : 'N/A';
          const chgColor = (r.change_today ?? 0) >= 0 ? '#22ab94' : '#ef5350';
          return `
            <div style="font-size:12px;line-height:1.6">
              <b style="font-size:13px">#${r.rank} ${r.name}</b> ${r.symbol ? `<span style="color:#888">(${r.symbol})</span>` : ''}<br/>
              <span style="color:#888">Type:</span> ${r.asset_type}<br/>
              <span style="color:#888">Market Cap:</span> ${fmtCap(r.market_cap)}<br/>
              ${r.price ? `<span style="color:#888">Price:</span> $${r.price.toLocaleString()}<br/>` : ''}
              <span style="color:#888">24h:</span> <span style="color:${chgColor};font-weight:600">${chg}</span>
            </div>
          `;
        },
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'rgba(255,255,255,0.08)',
        textStyle: { color: '#e2e8f0' },
        borderRadius: 6,
        padding: [8, 12],
      },
      series: [{
        type: 'treemap',
        width: '100%',
        height: '100%',
        roam: false,
        nodeClick: false,
        squareRatio: 0.5 * (1 + Math.sqrt(5)),
        breadcrumb: { show: false },
        label: {
          show: true,
          formatter: (params: any) => {
            const r = params.data._raw as MarketCapAsset;
            if (!r) return '';
            const chg = r.change_today != null ? `${r.change_today >= 0 ? '+' : ''}${r.change_today.toFixed(1)}%` : '';
            return `{name|${r.symbol || r.name}}\n{chg|${chg}}`;
          },
          rich: {
            name: { fontSize: 11, fontWeight: 600, color: '#fff', lineHeight: 16 },
            chg: { fontSize: 9, color: 'rgba(255,255,255,0.8)', lineHeight: 14 },
          },
          padding: [4, 6],
        },
        emphasis: {
          itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.3)' },
        },
        itemStyle: {
          borderColor: isDark ? '#1e293b' : '#334155',
          borderWidth: 1,
          gapWidth: 1,
        },
        data: treeData,
        animationDurationUpdate: 500,
        animationEasing: 'cubicOut',
      }],
    }, true);

    return () => {};
  }, [assets, loading, isDark]);

  // Resize handler
  useEffect(() => {
    const onResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', onResize);
    // Also resize on mount after a tick
    const timer = setTimeout(onResize, 100);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
    };
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Filter bar */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.5px', mr: 0.5 }}>
          Global Assets by Market Cap
        </Typography>
        {FILTERS.map(f => (
          <Chip
            key={f.key}
            label={f.label}
            size="small"
            onClick={() => setFilter(f.key)}
            sx={{
              height: 22, fontSize: 10, fontWeight: 600,
              bgcolor: filter === f.key ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)') : 'transparent',
              color: filter === f.key ? theme.text.primary : theme.text.muted,
              border: `1px solid ${filter === f.key ? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)') : 'transparent'}`,
              '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
            }}
          />
        ))}
      </Box>

      {/* Chart */}
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <LoadingDots text="Loading treemap" fontSize={12} />
          </Box>
        ) : assets.length === 0 ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 1 }}>
            <Typography sx={{ fontSize: 13, color: theme.text.muted }}>No data available</Typography>
            <Typography sx={{ fontSize: 11, color: theme.text.muted }}>Run sync first: POST /api/macro/marketcap/sync</Typography>
          </Box>
        ) : (
          <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
        )}
      </Box>
    </Box>
  );
}
