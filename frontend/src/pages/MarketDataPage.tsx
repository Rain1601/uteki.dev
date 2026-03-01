/**
 * Market Data Page — K-line database viewer with quality monitoring.
 *
 * Left panel: symbol list grouped by asset type with freshness status.
 * Right panel: TradingView-style candlestick chart + volume overlay.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Chip,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  alpha,
} from '@mui/material';
import {
  Database,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
} from 'lightweight-charts';
import { useTheme } from '../theme/ThemeProvider';
import {
  getSymbols,
  getKlines,
  getFreshness,
  SymbolRecord,
  KlineRecord,
  FreshnessItem,
} from '../api/marketData';

/* ── Constants ── */

const ASSET_LABELS: Record<string, string> = {
  us_stock: 'US Stocks',
  us_etf: 'US ETFs',
  crypto: 'Crypto',
  forex: 'Forex',
  futures: 'Futures',
  hk_stock: 'HK Stocks',
  a_share: 'A-Shares',
};

const STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle; label: string }> = {
  ok: { color: '#34d399', icon: CheckCircle, label: 'Up to date' },
  stale: { color: '#fbbf24', icon: Clock, label: 'Stale' },
  warning: { color: '#fb923c', icon: AlertTriangle, label: 'Warning' },
  error: { color: '#f87171', icon: XCircle, label: 'Error' },
  no_data: { color: '#6b7280', icon: Database, label: 'No data' },
};

type Interval = 'daily' | 'weekly' | 'monthly';

/* ── Page Component ── */

export default function MarketDataPage() {
  const { theme, isDark } = useTheme();

  const [symbols, setSymbols] = useState<SymbolRecord[]>([]);
  const [freshness, setFreshness] = useState<Map<string, FreshnessItem>>(new Map());
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolRecord | null>(null);
  const [interval, setInterval] = useState<Interval>('daily');
  const [klines, setKlines] = useState<KlineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

  // Fetch symbols + freshness on mount
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [symRes, frRes] = await Promise.all([getSymbols(), getFreshness()]);
      setSymbols(symRes.symbols);

      const map = new Map<string, FreshnessItem>();
      frRes.symbols.forEach((f) => map.set(f.symbol, f));
      setFreshness(map);

      // Auto-select first symbol
      if (symRes.symbols.length > 0 && !selectedSymbol) {
        setSelectedSymbol(symRes.symbols[0]);
      }
    } catch (e) {
      console.error('Failed to load market data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch klines when symbol or interval changes
  useEffect(() => {
    if (!selectedSymbol) return;
    let cancelled = false;

    (async () => {
      setChartLoading(true);
      const res = await getKlines(selectedSymbol.symbol, interval);
      if (!cancelled) {
        setKlines(res.data);
        setChartLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedSymbol, interval]);

  // Group symbols by asset type
  const grouped = symbols.reduce<Record<string, SymbolRecord[]>>((acc, sym) => {
    const key = sym.asset_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(sym);
    return acc;
  }, {});

  // Freshness summary
  const summaryStats = {
    total: symbols.length,
    ok: Array.from(freshness.values()).filter((f) => f.status === 'ok').length,
    issues: Array.from(freshness.values()).filter((f) => f.status !== 'ok').length,
  };

  const bg = isDark ? theme.background.primary : '#fafafa';
  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: bg }}>
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${borderColor}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Database size={20} color={theme.brand.primary} />
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: theme.text.primary }}>
            Market Data
          </Typography>
          {!loading && (
            <Chip
              size="small"
              label={`${summaryStats.total} symbols`}
              sx={{
                bgcolor: alpha(theme.brand.primary, 0.1),
                color: theme.brand.primary,
                fontSize: 11,
                height: 22,
              }}
            />
          )}
        </Box>
        {!loading && (
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <StatusBadge count={summaryStats.ok} status="ok" isDark={isDark} />
            {summaryStats.issues > 0 && (
              <StatusBadge count={summaryStats.issues} status="warning" isDark={isDark} />
            )}
          </Box>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Left: Symbol List */}
          <Box
            sx={{
              width: 280,
              borderRight: `1px solid ${borderColor}`,
              overflowY: 'auto',
              '&::-webkit-scrollbar': { width: 4 },
              '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(128,128,128,0.3)', borderRadius: 2 },
            }}
          >
            {Object.entries(ASSET_LABELS).map(([type, label]) => {
              const items = grouped[type];
              if (!items || items.length === 0) return null;
              return (
                <Box key={type} sx={{ mb: 0.5 }}>
                  <Typography
                    sx={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 1,
                      color: theme.text.muted,
                      px: 1.5,
                      pt: 1.5,
                      pb: 0.5,
                    }}
                  >
                    {label}
                  </Typography>
                  {items.map((sym) => (
                    <SymbolRow
                      key={sym.id}
                      sym={sym}
                      freshness={freshness.get(sym.symbol)}
                      selected={selectedSymbol?.id === sym.id}
                      onClick={() => setSelectedSymbol(sym)}
                      theme={theme}
                      isDark={isDark}
                    />
                  ))}
                </Box>
              );
            })}
          </Box>

          {/* Right: Chart + Details */}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {selectedSymbol ? (
              <>
                {/* Chart toolbar */}
                <Box
                  sx={{
                    px: 2,
                    py: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: `1px solid ${borderColor}`,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography
                      sx={{ fontSize: 18, fontWeight: 800, color: theme.text.primary, fontFamily: 'monospace' }}
                    >
                      {selectedSymbol.symbol}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: theme.text.muted }}>
                      {selectedSymbol.name}
                    </Typography>
                    {klines.length > 0 && <PriceChip klines={klines} theme={theme} />}
                  </Box>
                  <ToggleButtonGroup
                    size="small"
                    value={interval}
                    exclusive
                    onChange={(_e, v) => v && setInterval(v as Interval)}
                    sx={{
                      '& .MuiToggleButton-root': {
                        fontSize: 11,
                        fontWeight: 600,
                        px: 1.5,
                        py: 0.25,
                        color: theme.text.muted,
                        borderColor: borderColor,
                        '&.Mui-selected': {
                          bgcolor: alpha(theme.brand.primary, 0.15),
                          color: theme.brand.primary,
                        },
                      },
                    }}
                  >
                    <ToggleButton value="daily">D</ToggleButton>
                    <ToggleButton value="weekly">W</ToggleButton>
                    <ToggleButton value="monthly">M</ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                {/* Chart */}
                <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
                  {chartLoading && (
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 2,
                        bgcolor: alpha(bg, 0.6),
                      }}
                    >
                      <CircularProgress size={24} />
                    </Box>
                  )}
                  <CandlestickChart klines={klines} isDark={isDark} />
                </Box>

                {/* Stats footer */}
                <StatsFooter
                  klines={klines}
                  freshness={freshness.get(selectedSymbol.symbol)}
                  theme={theme}
                  borderColor={borderColor}
                />
              </>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                <Typography sx={{ color: theme.text.muted, fontSize: 13 }}>
                  Select a symbol to view chart
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/* ── Sub-components ── */

