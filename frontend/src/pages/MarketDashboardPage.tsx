import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
} from 'recharts';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import LoadingDots from '../components/LoadingDots';
import {
  getDashboardOverview,
  getValuationDetail,
  getLiquidityDetail,
  getFlowDetail,
} from '../api/marketDashboard';
import type {
  Signal,
  CategoryData,
  Indicator,
  HistoryPoint,
  FlowData,
  SectorETF,
  StyleComparison,
} from '../types/marketDashboard';

/* ─── palette ─── */
const SIG: Record<Signal, { color: string; bg: string }> = {
  green:   { color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  yellow:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  red:     { color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  neutral: { color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
};

const CAT_META: Record<string, { label: string; question: string; hero: string }> = {
  valuation: { label: 'Valuation', question: 'Is the market expensive?', hero: 'spy_pe' },
  liquidity: { label: 'Liquidity', question: 'Is liquidity abundant?', hero: 'net_liq' },
  flow:      { label: 'Money Flow', question: 'Where is money flowing?', hero: 'vix' },
};
const CAT_ORDER = ['valuation', 'liquidity', 'flow'];

/* ─── helpers ─── */
function fmtVal(v: number | null | undefined, unit?: string): string {
  if (v == null) return '—';
  const prefix = unit === '$' ? '$' : '';
  const suffix = unit && unit !== '$' ? unit : '';
  if (Math.abs(v) >= 1e12) return `${prefix}${(v / 1e12).toFixed(2)}T${suffix}`;
  if (Math.abs(v) >= 1e9) return `${prefix}${(v / 1e9).toFixed(1)}B${suffix}`;
  if (Math.abs(v) >= 1e6) return `${prefix}${(v / 1e6).toFixed(1)}M${suffix}`;
  if (Math.abs(v) >= 1e4 && !suffix) return `${prefix}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}${suffix}`;
  return `${prefix}${v.toLocaleString()}${suffix}`;
}

function fmtChg(v: number | null | undefined): string {
  if (v == null) return '';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

/* ═══════════════════ Left Panel Components ═══════════════════ */

function LeftCategoryGroup({ cat, theme, isDark, selected, onSelect }: {
  cat: CategoryData; theme: any; isDark: boolean; selected: boolean; onSelect: () => void;
}) {
  const s = SIG[cat.signal];
  const meta = CAT_META[cat.category];

  return (
    <Box sx={{ mb: 0.5 }}>
      {/* Category header */}
      <Box
        onClick={onSelect}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.75,
          p: '8px 12px', cursor: 'pointer', borderRadius: 1,
          bgcolor: selected ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent',
          '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)' },
          transition: 'background 0.15s',
        }}
      >
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: theme.text.primary, textTransform: 'uppercase', letterSpacing: '0.8px', flex: 1 }}>
          {meta.label}
        </Typography>
        <Box sx={{ px: 0.6, py: 0.15, borderRadius: 0.5, bgcolor: s.bg }}>
          <Typography sx={{ fontSize: 8, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            {cat.signal_label}
          </Typography>
        </Box>
      </Box>

      {/* Indicator rows */}
      {cat.indicators.map(ind => {
        const is = SIG[ind.signal];
        return (
          <Box key={ind.id} sx={{
            display: 'flex', alignItems: 'center', gap: 0.75,
            p: '5px 12px 5px 24px',
            '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.012)' },
          }}>
            <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: is.color, flexShrink: 0, opacity: 0.7 }} />
            <Typography noWrap sx={{ fontSize: 11, color: theme.text.muted, flex: 1, lineHeight: 1.3 }}>
              {ind.name}
            </Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: theme.text.primary, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {fmtVal(ind.value, ind.unit)}
            </Typography>
            {ind.change_pct != null && (
              <Typography sx={{ fontSize: 9, fontWeight: 600, color: ind.change_pct >= 0 ? SIG.green.color : SIG.red.color, flexShrink: 0, width: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmtChg(ind.change_pct)}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/* ═══════════════════ Right Panel Components ═══════════════════ */

/* ─── Sparkline area chart ─── */
function SparkArea({ data, color, height = 120 }: { data: HistoryPoint[]; color: string; height?: number }) {
  if (!data || data.length < 3) return null;
  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#475569' }} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" axisLine={false} tickLine={false} />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 11, color: '#e2e8f0', padding: '4px 8px' }}
            labelStyle={{ color: '#94a3b8', fontSize: 10 }}
            formatter={(v: number) => [v.toLocaleString(), '']}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#grad-${color.replace('#', '')})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
}

/* ─── Chart card ─── */
function ChartCard({ ind, theme, isDark }: { ind: Indicator; theme: any; isDark: boolean }) {
  const s = SIG[ind.signal];
  return (
    <Box sx={{
      p: 1.5, borderRadius: 1.5,
      bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.012)',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
      height: '100%', display: 'flex', flexDirection: 'column',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography noWrap sx={{ fontSize: 10, fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {ind.name}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: theme.text.primary, fontVariantNumeric: 'tabular-nums' }}>
            {fmtVal(ind.value, ind.unit)}
          </Typography>
          {ind.change_pct != null && (
            <Typography sx={{ fontSize: 9, fontWeight: 600, color: ind.change_pct >= 0 ? SIG.green.color : SIG.red.color }}>
              {fmtChg(ind.change_pct)}
            </Typography>
          )}
        </Box>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {ind.history && ind.history.length > 3 ? (
          <SparkArea data={ind.history} color={s.color} height={120} />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography sx={{ fontSize: 11, color: theme.text.muted }}>No history</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/* ─── Sector bars ─── */
function SectorBars({ sectors, theme, isDark }: { sectors: SectorETF[]; theme: any; isDark: boolean }) {
  if (!sectors?.length) return null;
  const sorted = [...sectors].sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0));
  const maxAbs = Math.max(...sorted.map(s => Math.abs(s.change_pct ?? 0)), 0.01);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {sorted.map(s => {
        const pct = s.change_pct ?? 0;
        const positive = pct >= 0;
        const barW = Math.max((Math.abs(pct) / maxAbs) * 50, 2);
        const c = positive ? SIG.green.color : SIG.red.color;
        return (
          <Box key={s.symbol} sx={{ display: 'flex', alignItems: 'center', height: 18 }}>
            <Typography sx={{ fontSize: 10, fontWeight: 500, color: theme.text.muted, width: 32, textAlign: 'right', flexShrink: 0 }}>
              {s.symbol}
            </Typography>
            <Box sx={{ flex: 1, position: 'relative', height: 10, mx: 0.75 }}>
              <Box sx={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} />
              <Box sx={{
                position: 'absolute', top: 1, bottom: 1,
                ...(positive ? { left: '50%', width: `${barW}%` } : { right: '50%', width: `${barW}%` }),
                borderRadius: positive ? '0 2px 2px 0' : '2px 0 0 2px',
                bgcolor: `${c}40`, transition: 'width 0.3s',
              }} />
            </Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, color: c, width: 46, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

/* ─── Style comparison ─── */
function StyleRow({ comp, theme, isDark }: { comp: StyleComparison; theme: any; isDark: boolean }) {
  const a = comp.a.change_pct ?? 0;
  const b = comp.b.change_pct ?? 0;
  const total = Math.abs(a) + Math.abs(b);
  const aRatio = total > 0 ? (Math.abs(a) / total) * 100 : 50;
  const aWins = a > b;
  const bWins = b > a;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.4 }}>
      <Box sx={{ width: 80, textAlign: 'right', flexShrink: 0 }}>
        <Typography noWrap sx={{ fontSize: 10, fontWeight: aWins ? 600 : 400, color: aWins ? theme.text.primary : theme.text.muted, lineHeight: 1.2 }}>
          {comp.a.name}
        </Typography>
        <Typography sx={{ fontSize: 9, fontWeight: 600, color: a >= 0 ? SIG.green.color : SIG.red.color }}>
          {a >= 0 ? '+' : ''}{a.toFixed(2)}%
        </Typography>
      </Box>
      <Box sx={{ flex: 1, height: 5, borderRadius: 3, display: 'flex', overflow: 'hidden', bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}>
        <Box sx={{ width: `${aRatio}%`, height: '100%', bgcolor: aWins ? `${a >= 0 ? SIG.green.color : SIG.red.color}50` : 'transparent', transition: 'width 0.3s' }} />
        <Box sx={{ width: `${100 - aRatio}%`, height: '100%', bgcolor: bWins ? `${b >= 0 ? SIG.green.color : SIG.red.color}50` : 'transparent', transition: 'width 0.3s' }} />
      </Box>
      <Box sx={{ width: 80, textAlign: 'left', flexShrink: 0 }}>
        <Typography noWrap sx={{ fontSize: 10, fontWeight: bWins ? 600 : 400, color: bWins ? theme.text.primary : theme.text.muted, lineHeight: 1.2 }}>
          {comp.b.name}
        </Typography>
        <Typography sx={{ fontSize: 9, fontWeight: 600, color: b >= 0 ? SIG.green.color : SIG.red.color }}>
          {b >= 0 ? '+' : ''}{b.toFixed(2)}%
        </Typography>
      </Box>
    </Box>
  );
}

/* ─── Right panel: Valuation / Liquidity detail ─── */
function DetailChartsPanel({ category, indicators, theme, isDark, loading }: {
  category: string; indicators: Indicator[]; theme: any; isDark: boolean; loading: boolean;
}) {
  const meta = CAT_META[category];
  const s = SIG[indicators[0]?.signal || 'neutral'];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <LoadingDots text="Loading charts" fontSize={12} />
      </Box>
    );
  }

  const charted = indicators.filter(i => i.history && i.history.length > 3);
  if (!charted.length) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography sx={{ fontSize: 13, color: theme.text.muted }}>No historical data available</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Title */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
        <Box sx={{ width: 3, height: 14, borderRadius: 1, bgcolor: s.color }} />
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.primary }}>
          {meta.label} — Historical Trends
        </Typography>
        <Typography sx={{ fontSize: 11, color: theme.text.muted, ml: 'auto' }}>
          {meta.question}
        </Typography>
      </Box>
      {/* Charts grid */}
      <Box sx={{
        flex: 1, minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 1.5,
        alignContent: 'start',
        overflowY: 'auto',
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-thumb': { bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', borderRadius: 2 },
      }}>
        {charted.map(ind => (
          <ChartCard key={ind.id} ind={ind} theme={theme} isDark={isDark} />
        ))}
      </Box>
    </Box>
  );
}

/* ─── Right panel: Flow detail ─── */
function FlowPanel({ flowData, cat, theme, isDark }: {
  flowData: FlowData | null; cat: CategoryData; theme: any; isDark: boolean;
}) {
  const s = SIG[cat.signal];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Title */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
        <Box sx={{ width: 3, height: 14, borderRadius: 1, bgcolor: s.color }} />
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.primary }}>
          Money Flow — Overview
        </Typography>
        <Typography sx={{ fontSize: 11, color: theme.text.muted, ml: 'auto' }}>
          Where is money flowing?
        </Typography>
      </Box>

      <Box sx={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 2.5,
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-thumb': { bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', borderRadius: 2 },
      }}>
        {/* Sector Performance */}
        {flowData && flowData.sectors.length > 0 && (
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.8px', mb: 1 }}>
              Sector Performance
            </Typography>
            <Box sx={{
              p: 1.5, borderRadius: 1.5,
              bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.012)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
            }}>
              <SectorBars sectors={flowData.sectors} theme={theme} isDark={isDark} />
            </Box>
          </Box>
        )}

        {/* Style Rotation */}
        {flowData && flowData.style_comparisons.length > 0 && (
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: '0.8px', mb: 1 }}>
              Style Rotation
            </Typography>
            <Box sx={{
              p: 1.5, borderRadius: 1.5,
              bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.012)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
            }}>
              {flowData.style_comparisons.map(sc => (
                <StyleRow key={sc.label} comp={sc} theme={theme} isDark={isDark} />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/* ═══════════════════ Main Page ═══════════════════ */

export default function MarketDashboardPage() {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const { isMobile, isSmallScreen } = useResponsive();
  const isCompact = isMobile || isSmallScreen;

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [flowData, setFlowData] = useState<FlowData | null>(null);
  const [selected, setSelected] = useState<string>('valuation');
  const [detailData, setDetailData] = useState<Record<string, Indicator[]>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, fl] = await Promise.all([getDashboardOverview(), getFlowDetail()]);
      if (ov.success) setCategories(ov.data.categories);
      if (fl.success) setFlowData(fl.data);
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-fetch detail when selecting a category
  const selectCategory = useCallback(async (cat: string) => {
    setSelected(cat);
    if (cat === 'flow' || detailData[cat]) return;
    setDetailLoading(p => ({ ...p, [cat]: true }));
    try {
      const res = cat === 'valuation' ? await getValuationDetail(52) : await getLiquidityDetail(52);
      if (res.success) setDetailData(p => ({ ...p, [cat]: res.data.indicators }));
    } catch (e) {
      console.error(`Detail fetch error (${cat}):`, e);
    } finally {
      setDetailLoading(p => ({ ...p, [cat]: false }));
    }
  }, [detailData]);

  // Preload first category detail
  useEffect(() => {
    if (!loading && categories.length > 0 && !detailData['valuation']) {
      selectCategory('valuation');
    }
  }, [loading, categories, detailData, selectCategory]);

  const sortedCats = [...categories].sort(
    (a, b) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category)
  );

  const selectedCat = sortedCats.find(c => c.category === selected);

  if (loading) {
    return (
      <Box sx={{
        height: isCompact ? 'calc(100vh - 48px)' : '100vh', width: '100%',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        bgcolor: theme.background.primary, m: isCompact ? -2 : -3,
      }}>
        <LoadingDots text="Loading dashboard" fontSize={14} />
      </Box>
    );
  }

  const LEFT_W = 280;

  return (
    <Box sx={{
      height: isCompact ? 'calc(100vh - 48px)' : '100vh',
      width: isCompact ? 'calc(100% + 32px)' : 'calc(100% + 48px)',
      bgcolor: theme.background.primary, color: theme.text.primary,
      m: isCompact ? -2 : -3,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* ─── Top bar ─── */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2.5, py: 1.5, flexShrink: 0,
        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
      }}>
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: theme.text.primary, letterSpacing: '-0.2px' }}>
            Market Dashboard
          </Typography>
        </Box>

        {/* 3 signal pills */}
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {sortedCats.map(cat => {
            const s = SIG[cat.signal];
            const meta = CAT_META[cat.category];
            const hero = cat.indicators.find(i => i.id === meta.hero) || cat.indicators[0];
            const isActive = selected === cat.category;
            return (
              <Box
                key={cat.category}
                onClick={() => selectCategory(cat.category)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.75,
                  px: 1.5, py: 0.6, borderRadius: 1, cursor: 'pointer',
                  bgcolor: isActive ? s.bg : 'transparent',
                  border: `1px solid ${isActive ? s.color + '30' : 'transparent'}`,
                  transition: 'all 0.15s',
                  '&:hover': { bgcolor: s.bg },
                }}
              >
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: isActive ? theme.text.primary : theme.text.muted }}>
                  {meta.label}
                </Typography>
                {hero && (
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: theme.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtVal(hero.value, hero.unit)}
                  </Typography>
                )}
              </Box>
            );
          })}

          <IconButton onClick={fetchAll} size="small" sx={{ color: theme.text.muted, ml: 0.5, '&:hover': { color: theme.text.primary } }}>
            <RefreshIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </Box>

      {/* ─── Body: left list + right detail ─── */}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* LEFT PANEL */}
        <Box sx={{
          width: LEFT_W, flexShrink: 0,
          borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
          overflowY: 'auto', py: 1,
          '&::-webkit-scrollbar': { width: 3 },
          '&::-webkit-scrollbar-thumb': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', borderRadius: 2 },
        }}>
          {sortedCats.map(cat => (
            <LeftCategoryGroup
              key={cat.category}
              cat={cat}
              theme={theme}
              isDark={isDark}
              selected={selected === cat.category}
              onSelect={() => selectCategory(cat.category)}
            />
          ))}
        </Box>

        {/* RIGHT PANEL */}
        <Box sx={{ flex: 1, minWidth: 0, p: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {selected === 'flow' && selectedCat ? (
            <FlowPanel flowData={flowData} cat={selectedCat} theme={theme} isDark={isDark} />
          ) : (
            <DetailChartsPanel
              category={selected}
              indicators={detailData[selected] || []}
              theme={theme}
              isDark={isDark}
              loading={detailLoading[selected] || false}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}
