import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, Switch } from '@mui/material';
import { useTheme } from '../theme/ThemeProvider';
import TradingViewChart from '../components/index/TradingViewChart';
import { useCompanyTaskStore, type TaskState } from '../stores/companyTaskStore';
import { analyzeCompanyStream, GATE_NAMES, TOTAL_GATES } from '../api/company';

interface ChartPoint { date: string; close: number; }

// ─── Gate info (for progress bar UI) ────────────────────────────────
const GATES = [
  { id: 1, name: '业务解析', nameEn: 'Business Analysis' },
  { id: 2, name: 'Fisher 检验', nameEn: 'Fisher QA' },
  { id: 3, name: '护城河', nameEn: 'Moat' },
  { id: 4, name: '管理层', nameEn: 'Management' },
  { id: 5, name: '逆向检验', nameEn: 'Reverse Test' },
  { id: 6, name: '估值', nameEn: 'Valuation' },
  { id: 7, name: '裁决', nameEn: 'Verdict' },
];

const ACTION_COLORS: Record<string, string> = {
  BUY: '#22c55e', WATCH: '#f59e0b', AVOID: '#ef4444',
};

const RUNNING_LABELS = ['Analyzing...', 'Evaluating...', 'Scoring...', 'Thinking...', 'Researching...', 'Reasoning...'];

// ─── Recommendations (mock for now) ─────────────────────────────────

interface Recommendation {
  id: string;
  symbol: string;
  company: string;
  model: string;
  date: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
}

const INITIAL_RECOMMENDATIONS: Recommendation[] = [
  { id: 'r1', symbol: 'PLTR', company: 'Palantir Tech.', model: 'claude-sonnet', date: '04-06', reason: 'AI/defense sector momentum, strong government contract pipeline', status: 'pending' },
  { id: 'r2', symbol: 'ARM', company: 'ARM Holdings', model: 'deepseek-chat', date: '04-05', reason: 'Mobile chip dominance, AI edge computing growth catalyst', status: 'pending' },
  { id: 'r3', symbol: 'CRWD', company: 'CrowdStrike', model: 'gpt-4.1', date: '04-05', reason: 'Cybersecurity leader with expanding TAM and net retention >120%', status: 'pending' },
  { id: 'r4', symbol: 'SNOW', company: 'Snowflake Inc.', model: 'claude-sonnet', date: '04-04', reason: 'Data cloud platform with strong enterprise adoption', status: 'accepted' },
  { id: 'r5', symbol: 'COIN', company: 'Coinbase Global', model: 'deepseek-chat', date: '04-03', reason: 'Crypto infrastructure leader, regulatory clarity improving', status: 'rejected' },
];

// ─── Task Scheduler (mock for now) ──────────────────────────────────

const AVAILABLE_MODELS = ['deepseek-chat', 'claude-sonnet', 'gpt-4.1', 'gemini-2.5-pro', 'qwen-plus'];

interface TaskItem {
  symbol: string;
  company: string;
  enabled: boolean;
  models: string[];
}

const INITIAL_TASKS: TaskItem[] = [
  { symbol: 'AAPL', company: 'Apple Inc.', enabled: true, models: ['deepseek-chat', 'claude-sonnet'] },
  { symbol: 'NVDA', company: 'NVIDIA Corp.', enabled: true, models: ['deepseek-chat'] },
  { symbol: 'TSLA', company: 'Tesla Inc.', enabled: false, models: ['gpt-4.1'] },
  { symbol: 'GOOGL', company: 'Alphabet Inc.', enabled: true, models: ['claude-sonnet', 'deepseek-chat'] },
  { symbol: 'MSFT', company: 'Microsoft Corp.', enabled: true, models: ['deepseek-chat'] },
  { symbol: 'META', company: 'Meta Platforms', enabled: false, models: ['claude-sonnet'] },
  { symbol: 'TSM', company: 'Taiwan Semi.', enabled: true, models: ['deepseek-chat', 'gpt-4.1'] },
  { symbol: 'AMZN', company: 'Amazon.com', enabled: false, models: ['deepseek-chat'] },
];

// ─── Fonts ────────────────────────────────────────────────────────────

const FONT_SERIF = "'Times New Roman', 'SimSun', '宋体', serif";
const FONT_UI = "Inter, -apple-system, BlinkMacSystemFont, sans-serif";
const FONT_MONO = "'SF Mono', Monaco, monospace";

// ─── Animated Running Status ────────────────────────────────────────

function RunningStatus({ color, gate }: { color: string; gate?: number }) {
  const [labelIdx, setLabelIdx] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setLabelIdx(p => (p + 1) % RUNNING_LABELS.length), 2400);
    return () => clearInterval(iv);
  }, []);

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
      <Box
        component="span"
        sx={{
          display: 'inline-block', fontSize: 11, lineHeight: 1,
          color, fontWeight: 700,
          animation: 'status-spin 1.2s linear infinite',
          '@keyframes status-spin': {
            '0%': { transform: 'rotate(0deg)' },
            '100%': { transform: 'rotate(360deg)' },
          },
        }}
      >
        ✳
      </Box>
      <Typography
        component="span"
        sx={{
          fontSize: 9.5, fontWeight: 600, color,
          fontFamily: FONT_MONO,
          animation: 'status-fade 2.4s ease-in-out infinite',
          '@keyframes status-fade': {
            '0%, 100%': { opacity: 0.5 },
            '50%': { opacity: 1 },
          },
        }}
      >
        {gate ? `Gate ${gate}/${TOTAL_GATES} · ` : ''}{RUNNING_LABELS[labelIdx]}
      </Typography>
    </Box>
  );
}

// ─── SVG Line Chart ──────────────────────────────────────────────────

