import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Typography, ToggleButton, ToggleButtonGroup, Tooltip as MuiTooltip,
  Button, IconButton,
  Table, TableHead, TableBody, TableRow, TableCell,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useTheme } from '../../theme/ThemeProvider';
import LoadingDots from '../LoadingDots';
import {
  fetchEvalOverview, fetchVotingMatrix, fetchPerformanceTrend,
  fetchCostAnalysis, fetchCounterfactualSummary, fetchLeaderboard,
  IndexResponse,
} from '../../api/index';

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7f50', '#00bcd4', '#e91e63', '#9c27b0', '#4caf50'];

// ─── useAsyncData hook ───
function useAsyncData<T>(fetcher: () => Promise<IndexResponse<T>>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetcherRef.current();
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setData(null);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}

// ─── EmptyGuide ───
function EmptyGuide({ title, hint, actionLabel, onAction, theme }: {
  title: string; hint: string; actionLabel?: string; onAction?: () => void;
  theme: any;
}) {
  return (
    <Box sx={{ py: 4, textAlign: 'center' }}>
      <Typography sx={{ fontSize: 13, color: theme.text.secondary, mb: 0.5, fontWeight: 500 }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: actionLabel ? 1.5 : 0 }}>
        {hint}
      </Typography>
      {actionLabel && onAction && (
        <Button
          size="small" variant="outlined"
          onClick={onAction}
          sx={{
            textTransform: 'none', fontSize: 12,
            color: theme.brand.primary, borderColor: theme.border.subtle,
          }}
        >
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}

// ─── KPI Card ───
function KpiCard({ label, value, sub, theme }: {
  label: string; value: string | number; sub?: string;
  theme: any;
}) {
  return (
    <Box sx={{
      flex: '1 1 0', minWidth: 140, p: 1.5, borderRadius: 2,
      bgcolor: theme.background.secondary, border: `1px solid ${theme.border.subtle}`,
      height: 72, display: 'flex', flexDirection: 'column', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <Typography sx={{ fontSize: 10, color: theme.text.muted, mb: 0.3, fontWeight: 600, lineHeight: 1 }}>
        {label}
      </Typography>
      <Typography sx={{
        fontSize: 16, fontWeight: 700, color: theme.text.primary, lineHeight: 1.2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </Typography>
      {sub && (
        <Typography sx={{
          fontSize: 10, color: theme.text.muted, mt: 0.2, lineHeight: 1.2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

// ─── Section wrapper (three-state) ───
function Section({ title, children, theme, fullWidth, loading, error, onRetry }: {
  title: string; children: React.ReactNode; theme: any; fullWidth?: boolean;
  loading?: boolean; error?: string | null; onRetry?: () => void;
}) {
  return (
    <Box sx={{
      flex: fullWidth ? '1 1 100%' : '1 1 calc(50% - 8px)',
      minWidth: 340, p: 2, borderRadius: 2,
      bgcolor: theme.background.secondary, border: `1px solid ${theme.border.subtle}`,
    }}>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary, mb: 1.5 }}>
        {title}
      </Typography>
      {loading ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <LoadingDots fontSize={12} />
        </Box>
      ) : error ? (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 12, color: '#f44336', mb: 1 }}>{error}</Typography>
          {onRetry && (
            <Button size="small" onClick={onRetry} sx={{ textTransform: 'none', fontSize: 12 }}>
              Retry
            </Button>
          )}
        </Box>
      ) : (
        children
      )}
    </Box>
  );
}

// ─── Main component ───
export default function EvaluationPanel({ onNavigate }: { onNavigate?: (tabIndex: number) => void }) {
  const { theme } = useTheme();
  const [trendMetric, setTrendMetric] = useState<'latency' | 'cost' | 'success_rate'>('latency');

  // Independent data fetching
  const overview = useAsyncData(() => fetchEvalOverview());
  const votingMatrix = useAsyncData(() => fetchVotingMatrix());
  const trend = useAsyncData(() => fetchPerformanceTrend());
  const costAnalysis = useAsyncData(() => fetchCostAnalysis());
  const cfSummary = useAsyncData(() => fetchCounterfactualSummary());
  const leaderboard = useAsyncData(() => fetchLeaderboard());

  const reloadAll = useCallback(() => {
    overview.reload();
    votingMatrix.reload();
    trend.reload();
    costAnalysis.reload();
    cfSummary.reload();
    leaderboard.reload();
  }, [overview, votingMatrix, trend, costAnalysis, cfSummary, leaderboard]);

  const goToArena = useCallback(() => onNavigate?.(0), [onNavigate]);

  // Short name helper
  const shortName = (full: string) => {
    const parts = full.split(':');
    return parts.length > 1 ? parts[1] : full;
  };

  // ─── Radar data from leaderboard ───
  const lbData = leaderboard.data ?? [];
  const radarData = useMemo(() => {
    if (!lbData.length) return [];
    const axes = ['win_rate', 'adoption_rate', 'model_score', 'avg_return_pct', 'counterfactual_win_rate'] as const;
    const maxes = {
      win_rate: Math.max(...lbData.map(e => e.win_rate), 1),
      adoption_rate: Math.max(...lbData.map(e => e.adoption_rate), 1),
      model_score: Math.max(...lbData.map(e => Math.abs(e.model_score)), 1),
      avg_return_pct: Math.max(...lbData.map(e => Math.abs(e.avg_return_pct)), 1),
      counterfactual_win_rate: Math.max(...lbData.map(e => e.counterfactual_win_rate), 1),
    };
    return axes.map(axis => {
      const row: Record<string, any> = { axis: axis.replace(/_/g, ' ') };
      lbData.slice(0, 5).forEach(e => {
        const key = `${e.model_provider}:${e.model_name}`;
        const raw = axis === 'model_score' ? Math.abs(e[axis]) : (e[axis] ?? 0);
        row[key] = Math.round((raw / maxes[axis]) * 100);
      });
      return row;
    });
  }, [lbData]);

  // ─── Trend chart data ───
  const trendData = trend.data;
  const trendChartData = useMemo(() => {
    if (!trendData?.dates.length) return [];
    return trendData.dates.map(date => {
      const row: Record<string, any> = { date: date.slice(5) };
      trendData.models.forEach(m => {
        const pt = m.data.find(d => d.date === date);
        row[m.name] = pt ? pt[trendMetric] : null;
      });
      return row;
    });
  }, [trendData, trendMetric]);

  const modelNames = useMemo(() => trendData?.models.map(m => m.name) ?? [], [trendData]);

  // Derived data
  const ov = overview.data;
  const vm = votingMatrix.data;
  const costModels = costAnalysis.data?.models ?? [];
  const cfModels = cfSummary.data?.models ?? [];

  const tableCellSx = {
    color: theme.text.primary,
    borderBottom: `1px solid ${theme.border.subtle}`,
    fontSize: 11,
    py: 0.8,
    px: 1,
  };
  const tableHeadSx = {
    color: theme.text.muted,
    borderBottom: `1px solid ${theme.border.default}`,
    fontSize: 11,
    fontWeight: 600,
    py: 0.6,
    px: 1,
  };

  const tooltipStyle = {
    background: theme.background.secondary,
    border: `1px solid ${theme.border.subtle}`,
    borderRadius: 6, fontSize: 12,
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto', px: 3, py: 2 }}>
      {/* ── 1. KPI Cards + Refresh ── */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {overview.loading ? (
          <Box sx={{ flex: 1, py: 3, textAlign: 'center' }}>
            <LoadingDots fontSize={12} />
          </Box>
        ) : overview.error ? (
          <Box sx={{ flex: 1, py: 2, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 12, color: '#f44336', mb: 1 }}>{overview.error}</Typography>
            <Button size="small" onClick={overview.reload} sx={{ textTransform: 'none', fontSize: 12 }}>Retry</Button>
          </Box>
        ) : ov ? (
          <>
            <KpiCard
              label="Arena Runs" value={ov.total_arena_runs}
              sub={Object.entries(ov.harness_breakdown).map(([k, v]) => `${k}: ${v}`).join(' · ') || undefined}
              theme={theme}
            />
            <KpiCard
              label="Decisions" value={ov.total_decisions}
              sub={Object.entries(ov.decision_breakdown).map(([k, v]) => `${k}: ${v}`).join(' · ') || undefined}
              theme={theme}
            />
            <KpiCard
              label="Best Model" value={ov.best_model ? shortName(ov.best_model) : '—'}
              sub={ov.best_model?.split(':')[0]}
              theme={theme}
            />
            <KpiCard
              label="Avg Win Rate" value={`${ov.avg_win_rate}%`}
              sub={`Latency ${ov.avg_latency_ms}ms · Cost $${ov.total_cost_usd}`}
              theme={theme}
            />
          </>
        ) : (
          <EmptyGuide
            title="System-wide performance metrics"
            hint="Run Arena to start generating data"
            actionLabel="Go to Arena" onAction={goToArena} theme={theme}
          />
        )}
        <MuiTooltip title="Refresh all data" arrow>
          <IconButton size="small" onClick={reloadAll} sx={{ color: theme.text.muted, mt: 0.5 }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </MuiTooltip>
      </Box>

      {/* ── 2 & 3: Radar + Voting Heatmap ── */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        {/* Radar */}
        <Section title="Model Radar" theme={theme}
          loading={leaderboard.loading} error={leaderboard.error} onRetry={leaderboard.reload}
        >
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={theme.border.subtle} />
                <PolarAngleAxis dataKey="axis" tick={{ fill: theme.text.muted, fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fill: theme.text.muted, fontSize: 10 }} domain={[0, 100]} />
                {lbData.slice(0, 5).map((e, i) => (
                  <Radar
                    key={`${e.model_provider}:${e.model_name}`}
                    name={shortName(e.model_name)}
                    dataKey={`${e.model_provider}:${e.model_name}`}
                    stroke={COLORS[i]}
                    fill={COLORS[i]}
                    fillOpacity={0.15}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: 11, color: theme.text.muted }} />
                <Tooltip contentStyle={tooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyGuide
              title="Multi-dimensional model comparison"
              hint="Run Arena and make decisions to populate leaderboard"
              actionLabel="Go to Arena" onAction={goToArena} theme={theme}
            />
          )}
        </Section>

        {/* Voting Heatmap */}
        <Section title="Voting Heatmap" theme={theme}
          loading={votingMatrix.loading} error={votingMatrix.error} onRetry={votingMatrix.reload}
        >
          {vm && vm.models.length > 0 ? (
            <Box sx={{ overflow: 'auto', maxHeight: 280 }}>
              <Table size="small" sx={{ minWidth: 200 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={tableHeadSx}>Voter / Target</TableCell>
                    {vm.models.map(m => (
                      <TableCell key={m} sx={{ ...tableHeadSx, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {shortName(m)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vm.models.map(voter => (
                    <TableRow key={voter}>
                      <TableCell sx={{ ...tableCellSx, fontWeight: 500 }}>
                        {shortName(voter)}
                      </TableCell>
                      {vm.models.map(target => {
                        if (voter === target) {
                          return <TableCell key={target} sx={{ ...tableCellSx, textAlign: 'center', color: theme.text.muted }}>—</TableCell>;
                        }
                        const cell = vm.matrix.find(e => e.voter === voter && e.target === target);
                        const approve = cell?.approve ?? 0;
                        const reject = cell?.reject ?? 0;
                        const total = approve + reject;
                        const ratio = total > 0 ? approve / total : 0.5;
                        const bg = total === 0
                          ? 'transparent'
                          : `rgba(${ratio > 0.5 ? '76,175,80' : '244,67,54'}, ${Math.min(0.15 + Math.abs(ratio - 0.5) * 0.7, 0.5)})`;
                        return (
                          <MuiTooltip key={target} title={`${approve} approve / ${reject} reject`} arrow>
                            <TableCell sx={{ ...tableCellSx, textAlign: 'center', bgcolor: bg, borderRadius: '3px', cursor: 'default' }}>
                              {total > 0 ? `${approve}/${reject}` : ''}
                            </TableCell>
                          </MuiTooltip>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          ) : (
            <EmptyGuide
              title="Voting patterns between models"
              hint="Run Arena with 2+ models to generate cross-voting data"
              actionLabel="Go to Arena" onAction={goToArena} theme={theme}
            />
          )}
        </Section>
      </Box>

      {/* ── 4. Performance Trend ── */}
      <Section title="Performance Trend" theme={theme} fullWidth
        loading={trend.loading} error={trend.error} onRetry={trend.reload}
      >
        {trendChartData.length > 0 ? (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
              <ToggleButtonGroup
                size="small" value={trendMetric} exclusive
                onChange={(_, v) => v && setTrendMetric(v)}
                sx={{
                  '& .MuiToggleButton-root': {
                    color: theme.text.muted, fontSize: 11, py: 0.3, px: 1.2,
                    textTransform: 'none', borderColor: theme.border.subtle,
                  },
                  '& .Mui-selected': { color: theme.brand.primary, bgcolor: `${theme.brand.primary}18` },
                }}
              >
                <ToggleButton value="latency">Latency (ms)</ToggleButton>
                <ToggleButton value="cost">Cost ($)</ToggleButton>
                <ToggleButton value="success_rate">Success %</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border.subtle} />
                <XAxis dataKey="date" tick={{ fill: theme.text.muted, fontSize: 11 }} />
                <YAxis tick={{ fill: theme.text.muted, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {modelNames.map((name, i) => (
                  <Line
                    key={name} type="monotone" dataKey={name}
                    name={shortName(name)} stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2} dot={false} connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <EmptyGuide
            title="Model latency, cost, and success trends over time"
            hint="Run Arena multiple times to see trends emerge"
            actionLabel="Go to Arena" onAction={goToArena} theme={theme}
          />
        )}
      </Section>

      {/* ── 5 & 6: Cost/Latency + Counterfactual ── */}
      <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
        {/* Cost & Latency */}
        <Section title="Cost & Latency" theme={theme}
          loading={costAnalysis.loading} error={costAnalysis.error} onRetry={costAnalysis.reload}
        >
          {costModels.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={costModels.map(m => ({
                name: shortName(m.name),
                'Avg Latency': m.avg_latency,
                'P95 Latency': m.p95_latency,
                'Cost x1000': Math.round(m.avg_cost * 1000),
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border.subtle} />
                <XAxis dataKey="name" tick={{ fill: theme.text.muted, fontSize: 10 }} />
                <YAxis tick={{ fill: theme.text.muted, fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Avg Latency" fill="#8884d8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="P95 Latency" fill="#ff7f50" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyGuide
              title="Per-model operational metrics"
              hint="Run Arena to collect latency and cost data"
              actionLabel="Go to Arena" onAction={goToArena} theme={theme}
            />
          )}
        </Section>

        {/* Counterfactual */}
        <Section title="Counterfactual: Adopted vs Missed" theme={theme}
          loading={cfSummary.loading} error={cfSummary.error} onRetry={cfSummary.reload}
        >
          {cfModels.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={cfModels.map(m => ({
                name: shortName(m.name),
                'Adopted Return %': m.adopted_avg_return,
                'Missed Return %': m.missed_avg_return,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border.subtle} />
                <XAxis dataKey="name" tick={{ fill: theme.text.muted, fontSize: 10 }} />
                <YAxis tick={{ fill: theme.text.muted, fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Adopted Return %" fill="#4caf50" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Missed Return %" fill="#ff9800" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyGuide
              title="Compare adopted vs missed returns"
              hint="Counterfactual data is generated automatically after decisions age 7+ days"
              theme={theme}
            />
          )}
        </Section>
      </Box>
    </Box>
  );
}
