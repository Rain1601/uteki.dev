/**
 * /company-agent — Studio (M1)
 *
 * The new Studio control room: 关注列表 (watchlist with K-line peek) ·
 * 正在起草 (live SSE-driven running queue) · 执行记录 (history log).
 *
 * Replaces the index-mode of the legacy CompanyAgentPage. `:id` routes
 * still go to the legacy detail page for now; M2 will replace that.
 *
 * Data wiring:
 *   - watchlist : localStorage (`company-agent-watchlist`) seeded with defaults
 *   - running   : `analyzeCompanyStream` SSE, tracked in a local Map
 *   - log       : `listCompanyAnalyses()` (refreshed on completion)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FONT_DISPLAY,
  FONT_BODY,
  FONT_MONO,
  COLOR_BG,
  COLOR_BG_RAISED,
  COLOR_INK,
  COLOR_INK_MUTED,
  COLOR_INK_FAINT,
  COLOR_GAIN,
  COLOR_LOSS,
  COLOR_NEUTRAL,
  BACKGROUND_PAPER,
} from '../theme/editorialTokens';
import TradingViewChart from '../components/index/TradingViewChart';
import {
  listCompanyAnalyses,
  type CompanyAnalysisSummary,
} from '../api/company';
import { useCompanyAgentRunStore } from '../stores/companyAgentRunStore';

// ─── Types ────────────────────────────────────────────────────────────────

interface WatchItem {
  symbol: string;
  name: string;
}

const TOTAL_GATES = 7;
const GATE_TITLES = ['生意分析', '费雪十五问', '护城河', '管理层', '逆向检验', '估值', '综合裁决'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const WATCHLIST_DEFAULT: WatchItem[] = [
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'TSM', name: 'Taiwan Semi.' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'TSLA', name: 'Tesla, Inc.' },
];

const WATCHLIST_KEY = 'company-agent-watchlist';
const DEFAULT_PROVIDER = 'openai/deepseek-v3.2';

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtElapsedMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function fmtTimeLog(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function verdictColor(action: string | null | undefined): string {
  if (action === 'BUY') return COLOR_GAIN;
  if (action === 'AVOID') return COLOR_LOSS;
  if (action === 'WATCH') return COLOR_NEUTRAL;
  return COLOR_INK_FAINT;
}

function loadWatchlist(): WatchItem[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return WATCHLIST_DEFAULT;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => x.symbol && x.name)) return parsed;
  } catch { /* ignore */ }
  return WATCHLIST_DEFAULT;
}

function saveWatchlist(items: WatchItem[]) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

// ─── Inline editorial atoms ───────────────────────────────────────────────

function MonoCaps({ children, color, size = 10 }: { children: React.ReactNode; color?: string; size?: number }) {
  return (
    <Typography
      component="span"
      sx={{
        fontFamily: FONT_MONO,
        fontSize: size,
        letterSpacing: '0.28em',
        textTransform: 'uppercase',
        color: color ?? COLOR_INK_MUTED,
        fontFeatureSettings: '"tnum"',
      }}
    >
      {children}
    </Typography>
  );
}

function ItalicSerif({ children, size = 14, color }: { children: React.ReactNode; size?: number; color?: string }) {
  return (
    <Typography
      component="span"
      sx={{
        fontFamily: FONT_DISPLAY,
        fontStyle: 'italic',
        fontSize: size,
        color: color ?? COLOR_INK,
        fontVariationSettings: '"opsz" 36',
        lineHeight: 1.5,
      }}
    >
      {children}
    </Typography>
  );
}

// ─── Inline chart panel (TradingView, no popup) ──────────────────────────

