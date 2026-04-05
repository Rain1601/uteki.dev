/**
 * EvaluationPanel — Agent quality testing dashboard.
 *
 * Tab 1: Consistency Test — run N analyses, measure output stability
 * Tab 2: Gate Quality Judge — LLM-as-Judge scoring
 * Tab 3: History — past evaluation trends
 */
import { useState, useCallback, useEffect } from 'react';
import {
  Box, Typography, TextField, Select, MenuItem, Button,
  IconButton, Collapse, Chip,
} from '@mui/material';
import {
  Play, ChevronDown, ChevronUp, Search,
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar,
} from 'recharts';
import { useTheme } from '../../theme/ThemeProvider';
import { API_BASE } from '../../api/client';
import { getAuthHeaders } from '../../hooks/useAuth';
import LoadingDots from '../LoadingDots';

// ── Colors ──
const ACTION_COLORS: Record<string, string> = { BUY: '#4caf50', WATCH: '#ff9800', AVOID: '#f44336', UNKNOWN: '#9e9e9e', ERROR: '#9e9e9e' };
const DIM_COLORS = ['#6495ed', '#4caf50', '#ff9800'];

// ── Types ──
interface ConsistencyResult {
  evaluation_id: string;
  symbol: string;
  model: string;
  runs_data: Array<{ run_index: number; action?: string; conviction?: number; quality_verdict?: string; latency_ms?: number; status?: string }>;
  metrics: {
    action_mode: string;
    action_distribution: Record<string, number>;
    action_agreement_rate: number;
    conviction_mean: number;
    conviction_std: number;
    conviction_range: number[];
    quality_mode: string;
    quality_agreement_rate: number;
    gate_score_variance?: Record<string, { mean: number; std: number }>;
    num_successful_runs: number;
  };
  total_latency_ms: number;
}

interface JudgeResult {
  analysis_id: string;
  symbol: string;
  judge_model: string;
  gates_judged: number;
  scores: Array<{
    gate: number; skill: string; gate_name?: string;
    accuracy?: number; depth?: number; consistency?: number; overall?: number;
    deductions?: Array<{ dimension: string; issue: string; severity: string }>;
    summary?: string; error?: string;
  }>;
  aggregate: { accuracy: number; depth: number; consistency: number; overall: number };
}

// ═══════════════════════════════════════════════════
// Tab 1: Consistency Test
// ═══════════════════════════════════════════════════

