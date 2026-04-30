/**
 * /demo/company-conversation
 *
 * Demo of the redesigned Company Agent conversation experience.
 *
 *   1. STUDIO    — control room: watchlist · running queue · execution log
 *   2. REQUEST   — centered byline form (symbol + model + as_of)
 *   3. COMPOSING — three-column manuscript: gate ledger | active chapter
 *                  (streaming thought + tool-call marginalia)
 *                  | source ledger filling up live
 *   4. FILED     — magazine spread with stamped verdict + citations
 *
 * Auto-plays REQUEST → COMPOSING → FILED with mock data. STUDIO is manual.
 */
import { useEffect, useRef, useState } from 'react';
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
  COLOR_ACCENT,
  BACKGROUND_PAPER,
} from '../theme/editorialTokens';
import TradingViewChart from '../components/index/TradingViewChart';

// ─── Types ────────────────────────────────────────────────────────────────

type Phase = 'studio' | 'request' | 'composing' | 'filed';

interface ToolCall {
  source: 'fmp' | 'edgar' | 'cse' | 'yfinance';
  query: string;
  result: string;
  date?: string;
}

interface Gate {
  num: number;
  key: string;
  title: string;
  romanNumeral: string;
  thinking: string[];
  tools: ToolCall[];
  finding: string;
}

interface CatalogEntry {
  id: number;
  source: 'fmp' | 'edgar' | 'cse' | 'yfinance';
  publisher: string;
  date: string;
  excerpt: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────

const GATES: Gate[] = [
  {
    num: 1,
    key: 'business',
    title: 'The Business',
    romanNumeral: 'I',
    thinking: [
      '从基础生意结构开始：Alphabet 是一家广告公司，但',
      '不止于此。需要拆开 segment revenue 看每条腿的体重。',
      '搜索引擎仍然是利润大头，但 Cloud 与 YouTube 的边际',
      '增长正在改写故事。',
    ],
    tools: [
      { source: 'edgar', query: '10-K segment revenue', result: 'FY2023 Services $307.4B / Cloud $33.0B', date: '2024-01-31' },
      { source: 'fmp', query: 'income_statement period=annual', result: 'Operating income $84.3B (margin 27.4%)', date: '2024-02-12' },
    ],
    finding: '广告 80% / Cloud 11% / 其他 9%。Cloud 营收 33B 仍小，但 YoY +26% 撑住整体增速。',
  },
  {
    num: 2,
    key: 'fisher',
    title: "Fisher's Fifteen",
    romanNumeral: 'II',
    thinking: [
      'Q1：产品是否能在多年内继续放量？',
      '搜索是 GDP-bound，Cloud + YouTube 是 secular tailwind。',
      'Q5：营运利润率长期是否有 expansion 空间？2023 年',
      'cost discipline 已经把 op margin 从 24% 推到 27%，是真。',
    ],
    tools: [
      { source: 'cse', query: 'GOOGL operating margin trend 2023 2024', result: 'Reuters: efficiency push lifted margin past 30%', date: '2024-04-25' },
      { source: 'fmp', query: 'historical operating margins', result: '2020:23.0% / 2021:30.6% / 2022:26.5% / 2023:27.4%', date: '2024-02-12' },
    ],
    finding: '15 题里 11 题正面，3 题中性，1 题（中国市场敞口）保留。整体属优等生。',
  },
  {
    num: 3,
    key: 'moat',
    title: 'The Moat',
    romanNumeral: 'III',
    thinking: [
      '搜索的网络效应 + 数据规模 = 最纯的 moat',
      'Android + Chrome 的分销控制是第二层',
      'Cloud 三巨头之一，但与 AWS/Azure 比 moat 较浅',
    ],
    tools: [
      { source: 'cse', query: 'Google search market share 2024', result: 'StatCounter: 91.5% global search share', date: '2024-04-30' },
      { source: 'edgar', query: 'risk factors 10-K antitrust', result: 'DOJ search antitrust ongoing; remedies pending', date: '2024-01-31' },
    ],
    finding: 'Wide moat in search + ads；Cloud narrow；YouTube wide。整体 Wide，但反垄断阴影需打折扣。',
  },
  {
    num: 4,
    key: 'mgmt',
    title: 'Management',
    romanNumeral: 'IV',
    thinking: [
      'Pichai 任内的资本配置：买回 + AI capex 双线推进',
      '2023 裁员 12k 体现了成本意识，但执行偏温和',
      'Ruth Porat → Anat Ashkenazi 的 CFO 交接需观察',
    ],
    tools: [
      { source: 'cse', query: 'Sundar Pichai capital allocation buybacks', result: 'FY2023 buybacks $61.5B', date: '2024-02-12' },
      { source: 'fmp', query: 'capex history', result: 'Capex 2021:$24.6B → 2023:$32.3B', date: '2024-02-12' },
    ],
    finding: '资本配置稳健，buyback 优先，但 AI capex 拉升正在测试纪律。Pichai 不是 Bezos 级，但合格。',
  },
  {
    num: 5,
    key: 'reverse',
    title: 'The Reverse Test',
    romanNumeral: 'V',
    thinking: [
      '什么会毁掉这个生意？',
      '场景 A：LLM 取代搜索 → 收入 -40%。概率 25%。',
      '场景 B：DOJ 强制拆分 → 估值 -25%。概率 15%。',
      '场景 C：Cloud 跟不上 AWS/Azure → 增长 -8pp。概率 35%。',
    ],
    tools: [
      { source: 'cse', query: 'ChatGPT search disruption Google 2024', result: 'Search Generative Experience contains some risk', date: '2024-03-15' },
    ],
    finding: '三个 destruction scenario 都有可能但都不致命；最大风险是 LLM 替代搜索，但 Google 自己也在 race。',
  },
  {
    num: 6,
    key: 'valuation',
    title: 'Valuation',
    romanNumeral: 'VI',
    thinking: [
      'PE 23x（FY2024 forward），高于 5 年中位数 21x',
      'FCF yield 4.2%，对应 10Y treasury 4.5% 不算贵',
      'EV/EBITDA 15.2x — 落在合理区间',
      'PEG 1.4 — growth-adjusted 偏中性',
    ],
    tools: [
      { source: 'yfinance', query: 'GOOGL valuation multiples', result: 'PE 23.1x, EV/EBITDA 15.2, PEG 1.4', date: '2026-04-29' },
      { source: 'fmp', query: 'free cash flow FY2023', result: 'FCF $69.5B (yield 4.2%)', date: '2024-02-12' },
    ],
    finding: '估值 fair-to-slightly-rich。不是 bargain，但不是 bubble。等回调到 PE 20x 更舒服。',
  },
  {
    num: 7,
    key: 'final',
    title: 'Final Verdict',
    romanNumeral: 'VII',
    thinking: [
      '汇总：宽护城河 + 优秀利润率 + 合理估值 - 反垄断阴影',
      'Bull：AI 是强化而非颠覆 Google 的核心',
      'Bear：搜索从 90% 下滑到 80% 都会戳破 EPS',
      '判断：BUY，但仓位 ≤ 5%，止损 -15%',
    ],
    tools: [],
    finding: 'BUY · 0.70 conviction · GOOD quality',
  },
];

const CATALOG: CatalogEntry[] = [
  { id: 1, source: 'edgar', publisher: 'SEC EDGAR', date: '2024-01-31', excerpt: '10-K Annual Report — FY2023' },
  { id: 2, source: 'fmp', publisher: 'FMP', date: '2024-02-12', excerpt: 'Income statement annual' },
  { id: 3, source: 'fmp', publisher: 'FMP', date: '2024-02-12', excerpt: 'Cash flow statement' },
  { id: 4, source: 'cse', publisher: 'Reuters', date: '2024-04-25', excerpt: 'Margin discipline lifts profit' },
  { id: 5, source: 'cse', publisher: 'StatCounter', date: '2024-04-30', excerpt: 'Search market share data' },
  { id: 6, source: 'edgar', publisher: 'SEC EDGAR', date: '2024-01-31', excerpt: 'Risk factors / antitrust' },
  { id: 7, source: 'cse', publisher: 'Bloomberg', date: '2024-02-12', excerpt: 'Pichai compensation review' },
  { id: 8, source: 'fmp', publisher: 'FMP', date: '2024-02-12', excerpt: 'Capex history' },
  { id: 9, source: 'cse', publisher: 'WSJ', date: '2024-03-15', excerpt: 'AI search disruption analysis' },
  { id: 10, source: 'yfinance', publisher: 'Yahoo Finance', date: '2026-04-29', excerpt: 'Valuation multiples' },
  { id: 11, source: 'fmp', publisher: 'FMP', date: '2024-02-12', excerpt: 'Free cash flow FY2023' },
  { id: 12, source: 'cse', publisher: 'FT', date: '2024-04-22', excerpt: 'AI capex narrative' },
];

const SOURCE_COLORS: Record<ToolCall['source'], string> = {
  fmp: COLOR_GAIN,
  edgar: COLOR_NEUTRAL,
  cse: COLOR_ACCENT,
  yfinance: '#8FA0B8',
};

const SOURCE_LABELS: Record<ToolCall['source'], string> = {
  fmp: 'FMP',
  edgar: 'EDGAR',
  cse: 'NEWS',
  yfinance: 'Y!FIN',
};

// ─── Mock OHLC data (deterministic, sin-wave random walk) ─────────────────

interface OHLC { date: string; o: number; h: number; l: number; c: number; v: number; }

const SERIES: OHLC[] = (() => {
  const out: OHLC[] = [];
  let price = 168;
  // 180 trading days ending 2026-04-29
  const end = new Date('2026-04-29');
  for (let i = 179; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const t = i / 30;
    // Long uptrend with three pullbacks
    const drift = 0.95 + Math.sin(t * 0.6) * 0.4 - i * 0.012;
    const noise = (Math.sin(i * 1.7) + Math.cos(i * 2.3)) * 1.2;
    const o = price;
    const c = Math.max(50, price + drift + noise);
    const range = Math.abs(c - o) + Math.abs(noise) * 0.6 + 1.2;
    const h = Math.max(o, c) + range * 0.5;
    const l = Math.min(o, c) - range * 0.5;
    out.push({
      date: d.toISOString().slice(0, 10),
      o: +o.toFixed(2),
      h: +h.toFixed(2),
      l: +l.toFixed(2),
      c: +c.toFixed(2),
      v: 0,
    });
    price = c;
  }
  return out;
})();

interface VerdictPin {
  date: string;
  action: 'BUY' | 'WATCH' | 'AVOID';
  conviction: number;
  model: string;
}

const PRIOR_VERDICTS: VerdictPin[] = [
  { date: '2025-11-12', action: 'WATCH', conviction: 0.55, model: 'deepseek-v3' },
  { date: '2026-01-28', action: 'BUY', conviction: 0.62, model: 'claude-sonnet' },
  { date: '2026-03-19', action: 'WATCH', conviction: 0.58, model: 'gpt-5' },
  { date: '2026-04-30', action: 'BUY', conviction: 0.70, model: 'claude-sonnet' }, // current
];

// ─── Studio mock data ─────────────────────────────────────────────────────

interface WatchItem {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  lastVerdict: 'BUY' | 'WATCH' | 'AVOID' | null;
  lastVerdictDate?: string;
  reanalyses: number;
}

interface RunningJob {
  id: string;
  symbol: string;
  name: string;
  model: string;
  startedAt: number; // unix ms
  currentGate: number; // 0..6
  elapsed: number; // sec
  asOf: string;
}

interface LogEntry {
  id: string;
  symbol: string;
  name: string;
  model: string;
  date: string;
  duration: string;
  action: 'BUY' | 'WATCH' | 'AVOID';
  conviction: number;
  citations: number;
}

const WATCHLIST_SEED: WatchItem[] = [
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 373.20, changePct: 1.84, lastVerdict: 'WATCH', lastVerdictDate: '2026-03-19', reanalyses: 4 },
  { symbol: 'TSM', name: 'Taiwan Semi.', price: 198.40, changePct: -0.62, lastVerdict: 'BUY', lastVerdictDate: '2026-04-12', reanalyses: 3 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 134.85, changePct: 2.41, lastVerdict: 'WATCH', lastVerdictDate: '2026-04-08', reanalyses: 6 },
  { symbol: 'PLTR', name: 'Palantir Tech.', price: 28.16, changePct: -3.12, lastVerdict: 'AVOID', lastVerdictDate: '2026-04-22', reanalyses: 2 },
  { symbol: 'ARM', name: 'Arm Holdings', price: 142.60, changePct: 0.84, lastVerdict: null, reanalyses: 0 },
  { symbol: 'CRWD', name: 'CrowdStrike', price: 318.90, changePct: 1.05, lastVerdict: 'BUY', lastVerdictDate: '2026-02-18', reanalyses: 1 },
  { symbol: 'TSLA', name: 'Tesla, Inc.', price: 248.30, changePct: -1.84, lastVerdict: 'AVOID', lastVerdictDate: '2026-04-30', reanalyses: 5 },
];