function SymbolRow({
  sym,
  freshness,
  selected,
  onClick,
  theme,
  isDark,
}: {
  sym: SymbolRecord;
  freshness?: FreshnessItem;
  selected: boolean;
  onClick: () => void;
  theme: any;
  isDark: boolean;
}) {
  const status = freshness?.status || 'no_data';
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.no_data;
  const Icon = cfg.icon;

  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1.5,
        py: 0.75,
        cursor: 'pointer',
        bgcolor: selected
          ? alpha(theme.brand.primary, isDark ? 0.12 : 0.08)
          : 'transparent',
        borderLeft: selected ? `2px solid ${theme.brand.primary}` : '2px solid transparent',
        '&:hover': {
          bgcolor: selected
            ? alpha(theme.brand.primary, isDark ? 0.12 : 0.08)
            : isDark
            ? 'rgba(255,255,255,0.03)'
            : 'rgba(0,0,0,0.02)',
        },
        transition: 'background-color 0.15s',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 700,
            color: theme.text.primary,
            fontFamily: 'monospace',
            lineHeight: 1.3,
          }}
        >
          {sym.symbol}
        </Typography>
        <Typography
          sx={{
            fontSize: 10,
            color: theme.text.muted,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 180,
          }}
        >
          {sym.name || sym.exchange || ''}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {freshness && freshness.actual_latest && (
          <Typography sx={{ fontSize: 9, color: theme.text.disabled, fontFamily: 'monospace' }}>
            {freshness.actual_latest.slice(5)}
          </Typography>
        )}
        <Icon size={12} color={cfg.color} />
      </Box>
    </Box>
  );
}