function ConsistencyTestView({ theme, isDark }: { theme: any; isDark: boolean }) {
  const [symbol, setSymbol] = useState('');
  const [numRuns, setNumRuns] = useState(3);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [result, setResult] = useState<ConsistencyResult | null>(null);

  const handleRun = useCallback(() => {
    if (!symbol.trim() || running) return;
    setRunning(true);
    setProgress([]);
    setResult(null);

    fetch(`${API_BASE}/api/evaluation/consistency-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: symbol.trim().toUpperCase(), num_runs: numRuns }),
    }).then(async (resp) => {
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            switch (event.type) {
              case 'run_start':
                setProgress(prev => [...prev, `Run ${event.run_index + 1}/${event.total} starting...`]);
                break;
              case 'run_complete':
                setProgress(prev => [...prev, `Run ${event.run_index + 1}: ${event.action} (conv=${event.conviction?.toFixed(2)})`]);
                break;
              case 'result':
                setResult(event.data);
                setRunning(false);
                break;
              case 'error':
                setProgress(prev => [...prev, `Error: ${event.message}`]);
                setRunning(false);
                break;
            }
          } catch { /* skip malformed */ }
        }
      }
      setRunning(false);
    }).catch(() => setRunning(false));
  }, [symbol, numRuns, running]);

  // Pie data
  const pieData = result ? Object.entries(result.metrics.action_distribution).map(([name, value]) => ({ name, value })) : [];

  // Conviction bar data (per run)
  const convData = result?.runs_data
    .filter(r => r.status === 'success')
    .map(r => ({ name: `R${r.run_index + 1}`, conviction: r.conviction ?? 0 })) || [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Input */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <TextField
          size="small" placeholder="Symbol (AAPL)" value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleRun()}
          sx={{ width: 140, '& .MuiOutlinedInput-root': { fontSize: 13 } }}
        />
        <Select size="small" value={numRuns} onChange={e => setNumRuns(Number(e.target.value))} sx={{ width: 80, fontSize: 13 }}>
          {[2, 3, 5, 10].map(n => <MenuItem key={n} value={n}>{n} runs</MenuItem>)}
        </Select>
        <Button
          startIcon={running ? undefined : <Play size={14} />}
          onClick={handleRun} disabled={!symbol.trim() || running} size="small"
          sx={{ bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none', fontWeight: 600, fontSize: 12, px: 2, '&:hover': { bgcolor: theme.brand.hover } }}
        >
          {running ? <LoadingDots text="Running" fontSize={12} color="#fff" /> : 'Run Test'}
        </Button>
      </Box>

      {/* Progress log */}
      {progress.length > 0 && (
        <Box sx={{ p: 1.5, bgcolor: theme.background.secondary, borderRadius: 1, border: `1px solid ${theme.border.subtle}`, maxHeight: 120, overflow: 'auto' }}>
          {progress.map((msg, i) => (
            <Typography key={i} sx={{ fontSize: 11, color: theme.text.muted, fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>{msg}</Typography>
          ))}
        </Box>
      )}

      {/* Results */}
      {result && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {/* Metrics cards */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 160 }}>
            {[
              { label: 'Action', value: result.metrics.action_mode, sub: `${Math.round(result.metrics.action_agreement_rate * 100)}% agreement` },
              { label: 'Conviction', value: `${result.metrics.conviction_mean.toFixed(2)} ± ${result.metrics.conviction_std.toFixed(2)}` },
              { label: 'Quality', value: result.metrics.quality_mode, sub: `${Math.round(result.metrics.quality_agreement_rate * 100)}% agreement` },
              { label: 'Runs', value: `${result.metrics.num_successful_runs}/${result.runs_data.length}` },
            ].map(({ label, value, sub }) => (
              <Box key={label} sx={{ p: 1.25, bgcolor: theme.background.secondary, borderRadius: 1, border: `1px solid ${theme.border.subtle}` }}>
                <Typography sx={{ fontSize: 9, color: theme.text.disabled, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-ui)' }}>{label}</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: theme.text.primary, fontFamily: 'var(--font-mono)' }}>{value}</Typography>
                {sub && <Typography sx={{ fontSize: 10, color: theme.text.muted }}>{sub}</Typography>}
              </Box>
            ))}
          </Box>

          {/* Action pie chart */}
          <Box sx={{ width: 200, height: 200 }}>
            <Typography sx={{ fontSize: 10, color: theme.text.disabled, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5, fontFamily: 'var(--font-ui)' }}>Action Distribution</Typography>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={30} paddingAngle={2} label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((entry) => <Cell key={entry.name} fill={ACTION_COLORS[entry.name] || '#9e9e9e'} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Box>

          {/* Conviction per run */}
          <Box sx={{ flex: 1, minWidth: 240, height: 200 }}>
            <Typography sx={{ fontSize: 10, color: theme.text.disabled, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5, fontFamily: 'var(--font-ui)' }}>Conviction per Run</Typography>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={convData}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: theme.text.muted }} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: theme.text.muted }} />
                <Tooltip />
                <Bar dataKey="conviction" fill={theme.brand.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ═══════════════════════════════════════════════════
// Tab 2: Gate Quality Judge
// ═══════════════════════════════════════════════════

function JudgeView({ theme, isDark }: { theme: any; isDark: boolean }) {
  const [analysisId, setAnalysisId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JudgeResult | null>(null);
  const [expandedGate, setExpandedGate] = useState<number | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<Array<{ id: string; symbol: string; verdict_action: string }>>([]);

  // Load recent analyses for quick selection
  useEffect(() => {
    fetch(`${API_BASE}/api/company/analyses?limit=10`, { headers: getAuthHeaders(), credentials: 'include' })
      .then(r => r.json())
      .then(d => setRecentAnalyses((d.analyses || []).filter((a: any) => a.status === 'completed').slice(0, 8)))
      .catch(() => {});
  }, []);

  const handleJudge = useCallback(async () => {
    if (!analysisId.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const resp = await fetch(`${API_BASE}/api/evaluation/judge/${analysisId.trim()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ judge_model: 'deepseek-chat' }),
      });
      const data = await resp.json();
      if (resp.ok) setResult(data);
      else console.error('Judge failed:', data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [analysisId, loading]);

  // Radar data
  const radarData = result ? [
    { dimension: 'Accuracy', ...Object.fromEntries(result.scores.filter(g => !g.error).map(g => [`G${g.gate}`, g.accuracy])) },
    { dimension: 'Depth', ...Object.fromEntries(result.scores.filter(g => !g.error).map(g => [`G${g.gate}`, g.depth])) },
    { dimension: 'Consistency', ...Object.fromEntries(result.scores.filter(g => !g.error).map(g => [`G${g.gate}`, g.consistency])) },
  ] : [];

  const gateKeys = result?.scores.filter(g => !g.error).map(g => `G${g.gate}`) || [];

  const SEVERITY_COLORS: Record<string, string> = { critical: '#f44336', major: '#ff9800', minor: '#ffc107' };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Input */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <TextField
          size="small" placeholder="Analysis ID" value={analysisId}
          onChange={e => setAnalysisId(e.target.value)}
          sx={{ width: 300, '& .MuiOutlinedInput-root': { fontSize: 12, fontFamily: 'var(--font-mono)' } }}
        />
        <Button
          startIcon={loading ? undefined : <Search size={14} />}
          onClick={handleJudge} disabled={!analysisId.trim() || loading} size="small"
          sx={{ bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none', fontWeight: 600, fontSize: 12, px: 2, '&:hover': { bgcolor: theme.brand.hover } }}
        >
          {loading ? <LoadingDots text="Judging" fontSize={12} color="#fff" /> : 'Judge'}
        </Button>
      </Box>

      {/* Recent analyses quick select */}
      {recentAnalyses.length > 0 && !result && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 10, color: theme.text.disabled, mr: 0.5, lineHeight: '24px' }}>Recent:</Typography>
          {recentAnalyses.map(a => (
            <Chip key={a.id} label={`${a.symbol} ${a.verdict_action}`} size="small"
              onClick={() => setAnalysisId(a.id)}
              sx={{ fontSize: 10, height: 22, cursor: 'pointer', bgcolor: analysisId === a.id ? `${theme.brand.primary}20` : theme.background.secondary }}
            />
          ))}
        </Box>
      )}

      {/* Results */}
      {result && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {/* Aggregate cards */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            {(['accuracy', 'depth', 'consistency', 'overall'] as const).map((dim, i) => (
              <Box key={dim} sx={{ p: 1.25, bgcolor: theme.background.secondary, borderRadius: 1, border: `1px solid ${theme.border.subtle}`, minWidth: 80, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 9, color: theme.text.disabled, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-ui)' }}>{dim}</Typography>
                <Typography sx={{ fontSize: 20, fontWeight: 700, color: DIM_COLORS[i] || theme.text.primary, fontFamily: 'var(--font-mono)' }}>
                  {result.aggregate[dim]}
                </Typography>
                <Typography sx={{ fontSize: 9, color: theme.text.muted }}>/10</Typography>
              </Box>
            ))}
          </Box>

          {/* Radar chart */}
          {radarData.length > 0 && (
            <Box sx={{ width: 280, height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: theme.text.muted }} />
                  <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 8, fill: theme.text.disabled }} />
                  {gateKeys.map((key, i) => (
                    <Radar key={key} name={key} dataKey={key} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
                  ))}
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Box>
      )}

      {/* Gate details (collapsible) */}
      {result?.scores.map(g => (
        <Box key={g.gate} sx={{ border: `1px solid ${theme.border.subtle}`, borderRadius: 1, overflow: 'hidden' }}>
          <Box
            onClick={() => setExpandedGate(expandedGate === g.gate ? null : g.gate)}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              px: 1.5, py: 1, cursor: 'pointer',
              bgcolor: theme.background.secondary,
              '&:hover': { bgcolor: theme.background.tertiary },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: theme.text.primary, fontFamily: 'var(--font-ui)' }}>
                G{g.gate} {g.gate_name || g.skill}
              </Typography>
              {g.error ? (
                <Chip label="ERROR" size="small" sx={{ fontSize: 9, height: 18, bgcolor: 'rgba(244,67,54,0.1)', color: '#f44336' }} />
              ) : (
                <Typography sx={{ fontSize: 11, color: theme.text.muted, fontFamily: 'var(--font-mono)' }}>
                  A={g.accuracy} D={g.depth} C={g.consistency} → {g.overall}/10
                </Typography>
              )}
            </Box>
            {expandedGate === g.gate ? <ChevronUp size={14} color={theme.text.muted} /> : <ChevronDown size={14} color={theme.text.muted} />}
          </Box>
          <Collapse in={expandedGate === g.gate}>
            <Box sx={{ px: 1.5, py: 1.25 }}>
              {g.summary && (
                <Typography sx={{ fontSize: 12, color: theme.text.secondary, mb: 1, fontFamily: 'var(--font-reading)', lineHeight: 1.7 }}>{g.summary}</Typography>
              )}
              {g.deductions && g.deductions.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography sx={{ fontSize: 9, color: theme.text.disabled, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-ui)' }}>Deductions</Typography>
                  {g.deductions.map((d, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
                      <Chip label={d.severity} size="small" sx={{ fontSize: 8, height: 16, bgcolor: `${SEVERITY_COLORS[d.severity] || '#9e9e9e'}20`, color: SEVERITY_COLORS[d.severity] || '#9e9e9e' }} />
                      <Typography sx={{ fontSize: 11, color: theme.text.secondary, lineHeight: 1.5 }}>[{d.dimension}] {d.issue}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Collapse>
        </Box>
      ))}
    </Box>
  );
}

// ═══════════════════════════════════════════════════
// Tab 3: History
// ═══════════════════════════════════════════════════

function HistoryView({ theme, isDark }: { theme: any; isDark: boolean }) {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/evaluation/runs?limit=50`)
      .then(r => r.json())
      .then(d => setRuns(d.runs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Build conviction trend from consistency test runs
  const trendData = runs
    .filter(r => r.test_type === 'consistency' && r.status === 'completed')
    .map(r => ({
      date: new Date(r.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      symbol: r.symbol,
      conviction: r.metrics?.conviction_mean ?? 0,
      agreement: r.metrics?.action_agreement_rate ?? 0,
      action: r.metrics?.action_mode ?? 'UNKNOWN',
    }))
    .reverse();

  if (loading) return <LoadingDots text="Loading history" fontSize={13} />;

  if (runs.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography sx={{ fontSize: 13, color: theme.text.muted }}>No evaluation runs yet</Typography>
        <Typography sx={{ fontSize: 11, color: theme.text.disabled, mt: 0.5 }}>Run a consistency test to generate data</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Conviction trend */}
      <Box>
        <Typography sx={{ fontSize: 10, color: theme.text.disabled, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1, fontFamily: 'var(--font-ui)' }}>Conviction Trend</Typography>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: theme.text.muted }} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: theme.text.muted }} />
            <Tooltip content={({ payload }) => {
              if (!payload?.[0]) return null;
              const d = payload[0].payload;
              return (
                <Box sx={{ bgcolor: theme.background.secondary, p: 1, borderRadius: 1, border: `1px solid ${theme.border.subtle}`, fontSize: 11 }}>
                  <div><strong>{d.symbol}</strong> — {d.action}</div>
                  <div>Conviction: {d.conviction?.toFixed(2)}</div>
                  <div>Agreement: {(d.agreement * 100).toFixed(0)}%</div>
                </Box>
              );
            }} />
            <Line type="monotone" dataKey="conviction" stroke={theme.brand.primary} strokeWidth={2} dot={{ r: 4, fill: theme.brand.primary }} />
          </LineChart>
        </ResponsiveContainer>
      </Box>

      {/* Runs table */}
      <Box>
        <Typography sx={{ fontSize: 10, color: theme.text.disabled, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1, fontFamily: 'var(--font-ui)' }}>Past Runs</Typography>
        {runs.map(r => (
          <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75, borderBottom: `1px solid ${theme.border.subtle}` }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: theme.text.primary, minWidth: 50 }}>{r.symbol}</Typography>
            <Chip label={r.test_type} size="small" sx={{ fontSize: 9, height: 18 }} />
            <Chip label={r.status} size="small" sx={{ fontSize: 9, height: 18, bgcolor: r.status === 'completed' ? 'rgba(76,175,80,0.1)' : 'rgba(255,152,0,0.1)', color: r.status === 'completed' ? '#4caf50' : '#ff9800' }} />
            <Typography sx={{ fontSize: 11, color: theme.text.muted, fontFamily: 'var(--font-mono)' }}>
              {r.metrics?.action_mode || '—'} conv={r.metrics?.conviction_mean?.toFixed(2) || '—'}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Typography sx={{ fontSize: 10, color: theme.text.disabled }}>{new Date(r.created_at).toLocaleDateString()}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ═══════════════════════════════════════════════════
// Colors constant for radar (must be at module level)
// ═══════════════════════════════════════════════════
const COLORS = ['#6495ed', '#4caf50', '#ff9800', '#f44336'];

// ═══════════════════════════════════════════════════
// Main Panel
// ═══════════════════════════════════════════════════

export default function EvaluationPanel({ onNavigate }: { onNavigate?: (tabIndex: number) => void }) {
  const { theme, isDark } = useTheme();
  const [tab, setTab] = useState(0);

  const tabs = [
    { label: 'Consistency', key: 'consistency' },
    { label: 'Judge', key: 'judge' },
    { label: 'History', key: 'history' },
  ];

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
      <Box sx={{ display: 'flex', gap: 0, px: 2, pt: 1.5, pb: 0, flexShrink: 0, borderBottom: `1px solid ${theme.border.subtle}` }}>
        {tabs.map((t, i) => (
          <Box
            key={t.key}
            onClick={() => setTab(i)}
            sx={{
              px: 2, py: 0.75,
              fontSize: 12, fontWeight: tab === i ? 600 : 400,
              color: tab === i ? theme.text.primary : theme.text.muted,
              borderBottom: tab === i ? `2px solid ${theme.brand.primary}` : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: 'var(--font-ui)',
              '&:hover': { color: theme.text.primary },
            }}
          >
            {t.label}
          </Box>
        ))}
      </Box>

      {/* Content */}
      <Box sx={{
        flex: 1, overflow: 'auto', p: 2,
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
        '&::-webkit-scrollbar-thumb': { bgcolor: `${theme.text.muted}18`, borderRadius: 4 },
      }}>
        {tab === 0 && <ConsistencyTestView theme={theme} isDark={isDark} />}
        {tab === 1 && <JudgeView theme={theme} isDark={isDark} />}
        {tab === 2 && <HistoryView theme={theme} isDark={isDark} />}
      </Box>
    </Box>
  );
}