const RUNNING_SEED: RunningJob[] = [
  { id: 'job-001', symbol: 'TSM', name: 'Taiwan Semi.', model: 'claude-sonnet', startedAt: Date.now() - 4 * 60 * 1000 - 22 * 1000, currentGate: 4, elapsed: 262, asOf: '2026-04-30' },
  { id: 'job-002', symbol: 'NVDA', name: 'NVIDIA Corp.', model: 'deepseek-v3', startedAt: Date.now() - 1 * 60 * 1000 - 8 * 1000, currentGate: 1, elapsed: 68, asOf: '2026-04-30' },
];

// Per-symbol deterministic 30-day OHLC for watchlist mini-charts
function makeSymbolSeries(symbol: string, changePct: number, days = 30): OHLC[] {
  const seed = [...symbol].reduce((s, c) => s + c.charCodeAt(0), 0);
  // Drift biased by today's change direction
  const drift = changePct >= 0 ? 0.55 : -0.55;
  let price = 100;
  const out: OHLC[] = [];
  for (let i = 0; i < days; i++) {
    const noise = Math.sin((seed + i) * 0.7) * 1.6 + Math.cos((seed + i * 1.31) * 1.07) * 1.05;
    const o = price;
    const c = Math.max(40, price + drift + noise);
    const range = Math.abs(c - o) + Math.abs(noise) * 0.4 + 0.6;
    const h = Math.max(o, c) + range * 0.4;
    const l = Math.min(o, c) - range * 0.4;
    out.push({ date: '', o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +c.toFixed(2), v: 0 });
    price = c;
  }
  return out;
}

const LOG_SEED: LogEntry[] = [
  { id: 'l-1', symbol: 'TSLA', name: 'Tesla', model: 'claude-sonnet', date: '2026-04-30 10:02', duration: '5m 14s', action: 'AVOID', conviction: 0.90, citations: 47 },
  { id: 'l-2', symbol: 'PLTR', name: 'Palantir', model: 'claude-sonnet', date: '2026-04-30 10:08', duration: '4m 38s', action: 'AVOID', conviction: 0.90, citations: 41 },
  { id: 'l-3', symbol: 'GOOGL', name: 'Alphabet', model: 'claude-sonnet', date: '2026-04-30 10:15', duration: '5m 47s', action: 'BUY', conviction: 0.70, citations: 53 },
  { id: 'l-4', symbol: 'GOOGL', name: 'Alphabet', model: 'deepseek-v3', date: '2026-04-30 09:52', duration: '3m 22s', action: 'WATCH', conviction: 0.55, citations: 38 },
  { id: 'l-5', symbol: 'GOOGL', name: 'Alphabet', model: 'gpt-5', date: '2026-04-30 09:46', duration: '6m 18s', action: 'BUY', conviction: 0.65, citations: 49 },
  { id: 'l-6', symbol: 'GOOGL', name: 'Alphabet (as_of 2024-06-01)', model: 'claude-sonnet', date: '2026-04-30 08:57', duration: '4m 51s', action: 'WATCH', conviction: 0.50, citations: 32 },
  { id: 'l-7', symbol: 'CRWD', name: 'CrowdStrike', model: 'claude-sonnet', date: '2026-04-29 22:14', duration: '5m 02s', action: 'BUY', conviction: 0.68, citations: 44 },
  { id: 'l-8', symbol: 'NVDA', name: 'NVIDIA', model: 'deepseek-v3', date: '2026-04-29 18:32', duration: '3m 41s', action: 'WATCH', conviction: 0.55, citations: 36 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

const usePhaseClock = (phase: Phase, onAdvance: () => void) => {
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (phase === 'request') {
      ref.current = setTimeout(onAdvance, 3500);
    } else if (phase === 'composing') {
      // gates auto-advance handled below
    }
    return () => {
      if (ref.current) clearTimeout(ref.current);
    };
  }, [phase, onAdvance]);
};

// ─── Reusable bits ────────────────────────────────────────────────────────

function StampedVerdict({ action, conviction }: { action: string; conviction: number }) {
  const color = action === 'BUY' ? COLOR_GAIN : action === 'AVOID' ? COLOR_LOSS : COLOR_NEUTRAL;
  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0, rotate: 0 }}
      animate={{ scale: 1, opacity: 1, rotate: -2.4 }}
      transition={{ type: 'spring', stiffness: 110, damping: 11, delay: 0.4 }}
      style={{ display: 'inline-block' }}
    >
      <Box
        sx={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          border: `3px double ${color}`,
          px: 4,
          py: 2,
          position: 'relative',
          bgcolor: 'rgba(176,82,74,0.04)',
          boxShadow: `0 0 0 1px ${color}33 inset, 0 4px 18px rgba(0,0,0,0.4)`,
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 4,
            border: `1px solid ${color}55`,
            pointerEvents: 'none',
          },
        }}
      >
        <Typography
          sx={{
            fontFamily: FONT_DISPLAY,
            fontStyle: 'italic',
            fontSize: 56,
            lineHeight: 1,
            letterSpacing: '0.08em',
            color,
            fontVariationSettings: '"opsz" 144, "WONK" 1',
            fontWeight: 600,
          }}
        >
          {action}
        </Typography>
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color,
            mt: 1,
            opacity: 0.85,
          }}
        >
          conviction · {conviction.toFixed(2)}
        </Typography>
      </Box>
    </motion.div>
  );
}

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
        lineHeight: 1.6,
      }}
    >
      {children}
    </Typography>
  );
}

// ─── Editorial candlestick ───────────────────────────────────────────────