function InlineChartPanel({
  symbol,
  name,
  onClose,
  onDraft,
}: {
  symbol: string;
  name: string;
  onClose: () => void;
  onDraft: (symbol: string) => void;
}) {
  return (
    <motion.div
      key={`chart-${symbol}`}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32 }}
      style={{ marginBottom: 24 }}
    >
      <Box
        sx={{
          border: `1px solid ${COLOR_INK_FAINT}55`,
          bgcolor: 'rgba(244,236,223,0.02)',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            px: 3,
            pt: 2.4,
            pb: 1.6,
            borderBottom: `1px solid ${COLOR_INK_FAINT}33`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
            <Typography
              sx={{
                fontFamily: FONT_DISPLAY,
                fontStyle: 'italic',
                fontSize: 32,
                color: COLOR_INK,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                fontVariationSettings: '"opsz" 144, "WONK" 1',
                fontWeight: 600,
              }}
            >
              {symbol}
            </Typography>
            <ItalicSerif size={14} color={COLOR_INK_MUTED}>{name}</ItalicSerif>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <Typography
              onClick={() => onDraft(symbol)}
              sx={{
                fontFamily: FONT_MONO,
                fontSize: 9.5,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: COLOR_BG,
                bgcolor: COLOR_INK,
                px: 1.6,
                py: 0.7,
                cursor: 'pointer',
                '&:hover': { bgcolor: '#FFF8EA' },
              }}
            >
              起草研究 →
            </Typography>
            <Typography
              onClick={onClose}
              sx={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                color: COLOR_INK_MUTED,
                letterSpacing: '0.28em',
                cursor: 'pointer',
                px: 1,
                '&:hover': { color: COLOR_INK },
              }}
            >
              ✕
            </Typography>
          </Box>
        </Box>
        <Box sx={{ height: 380, position: 'relative' }}>
          <TradingViewChart symbol={symbol} />
        </Box>
      </Box>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function CompanyAgentStudio() {
  const navigate = useNavigate();

  const [analyses, setAnalyses] = useState<CompanyAnalysisSummary[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(true);
  const [watchlist, setWatchlist] = useState<WatchItem[]>(() => loadWatchlist());
  const [peekSymbol, setPeekSymbol] = useState<string | null>(null);
  const [addingSymbol, setAddingSymbol] = useState(false);
  const [newSymInput, setNewSymInput] = useState('');

  // Live runs come from the global store (survive route changes)
  const runs = useCompanyAgentRunStore((s) => s.runs);
  const startRun = useCompanyAgentRunStore((s) => s.start);
  const abortRun = useCompanyAgentRunStore((s) => s.abort);
  const removeRun = useCompanyAgentRunStore((s) => s.removeRun);

  // Tick to refresh elapsed-time displays without re-rendering the store
  const [, setTick] = useState(0);
  useEffect(() => {
    if (runs.size === 0) return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [runs.size > 0]);

  // Persist watchlist
  useEffect(() => { saveWatchlist(watchlist); }, [watchlist]);

  // Load history log on mount; refresh after a completion
  const reloadAnalyses = useCallback(async () => {
    try {
      const { analyses: list } = await listCompanyAnalyses({ limit: 60 });
      setAnalyses(list);
    } catch (e) {
      console.error('Failed to load analyses:', e);
    } finally {
      setLoadingAnalyses(false);
    }
  }, []);

  useEffect(() => { void reloadAnalyses(); }, [reloadAnalyses]);

  // When a run completes, refresh log and retire it from the store after a beat
  useEffect(() => {
    for (const r of runs.values()) {
      if (r.done) {
        void reloadAnalyses();
        const id = r.id;
        setTimeout(() => removeRun(id), 800);
      }
    }
  }, [runs, reloadAnalyses, removeRun]);

  // ── Execute (kicks off SSE via store) ──
  const handleExecute = useCallback((symbol: string, provider: string = DEFAULT_PROVIDER) => {
    const w = watchlist.find((it) => it.symbol === symbol);
    startRun({ symbol, name: w?.name, provider });
  }, [watchlist, startRun]);

  const handleAbort = useCallback((runId: string) => {
    abortRun(runId);
  }, [abortRun]);

  const handleOpenLog = useCallback((analysisId: string) => {
    navigate(`/company-agent/${analysisId}`);
  }, [navigate]);

  const handlePeek = useCallback((symbol: string) => {
    setPeekSymbol((cur) => (cur === symbol ? null : symbol));
  }, []);

  const handleAddSymbol = () => {
    const sym = newSymInput.trim().toUpperCase();
    if (!sym) return;
    if (watchlist.some((it) => it.symbol === sym)) {
      setNewSymInput('');
      setAddingSymbol(false);
      return;
    }
    setWatchlist((prev) => [...prev, { symbol: sym, name: sym }]);
    setNewSymInput('');
    setAddingSymbol(false);
  };

  const handleRemoveSymbol = (symbol: string) => {
    setWatchlist((prev) => prev.filter((it) => it.symbol !== symbol));
  };

  // ── Derived ──
  const runningArr = Array.from(runs.values()).sort((a, b) => b.startTime - a.startTime);
  const runningSymbols = new Set(runningArr.map((r) => r.symbol));

  // ── Render ──
  return (
    <Box
      sx={{
        m: -3,
        height: '100vh',
        width: 'calc(100% + 48px)',
        bgcolor: COLOR_BG,
        backgroundImage: BACKGROUND_PAPER,
        color: COLOR_INK,
        fontFamily: FONT_BODY,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ── Masthead ── */}
      <Box
        sx={{
          flexShrink: 0,
          px: 5,
          py: 2.5,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${COLOR_INK_FAINT}44`,
          bgcolor: COLOR_BG_RAISED,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <Typography
            sx={{
              fontFamily: FONT_DISPLAY,
              fontStyle: 'italic',
              fontSize: 32,
              color: COLOR_INK,
              letterSpacing: '-0.025em',
              lineHeight: 1,
              fontVariationSettings: '"opsz" 144, "SOFT" 60',
            }}
          >
            研究台
          </Typography>
          <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 16, color: COLOR_INK_MUTED }}>
            Studio
          </Typography>
          <MonoCaps>关注 {watchlist.length} · 在跑 {runningArr.length} · 历史 {analyses.length}</MonoCaps>
        </Box>
        <Box
          onClick={() => navigate('/company-agent/new')}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1.2,
            fontFamily: FONT_MONO,
            fontSize: 11,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: COLOR_BG,
            bgcolor: COLOR_INK,
            px: 2.5,
            py: 1,
            cursor: 'pointer',
            transition: 'all 200ms',
            '&:hover': { bgcolor: '#FFF8EA' },
          }}
        >
          + 起草新研究
        </Box>
      </Box>

      {/* ── Three columns ── */}
      <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr 360px', overflow: 'hidden' }}>
        {/* ── Watchlist column ── */}
        <Box sx={{ borderRight: `1px solid ${COLOR_INK_FAINT}33`, py: 3.5, px: 3, overflow: 'auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 2 }}>
            <MonoCaps size={9.5}>关注列表 · watchlist</MonoCaps>
            <Typography
              onClick={() => setAddingSymbol((v) => !v)}
              sx={{
                fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT,
                letterSpacing: '0.18em', cursor: 'pointer',
                '&:hover': { color: COLOR_INK },
              }}
            >
              {addingSymbol ? '✕ 取消' : '+ 添加'}
            </Typography>
          </Box>

          {addingSymbol && (
            <Box sx={{ mb: 2, pb: 2, borderBottom: `1px dashed ${COLOR_INK_FAINT}55` }}>
              <input
                value={newSymInput}
                onChange={(e) => setNewSymInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddSymbol(); if (e.key === 'Escape') setAddingSymbol(false); }}
                placeholder="股票代码 (e.g. PLTR)"
                autoFocus
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${COLOR_INK_FAINT}`,
                  color: COLOR_INK,
                  fontFamily: FONT_MONO,
                  fontSize: 14,
                  letterSpacing: '0.06em',
                  padding: '6px 0',
                  outline: 'none',
                }}
              />
              <Typography
                onClick={handleAddSymbol}
                sx={{
                  mt: 1, fontFamily: FONT_MONO, fontSize: 9,
                  color: COLOR_INK_MUTED, letterSpacing: '0.24em',
                  cursor: 'pointer', textAlign: 'right',
                  '&:hover': { color: COLOR_INK },
                }}
              >
                添加 ↵
              </Typography>
            </Box>
          )}

          <Box>
            {watchlist.map((item, idx) => {
              const lastForSymbol = analyses.find((a) => a.symbol === item.symbol && a.status === 'completed');
              const lastVerdict = lastForSymbol?.verdict_action ?? null;
              const reanalyses = analyses.filter((a) => a.symbol === item.symbol).length;
              const swatchColor = verdictColor(lastVerdict);
              const isRunning = runningSymbols.has(item.symbol);

              return (
                <Box
                  key={item.symbol}
                  sx={{
                    py: 1.6,
                    borderBottom: idx < watchlist.length - 1 ? `1px dashed ${COLOR_INK_FAINT}33` : 'none',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.2,
                    cursor: 'default',
                    transition: 'all 200ms',
                    '&:hover .row-remove': { opacity: 1 },
                  }}
                >
                  <Box sx={{ width: 3, alignSelf: 'stretch', bgcolor: swatchColor, opacity: lastVerdict ? 1 : 0.2, mt: 0.4, flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.3 }}>
                      <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 17, color: COLOR_INK, letterSpacing: '-0.005em', fontVariationSettings: '"opsz" 36' }}>
                        {item.symbol}
                      </Typography>
                      <Typography
                        className="row-remove"
                        onClick={() => handleRemoveSymbol(item.symbol)}
                        sx={{
                          fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT,
                          letterSpacing: '0.18em', cursor: 'pointer', opacity: 0,
                          transition: 'opacity 180ms',
                          '&:hover': { color: COLOR_LOSS },
                        }}
                      >
                        ✕
                      </Typography>
                    </Box>
                    <ItalicSerif size={11.5} color={COLOR_INK_FAINT}>{item.name}</ItalicSerif>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.6 }}>
                      {lastVerdict ? (
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: swatchColor, letterSpacing: '0.18em', fontWeight: 600 }}>
                          {lastVerdict} · {reanalyses}×
                        </Typography>
                      ) : (
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, letterSpacing: '0.18em', fontStyle: 'italic' }}>
                          未研究
                        </Typography>
                      )}
                      <Box sx={{ flex: 1 }} />

                      {/* K-line peek button */}
                      <Box
                        onClick={() => handlePeek(item.symbol)}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.4,
                          fontFamily: FONT_MONO,
                          fontSize: 9,
                          color: peekSymbol === item.symbol ? COLOR_INK : COLOR_INK_MUTED,
                          letterSpacing: '0.24em',
                          cursor: 'pointer',
                          border: `1px solid ${peekSymbol === item.symbol ? COLOR_INK : COLOR_INK_FAINT + '66'}`,
                          px: 0.8,
                          py: 0.25,
                          transition: 'all 180ms',
                          '&:hover': { color: COLOR_INK, borderColor: COLOR_INK },
                        }}
                      >
                        <svg width="12" height="10" viewBox="0 0 12 10" style={{ display: 'block' }}>
                          <line x1="2.5" y1="1" x2="2.5" y2="9" stroke="currentColor" strokeWidth="0.7" />
                          <rect x="1.5" y="3" width="2" height="4" fill="currentColor" opacity="0.9" />
                          <line x1="6.5" y1="2" x2="6.5" y2="8" stroke="currentColor" strokeWidth="0.7" />
                          <rect x="5.5" y="2.5" width="2" height="3" fill="none" stroke="currentColor" strokeWidth="0.7" />
                          <line x1="10.5" y1="0.5" x2="10.5" y2="6" stroke="currentColor" strokeWidth="0.7" />
                          <rect x="9.5" y="1.5" width="2" height="3" fill="none" stroke="currentColor" strokeWidth="0.7" />
                        </svg>
                        K
                      </Box>

                      {isRunning ? (
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_MUTED, letterSpacing: '0.24em' }}>
                          ▶ 在跑
                        </Typography>
                      ) : (
                        <Typography
                          onClick={() => handleExecute(item.symbol)}
                          sx={{
                            fontFamily: FONT_MONO,
                            fontSize: 9,
                            color: COLOR_INK_MUTED,
                            letterSpacing: '0.24em',
                            cursor: 'pointer',
                            border: `1px solid ${COLOR_INK_FAINT}66`,
                            px: 0.8,
                            py: 0.25,
                            transition: 'all 180ms',
                            '&:hover': { color: COLOR_INK, borderColor: COLOR_INK },
                          }}
                        >
                          起草 →
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* ── Active queue + chart panel ── */}
        <Box sx={{ p: 4, overflow: 'auto' }}>
          <AnimatePresence>
            {peekSymbol && (
              <InlineChartPanel
                symbol={peekSymbol}
                name={watchlist.find((w) => w.symbol === peekSymbol)?.name ?? peekSymbol}
                onClose={() => setPeekSymbol(null)}
                onDraft={(sym) => { setPeekSymbol(null); handleExecute(sym); }}
              />
            )}
          </AnimatePresence>

          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
              <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 22, color: COLOR_INK, letterSpacing: '-0.015em', fontVariationSettings: '"opsz" 72, "SOFT" 60' }}>
                正在起草
              </Typography>
              <ItalicSerif size={13} color={COLOR_INK_MUTED}>active drafts · {runningArr.length}</ItalicSerif>
            </Box>
            <MonoCaps size={9}>后台执行 · 异步</MonoCaps>
          </Box>

          {runningArr.length === 0 && (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <ItalicSerif size={18} color={COLOR_INK_FAINT}>— 暂无在跑研究 —</ItalicSerif>
              <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 12, color: COLOR_INK_FAINT, mt: 1.2 }}>
                从左侧关注列表点&ldquo;起草&rdquo;，或右上角&ldquo;起草新研究&rdquo;。
              </Typography>
            </Box>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {runningArr.map((job) => {
              const pct = (job.currentGate / TOTAL_GATES) * 100;
              const gateIdx = Math.max(0, job.currentGate - 1);
              const gateName = GATE_TITLES[Math.min(gateIdx, TOTAL_GATES - 1)];
              const gateRoman = ROMAN[Math.min(gateIdx, TOTAL_GATES - 1)];
              const elapsedMs = Date.now() - job.startTime;
              return (
                <motion.div
                  key={job.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.4 }}
                >
                  <Box
                    onClick={() => job.analysisId && navigate(`/company-agent/${job.analysisId}`)}
                    sx={{
                      border: `1px solid ${COLOR_INK_FAINT}55`,
                      bgcolor: 'rgba(244,236,223,0.025)',
                      p: 3,
                      cursor: job.analysisId ? 'pointer' : 'default',
                      position: 'relative',
                      transition: 'all 200ms',
                      '&:hover': { borderColor: job.analysisId ? COLOR_INK_MUTED : `${COLOR_INK_FAINT}55`, bgcolor: job.analysisId ? 'rgba(244,236,223,0.05)' : 'rgba(244,236,223,0.025)' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.4 }}>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.6 }}>
                        <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 30, color: COLOR_INK, letterSpacing: '-0.015em', lineHeight: 1, fontVariationSettings: '"opsz" 144, "WONK" 1', fontWeight: 600 }}>
                          {job.symbol}
                        </Typography>
                        <ItalicSerif size={14} color={COLOR_INK_MUTED}>{job.name}</ItalicSerif>
                        <MonoCaps size={9}>{job.provider}</MonoCaps>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 13, color: COLOR_INK, fontFeatureSettings: '"tnum"' }}>
                          {fmtElapsedMs(elapsedMs)}
                        </Typography>
                        <Typography
                          onClick={(e) => { e.stopPropagation(); handleAbort(job.id); }}
                          sx={{
                            fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT,
                            letterSpacing: '0.24em', cursor: 'pointer',
                            '&:hover': { color: COLOR_LOSS },
                          }}
                        >
                          ⊗ 中止
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 0.6, mb: 1 }}>
                      {Array.from({ length: TOTAL_GATES }).map((_, i) => {
                        const done = i < gateIdx;
                        const active = i === gateIdx;
                        return (
                          <Box
                            key={i}
                            sx={{
                              flex: 1,
                              height: 3,
                              bgcolor: done || active ? COLOR_INK : COLOR_INK_FAINT + '55',
                              position: 'relative',
                              '&::after': active ? {
                                content: '""',
                                position: 'absolute',
                                inset: 0,
                                bgcolor: COLOR_INK,
                                animation: 'studio-gate-shimmer 1.4s ease-in-out infinite',
                                '@keyframes studio-gate-shimmer': {
                                  '0%, 100%': { opacity: 0.5 },
                                  '50%': { opacity: 1 },
                                },
                              } : undefined,
                            }}
                          />
                        );
                      })}
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.2 }}>
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: COLOR_INK_FAINT, letterSpacing: '0.18em' }}>
                          {pct.toFixed(0)}% · GATE {Math.max(1, job.currentGate)}/{TOTAL_GATES}
                        </Typography>
                        <ItalicSerif size={13} color={COLOR_INK}>{gateRoman}. {gateName}</ItalicSerif>
                      </Box>
                      {job.error ? (
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: COLOR_LOSS, letterSpacing: '0.18em' }}>
                          ⚠ {job.error.slice(0, 80)}
                        </Typography>
                      ) : job.analysisId ? (
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: COLOR_INK_MUTED, letterSpacing: '0.18em' }}>
                          点击查看 →
                        </Typography>
                      ) : (
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: COLOR_INK_FAINT, letterSpacing: '0.18em' }}>
                          初始化…
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </motion.div>
              );
            })}
          </Box>
        </Box>

        {/* ── Execution log ── */}
        <Box sx={{ borderLeft: `1px solid ${COLOR_INK_FAINT}33`, py: 3.5, px: 3, overflow: 'auto', bgcolor: 'rgba(0,0,0,0.12)' }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 2.5 }}>
            <MonoCaps size={9.5}>执行记录 · log</MonoCaps>
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_MUTED, fontFeatureSettings: '"tnum"' }}>
              {analyses.length} entries
            </Typography>
          </Box>

          {loadingAnalyses && (
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_FAINT, letterSpacing: '0.24em', textAlign: 'center', py: 4 }}>
              loading…
            </Typography>
          )}

          {!loadingAnalyses && analyses.length === 0 && (
            <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 12, color: COLOR_INK_FAINT, textAlign: 'center', py: 4 }}>
              暂无历史分析
            </Typography>
          )}

          <Box>
            {analyses.map((entry, idx) => {
              const c = verdictColor(entry.verdict_action);
              const dur = fmtDuration(entry.total_latency_ms);
              return (
                <Box
                  key={entry.id}
                  onClick={() => handleOpenLog(entry.id)}
                  sx={{
                    py: 1.4,
                    borderBottom: idx < analyses.length - 1 ? `1px dashed ${COLOR_INK_FAINT}33` : 'none',
                    cursor: 'pointer',
                    transition: 'all 200ms',
                    '&:hover': { bgcolor: 'rgba(244,236,223,0.03)', mx: -1, px: 1 },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.2, mb: 0.4 }}>
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, fontFeatureSettings: '"tnum"', minWidth: 100 }}>
                      {fmtTimeLog(entry.created_at)}
                    </Typography>
                    <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 14, color: COLOR_INK, fontVariationSettings: '"opsz" 36' }}>
                      {entry.symbol}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    {entry.status === 'running' ? (
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_NEUTRAL, letterSpacing: '0.18em', fontWeight: 600 }}>
                        ▶ 进行中
                      </Typography>
                    ) : entry.status === 'error' ? (
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_LOSS, letterSpacing: '0.18em', fontWeight: 600 }}>
                        ⚠ 失败
                      </Typography>
                    ) : (
                      <>
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: c, letterSpacing: '0.18em', fontWeight: 600 }}>
                          {entry.verdict_action}
                        </Typography>
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_MUTED, fontFeatureSettings: '"tnum"' }}>
                          ·{entry.verdict_conviction.toFixed(2)}
                        </Typography>
                      </>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, ml: 0.5 }}>
                    <ItalicSerif size={11} color={COLOR_INK_FAINT}>
                      {entry.provider}{entry.model ? `/${entry.model}` : ''}
                    </ItalicSerif>
                    <Box sx={{ flex: 1 }} />
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, fontFeatureSettings: '"tnum"', letterSpacing: '0.14em' }}>
                      {dur}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