function SvgLineChart({ data, width, height, color }: { data: ChartPoint[]; width: number; height: number; color: string }) {
  if (data.length < 2) return null;
  const closes = data.map(d => d.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const pad = 4;
  const w = width;
  const h = height - pad * 2;

  const points = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * w;
    const y = pad + h - ((c - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const gradId = `areaGrad-${Math.random().toString(36).slice(2, 6)}`;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${points} ${w},${height} 0,${height}`}
        fill={`url(#${gradId})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Helper: extract verdict from task ──────────────────────────────

function getTaskVerdict(task: TaskState) {
  return task.gateResults[7]?.parsed?.position_holding || null;
}

function getTaskAction(task: TaskState): string | null {
  return getTaskVerdict(task)?.action || null;
}

function getTaskConviction(task: TaskState): number | null {
  const c = getTaskVerdict(task)?.conviction;
  return typeof c === 'number' ? c : null;
}

// ─── Component ────────────────────────────────────────────────────────

export default function CompanyAgentV2DemoPage() {
  const { theme } = useTheme();

  // Zustand store for real task data
  const {
    tasks: storeTasks,
    registerTask,
    handleEvent,
    finishTask,
    restoreRunningTasks,
    reconnectTask,
  } = useCompanyTaskStore();

  // Local UI state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [watchlistSymbol, setWatchlistSymbol] = useState<string>('');
  const [activeGate, setActiveGate] = useState<number | null>(null);
  const [chartMode, setChartMode] = useState<'line' | 'kline'>('line');
  const [priceData, setPriceData] = useState<ChartPoint[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [expandedGates, setExpandedGates] = useState<Set<number>>(new Set());
  const [searchSymbol, setSearchSymbol] = useState('');

  // Left panel tab: watchlist or recommendations
  const [leftTab, setLeftTab] = useState<'watchlist' | 'recommend'>('watchlist');
  const [recommendations, setRecommendations] = useState<Recommendation[]>(INITIAL_RECOMMENDATIONS);

  // Task scheduler
  const [taskOpen, setTaskOpen] = useState(false);
  const [scheduledTasks, setScheduledTasks] = useState<TaskItem[]>(INITIAL_TASKS);

  // Elapsed time timer
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollBoxRef = useRef<HTMLDivElement>(null);

  // ── Derived state ──────────────────────────────────────────────────

  const taskList = Object.values(storeTasks)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const selectedTask = selectedId ? storeTasks[selectedId] : null;
  const hasSelection = !!selectedId;

  // Recommendation helpers
  const pendingCount = recommendations.filter(r => r.status === 'pending').length;
  const handleAccept = (id: string) => setRecommendations(prev => prev.map(r => r.id === id ? { ...r, status: 'accepted' as const } : r));
  const handleReject = (id: string) => setRecommendations(prev => prev.map(r => r.id === id ? { ...r, status: 'rejected' as const } : r));
  const handleDeleteRec = (id: string) => setRecommendations(prev => prev.filter(r => r.id !== id));

  // Task scheduler helpers
  const toggleTask = (symbol: string) => setScheduledTasks(prev => prev.map(t => t.symbol === symbol ? { ...t, enabled: !t.enabled } : t));
  const toggleModel = (symbol: string, model: string) => setScheduledTasks(prev => prev.map(t => {
    if (t.symbol !== symbol) return t;
    const has = t.models.includes(model);
    return { ...t, models: has ? t.models.filter(m => m !== model) : [...t.models, model] };
  }));
  const enabledTaskCount = scheduledTasks.filter(t => t.enabled).length;

  // ── Effects ────────────────────────────────────────────────────────

  // Restore running tasks on mount
  useEffect(() => {
    restoreRunningTasks();
  }, [restoreRunningTasks]);

  // Auto-scroll streaming text
  useEffect(() => {
    if (scrollBoxRef.current) scrollBoxRef.current.scrollTop = scrollBoxRef.current.scrollHeight;
  }, [selectedTask?.streamText]);

  // Elapsed time timer for running tasks
  useEffect(() => {
    if (selectedTask?.status === 'running') {
      const startTime = new Date(selectedTask.createdAt).getTime();
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - startTime), 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [selectedTask?.status, selectedTask?.createdAt]);

  // Fetch real price data for chart
  const chartFetchSymbol = selectedTask?.symbol || watchlistSymbol || 'AAPL';

  useEffect(() => {
    let cancelled = false;
    setPriceLoading(true);
    (async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const from = now - 365 * 24 * 3600;
        const res = await fetch(`/api/udf/history?symbol=${chartFetchSymbol}&resolution=D&from=${from}&to=${now}`);
        const json = await res.json();
        if (!cancelled && json.s === 'ok' && json.t?.length > 0) {
          const points: ChartPoint[] = json.t.map((ts: number, i: number) => ({
            date: new Date(ts * 1000).toISOString().slice(0, 10),
            close: json.c[i],
          }));
          setPriceData(points);
        }
      } catch {
        if (!cancelled) setPriceData([]);
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [chartFetchSymbol]);

  // ── Handlers ───────────────────────────────────────────────────────

  const handleAnalyze = useCallback(() => {
    const symbol = searchSymbol.trim().toUpperCase();
    if (!symbol) return;

    let currentTaskId: string | null = null;

    analyzeCompanyStream(
      { symbol },
      (event) => {
        if (event.type === 'data_loaded' && event.analysis_id) {
          currentTaskId = event.analysis_id;
          registerTask(currentTaskId, {
            symbol: event.symbol || symbol,
            companyName: event.company_name || symbol,
            model: 'default',
            provider: 'default',
          });
          setSelectedId(currentTaskId);
          setActiveGate(null);
          setExpandedGates(new Set());
          handleEvent(currentTaskId, event);
        } else if (currentTaskId) {
          handleEvent(currentTaskId, event);
          if (event.type === 'result') {
            finishTask(currentTaskId, 'completed');
          } else if (event.type === 'error') {
            finishTask(currentTaskId, 'error');
          }
        }
      },
    );

    setSearchSymbol('');
  }, [searchSymbol, registerTask, handleEvent, finishTask]);

  const handleBack = useCallback(() => {
    setSelectedId(null);
    setActiveGate(null);
    setExpandedGates(new Set());
  }, []);

  const toggleGate = (id: number) => {
    setExpandedGates(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const fmtTime = (ms: number) => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`; };

  // Derived display info
  const displaySymbol = selectedTask?.symbol || null;
  const displayCompany = selectedTask?.companyName || null;
  const displayAction = selectedTask?.status === 'completed' ? getTaskAction(selectedTask) : null;
  const chartSymbol = displaySymbol || watchlistSymbol || 'AAPL';

  // Watchlist: deduplicated symbols from real analyses
  const watchlist = (() => {
    const seen = new Set<string>();
    return taskList.filter(t => { if (seen.has(t.symbol)) return false; seen.add(t.symbol); return true; });
  })();

  // Auto-select first watchlist symbol when none is selected
  useEffect(() => {
    if (!watchlistSymbol && watchlist.length > 0) {
      setWatchlistSymbol(watchlist[0].symbol);
    }
  }, [watchlist.length, watchlistSymbol]);

  const spinKeyframes = `
    @keyframes analyzing-pulse {
      0%, 100% { background-color: rgba(59,130,246,0.08); }
      50% { background-color: rgba(59,130,246,0.18); }
    }
    @keyframes caret-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }`;

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: theme.background.primary, color: theme.text.primary, overflow: 'hidden' }}>
      <style>{spinKeyframes}</style>

      {/* ── Header ── */}
      <Box sx={{
        px: 2, py: 1, borderBottom: `1px solid ${theme.border.subtle}`,
        display: 'flex', alignItems: 'center', gap: 1,
        fontFamily: FONT_UI, flexShrink: 0,
      }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: FONT_UI, whiteSpace: 'nowrap' }}>
          Company Agent
        </Typography>

        {displaySymbol && (
          <>
            <Box sx={{ width: 1, height: 14, bgcolor: theme.border.subtle, flexShrink: 0 }} />
            <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: FONT_MONO, whiteSpace: 'nowrap' }}>{displaySymbol}</Typography>
            <Typography sx={{ fontSize: 12, color: theme.text.muted, whiteSpace: 'nowrap' }}>{displayCompany}</Typography>
            {displayAction && (
              <Typography sx={{
                fontSize: 10, fontWeight: 800, px: 0.75, py: 0.1, borderRadius: '4px',
                color: ACTION_COLORS[displayAction],
                bgcolor: `${ACTION_COLORS[displayAction]}15`,
                whiteSpace: 'nowrap',
              }}>
                {displayAction}
              </Typography>
            )}
            {selectedTask?.status === 'running' && (
              <RunningStatus color={theme.brand.primary} gate={selectedTask.currentGate} />
            )}
          </>
        )}

        <Box sx={{ flex: 1 }} />

        {/* Task count */}
        {taskList.length > 0 && (
          <Typography sx={{ fontSize: 10, color: theme.text.disabled, fontFamily: FONT_MONO, whiteSpace: 'nowrap' }}>
            {taskList.length} tasks · {taskList.filter(t => t.status === 'running').length} running
          </Typography>
        )}

        {hasSelection && (
          <Typography
            onClick={handleBack}
            sx={{ fontSize: 12, color: theme.text.muted, cursor: 'pointer', whiteSpace: 'nowrap', '&:hover': { color: theme.text.primary, bgcolor: `${theme.text.primary}08` }, px: 1, py: 0.3, borderRadius: '6px' }}
          >
            ← 返回列表
          </Typography>
        )}

        {/* Task scheduler button */}
        <Box
          onClick={() => setTaskOpen(!taskOpen)}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            px: 1.5, py: 0.4, borderRadius: '6px', cursor: 'pointer',
            border: `1px solid ${taskOpen ? theme.brand.primary + '40' : theme.border.subtle}`,
            bgcolor: taskOpen ? `${theme.brand.primary}08` : 'transparent',
            transition: 'all 0.15s',
            '&:hover': { borderColor: theme.brand.primary + '60', bgcolor: `${theme.brand.primary}06` },
          }}
        >
          <Typography sx={{ fontSize: 10, fontWeight: 600, color: theme.text.muted, fontFamily: FONT_UI, whiteSpace: 'nowrap' }}>
            下次执行
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: theme.brand.primary, fontFamily: FONT_MONO, whiteSpace: 'nowrap' }}>
            08:00
          </Typography>
          <Box sx={{
            fontSize: 9, fontWeight: 700, fontFamily: FONT_MONO,
            bgcolor: `${theme.brand.primary}15`, color: theme.brand.primary,
            px: 0.5, borderRadius: '3px', lineHeight: '16px',
          }}>
            {enabledTaskCount}
          </Box>
        </Box>
      </Box>

      {/* ── Task Scheduler Drawer ── */}
      {taskOpen && (
        <Box sx={{
          position: 'absolute', top: 44, right: 0, zIndex: 200,
          width: 380, maxHeight: 'calc(100vh - 60px)',
          bgcolor: theme.background.secondary,
          border: `1px solid ${theme.border.default}`,
          borderRadius: '0 0 0 8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${theme.border.subtle}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: FONT_UI, color: theme.text.primary }}>
                定时任务
              </Typography>
              <Typography sx={{ fontSize: 10, color: theme.text.disabled, fontFamily: FONT_UI }}>
                每日 08:00 自动执行 · {enabledTaskCount} 个活跃
              </Typography>
            </Box>
            <Typography
              onClick={() => setTaskOpen(false)}
              sx={{ fontSize: 16, color: theme.text.disabled, cursor: 'pointer', lineHeight: 1, '&:hover': { color: theme.text.primary } }}
            >
              ×
            </Typography>
          </Box>

          <Box sx={{
            flex: 1, overflow: 'auto', py: 0.5,
            '&::-webkit-scrollbar': { width: 3 },
            '&::-webkit-scrollbar-thumb': { bgcolor: `${theme.text.muted}18`, borderRadius: 4 },
          }}>
            {scheduledTasks.map(task => (
              <Box key={task.symbol} sx={{
                px: 2, py: 1, borderBottom: `1px solid ${theme.border.subtle}15`,
                opacity: task.enabled ? 1 : 0.5,
                transition: 'opacity 0.15s',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, fontFamily: FONT_MONO, color: theme.text.primary }}>{task.symbol}</Typography>
                    <Typography sx={{ fontSize: 10, color: theme.text.disabled }}>{task.company}</Typography>
                  </Box>
                  <Switch
                    size="small"
                    checked={task.enabled}
                    onChange={() => toggleTask(task.symbol)}
                    sx={{
                      width: 28, height: 16, p: 0,
                      '& .MuiSwitch-switchBase': { p: '2px', '&.Mui-checked': { transform: 'translateX(12px)', color: '#fff' } },
                      '& .MuiSwitch-thumb': { width: 12, height: 12 },
                      '& .MuiSwitch-track': { borderRadius: 8, bgcolor: `${theme.text.disabled}30` },
                      '& .Mui-checked + .MuiSwitch-track': { bgcolor: `${theme.brand.primary}60 !important` },
                    }}
                  />
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {AVAILABLE_MODELS.map(model => {
                    const selected = task.models.includes(model);
                    const shortName = model.split('-')[0];
                    return (
                      <Typography
                        key={model}
                        onClick={() => toggleModel(task.symbol, model)}
                        sx={{
                          fontSize: 9, fontFamily: FONT_MONO, cursor: 'pointer',
                          px: 0.75, py: 0.2, borderRadius: '10px',
                          fontWeight: selected ? 600 : 400,
                          color: selected ? theme.brand.primary : theme.text.disabled,
                          bgcolor: selected ? `${theme.brand.primary}12` : 'transparent',
                          border: `1px solid ${selected ? theme.brand.primary + '30' : theme.border.subtle}`,
                          transition: 'all 0.15s',
                          '&:hover': { borderColor: theme.brand.primary + '50' },
                        }}
                      >
                        {shortName}
                      </Typography>
                    );
                  })}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* ── Main content ── */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {hasSelection && selectedTask ? (
          /* ═══ LAYOUT B: Detail mode — Left 35% K-line | Right 65% Analysis ═══ */
          <>
            {/* Left: Chart panel */}
            <Box sx={{
              width: '35%', flexShrink: 0,
              borderRight: `1px solid ${theme.border.subtle}`,
              display: 'flex', flexDirection: 'column',
              position: 'relative',
            }}>
              {/* Chart mode toggle */}
              <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                px: 1.5, py: 0.5, borderBottom: `1px solid ${theme.border.subtle}`,
                flexShrink: 0,
              }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, fontFamily: FONT_MONO, color: theme.text.primary }}>
                  {chartSymbol}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontSize: 9, color: chartMode === 'line' ? theme.text.primary : theme.text.disabled, fontFamily: FONT_UI, fontWeight: 600 }}>
                    Line
                  </Typography>
                  <Switch
                    size="small"
                    checked={chartMode === 'kline'}
                    onChange={(_, checked) => setChartMode(checked ? 'kline' : 'line')}
                    sx={{
                      width: 32, height: 18, p: 0,
                      '& .MuiSwitch-switchBase': { p: '2px', '&.Mui-checked': { transform: 'translateX(14px)', color: '#fff' } },
                      '& .MuiSwitch-thumb': { width: 14, height: 14 },
                      '& .MuiSwitch-track': { borderRadius: 9, bgcolor: `${theme.text.disabled}30` },
                      '& .Mui-checked + .MuiSwitch-track': { bgcolor: `${theme.brand.primary}60 !important` },
                    }}
                  />
                  <Typography sx={{ fontSize: 9, color: chartMode === 'kline' ? theme.text.primary : theme.text.disabled, fontFamily: FONT_UI, fontWeight: 600 }}>
                    K-Line
                  </Typography>
                </Box>
              </Box>

              {/* Chart content */}
              <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {chartMode === 'kline' ? (
                  <TradingViewChart symbol={chartSymbol} />
                ) : (
                  <Box sx={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    bgcolor: theme.background.secondary,
                  }}>
                    {priceData.length > 0 && (
                      <Typography sx={{ fontSize: 20, fontWeight: 600, fontFamily: FONT_MONO, color: theme.text.primary, mb: 0.25 }}>
                        ${priceData[priceData.length - 1].close.toFixed(2)}
                      </Typography>
                    )}
                    {priceData.length > 1 && (() => {
                      const first = priceData[0].close;
                      const last = priceData[priceData.length - 1].close;
                      const changePct = ((last - first) / first * 100);
                      const positive = changePct >= 0;
                      return (
                        <Typography sx={{ fontSize: 11, fontFamily: FONT_MONO, color: positive ? '#22c55e' : '#ef4444', mb: 2 }}>
                          {positive ? '+' : ''}{changePct.toFixed(2)}%
                        </Typography>
                      );
                    })()}
                    <Box sx={{ width: '85%', height: '45%', maxHeight: 200 }}>
                      {priceLoading ? (
                        <Typography sx={{ fontSize: 11, color: theme.text.disabled, textAlign: 'center', pt: 4 }}>Loading...</Typography>
                      ) : (
                        <SvgLineChart
                          data={priceData}
                          width={300}
                          height={120}
                          color={priceData.length > 1 && priceData[priceData.length - 1].close >= priceData[0].close ? '#22c55e' : '#ef4444'}
                        />
                      )}
                    </Box>
                    {priceData.length > 0 && (
                      <Typography sx={{ fontSize: 9, color: theme.text.disabled, fontFamily: FONT_UI, mt: 1 }}>
                        {priceData[0].date} — {priceData[priceData.length - 1].date}
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            </Box>

            {/* Right: Analysis content */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Gate progress bar */}
              <Box sx={{
                flexShrink: 0,
                borderBottom: `1px solid ${theme.border.subtle}`,
                px: 2, py: 0.75,
                display: 'flex', alignItems: 'center', gap: 1,
              }}>
                {GATES.map((gate, i) => {
                  const isDone = !!selectedTask.gateResults[gate.id];
                  const isCurrent = selectedTask.currentGate === gate.id && selectedTask.status === 'running';
                  return (
                    <Box key={gate.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {i > 0 && <Box sx={{ width: 12, height: 1, bgcolor: isDone ? '#4caf50' : theme.border.subtle }} />}
                      <Box
                        onClick={() => isDone && setActiveGate(gate.id)}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 0.3,
                          cursor: isDone ? 'pointer' : 'default',
                          px: 0.75, py: 0.3, borderRadius: '6px',
                          bgcolor: activeGate === gate.id ? `${theme.brand.primary}15` : 'transparent',
                          border: activeGate === gate.id ? `1px solid ${theme.brand.primary}30` : '1px solid transparent',
                          '&:hover': isDone ? { bgcolor: activeGate === gate.id ? `${theme.brand.primary}15` : `${theme.text.primary}06` } : {},
                        }}
                      >
                        <Box sx={{
                          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                          bgcolor: isDone ? '#4caf50' : isCurrent ? theme.brand.primary : theme.border.default,
                          animation: isCurrent ? 'analyzing-pulse 1.5s ease-in-out infinite' : 'none',
                        }} />
                        <Typography sx={{ fontSize: 9.5, color: isDone ? theme.text.secondary : theme.text.disabled, fontFamily: FONT_UI, whiteSpace: 'nowrap' }}>
                          {gate.name}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
                <Box sx={{ flex: 1 }} />
                {selectedTask.status === 'running' && (
                  <Typography sx={{ fontSize: 10, color: theme.text.muted, fontFamily: FONT_MONO, fontFeatureSettings: '"tnum"' }}>
                    {fmtTime(elapsedMs)}
                  </Typography>
                )}
                {selectedTask.status === 'completed' && (
                  <Typography sx={{ fontSize: 10, fontWeight: 500, color: theme.text.muted, fontFamily: FONT_UI, cursor: 'pointer', '&:hover': { color: theme.text.primary } }}>
                    Judge
                  </Typography>
                )}
              </Box>

              {/* Report/Stream area */}
              <Box ref={scrollBoxRef} sx={{
                flex: 1, overflow: 'auto',
                '&::-webkit-scrollbar': { width: 4 },
                '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
                '&::-webkit-scrollbar-thumb': { bgcolor: `${theme.text.muted}18`, borderRadius: 4 },
              }}>
                {/* ── Running: streaming view ── */}
                {selectedTask.status === 'running' && (
                  <Box sx={{ px: 2.5, py: 2, maxWidth: 680 }}>
                    {/* Completed gate summaries */}
                    {Object.values(selectedTask.gateResults)
                      .sort((a, b) => a.gate - b.gate)
                      .map(gr => (
                        <Box key={gr.gate} sx={{
                          display: 'flex', alignItems: 'baseline', gap: 1.5,
                          py: 1, borderBottom: `1px solid ${theme.border.subtle}15`,
                        }}>
                          <Typography sx={{ fontSize: 11, color: '#10b981', fontFamily: FONT_MONO, fontWeight: 500 }}>
                            {gr.replay ? '↺' : '✓'}
                          </Typography>
                          <Typography sx={{ fontSize: 13, fontWeight: 500, color: theme.text.secondary, fontFamily: FONT_UI, flex: 1 }}>
                            {gr.display_name || GATE_NAMES[gr.gate] || `Gate ${gr.gate}`}
                          </Typography>
                          {gr.latency_ms && (
                            <Typography sx={{ fontSize: 10, color: theme.text.disabled, fontFamily: FONT_MONO }}>
                              {(gr.latency_ms / 1000).toFixed(1)}s
                            </Typography>
                          )}
                        </Box>
                      ))}

                    {/* Active streaming */}
                    {selectedTask.streamText && (
                      <Box sx={{ mt: 2 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.brand.primary, fontFamily: FONT_UI, mb: 1.5 }}>
                          {GATE_NAMES[selectedTask.streamGate] || `Gate ${selectedTask.streamGate}`}
                        </Typography>
                        <Box sx={{
                          maxHeight: 280, overflow: 'auto', p: 2, borderRadius: '4px',
                          bgcolor: theme.background.secondary,
                          borderLeft: `3px solid ${theme.brand.primary}40`,
                          fontFamily: FONT_SERIF, fontSize: 14, lineHeight: 1.8,
                          color: theme.text.secondary, whiteSpace: 'pre-wrap',
                          '&::-webkit-scrollbar': { width: 3 },
                          '&::-webkit-scrollbar-thumb': { bgcolor: `${theme.text.muted}15`, borderRadius: 4 },
                        }}>
                          {selectedTask.streamText}
                          <Box component="span" sx={{
                            display: 'inline-block', width: 2, height: 16,
                            bgcolor: theme.brand.primary, ml: 0.5, verticalAlign: 'text-bottom',
                            animation: 'caret-blink 1s step-end infinite',
                          }} />
                        </Box>
                      </Box>
                    )}

                    {/* Waiting state */}
                    {Object.keys(selectedTask.gateResults).length === 0 && !selectedTask.streamText && (
                      <Box sx={{ textAlign: 'center', py: 6 }}>
                        <Typography sx={{ fontSize: 12, color: theme.text.disabled }}>
                          Waiting for gate results...
                        </Typography>
                      </Box>
                    )}
                  </Box>
                )}

                {/* ── Completed / Error: verdict + gate cards ── */}
                {(selectedTask.status === 'completed' || selectedTask.status === 'error') && (
                  <Box sx={{ px: 2.5, py: 2.5, maxWidth: 680 }}>
                    {/* Verdict */}
                    {selectedTask.status === 'completed' && (() => {
                      const action = getTaskAction(selectedTask) || 'WATCH';
                      const conviction = getTaskConviction(selectedTask);
                      const verdict = getTaskVerdict(selectedTask);
                      const summary = verdict?.one_sentence
                        || verdict?.summary
                        || '';
                      return (
                        <Box sx={{ mb: 3 }}>
                          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mb: 1.5 }}>
                            <Typography sx={{ fontSize: 28, fontWeight: 800, color: ACTION_COLORS[action] || theme.text.primary, fontFamily: FONT_UI, letterSpacing: '-0.04em', lineHeight: 1 }}>
                              {action}
                            </Typography>
                            {conviction !== null && (
                              <>
                                <Typography sx={{ fontSize: 22, fontWeight: 300, color: theme.text.primary, fontFamily: FONT_MONO }}>
                                  {Math.round(conviction * 100)}%
                                </Typography>
                                <Typography sx={{ fontSize: 12, color: theme.text.muted, fontFamily: FONT_UI }}>conviction</Typography>
                              </>
                            )}
                          </Box>

                          {summary && (
                            <Typography sx={{
                              fontSize: 14, lineHeight: 1.8, color: theme.text.secondary,
                              fontFamily: FONT_SERIF, fontStyle: 'italic',
                              borderLeft: `3px solid ${ACTION_COLORS[action] || theme.text.muted}40`, pl: 2, py: 0.5, mb: 2.5,
                            }}>
                              {summary.slice(0, 300)}
                            </Typography>
                          )}

                          <Box sx={{ display: 'flex', gap: 2.5, mt: 1.5 }}>
                            <Typography sx={{ fontSize: 11, color: theme.text.disabled, fontFamily: FONT_UI }}>{selectedTask.model}</Typography>
                            <Typography sx={{ fontSize: 11, color: theme.text.disabled, fontFamily: FONT_UI }}>
                              {new Date(selectedTask.createdAt).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })()}

                    {selectedTask.status === 'error' && (
                      <Box sx={{ mb: 3, p: 2, borderRadius: '4px', bgcolor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#ef4444', fontFamily: FONT_UI }}>
                          Analysis failed
                        </Typography>
                      </Box>
                    )}

                    {/* Gate cards */}
                    {Object.values(selectedTask.gateResults)
                      .sort((a, b) => a.gate - b.gate)
                      .map(gr => {
                        const expanded = expandedGates.has(gr.gate);
                        return (
                          <Box key={gr.gate} sx={{
                            mb: 0.5, borderRadius: '4px',
                            border: `1px solid ${theme.border.subtle}`,
                            overflow: 'hidden',
                            transition: 'border-color 0.15s ease',
                            '&:hover': { borderColor: theme.border.default },
                          }}>
                            <Box onClick={() => toggleGate(gr.gate)} sx={{
                              display: 'flex', alignItems: 'center', gap: 1.5,
                              px: 2, py: 1, cursor: 'pointer',
                              '&:hover': { bgcolor: `${theme.text.primary}03` },
                            }}>
                              <Typography sx={{ fontSize: 11, fontWeight: 600, color: theme.text.disabled, fontFamily: FONT_MONO, width: 14 }}>{gr.gate}</Typography>
                              <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.text.primary, fontFamily: FONT_UI, flex: 1 }}>
                                {gr.display_name || GATE_NAMES[gr.gate] || `Gate ${gr.gate}`}
                              </Typography>
                              {gr.latency_ms && (
                                <Typography sx={{ fontSize: 10, color: theme.text.disabled, fontFamily: FONT_MONO }}>
                                  {(gr.latency_ms / 1000).toFixed(1)}s
                                </Typography>
                              )}
                              <Typography sx={{ fontSize: 13, color: theme.text.disabled, transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'none' }}>›</Typography>
                            </Box>
                            {expanded && gr.raw && (
                              <Box sx={{ px: 2, pb: 2, pt: 0.5, borderTop: `1px solid ${theme.border.subtle}30`, ml: '38px' }}>
                                <Typography sx={{ fontSize: 13, lineHeight: 1.8, color: theme.text.secondary, fontFamily: FONT_SERIF, whiteSpace: 'pre-wrap' }}>
                                  {gr.raw.slice(0, 2000)}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        );
                      })}

                    {/* Actions */}
                    <Box sx={{ display: 'flex', gap: 3, mt: 2.5, pt: 2, borderTop: `1px solid ${theme.border.subtle}` }}>
                      {['Export PDF', 'Share Link', 'Judge Quality'].map(label => (
                        <Typography key={label} sx={{
                          fontSize: 12, fontWeight: 500, fontFamily: FONT_UI,
                          color: theme.text.muted, cursor: 'pointer',
                          '&:hover': { color: theme.text.primary },
                        }}>
                          {label}
                        </Typography>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
          </>
        ) : (
          /* ═══ LAYOUT A: List mode — Watchlist | K-line | Screener ═══ */
          <>
            {/* Left ~10%: Watchlist / Recommendations */}
            <Box sx={{
              width: leftTab === 'recommend' ? '18%' : '10%', minWidth: leftTab === 'recommend' ? 160 : 100, flexShrink: 0,
              borderRight: `1px solid ${theme.border.subtle}`,
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              transition: 'width 0.2s ease, min-width 0.2s ease',
            }}>
              {/* Tab headers */}
              <Box sx={{ display: 'flex', flexShrink: 0, borderBottom: `1px solid ${theme.border.subtle}` }}>
                <Box
                  onClick={() => setLeftTab('watchlist')}
                  sx={{
                    flex: 1, px: 1, py: 0.75, cursor: 'pointer', textAlign: 'center',
                    borderBottom: leftTab === 'watchlist' ? `2px solid ${theme.brand.primary}` : '2px solid transparent',
                  }}
                >
                  <Typography sx={{ fontSize: 10, fontWeight: 600, color: leftTab === 'watchlist' ? theme.text.primary : theme.text.disabled, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT_UI }}>
                    关注
                  </Typography>
                </Box>
                <Box
                  onClick={() => setLeftTab('recommend')}
                  sx={{
                    flex: 1, px: 1, py: 0.75, cursor: 'pointer', textAlign: 'center', position: 'relative',
                    borderBottom: leftTab === 'recommend' ? `2px solid ${theme.brand.primary}` : '2px solid transparent',
                  }}
                >
                  <Typography sx={{ fontSize: 10, fontWeight: 600, color: leftTab === 'recommend' ? theme.text.primary : theme.text.disabled, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT_UI }}>
                    推荐
                    {pendingCount > 0 && (
                      <Box component="span" sx={{
                        ml: 0.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 14, height: 14, borderRadius: '7px', fontSize: 9, fontWeight: 700,
                        bgcolor: theme.brand.primary, color: '#fff', px: 0.3, verticalAlign: 'middle',
                      }}>
                        {pendingCount}
                      </Box>
                    )}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{
                flex: 1, overflow: 'auto',
                '&::-webkit-scrollbar': { width: 3 },
                '&::-webkit-scrollbar-thumb': { bgcolor: `${theme.text.muted}18`, borderRadius: 4 },
              }}>
                {leftTab === 'watchlist' ? (
                  /* ── Watchlist tab (from real analyses) ── */
                  watchlist.length > 0 ? watchlist.map(t => {
                    const isActive = watchlistSymbol === t.symbol;
                    const action = getTaskAction(t);
                    return (
                      <Box
                        key={t.symbol}
                        onClick={() => setWatchlistSymbol(t.symbol)}
                        sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          px: 1.5, py: 0.75, cursor: 'pointer',
                          bgcolor: isActive ? `${theme.brand.primary}08` : 'transparent',
                          borderLeft: isActive ? `2px solid ${theme.brand.primary}` : '2px solid transparent',
                          '&:hover': { bgcolor: `${theme.text.primary}05` },
                        }}
                      >
                        <Box>
                          <Typography sx={{ fontSize: 12, fontWeight: 700, color: theme.text.primary, fontFamily: FONT_MONO }}>{t.symbol}</Typography>
                          <Typography sx={{ fontSize: 9.5, color: theme.text.disabled, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>
                            {t.companyName}
                          </Typography>
                        </Box>
                        {action && (
                          <Typography sx={{ fontSize: 10, fontWeight: 700, color: ACTION_COLORS[action] || theme.text.muted }}>
                            {action}
                          </Typography>
                        )}
                      </Box>
                    );
                  }) : (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 10, color: theme.text.disabled }}>
                        Run an analysis to populate watchlist
                      </Typography>
                    </Box>
                  )
                ) : (
                  /* ── Recommendations tab ── */
                  recommendations.map(rec => (
                    <Box
                      key={rec.id}
                      sx={{
                        px: 1.5, py: 1, borderBottom: `1px solid ${theme.border.subtle}15`,
                        opacity: rec.status === 'rejected' ? 0.45 : 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.3 }}>
                        <Typography sx={{
                          fontSize: 12, fontWeight: 700, fontFamily: FONT_MONO, color: theme.text.primary,
                          textDecoration: rec.status === 'rejected' ? 'line-through' : 'none',
                        }}>
                          {rec.symbol}
                        </Typography>
                        <Typography sx={{ fontSize: 9, color: theme.text.disabled, fontFamily: FONT_MONO }}>
                          {rec.date}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: 9, color: theme.text.disabled, fontFamily: FONT_UI, mb: 0.3 }}>
                        {rec.model}
                      </Typography>
                      <Typography sx={{
                        fontSize: 10, color: rec.status === 'rejected' ? theme.text.disabled : theme.text.muted,
                        fontFamily: FONT_SERIF, lineHeight: 1.5, mb: 0.5,
                        textDecoration: rec.status === 'rejected' ? 'line-through' : 'none',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {rec.reason}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {rec.status === 'pending' && (
                          <>
                            <Typography onClick={() => handleAccept(rec.id)} sx={{ fontSize: 10, fontWeight: 600, color: '#10b981', cursor: 'pointer', fontFamily: FONT_UI, '&:hover': { textDecoration: 'underline' } }}>
                              采纳
                            </Typography>
                            <Typography sx={{ fontSize: 10, color: theme.text.disabled }}>·</Typography>
                            <Typography onClick={() => handleReject(rec.id)} sx={{ fontSize: 10, fontWeight: 600, color: '#ef4444', cursor: 'pointer', fontFamily: FONT_UI, '&:hover': { textDecoration: 'underline' } }}>
                              拒绝
                            </Typography>
                          </>
                        )}
                        {rec.status === 'accepted' && (
                          <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#10b981', fontFamily: FONT_UI }}>已采纳</Typography>
                        )}
                        {rec.status === 'rejected' && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography sx={{ fontSize: 10, fontWeight: 600, color: theme.text.disabled, fontFamily: FONT_UI }}>已拒绝</Typography>
                            <Typography sx={{ fontSize: 10, color: theme.text.disabled }}>·</Typography>
                            <Typography onClick={() => handleDeleteRec(rec.id)} sx={{ fontSize: 10, fontWeight: 600, color: theme.text.disabled, cursor: 'pointer', fontFamily: FONT_UI, '&:hover': { color: '#ef4444' } }}>
                              删除
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  ))
                )}
              </Box>
            </Box>

            {/* Center ~45%: Chart */}
            <Box sx={{
              width: '45%', flexShrink: 0,
              borderRight: `1px solid ${theme.border.subtle}`,
              display: 'flex', flexDirection: 'column',
              position: 'relative',
            }}>
              <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                px: 1.5, py: 0.5, borderBottom: `1px solid ${theme.border.subtle}`,
                flexShrink: 0,
              }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: FONT_MONO, color: theme.text.primary }}>
                  {chartSymbol}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontSize: 9, color: chartMode === 'line' ? theme.text.primary : theme.text.disabled, fontFamily: FONT_UI, fontWeight: 600 }}>
                    Line
                  </Typography>
                  <Switch
                    size="small"
                    checked={chartMode === 'kline'}
                    onChange={(_, checked) => setChartMode(checked ? 'kline' : 'line')}
                    sx={{
                      width: 32, height: 18, p: 0,
                      '& .MuiSwitch-switchBase': { p: '2px', '&.Mui-checked': { transform: 'translateX(14px)', color: '#fff' } },
                      '& .MuiSwitch-thumb': { width: 14, height: 14 },
                      '& .MuiSwitch-track': { borderRadius: 9, bgcolor: `${theme.text.disabled}30` },
                      '& .Mui-checked + .MuiSwitch-track': { bgcolor: `${theme.brand.primary}60 !important` },
                    }}
                  />
                  <Typography sx={{ fontSize: 9, color: chartMode === 'kline' ? theme.text.primary : theme.text.disabled, fontFamily: FONT_UI, fontWeight: 600 }}>
                    K-Line
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {chartMode === 'kline' ? (
                  <TradingViewChart symbol={chartSymbol} />
                ) : (
                  <Box sx={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    bgcolor: theme.background.secondary,
                  }}>
                    {priceData.length > 0 && (
                      <Typography sx={{ fontSize: 24, fontWeight: 600, fontFamily: FONT_MONO, color: theme.text.primary, mb: 0.25 }}>
                        ${priceData[priceData.length - 1].close.toFixed(2)}
                      </Typography>
                    )}
                    {priceData.length > 1 && (() => {
                      const first = priceData[0].close;
                      const last = priceData[priceData.length - 1].close;
                      const changePct = ((last - first) / first * 100);
                      const positive = changePct >= 0;
                      return (
                        <Typography sx={{ fontSize: 12, fontFamily: FONT_MONO, color: positive ? '#22c55e' : '#ef4444', mb: 2 }}>
                          {positive ? '+' : ''}{changePct.toFixed(2)}%
                        </Typography>
                      );
                    })()}
                    <Box sx={{ width: '85%', height: '40%', maxHeight: 180 }}>
                      {priceLoading ? (
                        <Typography sx={{ fontSize: 11, color: theme.text.disabled, textAlign: 'center', pt: 4 }}>Loading...</Typography>
                      ) : (
                        <SvgLineChart
                          data={priceData}
                          width={300}
                          height={120}
                          color={priceData.length > 1 && priceData[priceData.length - 1].close >= priceData[0].close ? '#22c55e' : '#ef4444'}
                        />
                      )}
                    </Box>
                    {priceData.length > 0 && (
                      <Typography sx={{ fontSize: 9, color: theme.text.disabled, fontFamily: FONT_UI, mt: 1.5 }}>
                        {priceData[0].date} — {priceData[priceData.length - 1].date}
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            </Box>

            {/* Right ~45%: Analysis records (real data from store) */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Column headers */}
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: '48px minmax(80px,1.2fr) minmax(70px,1fr) 48px minmax(90px,1fr)',
                alignItems: 'center',
                py: 0.5, px: 1.5,
                borderBottom: `1px solid ${theme.border.subtle}`,
                flexShrink: 0,
              }}>
                {['Sym', 'Company', 'Model', 'Act', 'Status'].map((label, i) => (
                  <Typography key={label} sx={{
                    fontSize: 8.5, fontWeight: 600, color: theme.text.disabled,
                    textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: FONT_UI,
                    textAlign: i === 3 ? 'center' : 'left',
                  }}>
                    {label}
                  </Typography>
                ))}
              </Box>

              {/* Rows */}
              <Box sx={{
                flex: 1, overflow: 'auto',
                '&::-webkit-scrollbar': { width: 3 },
                '&::-webkit-scrollbar-thumb': { bgcolor: `${theme.text.muted}18`, borderRadius: 4 },
              }}>
                {taskList.length === 0 && (
                  <Box sx={{ p: 4, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: 12, color: theme.text.disabled }}>
                      No analyses yet. Use the search bar below to start.
                    </Typography>
                  </Box>
                )}
                {taskList.map((t, idx) => {
                  const action = getTaskAction(t);
                  const conviction = getTaskConviction(t);
                  return (
                    <Box
                      key={t.id}
                      onClick={() => setSelectedId(t.id)}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '48px minmax(80px,1.2fr) minmax(70px,1fr) 48px minmax(90px,1fr)',
                        alignItems: 'center',
                        px: 1.5, minHeight: 38,
                        cursor: 'pointer',
                        borderBottom: `1px solid ${theme.border.subtle}22`,
                        bgcolor: idx % 2 === 0 ? `${theme.text.primary}02` : 'transparent',
                        transition: 'background-color 0.1s',
                        '&:hover': { bgcolor: `${theme.text.primary}06` },
                      }}
                    >
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: theme.text.primary, fontFamily: FONT_MONO }}>{t.symbol}</Typography>
                      <Typography sx={{ fontSize: 11, color: theme.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pr: 1 }}>
                        {t.companyName}
                      </Typography>
                      <Typography sx={{ fontSize: 9.5, color: theme.text.disabled, fontFamily: FONT_MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.model}
                      </Typography>
                      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                        {t.status === 'running' ? (
                          <Typography sx={{ fontSize: 9, color: theme.text.disabled, lineHeight: 1.4 }}>—</Typography>
                        ) : action ? (
                          <Box sx={{ px: 0.75, py: 0.15, borderRadius: '4px', bgcolor: `${ACTION_COLORS[action] || '#666'}12` }}>
                            <Typography sx={{ fontSize: 10, fontWeight: 800, color: ACTION_COLORS[action] || theme.text.muted, lineHeight: 1.4 }}>{action}</Typography>
                          </Box>
                        ) : (
                          <Typography sx={{ fontSize: 9, color: theme.text.disabled, lineHeight: 1.4 }}>—</Typography>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {t.status === 'completed' && (
                          <>
                            {conviction !== null && (
                              <Typography sx={{ fontSize: 10, fontWeight: 600, color: theme.text.muted, fontFamily: FONT_MONO, fontFeatureSettings: '"tnum"' }}>
                                {Math.round(conviction * 100)}%
                              </Typography>
                            )}
                            <Typography sx={{ fontSize: 9.5, fontWeight: 600, color: '#10b981', fontFamily: FONT_UI }}>
                              已完成
                            </Typography>
                          </>
                        )}
                        {t.status === 'running' && (
                          <RunningStatus color={theme.brand.primary} gate={t.currentGate} />
                        )}
                        {t.status === 'error' && (
                          <Typography sx={{ fontSize: 9.5, fontWeight: 600, color: '#ef4444', fontFamily: FONT_UI }}>
                            失败
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </>
        )}
      </Box>

      {/* ── Floating search bar ── */}
      {!hasSelection && (
        <Box sx={{
          position: 'absolute', bottom: 48, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          width: 340, opacity: 0.6,
          transition: 'opacity 0.2s ease',
          filter: 'drop-shadow(0 2px 12px rgba(0,0,0,0.15))',
          '&:hover': { opacity: 0.85 },
          '&:focus-within': { opacity: 1 },
        }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            bgcolor: theme.background.secondary, borderRadius: '8px',
            border: `1px solid ${theme.border.default}`,
            px: 2, py: 1,
          }}>
            <input
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              placeholder="输入股票代码 (e.g. AAPL)"
              style={{
                flex: 1, border: 'none', outline: 'none',
                background: 'transparent', color: theme.text.primary,
                fontSize: 13, fontFamily: FONT_UI,
              }}
            />
            <Box
              onClick={handleAnalyze}
              sx={{
                px: 2, py: 0.5, borderRadius: '4px', cursor: 'pointer',
                bgcolor: theme.text.primary, color: theme.background.primary,
                fontSize: 12, fontWeight: 600, fontFamily: FONT_UI,
                transition: 'transform 0.15s ease',
                '&:hover': { transform: 'translateY(-1px)' },
              }}
            >
              Analyze
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