function EditorialCandlestick({
  data,
  width,
  height,
  pins,
  showAxes = true,
  showPins = true,
  asOfIndex,
}: {
  data: OHLC[];
  width: number;
  height: number;
  pins?: VerdictPin[];
  showAxes?: boolean;
  showPins?: boolean;
  asOfIndex?: number; // candles after this drawn faded (future-data)
}) {
  if (!data.length) return null;
  const padTop = 14;
  const padBottom = showAxes ? 22 : 8;
  const padLeft = showAxes ? 0 : 4;
  const padRight = showAxes ? 50 : 4;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const highs = data.map((d) => d.h);
  const lows = data.map((d) => d.l);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = max - min || 1;

  const xFor = (i: number) => padLeft + (i / Math.max(1, data.length - 1)) * chartW;
  const yFor = (price: number) => padTop + chartH - ((price - min) / range) * chartH;

  const candleW = Math.max(1.8, Math.min(7, (chartW / data.length) * 0.62));

  // Y-axis ticks
  const ticks = 4;
  const tickPrices = Array.from({ length: ticks + 1 }, (_, i) => min + (range * i) / ticks);

  // Month markers
  const monthSeen = new Set<string>();
  const monthMarkers = data.map((d, i) => {
    const m = d.date.slice(0, 7);
    if (!monthSeen.has(m)) {
      monthSeen.add(m);
      return { i, label: d.date.slice(5, 7) + '/' + d.date.slice(2, 4) };
    }
    return null;
  }).filter(Boolean) as { i: number; label: string }[];

  // Pin date → candle index
  const pinIndex = (date: string) => {
    let best = -1;
    let bestDiff = Infinity;
    const tgt = new Date(date).getTime();
    data.forEach((d, i) => {
      const diff = Math.abs(new Date(d.date).getTime() - tgt);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    });
    return best;
  };

  return (
    <Box sx={{ position: 'relative', width, height }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="kbg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(168,137,110,0.04)" />
            <stop offset="100%" stopColor="rgba(168,137,110,0)" />
          </linearGradient>
        </defs>

        {/* Subtle horizontal grid */}
        {showAxes && tickPrices.map((p, i) => (
          <line
            key={`grid-${i}`}
            x1={padLeft}
            x2={padLeft + chartW}
            y1={yFor(p)}
            y2={yFor(p)}
            stroke={COLOR_INK_FAINT}
            strokeOpacity={0.18}
            strokeDasharray="1 4"
          />
        ))}

        {/* Atmospheric backdrop */}
        <rect x={padLeft} y={padTop} width={chartW} height={chartH} fill="url(#kbg)" />

        {/* Candles */}
        {data.map((d, i) => {
          const x = xFor(i);
          const isUp = d.c >= d.o;
          const color = isUp ? COLOR_GAIN : COLOR_LOSS;
          const yHigh = yFor(d.h);
          const yLow = yFor(d.l);
          const yOpen = yFor(d.o);
          const yClose = yFor(d.c);
          const top = Math.min(yOpen, yClose);
          const bodyH = Math.max(0.8, Math.abs(yClose - yOpen));
          const future = asOfIndex !== undefined && i > asOfIndex;
          const opacity = future ? 0.25 : 1;
          return (
            <g key={i} opacity={opacity}>
              {/* wick */}
              <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} />
              {/* body — hollow if up, solid if down (editorial convention) */}
              {isUp ? (
                <rect
                  x={x - candleW / 2}
                  y={top}
                  width={candleW}
                  height={bodyH}
                  fill={COLOR_BG}
                  stroke={color}
                  strokeWidth={1}
                />
              ) : (
                <rect
                  x={x - candleW / 2}
                  y={top}
                  width={candleW}
                  height={bodyH}
                  fill={color}
                />
              )}
            </g>
          );
        })}

        {/* As-of vertical rule */}
        {asOfIndex !== undefined && asOfIndex < data.length - 1 && (
          <g>
            <line
              x1={xFor(asOfIndex)}
              x2={xFor(asOfIndex)}
              y1={padTop}
              y2={padTop + chartH}
              stroke={COLOR_INK_MUTED}
              strokeWidth={0.8}
              strokeDasharray="3 3"
            />
            <text
              x={xFor(asOfIndex) + 4}
              y={padTop + 9}
              fontFamily="JetBrains Mono"
              fontSize={8}
              letterSpacing="0.18em"
              fill={COLOR_INK_MUTED}
            >
              AS_OF
            </text>
          </g>
        )}

        {/* Y-axis labels */}
        {showAxes && tickPrices.map((p, i) => (
          <text
            key={`yl-${i}`}
            x={padLeft + chartW + 6}
            y={yFor(p) + 3}
            fontFamily="JetBrains Mono"
            fontSize={9}
            fill={COLOR_INK_FAINT}
            letterSpacing="0.05em"
          >
            {p.toFixed(0)}
          </text>
        ))}

        {/* X-axis month markers */}
        {showAxes && monthMarkers.map((m) => (
          <g key={`xm-${m.i}`}>
            <line
              x1={xFor(m.i)}
              x2={xFor(m.i)}
              y1={padTop + chartH}
              y2={padTop + chartH + 3}
              stroke={COLOR_INK_FAINT}
              strokeWidth={0.6}
            />
            <text
              x={xFor(m.i)}
              y={padTop + chartH + 14}
              fontFamily="JetBrains Mono"
              fontSize={9}
              fill={COLOR_INK_FAINT}
              letterSpacing="0.18em"
              textAnchor="middle"
            >
              {m.label}
            </text>
          </g>
        ))}

        {/* Verdict pins */}
        {showPins && pins && pins.map((p, idx) => {
          const i = pinIndex(p.date);
          if (i < 0) return null;
          const x = xFor(i);
          const candle = data[i];
          const yTop = yFor(candle.h) - 4;
          const stemTop = padTop + 2;
          const color = p.action === 'BUY' ? COLOR_GAIN : p.action === 'AVOID' ? COLOR_LOSS : COLOR_NEUTRAL;
          const isCurrent = idx === pins.length - 1;
          return (
            <g key={`pin-${idx}`}>
              <line x1={x} x2={x} y1={stemTop} y2={yTop} stroke={color} strokeWidth={isCurrent ? 1 : 0.6} strokeDasharray={isCurrent ? '0' : '2 2'} />
              <circle cx={x} cy={stemTop} r={isCurrent ? 4 : 2.5} fill={COLOR_BG} stroke={color} strokeWidth={isCurrent ? 1.5 : 1} />
              <text
                x={x}
                y={stemTop - 6}
                fontFamily="JetBrains Mono"
                fontSize={isCurrent ? 9 : 8}
                fill={color}
                letterSpacing="0.16em"
                fontWeight={isCurrent ? 600 : 400}
                textAnchor="middle"
              >
                {p.action}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

// Compact candlestick for tight UI (watchlist rows). No axes, no wicks reach
// the canvas edge; tuned for ~80×22 size.
function MiniCandles({ data, width, height }: { data: OHLC[]; width: number; height: number }) {
  if (!data.length) return null;
  const highs = data.map((d) => d.h);
  const lows = data.map((d) => d.l);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = max - min || 1;
  const candleW = Math.max(1.2, (width / data.length) * 0.62);
  const yFor = (p: number) => 1 + (height - 2) - ((p - min) / (range || 1)) * (height - 2);
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {data.map((d, i) => {
        const x = (i / Math.max(1, data.length - 1)) * (width - candleW) + candleW / 2;
        const isUp = d.c >= d.o;
        const color = isUp ? COLOR_GAIN : COLOR_LOSS;
        const yHigh = yFor(d.h);
        const yLow = yFor(d.l);
        const yOpen = yFor(d.o);
        const yClose = yFor(d.c);
        const top = Math.min(yOpen, yClose);
        const bodyH = Math.max(0.7, Math.abs(yClose - yOpen));
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth={0.6} opacity={0.5} />
            <rect x={x - candleW / 2} y={top} width={candleW} height={bodyH} fill={color} opacity={isUp ? 0.7 : 0.95} />
          </g>
        );
      })}
    </svg>
  );
}

function SourceChip({ entry, dimmed = false }: { entry: CatalogEntry; dimmed?: boolean }) {
  const color = SOURCE_COLORS[entry.source];
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 1,
        py: 0.85,
        opacity: dimmed ? 0.45 : 1,
        transition: 'opacity 600ms',
        borderBottom: `1px dashed ${COLOR_INK_FAINT}40`,
      }}
    >
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_FAINT, minWidth: 18, fontFeatureSettings: '"tnum"' }}>
        {String(entry.id).padStart(2, '0')}
      </Typography>
      <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: color, mt: 0.5, flexShrink: 0 }} />
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color, letterSpacing: '0.18em', fontWeight: 600, minWidth: 44 }}>
        {SOURCE_LABELS[entry.source]}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 11.5, color: COLOR_INK, lineHeight: 1.4, mb: 0.2 }}>
          {entry.excerpt}
        </Typography>
        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, letterSpacing: '0.14em', fontFeatureSettings: '"tnum"' }}>
          {entry.publisher} · {entry.date}
        </Typography>
      </Box>
    </Box>
  );
}

// ─── Phase: Request ───────────────────────────────────────────────────────