function StatusBadge({
  count,
  status,
  isDark,
}: {
  count: number;
  status: string;
  theme?: any;
  isDark: boolean;
}) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.no_data;
  const Icon = cfg.icon;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.25,
        borderRadius: 1,
        bgcolor: alpha(cfg.color, isDark ? 0.12 : 0.08),
      }}
    >
      <Icon size={12} color={cfg.color} />
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: cfg.color }}>
        {count}
      </Typography>
    </Box>
  );
}

function PriceChip({ klines, theme }: { klines: KlineRecord[]; theme: any }) {
  if (klines.length < 2) return null;
  const last = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  if (!last.close || !prev.close) return null;

  const change = ((last.close - prev.close) / prev.close) * 100;
  const up = change >= 0;
  const color = up ? '#34d399' : '#f87171';
  const Icon = up ? TrendingUp : TrendingDown;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
      <Typography sx={{ fontSize: 15, fontWeight: 700, color: theme.text.primary, fontFamily: 'monospace' }}>
        {last.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
        <Icon size={12} color={color} />
        <Typography sx={{ fontSize: 11, fontWeight: 600, color, fontFamily: 'monospace' }}>
          {up ? '+' : ''}{change.toFixed(2)}%
        </Typography>
      </Box>
    </Box>
  );
}

function StatsFooter({
  klines,
  freshness,
  theme,
  borderColor,
}: {
  klines: KlineRecord[];
  freshness?: FreshnessItem;
  theme: any;
  isDark?: boolean;
  borderColor: string;
}) {
  if (klines.length === 0) return null;

  const last = klines[klines.length - 1];
  const first = klines[0];

  const stats = [
    { label: 'Data points', value: klines.length.toLocaleString() },
    { label: 'Range', value: `${first.time} \u2192 ${last.time}` },
    { label: 'Open', value: last.open?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '-' },
    { label: 'High', value: last.high?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '-' },
    { label: 'Low', value: last.low?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '-' },
    { label: 'Volume', value: last.volume ? formatVolume(last.volume) : '-' },
  ];

  if (freshness) {
    const cfg = STATUS_CONFIG[freshness.status] || STATUS_CONFIG.no_data;
    stats.push({ label: 'Freshness', value: cfg.label });
  }

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 3,
        px: 2,
        py: 1,
        borderTop: `1px solid ${borderColor}`,
        overflowX: 'auto',
      }}
    >
      {stats.map((s) => (
        <Box key={s.label} sx={{ minWidth: 'fit-content' }}>
          <Typography sx={{ fontSize: 9, color: theme.text.disabled, fontWeight: 600, letterSpacing: 0.5 }}>
            {s.label}
          </Typography>
          <Typography sx={{ fontSize: 12, color: theme.text.primary, fontWeight: 600, fontFamily: 'monospace' }}>
            {s.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/* ── TradingView Chart ── */

function CandlestickChart({
  klines,
  isDark,
}: {
  klines: KlineRecord[];
  isDark: boolean;
  theme?: any;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#8b8d94' : '#6b7280',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },
        horzLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },
      },
      crosshair: {
        vertLine: { labelBackgroundColor: isDark ? '#374151' : '#e5e7eb' },
        horzLine: { labelBackgroundColor: isDark ? '#374151' : '#e5e7eb' },
      },
      rightPriceScale: { borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
      timeScale: {
        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        timeVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399',
      downColor: '#f87171',
      borderDownColor: '#f87171',
      borderUpColor: '#34d399',
      wickDownColor: '#f87171',
      wickUpColor: '#34d399',
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volume.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [isDark]);

  // Update data
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current || klines.length === 0) return;

    const candleData: CandlestickData[] = [];
    const volumeData: HistogramData[] = [];

    for (const k of klines) {
      if (k.open == null || k.high == null || k.low == null || k.close == null) continue;
      const time = k.time as string;
      candleData.push({ time, open: k.open, high: k.high, low: k.low, close: k.close });

      const up = k.close >= k.open;
      volumeData.push({
        time,
        value: k.volume || 0,
        color: up ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)',
      });
    }

    candleRef.current.setData(candleData);
    volumeRef.current.setData(volumeData);

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [klines]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

/* ── Utils ── */

function formatVolume(vol: number): string {
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
  return vol.toLocaleString();
}