function RequestPhase({ symbol, onSubmit }: { symbol: string; onSubmit: () => void }) {
  return (
    <motion.div
      key="request"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      style={{ height: '100%', display: 'flex' }}
    >
      <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: '38% 62%', height: '100%' }}>
        {/* Left: brass-lit carrel */}
        <Box
          sx={{
            position: 'relative',
            borderRight: `1px solid ${COLOR_INK_FAINT}66`,
            p: 6,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: `radial-gradient(ellipse at 30% 20%, rgba(168,137,110,0.08), transparent 60%)`,
          }}
        >
          <Box>
            <MonoCaps>研究台 · Carrel No. 04</MonoCaps>
            <Typography
              sx={{
                fontFamily: FONT_DISPLAY,
                fontStyle: 'italic',
                fontSize: 38,
                color: COLOR_INK,
                lineHeight: 1,
                mt: 2,
                fontVariationSettings: '"opsz" 144, "SOFT" 60',
              }}
            >
              新建一份研究
            </Typography>
            <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 13, color: COLOR_INK_MUTED, mt: 1.2 }}>
              选择主题、研究员、与时间锚点。提交后档案将由七个 gate 顺序起草。
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, my: 4 }}>
            {/* Researcher / model picker */}
            <Box>
              <MonoCaps size={9.5}>研究员 · researcher</MonoCaps>
              <Box sx={{ display: 'flex', gap: 2, mt: 1.5 }}>
                {[
                  { name: 'claude-sonnet', initials: 'CS', selected: true },
                  { name: 'deepseek-v3', initials: 'DS', selected: false },
                  { name: 'gpt-5', initials: 'G5', selected: false },
                ].map((m) => (
                  <Box
                    key={m.name}
                    sx={{
                      width: 64,
                      textAlign: 'center',
                    }}
                  >
                    <Box
                      sx={{
                        width: 56,
                        height: 56,
                        border: `1.5px solid ${m.selected ? COLOR_INK : COLOR_INK_FAINT}`,
                        bgcolor: m.selected ? 'rgba(244,236,223,0.06)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mb: 0.8,
                        position: 'relative',
                        '&::after': m.selected
                          ? {
                              content: '""',
                              position: 'absolute',
                              inset: -3,
                              border: `1px solid ${COLOR_INK}88`,
                              pointerEvents: 'none',
                            }
                          : undefined,
                      }}
                    >
                      <Typography
                        sx={{
                          fontFamily: FONT_DISPLAY,
                          fontStyle: 'italic',
                          fontSize: 20,
                          color: m.selected ? COLOR_INK : COLOR_INK_MUTED,
                        }}
                      >
                        {m.initials}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: '0.12em', color: m.selected ? COLOR_INK : COLOR_INK_FAINT }}>
                      {m.name}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>

            {/* As_of / time anchor */}
            <Box>
              <MonoCaps size={9.5}>时间锚点 · as_of</MonoCaps>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1.5 }}>
                <Box sx={{ flex: 1, borderBottom: `1px solid ${COLOR_INK_FAINT}` }}>
                  <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 24, color: COLOR_INK, py: 0.6, fontVariationSettings: '"opsz" 72' }}>
                    今日 · 2026/04/30
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, letterSpacing: '0.18em', cursor: 'pointer', '&:hover': { color: COLOR_INK } }}>↑ 拨回</Typography>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, letterSpacing: '0.18em' }}>↓ 拨进</Typography>
                </Box>
              </Box>
              <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 11, color: COLOR_INK_FAINT, mt: 0.8 }}>
                可滚回任一历史日期；档案会按当时已有的数据起草。
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <MonoCaps>预计 · 4-6 min</MonoCaps>
            <Box
              onClick={onSubmit}
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
                px: 3,
                py: 1.2,
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 200ms',
                '&:hover': { bgcolor: '#FFF8EA', transform: 'translateY(-1px)' },
              }}
            >
              起草 · Begin Draft →
            </Box>
          </Box>
        </Box>

        {/* Right: prospectus page filling in */}
        <Box
          sx={{
            position: 'relative',
            p: 6,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            backgroundImage: `repeating-linear-gradient(0deg, transparent 0 27px, ${COLOR_INK_FAINT}14 27px 28px)`,
          }}
        >
          {/* corner registration mark */}
          <Box sx={{ position: 'absolute', top: 24, right: 24 }}>
            <MonoCaps size={9}>prospectus · draft</MonoCaps>
          </Box>
          <Box sx={{ position: 'absolute', top: 24, left: 24 }}>
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, letterSpacing: '0.32em' }}>
              FOLIO · 04 / 30
            </Typography>
          </Box>

          <Box>
            <MonoCaps size={10}>主题 · subject</MonoCaps>
            <Typography
              sx={{
                fontFamily: FONT_DISPLAY,
                fontStyle: 'italic',
                fontSize: 132,
                lineHeight: 0.9,
                color: COLOR_INK,
                letterSpacing: '-0.04em',
                mt: 1,
                fontVariationSettings: '"opsz" 144, "SOFT" 100, "WONK" 1',
                fontWeight: 600,
              }}
            >
              {symbol}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mt: 1.5 }}>
              <ItalicSerif size={20} color={COLOR_INK_MUTED}>Alphabet Inc.</ItalicSerif>
              <Typography sx={{ fontFamily: FONT_MONO, fontSize: 12, color: COLOR_INK_MUTED, letterSpacing: '0.14em', fontFeatureSettings: '"tnum"' }}>
                NASDAQ · INTERNET CONTENT
              </Typography>
            </Box>

            <Box sx={{ mt: 5, display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <Box>
                <MonoCaps size={9}>last · 04/29</MonoCaps>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 28, color: COLOR_INK, letterSpacing: '0.02em', fontFeatureSettings: '"tnum"', mt: 0.5 }}>
                  ${SERIES[SERIES.length - 1].c.toFixed(2)}
                </Typography>
              </Box>
              <Box>
                <MonoCaps size={9}>9m</MonoCaps>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 28, color: COLOR_GAIN, fontFeatureSettings: '"tnum"', mt: 0.5 }}>
                  +{(((SERIES[SERIES.length - 1].c - SERIES[0].o) / SERIES[0].o) * 100).toFixed(1)}%
                </Typography>
              </Box>
              <Box>
                <MonoCaps size={9}>52w hi/lo</MonoCaps>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 14, color: COLOR_INK_MUTED, fontFeatureSettings: '"tnum"', mt: 0.5 }}>
                  {Math.max(...SERIES.map(s => s.h)).toFixed(0)} / {Math.min(...SERIES.map(s => s.l)).toFixed(0)}
                </Typography>
              </Box>
            </Box>

            {/* Prospectus-page sparkline */}
            <Box sx={{ mt: 4, maxWidth: 580 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.6 }}>
                <MonoCaps size={9}>price · 9 months</MonoCaps>
                <ItalicSerif size={11} color={COLOR_INK_FAINT}>daily candles</ItalicSerif>
              </Box>
              <EditorialCandlestick
                data={SERIES}
                width={580}
                height={120}
                showAxes={false}
                showPins={false}
              />
            </Box>

            <Box sx={{ mt: 4, maxWidth: 480 }}>
              <ItalicSerif size={15} color={COLOR_INK_MUTED}>
                — 即将由七个 gate 起草。先看生意结构，再依次过 Fisher 十五题、护城河、管理、reverse stress test、估值，最终落定 verdict。
              </ItalicSerif>
            </Box>
          </Box>
        </Box>
      </Box>
    </motion.div>
  );
}

// ─── Phase: Composing ─────────────────────────────────────────────────────

function ComposingPhase({
  symbol,
  activeGate,
  thinkingProgress,
  visibleTools,
  catalogVisible,
  onComplete: _onComplete,
}: {
  symbol: string;
  activeGate: number;
  thinkingProgress: number;
  visibleTools: number;
  catalogVisible: number;
  onComplete: () => void;
}) {
  const gate = GATES[activeGate];
  const totalGates = GATES.length;

  return (
    <motion.div
      key="composing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {/* Subject ribbon */}
      <Box
        sx={{
          flexShrink: 0,
          px: 5,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          borderBottom: `1px solid ${COLOR_INK_FAINT}44`,
        }}
      >
        <Typography
          sx={{
            fontFamily: FONT_DISPLAY,
            fontStyle: 'italic',
            fontSize: 36,
            color: COLOR_INK,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            fontVariationSettings: '"opsz" 144',
            fontWeight: 600,
          }}
        >
          {symbol}
        </Typography>
        <ItalicSerif size={14} color={COLOR_INK_MUTED}>Alphabet Inc.</ItalicSerif>

        {/* Inline price strip — last 60 sessions, micro candlesticks */}
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ flex: 1, maxWidth: 460, mx: 'auto', opacity: 0.85 }}>
            <EditorialCandlestick
              data={SERIES.slice(-60)}
              width={460}
              height={48}
              showAxes={false}
              showPins={false}
            />
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.6 }}>
          <Typography sx={{ fontFamily: FONT_MONO, fontSize: 18, color: COLOR_INK, fontFeatureSettings: '"tnum"' }}>
            {SERIES[SERIES.length - 1].c.toFixed(2)}
          </Typography>
          <Typography sx={{ fontFamily: FONT_MONO, fontSize: 11, color: COLOR_GAIN, fontFeatureSettings: '"tnum"' }}>
            +{((SERIES[SERIES.length - 1].c / SERIES[SERIES.length - 21].c - 1) * 100).toFixed(2)}%
          </Typography>
        </Box>

        <MonoCaps>gate {activeGate + 1}/{totalGates}</MonoCaps>
        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 11, color: COLOR_INK_MUTED, letterSpacing: '0.14em', fontFeatureSettings: '"tnum"' }}>
          02:14
        </Typography>
      </Box>

      {/* Three-column manuscript */}
      <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr 320px', overflow: 'hidden' }}>
        {/* Left: gate ledger */}
        <Box sx={{ borderRight: `1px solid ${COLOR_INK_FAINT}33`, py: 4, px: 3, overflow: 'auto' }}>
          <MonoCaps size={9}>chapters · gates</MonoCaps>
          <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {GATES.map((g, i) => {
              const done = i < activeGate;
              const active = i === activeGate;
              const pending = i > activeGate;
              return (
                <Box key={g.key} sx={{ display: 'flex', alignItems: 'baseline', gap: 1.4, opacity: pending ? 0.3 : 1, transition: 'opacity 400ms' }}>
                  <Typography
                    sx={{
                      fontFamily: FONT_DISPLAY,
                      fontStyle: 'italic',
                      fontSize: 16,
                      color: active ? COLOR_INK : COLOR_INK_MUTED,
                      minWidth: 24,
                      textAlign: 'right',
                      fontVariationSettings: '"opsz" 36',
                    }}
                  >
                    {g.romanNumeral}
                  </Typography>
                  <Box sx={{ flex: 1, position: 'relative' }}>
                    <Typography
                      sx={{
                        fontFamily: FONT_BODY,
                        fontStyle: 'italic',
                        fontSize: 13.5,
                        color: active ? COLOR_INK : done ? COLOR_INK_MUTED : COLOR_INK_FAINT,
                        lineHeight: 1.3,
                        textDecoration: done ? 'line-through' : 'none',
                        textDecorationColor: COLOR_INK_FAINT,
                        textDecorationThickness: '0.5px',
                      }}
                    >
                      {g.title}
                    </Typography>
                    {active && (
                      <motion.div
                        layoutId="active-pointer"
                        style={{
                          position: 'absolute',
                          left: -12,
                          top: 6,
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          backgroundColor: COLOR_INK,
                        }}
                      />
                    )}
                  </Box>
                  {done && (
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, letterSpacing: '0.18em' }}>
                      ✓
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Center: active chapter */}
        <Box sx={{ position: 'relative', overflow: 'hidden' }}>
          <Box sx={{ height: '100%', overflowY: 'auto', px: 6, py: 5 }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={`gate-${activeGate}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.5 }}
              >
                <MonoCaps size={9.5}>chapter {gate.romanNumeral}</MonoCaps>
                <Typography
                  sx={{
                    fontFamily: FONT_DISPLAY,
                    fontStyle: 'italic',
                    fontSize: 56,
                    color: COLOR_INK,
                    lineHeight: 1,
                    letterSpacing: '-0.025em',
                    mt: 1.5,
                    mb: 4,
                    fontVariationSettings: '"opsz" 144, "SOFT" 60, "WONK" 1',
                    fontWeight: 600,
                  }}
                >
                  {gate.title}
                </Typography>

                {/* Streaming thought paragraphs with marginalia in gutter */}
                <Box sx={{ position: 'relative', maxWidth: 640 }}>
                  {gate.thinking.map((paragraph, idx) => {
                    const visible = idx < thinkingProgress;
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: visible ? 1 : 0 }}
                        transition={{ duration: 0.5 }}
                        style={{ marginBottom: 14, position: 'relative' }}
                      >
                        <ItalicSerif size={17} color={COLOR_INK}>
                          {paragraph}
                          {idx === thinkingProgress - 1 && (
                            <motion.span
                              animate={{ opacity: [1, 0.2, 1] }}
                              transition={{ duration: 0.9, repeat: Infinity }}
                              style={{
                                display: 'inline-block',
                                width: 8,
                                height: 18,
                                backgroundColor: COLOR_INK,
                                marginLeft: 4,
                                verticalAlign: 'text-bottom',
                              }}
                            />
                          )}
                        </ItalicSerif>
                      </motion.div>
                    );
                  })}

                  {/* Tool call marginalia — to the right of thinking text */}
                  <Box sx={{ position: 'absolute', top: 0, left: 'calc(100% + 32px)', width: 240 }}>
                    {gate.tools.slice(0, visibleTools).map((tool, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, delay: idx * 0.08 }}
                        style={{ marginBottom: 18, position: 'relative' }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8, mb: 0.5 }}>
                          <Box sx={{ width: 16, height: 1, bgcolor: SOURCE_COLORS[tool.source] }} />
                          <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: SOURCE_COLORS[tool.source], letterSpacing: '0.18em', fontWeight: 600 }}>
                            ↦ {SOURCE_LABELS[tool.source]}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 11.5, color: COLOR_INK_MUTED, lineHeight: 1.45, mb: 0.4 }}>
                          {tool.query}
                        </Typography>
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK, lineHeight: 1.5, fontFeatureSettings: '"tnum"' }}>
                          {tool.result}
                        </Typography>
                        {tool.date && (
                          <Typography sx={{ fontFamily: FONT_MONO, fontSize: 8.5, color: COLOR_INK_FAINT, letterSpacing: '0.18em', mt: 0.4, fontFeatureSettings: '"tnum"' }}>
                            FILED · {tool.date}
                          </Typography>
                        )}
                      </motion.div>
                    ))}
                  </Box>
                </Box>
              </motion.div>
            </AnimatePresence>
          </Box>
        </Box>

        {/* Right: source ledger */}
        <Box sx={{ borderLeft: `1px solid ${COLOR_INK_FAINT}33`, py: 4, px: 3, overflow: 'auto', bgcolor: 'rgba(0,0,0,0.12)' }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 2.5 }}>
            <MonoCaps size={9}>source ledger</MonoCaps>
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_MUTED, fontFeatureSettings: '"tnum"' }}>
              {catalogVisible} entries
            </Typography>
          </Box>
          <Box>
            {CATALOG.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: i < catalogVisible ? 1 : 0, x: i < catalogVisible ? 0 : 8 }}
                transition={{ duration: 0.4 }}
              >
                {i < catalogVisible && <SourceChip entry={entry} />}
              </motion.div>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Bottom hash progress */}
      <Box sx={{ flexShrink: 0, px: 5, py: 2, borderTop: `1px solid ${COLOR_INK_FAINT}44`, display: 'flex', alignItems: 'center', gap: 3 }}>
        <MonoCaps size={9}>progress</MonoCaps>
        <Box sx={{ display: 'flex', gap: 1.2, flex: 1 }}>
          {GATES.map((g, i) => {
            const done = i < activeGate;
            const active = i === activeGate;
            return (
              <Box key={g.key} sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                <Box
                  sx={{
                    height: 2,
                    bgcolor: done || active ? COLOR_INK : COLOR_INK_FAINT,
                    transition: 'background-color 600ms',
                    position: 'relative',
                    '&::after': active
                      ? {
                          content: '""',
                          position: 'absolute',
                          top: -2,
                          right: 0,
                          width: 2,
                          height: 6,
                          bgcolor: COLOR_INK,
                          animation: 'composing-pulse 1s ease-in-out infinite',
                          '@keyframes composing-pulse': {
                            '0%, 100%': { opacity: 1 },
                            '50%': { opacity: 0.3 },
                          },
                        }
                      : undefined,
                  }}
                />
                <Typography
                  sx={{
                    fontFamily: FONT_MONO,
                    fontSize: 8.5,
                    letterSpacing: '0.18em',
                    color: active ? COLOR_INK : done ? COLOR_INK_MUTED : COLOR_INK_FAINT,
                  }}
                >
                  {g.romanNumeral} · {g.title}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </motion.div>
  );
}

// ─── Phase: Filed ─────────────────────────────────────────────────────────

function FiledPhase({ symbol, onReplay }: { symbol: string; onReplay: () => void }) {
  return (
    <motion.div
      key="filed"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
      style={{ height: '100%', overflow: 'auto' }}
    >
      <Box sx={{ maxWidth: 1180, mx: 'auto', px: 6, py: 6 }}>
        {/* Folio header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4, pb: 2, borderBottom: `1px solid ${COLOR_INK_FAINT}` }}>
          <MonoCaps>archive · filed 2026/04/30 · folio 04/30/A</MonoCaps>
          <Box
            onClick={onReplay}
            sx={{
              fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_MUTED, letterSpacing: '0.28em',
              textTransform: 'uppercase', cursor: 'pointer', '&:hover': { color: COLOR_INK },
            }}
          >
            ↻ replay
          </Box>
        </Box>

        {/* Front-page layout: stamped verdict + giant subject + key findings columns */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, alignItems: 'start' }}>
          <Box>
            <MonoCaps size={10}>verdict</MonoCaps>
            <Box sx={{ mt: 2, mb: 4 }}>
              <StampedVerdict action="BUY" conviction={0.7} />
            </Box>
            <Typography
              sx={{
                fontFamily: FONT_DISPLAY,
                fontStyle: 'italic',
                fontSize: 96,
                color: COLOR_INK,
                lineHeight: 0.92,
                letterSpacing: '-0.04em',
                fontVariationSettings: '"opsz" 144, "SOFT" 60',
                fontWeight: 600,
              }}
            >
              {symbol}
            </Typography>
            <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 22, color: COLOR_INK_MUTED, mt: 1 }}>
              Alphabet Inc.
            </Typography>
            <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 16, color: COLOR_INK, mt: 4, lineHeight: 1.7, maxWidth: 480 }}>
              <ItalicSerif size={16} color={COLOR_INK}>
                宽护城河叠加优秀利润率，估值合理偏稍贵，但反垄断阴影需要折扣
                <sup style={{ fontSize: 10, color: COLOR_NEUTRAL, marginLeft: 2 }}>[6]</sup>。
                若 PE 回到 20× 是更舒服的入场区间
                <sup style={{ fontSize: 10, color: COLOR_GAIN, marginLeft: 2 }}>[10]</sup>。
                AI 是强化而非颠覆 Google 的核心
                <sup style={{ fontSize: 10, color: COLOR_ACCENT, marginLeft: 2 }}>[9]</sup>，
                但 LLM-replaces-search 概率 25% 仍是最大下行尾巴。
              </ItalicSerif>
            </Typography>
          </Box>

          <Box>
            <MonoCaps size={10}>七章摘要 · seven chapters</MonoCaps>
            <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: '1fr', gap: 2.4 }}>
              {GATES.map((g) => (
                <Box key={g.key} sx={{ pb: 2, borderBottom: `1px dashed ${COLOR_INK_FAINT}55` }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 0.6 }}>
                    <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 20, color: COLOR_INK_MUTED, minWidth: 24, fontVariationSettings: '"opsz" 36' }}>
                      {g.romanNumeral}
                    </Typography>
                    <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 18, color: COLOR_INK, fontVariationSettings: '"opsz" 36' }}>
                      {g.title}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 13, color: COLOR_INK, lineHeight: 1.55, ml: 4.5 }}>
                    {g.finding}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* ── Featured K-line: 9-month price + verdict timeline ── */}
        <Box sx={{ mt: 8, pt: 4, borderTop: `1px solid ${COLOR_INK_FAINT}` }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.6 }}>
              <MonoCaps size={10}>price · verdict timeline</MonoCaps>
              <ItalicSerif size={13} color={COLOR_INK_MUTED}>nine months · daily candles</ItalicSerif>
            </Box>
            <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'baseline' }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.6 }}>
                <MonoCaps size={9}>last</MonoCaps>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 16, color: COLOR_INK, fontFeatureSettings: '"tnum"' }}>
                  {SERIES[SERIES.length - 1].c.toFixed(2)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.6 }}>
                <MonoCaps size={9}>9m</MonoCaps>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 14, color: COLOR_GAIN, fontFeatureSettings: '"tnum"' }}>
                  +{(((SERIES[SERIES.length - 1].c - SERIES[0].o) / SERIES[0].o) * 100).toFixed(1)}%
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.6 }}>
                <MonoCaps size={9}>52w hi/lo</MonoCaps>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 12, color: COLOR_INK_MUTED, fontFeatureSettings: '"tnum"' }}>
                  {Math.max(...SERIES.map(s => s.h)).toFixed(0)} / {Math.min(...SERIES.map(s => s.l)).toFixed(0)}
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Chart canvas */}
          <Box sx={{ position: 'relative', mt: 1 }}>
            <EditorialCandlestick
              data={SERIES}
              width={1080}
              height={260}
              pins={PRIOR_VERDICTS}
              showAxes={true}
              showPins={true}
            />
          </Box>

          {/* Verdict timeline legend below chart */}
          <Box sx={{ display: 'flex', gap: 4, mt: 3, pt: 2, borderTop: `1px dashed ${COLOR_INK_FAINT}33` }}>
            <MonoCaps size={9}>prior verdicts</MonoCaps>
            <Box sx={{ flex: 1, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {PRIOR_VERDICTS.map((p, i) => {
                const color = p.action === 'BUY' ? COLOR_GAIN : p.action === 'AVOID' ? COLOR_LOSS : COLOR_NEUTRAL;
                const isCurrent = i === PRIOR_VERDICTS.length - 1;
                return (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: COLOR_INK_FAINT, letterSpacing: '0.14em', fontFeatureSettings: '"tnum"' }}>
                      {p.date}
                    </Typography>
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color, letterSpacing: '0.18em', fontWeight: isCurrent ? 700 : 500 }}>
                      {p.action}
                    </Typography>
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: COLOR_INK_MUTED, fontFeatureSettings: '"tnum"' }}>
                      ·{p.conviction.toFixed(2)}
                    </Typography>
                    <ItalicSerif size={11.5} color={COLOR_INK_FAINT}>{p.model}</ItalicSerif>
                    {isCurrent && (
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 8, color: COLOR_INK, letterSpacing: '0.32em', ml: 0.5 }}>
                        ← TODAY
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>

        {/* Source ledger footer */}
        <Box sx={{ mt: 8, pt: 4, borderTop: `1px solid ${COLOR_INK_FAINT}` }}>
          <MonoCaps>source ledger · {CATALOG.length} entries</MonoCaps>
          <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', columnGap: 6, rowGap: 0 }}>
            {CATALOG.map((entry) => (
              <SourceChip key={entry.id} entry={entry} />
            ))}
          </Box>
        </Box>
      </Box>
    </motion.div>
  );
}

// ─── Phase: Studio ────────────────────────────────────────────────────────

function fmtElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function StudioPhase({
  watchlist,
  running,
  log,
  onExecute,
  onAbort,
  onOpenJob,
  onOpenLog,
  onNew,
  onPeek,
  peekSymbol,
  onClosePeek,
}: {
  watchlist: WatchItem[];
  running: RunningJob[];
  log: LogEntry[];
  onExecute: (symbol: string) => void;
  onAbort: (jobId: string) => void;
  onOpenJob: (jobId: string) => void;
  onOpenLog: (entryId: string) => void;
  onNew: () => void;
  onPeek: (symbol: string) => void;
  peekSymbol: string | null;
  onClosePeek: () => void;
}) {
  return (
    <motion.div
      key="studio"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {/* Studio masthead */}
      <Box
        sx={{
          flexShrink: 0,
          px: 5,
          py: 2.5,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${COLOR_INK_FAINT}44`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 32, color: COLOR_INK, letterSpacing: '-0.025em', lineHeight: 1, fontVariationSettings: '"opsz" 144, "SOFT" 60' }}>
            研究台
          </Typography>
          <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 16, color: COLOR_INK_MUTED }}>
            Studio
          </Typography>
          <MonoCaps>关注 {watchlist.length} · 在跑 {running.length} · 历史 {log.length}</MonoCaps>
        </Box>
        <Box
          onClick={onNew}
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

      {/* Three columns */}
      <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr 360px', overflow: 'hidden' }}>
        {/* ── Watchlist ── */}
        <Box sx={{ borderRight: `1px solid ${COLOR_INK_FAINT}33`, py: 3.5, px: 3, overflow: 'auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 2 }}>
            <MonoCaps size={9.5}>关注列表 · watchlist</MonoCaps>
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, letterSpacing: '0.18em' }}>+ 添加</Typography>
          </Box>
          <Box>
            {watchlist.map((item, idx) => {
              const verdictColor = item.lastVerdict === 'BUY' ? COLOR_GAIN : item.lastVerdict === 'AVOID' ? COLOR_LOSS : item.lastVerdict === 'WATCH' ? COLOR_NEUTRAL : COLOR_INK_FAINT;
              const isRunning = running.some(r => r.symbol === item.symbol);
              return (
                <Box
                  key={item.symbol}
                  sx={{
                    py: 1.6,
                    borderBottom: idx < watchlist.length - 1 ? `1px dashed ${COLOR_INK_FAINT}33` : 'none',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.2,
                    cursor: isRunning ? 'default' : 'pointer',
                    opacity: isRunning ? 0.5 : 1,
                    transition: 'all 200ms',
                    '&:hover': isRunning ? {} : { bgcolor: 'rgba(244,236,223,0.025)', mx: -1, px: 1 },
                  }}
                >
                  {/* Verdict swatch */}
                  <Box sx={{ width: 3, alignSelf: 'stretch', bgcolor: verdictColor, opacity: item.lastVerdict ? 1 : 0.2, mt: 0.4, flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.3 }}>
                      <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 17, color: COLOR_INK, letterSpacing: '-0.005em', fontVariationSettings: '"opsz" 36' }}>
                        {item.symbol}
                      </Typography>
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 11, color: item.changePct >= 0 ? COLOR_GAIN : COLOR_LOSS, fontFeatureSettings: '"tnum"' }}>
                        {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.6 }}>
                      <ItalicSerif size={11.5} color={COLOR_INK_FAINT}>{item.name}</ItalicSerif>
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 11, color: COLOR_INK_MUTED, fontFeatureSettings: '"tnum"' }}>
                        ${item.price.toFixed(2)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.6 }}>
                      {item.lastVerdict ? (
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: verdictColor, letterSpacing: '0.18em', fontWeight: 600 }}>
                          {item.lastVerdict} · {item.reanalyses}×
                        </Typography>
                      ) : (
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, letterSpacing: '0.18em', fontStyle: 'italic' }}>
                          未研究
                        </Typography>
                      )}
                      <Box sx={{ flex: 1 }} />
                      {/* K-line peek button */}
                      <Box
                        onClick={(e) => { e.stopPropagation(); onPeek(item.symbol); }}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.4,
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
                        {/* tiny inline candle glyph */}
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
                          onClick={(e) => { e.stopPropagation(); onExecute(item.symbol); }}
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

        {/* ── Active queue ── */}
        <Box sx={{ p: 4, overflow: 'auto' }}>
          {/* Inline chart panel (shows when a watchlist row's K button is clicked) */}
          <AnimatePresence>
            {peekSymbol && (
              <InlineChartPanel
                symbol={peekSymbol}
                onClose={onClosePeek}
                onDraft={(sym) => { onClosePeek(); onExecute(sym); }}
                watchlist={watchlist}
              />
            )}
          </AnimatePresence>

          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
              <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 22, color: COLOR_INK, letterSpacing: '-0.015em', fontVariationSettings: '"opsz" 72, "SOFT" 60' }}>
                正在起草
              </Typography>
              <ItalicSerif size={13} color={COLOR_INK_MUTED}>active drafts · {running.length}</ItalicSerif>
            </Box>
            <MonoCaps size={9}>后台执行 · 异步</MonoCaps>
          </Box>

          {running.length === 0 && (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <ItalicSerif size={18} color={COLOR_INK_FAINT}>
                — 暂无在跑研究 —
              </ItalicSerif>
              <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 12, color: COLOR_INK_FAINT, mt: 1.2 }}>
                从左侧关注列表点"起草"，或右上角"起草新研究"。
              </Typography>
            </Box>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {running.map((job) => {
              const pct = ((job.currentGate + 1) / GATES.length) * 100;
              const gate = GATES[Math.min(job.currentGate, GATES.length - 1)];
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
                    onClick={() => onOpenJob(job.id)}
                    sx={{
                      border: `1px solid ${COLOR_INK_FAINT}55`,
                      bgcolor: 'rgba(244,236,223,0.025)',
                      p: 3,
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 200ms',
                      '&:hover': { borderColor: COLOR_INK_MUTED, bgcolor: 'rgba(244,236,223,0.05)' },
                    }}
                  >
                    {/* Header row */}
                    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.4 }}>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.6 }}>
                        <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 30, color: COLOR_INK, letterSpacing: '-0.015em', lineHeight: 1, fontVariationSettings: '"opsz" 144, "WONK" 1', fontWeight: 600 }}>
                          {job.symbol}
                        </Typography>
                        <ItalicSerif size={14} color={COLOR_INK_MUTED}>{job.name}</ItalicSerif>
                        <MonoCaps size={9}>{job.model} · as_of {job.asOf}</MonoCaps>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 13, color: COLOR_INK, fontFeatureSettings: '"tnum"' }}>
                          {fmtElapsed(job.elapsed)}
                        </Typography>
                        <Typography
                          onClick={(e) => { e.stopPropagation(); onAbort(job.id); }}
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

                    {/* Gate progress bar */}
                    <Box sx={{ display: 'flex', gap: 0.6, mb: 1 }}>
                      {GATES.map((g, i) => {
                        const done = i < job.currentGate;
                        const active = i === job.currentGate;
                        return (
                          <Box
                            key={g.key}
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
                                animation: 'gate-shimmer 1.4s ease-in-out infinite',
                                '@keyframes gate-shimmer': {
                                  '0%, 100%': { opacity: 0.6 },
                                  '50%': { opacity: 1 },
                                },
                              } : undefined,
                            }}
                          />
                        );
                      })}
                    </Box>

                    {/* Status line */}
                    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.2 }}>
                        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: COLOR_INK_FAINT, letterSpacing: '0.18em' }}>
                          {pct.toFixed(0)}% · GATE {job.currentGate + 1}/{GATES.length}
                        </Typography>
                        <ItalicSerif size={13} color={COLOR_INK}>{gate.romanNumeral}. {gate.title}</ItalicSerif>
                      </Box>
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: COLOR_INK_MUTED, letterSpacing: '0.18em' }}>
                        点击查看 →
                      </Typography>
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
              {log.length} entries
            </Typography>
          </Box>
          <Box>
            {log.map((entry, idx) => {
              const color = entry.action === 'BUY' ? COLOR_GAIN : entry.action === 'AVOID' ? COLOR_LOSS : COLOR_NEUTRAL;
              return (
                <Box
                  key={entry.id}
                  onClick={() => onOpenLog(entry.id)}
                  sx={{
                    py: 1.4,
                    borderBottom: idx < log.length - 1 ? `1px dashed ${COLOR_INK_FAINT}33` : 'none',
                    cursor: 'pointer',
                    transition: 'all 200ms',
                    '&:hover': { bgcolor: 'rgba(244,236,223,0.03)', mx: -1, px: 1 },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.2, mb: 0.4 }}>
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, fontFeatureSettings: '"tnum"', minWidth: 90 }}>
                      {entry.date}
                    </Typography>
                    <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 14, color: COLOR_INK, fontVariationSettings: '"opsz" 36' }}>
                      {entry.symbol}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color, letterSpacing: '0.18em', fontWeight: 600 }}>
                      {entry.action}
                    </Typography>
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_MUTED, fontFeatureSettings: '"tnum"' }}>
                      ·{entry.conviction.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, ml: 0.5 }}>
                    <ItalicSerif size={11} color={COLOR_INK_FAINT}>{entry.model}</ItalicSerif>
                    <Box sx={{ flex: 1 }} />
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, fontFeatureSettings: '"tnum"', letterSpacing: '0.14em' }}>
                      {entry.duration} · {entry.citations} src
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    </motion.div>
  );
}

// ─── Inline chart panel (sits inside Studio center column) ────────────────

function InlineChartPanel({
  symbol,
  onClose,
  onDraft,
  watchlist,
}: {
  symbol: string;
  onClose: () => void;
  onDraft: (symbol: string) => void;
  watchlist: WatchItem[];
}) {
  const item = watchlist.find((w) => w.symbol === symbol);
  if (!item) return null;
  const verdictColor =
    item.lastVerdict === 'BUY' ? COLOR_GAIN : item.lastVerdict === 'AVOID' ? COLOR_LOSS : item.lastVerdict === 'WATCH' ? COLOR_NEUTRAL : COLOR_INK_FAINT;

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
        {/* Header */}
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
              {item.symbol}
            </Typography>
            <ItalicSerif size={14} color={COLOR_INK_MUTED}>{item.name}</ItalicSerif>
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 14, color: COLOR_INK, fontFeatureSettings: '"tnum"', ml: 1 }}>
              ${item.price.toFixed(2)}
            </Typography>
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 12, color: item.changePct >= 0 ? COLOR_GAIN : COLOR_LOSS, fontFeatureSettings: '"tnum"' }}>
              {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
            </Typography>
            {item.lastVerdict && (
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.6, ml: 1 }}>
                <MonoCaps size={9}>last verdict</MonoCaps>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: verdictColor, letterSpacing: '0.2em', fontWeight: 600 }}>
                  {item.lastVerdict}
                </Typography>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, fontFeatureSettings: '"tnum"' }}>
                  {item.lastVerdictDate}
                </Typography>
              </Box>
            )}
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

        {/* TradingView chart — referenced from /company-agent */}
        <Box sx={{ height: 380, position: 'relative' }}>
          <TradingViewChart symbol={symbol} />
        </Box>
      </Box>
    </motion.div>
  );
}

// (kept for reference — unused now)
function KPeekModal({
  symbol,
  onClose,
  watchlist,
}: {
  symbol: string;
  onClose: () => void;
  watchlist: WatchItem[];
}) {
  const item = watchlist.find((w) => w.symbol === symbol);
  if (!item) return null;
  const series = makeSymbolSeries(symbol, item.changePct, 180);
  const lastClose = series[series.length - 1].c;
  const firstOpen = series[0].o;
  const totalPct = ((lastClose - firstOpen) / firstOpen) * 100;
  const high = Math.max(...series.map((s) => s.h));
  const low = Math.min(...series.map((s) => s.l));
  const verdictColor =
    item.lastVerdict === 'BUY' ? COLOR_GAIN : item.lastVerdict === 'AVOID' ? COLOR_LOSS : item.lastVerdict === 'WATCH' ? COLOR_NEUTRAL : COLOR_INK_FAINT;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Scrim */}
      <Box
        onClick={onClose}
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: 'rgba(15,12,9,0.78)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Card */}
      <motion.div
        initial={{ scale: 0.96, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.97, y: 8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        style={{ position: 'relative', zIndex: 1 }}
      >
        <Box
          sx={{
            width: 1080,
            maxWidth: '92vw',
            bgcolor: COLOR_BG,
            border: `1px solid ${COLOR_INK_FAINT}66`,
            boxShadow: '0 36px 80px rgba(0,0,0,0.6)',
            position: 'relative',
            overflow: 'hidden',
            backgroundImage: BACKGROUND_PAPER,
          }}
        >
          {/* Header bar */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 3,
              px: 5,
              pt: 3.5,
              pb: 2.5,
              borderBottom: `1px solid ${COLOR_INK_FAINT}33`,
            }}
          >
            <Box>
              <MonoCaps size={9.5}>price · 9 months · daily candles</MonoCaps>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2.5, mt: 1 }}>
                <Typography
                  sx={{
                    fontFamily: FONT_DISPLAY,
                    fontStyle: 'italic',
                    fontSize: 56,
                    color: COLOR_INK,
                    lineHeight: 0.9,
                    letterSpacing: '-0.025em',
                    fontVariationSettings: '"opsz" 144, "SOFT" 60, "WONK" 1',
                    fontWeight: 600,
                  }}
                >
                  {item.symbol}
                </Typography>
                <ItalicSerif size={18} color={COLOR_INK_MUTED}>{item.name}</ItalicSerif>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <Box>
                <MonoCaps size={9}>last · 04/29</MonoCaps>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 22, color: COLOR_INK, fontFeatureSettings: '"tnum"', mt: 0.4 }}>
                  ${item.price.toFixed(2)}
                </Typography>
              </Box>
              <Box>
                <MonoCaps size={9}>today</MonoCaps>
                <Typography
                  sx={{
                    fontFamily: FONT_MONO,
                    fontSize: 22,
                    color: item.changePct >= 0 ? COLOR_GAIN : COLOR_LOSS,
                    fontFeatureSettings: '"tnum"',
                    mt: 0.4,
                  }}
                >
                  {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
                </Typography>
              </Box>
              <Box>
                <MonoCaps size={9}>9m</MonoCaps>
                <Typography
                  sx={{
                    fontFamily: FONT_MONO,
                    fontSize: 14,
                    color: totalPct >= 0 ? COLOR_GAIN : COLOR_LOSS,
                    fontFeatureSettings: '"tnum"',
                    mt: 0.4,
                  }}
                >
                  {totalPct >= 0 ? '+' : ''}{totalPct.toFixed(1)}%
                </Typography>
              </Box>
              <Box>
                <MonoCaps size={9}>52w hi/lo</MonoCaps>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 14, color: COLOR_INK_MUTED, fontFeatureSettings: '"tnum"', mt: 0.4 }}>
                  {high.toFixed(0)} / {low.toFixed(0)}
                </Typography>
              </Box>

              {/* Close */}
              <Box
                onClick={onClose}
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: 12,
                  color: COLOR_INK_MUTED,
                  letterSpacing: '0.32em',
                  cursor: 'pointer',
                  ml: 1,
                  alignSelf: 'flex-start',
                  '&:hover': { color: COLOR_INK },
                }}
              >
                ✕
              </Box>
            </Box>
          </Box>

          {/* Chart */}
          <Box sx={{ p: 4 }}>
            <EditorialCandlestick
              data={series}
              width={1000}
              height={300}
              showAxes={true}
              showPins={false}
            />
          </Box>

          {/* Footer */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 3,
              px: 5,
              py: 2.4,
              borderTop: `1px solid ${COLOR_INK_FAINT}33`,
              bgcolor: 'rgba(0,0,0,0.2)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.6 }}>
              <MonoCaps size={9}>最近一次研究</MonoCaps>
              {item.lastVerdict ? (
                <>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 11, color: verdictColor, letterSpacing: '0.2em', fontWeight: 600 }}>
                    {item.lastVerdict}
                  </Typography>
                  <ItalicSerif size={12} color={COLOR_INK_MUTED}>
                    {item.lastVerdictDate} · {item.reanalyses}× 历史分析
                  </ItalicSerif>
                </>
              ) : (
                <ItalicSerif size={12} color={COLOR_INK_FAINT}>暂未研究过</ItalicSerif>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Typography
                onClick={onClose}
                sx={{
                  fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_MUTED, letterSpacing: '0.28em',
                  textTransform: 'uppercase', cursor: 'pointer', px: 2, py: 0.8,
                  border: `1px solid ${COLOR_INK_FAINT}66`,
                  '&:hover': { color: COLOR_INK, borderColor: COLOR_INK },
                }}
              >
                关闭
              </Typography>
              <Typography
                onClick={onClose}
                sx={{
                  fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.28em',
                  textTransform: 'uppercase', cursor: 'pointer', px: 2, py: 0.8,
                  color: COLOR_BG, bgcolor: COLOR_INK,
                  '&:hover': { bgcolor: '#FFF8EA' },
                }}
              >
                起草研究 →
              </Typography>
            </Box>
          </Box>
        </Box>
      </motion.div>
    </motion.div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────

export default function CompanyConversationDemo() {
  const [phase, setPhase] = useState<Phase>('studio');
  const [activeGate, setActiveGate] = useState(0);
  const [thinkingProgress, setThinkingProgress] = useState(0);
  const [visibleTools, setVisibleTools] = useState(0);
  const [catalogVisible, setCatalogVisible] = useState(0);

  // ─── Studio state (background queue + log) ───
  const [watchlist] = useState<WatchItem[]>(WATCHLIST_SEED);
  const [running, setRunning] = useState<RunningJob[]>(RUNNING_SEED);
  const [log, setLog] = useState<LogEntry[]>(LOG_SEED);
  const [kPeek, setKPeek] = useState<string | null>(null);

  // Esc closes peek
  useEffect(() => {
    if (!kPeek) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setKPeek(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kPeek]);

  // Studio jobs tick: every 1.5s advance each job 1 second of elapsed,
  // and every ~12s advance one gate. When a job finishes 7 gates, move to log.
  useEffect(() => {
    if (phase !== 'studio') return; // pause when user is reading a job
    const tickElapsed = setInterval(() => {
      setRunning((rs) =>
        rs.map((r) => ({
          ...r,
          elapsed: r.elapsed + 1,
          // Auto-advance gate every 12 elapsed seconds (mock)
          currentGate: Math.min(GATES.length - 1, Math.floor((r.elapsed + 1) / 12)),
        })),
      );
    }, 1500);
    return () => clearInterval(tickElapsed);
  }, [phase]);

  // When a running job completes 7 gates, retire it to the log
  useEffect(() => {
    setRunning((rs) => {
      const completed = rs.filter((r) => r.currentGate >= GATES.length - 1 && r.elapsed >= GATES.length * 12 + 4);
      if (completed.length === 0) return rs;
      const newLog: LogEntry[] = completed.map((c) => ({
        id: `auto-${c.id}`,
        symbol: c.symbol,
        name: c.name,
        model: c.model,
        date: new Date().toISOString().slice(0, 16).replace('T', ' '),
        duration: fmtElapsed(c.elapsed),
        action: 'WATCH',
        conviction: 0.55 + Math.random() * 0.25,
        citations: 32 + Math.floor(Math.random() * 24),
      }));
      setLog((l) => [...newLog, ...l]);
      return rs.filter((r) => !completed.some((c) => c.id === r.id));
    });
  }, [running]);

  // Auto-advance from request → composing
  usePhaseClock(phase, () => {
    if (phase === 'request') setPhase('composing');
  });

  // Composing engine: per-gate progression
  useEffect(() => {
    if (phase !== 'composing') return;
    const gate = GATES[activeGate];

    setThinkingProgress(0);
    setVisibleTools(0);

    const thinkSteps = gate.thinking.length;
    const toolSteps = gate.tools.length;

    let cancelled = false;

    (async () => {
      // Reveal thinking paragraphs
      for (let i = 1; i <= thinkSteps; i++) {
        await new Promise((r) => setTimeout(r, 600));
        if (cancelled) return;
        setThinkingProgress(i);
      }
      // Reveal tools (and grow catalog as each lands)
      for (let i = 1; i <= toolSteps; i++) {
        await new Promise((r) => setTimeout(r, 450));
        if (cancelled) return;
        setVisibleTools(i);
        setCatalogVisible((c) => Math.min(c + 1, CATALOG.length));
      }
      // Pause at chapter end
      await new Promise((r) => setTimeout(r, 1000));
      if (cancelled) return;

      if (activeGate < GATES.length - 1) {
        setActiveGate((g) => g + 1);
      } else {
        setPhase('filed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, activeGate]);

  const handleReplay = () => {
    setActiveGate(0);
    setThinkingProgress(0);
    setVisibleTools(0);
    setCatalogVisible(0);
    setPhase('studio');
  };

  const handleSkip = (target: Phase) => {
    if (target === 'studio') {
      setPhase('studio');
    } else if (target === 'request') {
      setActiveGate(0);
      setThinkingProgress(0);
      setVisibleTools(0);
      setCatalogVisible(0);
      setPhase('request');
    } else if (target === 'composing') {
      setActiveGate(0);
      setThinkingProgress(0);
      setVisibleTools(0);
      setCatalogVisible(0);
      setPhase('composing');
    } else {
      setActiveGate(GATES.length - 1);
      setThinkingProgress(GATES[GATES.length - 1].thinking.length);
      setVisibleTools(0);
      setCatalogVisible(CATALOG.length);
      setPhase('filed');
    }
  };

  return (
    <Box
      sx={{
        height: '100vh',
        width: '100vw',
        bgcolor: COLOR_BG,
        backgroundImage: BACKGROUND_PAPER,
        color: COLOR_INK,
        fontFamily: FONT_BODY,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Demo control strip */}
      <Box
        sx={{
          flexShrink: 0,
          px: 4,
          py: 1.4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${COLOR_INK_FAINT}33`,
          bgcolor: COLOR_BG_RAISED,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <Typography
            sx={{
              fontFamily: FONT_DISPLAY,
              fontStyle: 'italic',
              fontSize: 18,
              color: COLOR_INK,
              letterSpacing: '-0.01em',
              fontVariationSettings: '"opsz" 36',
            }}
          >
            Composition Desk
          </Typography>
          <MonoCaps size={9.5}>demo · /demo/company-conversation</MonoCaps>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {(['studio', 'request', 'composing', 'filed'] as Phase[]).map((p) => (
            <Box
              key={p}
              onClick={() => handleSkip(p)}
              sx={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: phase === p ? COLOR_INK : COLOR_INK_FAINT,
                px: 1.6,
                py: 0.5,
                cursor: 'pointer',
                borderBottom: phase === p ? `1px solid ${COLOR_INK}` : '1px solid transparent',
                '&:hover': { color: COLOR_INK },
              }}
            >
              {p}
            </Box>
          ))}
          <Box
            onClick={handleReplay}
            sx={{
              fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.24em',
              textTransform: 'uppercase', color: COLOR_INK_MUTED, ml: 1.5,
              cursor: 'pointer', '&:hover': { color: COLOR_INK },
            }}
          >
            ↻ replay
          </Box>
        </Box>
      </Box>

      {/* Phase canvas */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {phase === 'studio' && (
            <StudioPhase
              watchlist={watchlist}
              running={running}
              log={log}
              onExecute={(symbol) => {
                const item = watchlist.find((w) => w.symbol === symbol);
                if (!item) return;
                const newJob: RunningJob = {
                  id: `job-${Date.now()}`,
                  symbol: item.symbol,
                  name: item.name,
                  model: 'claude-sonnet',
                  startedAt: Date.now(),
                  currentGate: 0,
                  elapsed: 0,
                  asOf: '2026-04-30',
                };
                setRunning((rs) => [newJob, ...rs]);
              }}
              onAbort={(jobId) => setRunning((rs) => rs.filter((r) => r.id !== jobId))}
              onOpenJob={(_jobId) => {
                // For demo: jump into composition desk for any running job
                handleSkip('composing');
              }}
              onOpenLog={(_entryId) => {
                handleSkip('filed');
              }}
              onNew={() => handleSkip('request')}
              onPeek={(symbol) => setKPeek((cur) => (cur === symbol ? null : symbol))}
              peekSymbol={kPeek}
              onClosePeek={() => setKPeek(null)}
            />
          )}
          {phase === 'request' && (
            <RequestPhase symbol="GOOGL" onSubmit={() => setPhase('composing')} />
          )}
          {phase === 'composing' && (
            <ComposingPhase
              symbol="GOOGL"
              activeGate={activeGate}
              thinkingProgress={thinkingProgress}
              visibleTools={visibleTools}
              catalogVisible={catalogVisible}
              onComplete={() => setPhase('filed')}
            />
          )}
          {phase === 'filed' && <FiledPhase symbol="GOOGL" onReplay={handleReplay} />}
        </AnimatePresence>
      </Box>

    </Box>
  );
}
