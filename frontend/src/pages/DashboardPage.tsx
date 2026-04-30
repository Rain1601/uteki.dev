import { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, ArrowUpRight, Sparkle, Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import PortfolioPie from '../components/snb/PortfolioPie';
import {
  getEvalOverview,
  getLeaderboard,
  getDecisions,
  getCompanyAnalyses,
  type EvalOverview,
  type LeaderboardEntry,
  type DecisionItem,
  type CompanyAnalysis,
} from '../api/dashboard';
import {
  fetchBalance,
  fetchPositions,
  type SnbBalance,
  type SnbPosition,
} from '../api/snb';
import { getLatestNews } from '../api/news';
import type { NewsItem } from '../types/news';

// ── Editorial type stack ──────────────────────────────────────────────────
const FONT_DISPLAY = "'Fraunces', 'Newsreader', '宋体', 'STSong', Georgia, serif";
const FONT_BODY = "'Newsreader', '宋体', 'STSong', Georgia, serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

const COLOR_GAIN = '#6FAF8D';
const COLOR_LOSS = '#B0524A';
const COLOR_NEUTRAL = '#C9A97E';
const COLOR_INK = '#F4ECDF';
const COLOR_INK_MUTED = '#A8A097';
const COLOR_INK_FAINT = '#5C5750';
const COLOR_BG = '#15130F';

const fmtUsd = (v: number | null | undefined, opts?: { compact?: boolean }) => {
  if (v == null || Number.isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (opts?.compact && abs >= 1000) {
    return `$${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`;
  }
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtPct = (v: number | null | undefined, digits = 2) => {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
};

const verdictTone = (v: string | null | undefined) => {
  switch ((v || '').toUpperCase()) {
    case 'BUY': return COLOR_GAIN;
    case 'AVOID': return COLOR_LOSS;
    case 'WATCH': return COLOR_NEUTRAL;
    default: return COLOR_INK_MUTED;
  }
};
const verdictText = (v: string | null | undefined) => {
  switch ((v || '').toUpperCase()) {
    case 'BUY': return '建议买入';
    case 'AVOID': return '建议回避';
    case 'WATCH': return '持续观察';
    default: return '未裁决';
  }
};

type SlideKey = 'overview' | 'holdings' | 'agents' | 'record';
const SLIDES: { key: SlideKey; label: string; en: string }[] = [
  { key: 'overview', label: '概览', en: 'Today' },
  { key: 'holdings', label: '持仓',   en: 'Holdings' },
  { key: 'agents',   label: '智能体', en: 'Agents' },
  { key: 'record',   label: '战绩',   en: 'Record' },
];

// ── Loading shimmer (editorial-grade — no generic spinner) ────────────────
function Shimmer({ width = '100%', height = 16, mb = 0 }: { width?: number | string; height?: number; mb?: number }) {
  return (
    <Box
      sx={{
        width,
        height,
        mb,
        background: `linear-gradient(90deg,
          rgba(244,236,223,0.025) 0%,
          rgba(244,236,223,0.07) 40%,
          rgba(244,236,223,0.025) 80%
        )`,
        backgroundSize: '200% 100%',
        animation: 'editorial-shimmer 1.6s ease-in-out infinite',
        '@keyframes editorial-shimmer': {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      }}
    />
  );
}

function LoadingNote({ text = '正在加载' }: { text?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: COLOR_INK_FAINT }}>
      <Box
        sx={{
          width: 6, height: 6, borderRadius: '50%',
          bgcolor: COLOR_INK_MUTED,
          animation: 'pulse-dot 1.4s ease-in-out infinite',
          '@keyframes pulse-dot': {
            '0%, 100%': { opacity: 0.3, transform: 'scale(0.85)' },
            '50%':      { opacity: 1,   transform: 'scale(1)' },
          },
        }}
      />
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          color: COLOR_INK_FAINT,
        }}
      >
        {text}
      </Typography>
    </Box>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();

  const [snbBalance, setSnbBalance] = useState<SnbBalance | null>(null);
  const [snbPositions, setSnbPositions] = useState<SnbPosition[]>([]);
  const [snbLoaded, setSnbLoaded] = useState(false);
  const [snbAvailable, setSnbAvailable] = useState(true);

  const [evalOverview, setEvalOverview] = useState<EvalOverview | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [companyAnalyses, setCompanyAnalyses] = useState<CompanyAnalysis[]>([]);

  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoaded, setNewsLoaded] = useState(false);

  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [leaderboardLoaded, setLeaderboardLoaded] = useState(false);
  const [decisionsLoaded, setDecisionsLoaded] = useState(false);
  const [analysesLoaded, setAnalysesLoaded] = useState(false);

  const [slideIdx, setSlideIdx] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const [b, p] = await Promise.all([fetchBalance(), fetchPositions()]);
        if (b.success && b.data) setSnbBalance(b.data);
        if (p.success && p.data) setSnbPositions(p.data);
      } catch {
        setSnbAvailable(false);
      } finally {
        setSnbLoaded(true);
      }
    })();
    getEvalOverview().then((d) => setEvalOverview(d)).finally(() => setOverviewLoaded(true));
    getLeaderboard().then((d) => setLeaderboard(d)).finally(() => setLeaderboardLoaded(true));
    getDecisions(8).then((d) => setDecisions(d)).finally(() => setDecisionsLoaded(true));
    getCompanyAnalyses(12).then((d) => setCompanyAnalyses(d)).finally(() => setAnalysesLoaded(true));
    // Top news for the overview slide — pull more then sort by importance + recency
    getLatestNews(20).then((items) => {
      const ranked = [...items].sort((a, b) => {
        // Important items rank above unimportant
        if (a.important !== b.important) return a.important ? -1 : 1;
        // Then by publish time desc
        const ta = new Date(a.publish_time || a.time || a.date || 0).getTime();
        const tb = new Date(b.publish_time || b.time || b.date || 0).getTime();
        return tb - ta;
      });
      setNews(ranked.slice(0, 5));
    }).finally(() => setNewsLoaded(true));
  }, []);

  const portfolio = useMemo(() => {
    if (snbPositions.length === 0) {
      return {
        totalCost: 0, totalMarket: 0, totalPnl: 0, returnPct: 0, count: 0,
        topMover: null as SnbPosition | null,
        worstMover: null as SnbPosition | null,
      };
    }
    let totalCost = 0, totalMarket = 0, totalPnl = 0;
    let topMover: SnbPosition | null = null;
    let worstMover: SnbPosition | null = null;
    let topPct = -Infinity, worstPct = Infinity;
    for (const p of snbPositions) {
      const cost = p.cost > 0 ? p.cost : (p.quantity || 0) * (p.average_price || 0);
      const ret = cost > 0 ? (p.unrealized_pnl / cost) * 100 : 0;
      totalCost += cost;
      totalMarket += p.market_value || 0;
      totalPnl += p.unrealized_pnl || 0;
      if (ret > topPct) { topPct = ret; topMover = p; }
      if (ret < worstPct) { worstPct = ret; worstMover = p; }
    }
    return {
      totalCost, totalMarket, totalPnl,
      returnPct: totalCost > 0 ? (totalPnl / totalCost) * 100 : 0,
      count: snbPositions.length,
      topMover, worstMover,
    };
  }, [snbPositions]);

  const goTo = useCallback((idx: number) => {
    const next = ((idx % SLIDES.length) + SLIDES.length) % SLIDES.length;
    setDirection(next > slideIdx ? 1 : -1);
    setSlideIdx(next);
  }, [slideIdx]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(slideIdx - 1);
      if (e.key === 'ArrowRight') goTo(slideIdx + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slideIdx, goTo]);

  const today = useMemo(() => new Date(), []);
  const dateText = today.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <Box
      sx={{
        m: -3,
        height: '100vh',
        width: 'calc(100% + 48px)',
        bgcolor: COLOR_BG,
        color: COLOR_INK,
        backgroundImage: `
          radial-gradient(ellipse 1400px 700px at 8% -8%, rgba(168,137,110,0.06), transparent 60%),
          radial-gradient(ellipse 900px 600px at 96% 108%, rgba(91,123,106,0.05), transparent 65%),
          repeating-linear-gradient(0deg, rgba(255,255,255,0.005) 0 1px, transparent 1px 3px)
        `,
        fontFamily: FONT_BODY,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* ── Top bar: masthead + slide nav (中文) ────────────────────── */}
      <Box
        sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          px: { xs: 4, md: 6 },
          py: 3,
          pb: 2,
          borderBottom: `1px solid ${COLOR_INK_FAINT}`,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontFamily: FONT_DISPLAY,
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: { xs: 32, md: 44 },
              letterSpacing: '-0.025em',
              lineHeight: 1,
              color: COLOR_INK,
              fontVariationSettings: '"opsz" 144, "SOFT" 60',
            }}
          >
            交易日报
          </Typography>
          <Typography
            sx={{
              fontFamily: FONT_BODY,
              fontStyle: 'italic',
              fontSize: 12,
              color: COLOR_INK_MUTED,
              mt: 0.5,
            }}
          >
            {dateText}
          </Typography>
        </Box>

        {/* Slide nav: text labels + dots */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          {SLIDES.map((s, i) => (
            <Box
              key={s.key}
              onClick={() => goTo(i)}
              sx={{
                cursor: 'pointer',
                position: 'relative',
                pb: 0.75,
              }}
            >
              <Typography
                sx={{
                  fontFamily: FONT_DISPLAY,
                  fontStyle: 'italic',
                  fontSize: 17,
                  color: i === slideIdx ? COLOR_INK : COLOR_INK_MUTED,
                  letterSpacing: '-0.005em',
                  fontVariationSettings: '"opsz" 36',
                  transition: 'color 200ms',
                }}
              >
                {s.label}
              </Typography>
              <Typography
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: 8.5,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: i === slideIdx ? COLOR_INK_MUTED : COLOR_INK_FAINT,
                  textAlign: 'center',
                }}
              >
                {s.en}
              </Typography>
              {i === slideIdx && (
                <motion.div
                  layoutId="active-slide"
                  style={{
                    position: 'absolute',
                    bottom: 0, left: 0, right: 0,
                    height: 1,
                    background: COLOR_INK,
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── Slide stage ───────────────────────────────────────────── */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Side chevrons (subtle) */}
        <Box
          onClick={() => goTo(slideIdx - 1)}
          sx={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            zIndex: 10, cursor: 'pointer',
            color: COLOR_INK_FAINT,
            transition: 'color 200ms',
            '&:hover': { color: COLOR_INK },
          }}
        >
          <ChevronLeft size={28} strokeWidth={1} />
        </Box>
        <Box
          onClick={() => goTo(slideIdx + 1)}
          sx={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            zIndex: 10, cursor: 'pointer',
            color: COLOR_INK_FAINT,
            transition: 'color 200ms',
            '&:hover': { color: COLOR_INK },
          }}
        >
          <ChevronRight size={28} strokeWidth={1} />
        </Box>

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={SLIDES[slideIdx].key}
            custom={direction}
            initial={{ x: direction * 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -direction * 60, opacity: 0 }}
            transition={{
              x: { type: 'spring', stiffness: 280, damping: 32 },
              opacity: { duration: 0.25 },
            }}
            style={{
              position: 'absolute', inset: 0,
              padding: '40px 64px 56px',
              overflow: 'auto',
            }}
          >
            {SLIDES[slideIdx].key === 'overview' && (
              <SlideOverview
                snbLoaded={snbLoaded}
                snbAvailable={snbAvailable}
                balance={snbBalance}
                portfolio={portfolio}
                news={news}
                newsLoaded={newsLoaded}
                onTrade={() => navigate('/trading/snb')}
                onAnalyze={() => navigate('/company-agent')}
                onSeeAllNews={() => navigate('/news-timeline')}
              />
            )}
            {SLIDES[slideIdx].key === 'holdings' && (
              <SlideHoldings
                loaded={snbLoaded}
                positions={snbPositions}
                totalMarket={portfolio.totalMarket}
              />
            )}
            {SLIDES[slideIdx].key === 'agents' && (
              <SlideAgents
                loaded={analysesLoaded}
                analyses={companyAnalyses}
                onClick={(id) => navigate(`/company-agent/${id}`)}
              />
            )}
            {SLIDES[slideIdx].key === 'record' && (
              <SlideRecord
                overviewLoaded={overviewLoaded}
                leaderboardLoaded={leaderboardLoaded}
                decisionsLoaded={decisionsLoaded}
                evalOverview={evalOverview}
                leaderboard={leaderboard}
                decisions={decisions}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </Box>

      {/* ── Bottom indicator: page count ─────────────────────────── */}
      <Box
        sx={{
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: { xs: 4, md: 6 },
          py: 1.75,
          // Subtle hairline separator that doesn't create a color seam — same hue as ink faint
          borderTop: `1px solid ${COLOR_INK_FAINT}40`,
        }}
      >
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontSize: 9,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: COLOR_INK_FAINT,
          }}
        >
          ←  ↔  →   <Box component="span" sx={{ ml: 2, opacity: 0.6 }}>键盘左右切换</Box>
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          {SLIDES.map((_, i) => (
            <Box
              key={i}
              onClick={() => goTo(i)}
              sx={{
                width: i === slideIdx ? 24 : 6,
                height: 2,
                bgcolor: i === slideIdx ? COLOR_INK : COLOR_INK_FAINT,
                cursor: 'pointer',
                transition: 'all 300ms cubic-bezier(0.2,0,0.2,1)',
              }}
            />
          ))}
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: COLOR_INK_MUTED,
              ml: 1.5,
              fontFeatureSettings: '"tnum"',
              letterSpacing: '0.05em',
            }}
          >
            {String(slideIdx + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

// ── Slide 1: 概览 ────────────────────────────────────────────────────────
function SlideOverview({
  snbLoaded, snbAvailable, balance, portfolio,
  news, newsLoaded,
  onTrade, onAnalyze, onSeeAllNews,
}: {
  snbLoaded: boolean;
  snbAvailable: boolean;
  balance: SnbBalance | null;
  portfolio: ReturnType<typeof useMemo<any>>;
  news: NewsItem[];
  newsLoaded: boolean;
  onTrade: () => void;
  onAnalyze: () => void;
  onSeeAllNews: () => void;
}) {
  if (!snbLoaded) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <LoadingNote text="加载账户" />
        <Box sx={{ mt: 6 }}>
          <Shimmer width={240} height={14} mb={3} />
          <Shimmer width={'70%'} height={84} mb={4} />
          <Shimmer width={'90%'} height={20} mb={1.5} />
          <Shimmer width={'82%'} height={20} />
        </Box>
      </Box>
    );
  }
  if (!snbAvailable) {
    return (
      <Box sx={{ maxWidth: 700, mx: 'auto', mt: 8 }}>
        <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 28, color: COLOR_INK, mb: 1.5 }}>
          雪盈账户尚未连接
        </Typography>
        <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 14, color: COLOR_INK_MUTED, lineHeight: 1.7 }}>
          请在 backend/.env 配置 SNB_ACCOUNT 与 SNB_API_KEY，重启后即可在此处查看持仓与盈亏。
        </Typography>
      </Box>
    );
  }

  const pnlSign = portfolio.totalPnl >= 0;
  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      {/* Eyebrow */}
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          color: COLOR_INK_MUTED,
          mb: 2,
        }}
      >
        净资产 · Net Worth
      </Typography>

      {/* Hero number */}
      <Typography
        component={motion.div}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        sx={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 300,
          fontSize: { xs: 64, md: 112 },
          letterSpacing: '-0.045em',
          color: COLOR_INK,
          fontFeatureSettings: '"tnum", "lnum"',
          fontVariationSettings: '"opsz" 144, "SOFT" 30',
          lineHeight: 0.92,
          mb: 3,
        }}
      >
        {fmtUsd(balance?.total_value)}
      </Typography>

      {/* One-line narrative */}
      {portfolio.count > 0 && (
        <Typography
          component={motion.div}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          sx={{
            fontFamily: FONT_BODY,
            fontStyle: 'italic',
            fontSize: { xs: 18, md: 22 },
            color: COLOR_INK,
            maxWidth: 720,
            lineHeight: 1.55,
            mb: 5,
          }}
        >
          目前持有{' '}
          <Box component="span" sx={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontStyle: 'normal' }}>
            {portfolio.count} 个标的
          </Box>
          ，综合浮动收益{' '}
          <Box component="span" sx={{ color: pnlSign ? COLOR_GAIN : COLOR_LOSS, fontFamily: FONT_DISPLAY, fontWeight: 600, fontStyle: 'italic' }}>
            {fmtPct(portfolio.returnPct)}
          </Box>
          {' '}（基于成本{' '}
          <Box component="span" sx={{ fontFamily: FONT_MONO, fontStyle: 'normal' }}>
            {fmtUsd(portfolio.totalCost)}
          </Box>
          ）。
        </Typography>
      )}

      {/* Top mover / laggard */}
      {portfolio.topMover && portfolio.worstMover && (
        <Box
          component={motion.div}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: 5,
            pt: 4,
            borderTop: `1px solid ${COLOR_INK_FAINT}`,
            mb: 5,
          }}
        >
          <PullStat
            label="今日领涨"
            symbol={portfolio.topMover.symbol}
            pct={(portfolio.topMover.unrealized_pnl / Math.max(1, portfolio.topMover.cost)) * 100}
          />
          <PullStat
            label="表现疲软"
            symbol={portfolio.worstMover.symbol}
            pct={(portfolio.worstMover.unrealized_pnl / Math.max(1, portfolio.worstMover.cost)) * 100}
          />
          <Box>
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: COLOR_INK_FAINT, mb: 0.75 }}>
              现金 / 可用
            </Typography>
            <Typography
              sx={{
                fontFamily: FONT_MONO,
                fontWeight: 400,
                fontSize: 24,
                color: COLOR_INK,
                fontFeatureSettings: '"tnum"',
                letterSpacing: '-0.02em',
              }}
            >
              {fmtUsd(balance?.cash)}
            </Typography>
            <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 12, color: COLOR_INK_MUTED, mt: 0.5 }}>
              {(balance?.cash ?? 0) < 0 ? '账户处于融资状态' : '可用于建仓'}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Action shortcuts */}
      <Box sx={{ display: 'flex', gap: 4, mb: 5 }}>
        <CtaLink onClick={onTrade}>前往交易台</CtaLink>
        <CtaLink onClick={onAnalyze}>发起公司分析</CtaLink>
      </Box>

      {/* ── Top news ─────────────────────────────────────────────── */}
      <Box
        component={motion.div}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        sx={{ pt: 4, borderTop: `1px solid ${COLOR_INK_FAINT}` }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
            <Typography
              sx={{
                fontFamily: FONT_MONO,
                fontSize: 9.5,
                letterSpacing: '0.32em',
                textTransform: 'uppercase',
                color: COLOR_INK_MUTED,
              }}
            >
              今日要闻 · Top Headlines
            </Typography>
          </Box>
          <CtaLink onClick={onSeeAllNews}>查看全部</CtaLink>
        </Box>

        {!newsLoaded ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Box
                key={i}
                sx={{
                  height: 12,
                  background: 'linear-gradient(90deg, rgba(244,236,223,0.025) 0%, rgba(244,236,223,0.07) 40%, rgba(244,236,223,0.025) 80%)',
                  backgroundSize: '200% 100%',
                  animation: 'editorial-shimmer 1.6s ease-in-out infinite',
                  '@keyframes editorial-shimmer': {
                    '0%': { backgroundPosition: '200% 0' },
                    '100%': { backgroundPosition: '-200% 0' },
                  },
                }}
              />
            ))}
          </Box>
        ) : news.length === 0 ? (
          <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 13, color: COLOR_INK_MUTED }}>
            暂无新闻数据
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {news.map((n, i) => (
              <NewsHeadline
                key={n.id || i}
                rank={i + 1}
                title={n.title_zh || n.title || n.headline}
                source={n.source}
                time={n.publish_time || n.time || n.date}
                important={n.important}
                onClick={onSeeAllNews}
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

// Newspaper-style headline row
function NewsHeadline({
  rank, title, source, time, important, onClick,
}: { rank: number; title: string; source: string; time?: string; important: boolean; onClick: () => void }) {
  const formattedTime = useMemo(() => {
    if (!time) return '';
    try {
      const d = new Date(time);
      const now = new Date();
      const diffH = (now.getTime() - d.getTime()) / 3_600_000;
      if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))} 分钟前`;
      if (diffH < 24) return `${Math.round(diffH)} 小时前`;
      return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    } catch {
      return '';
    }
  }, [time]);

  return (
    <Box
      onClick={onClick}
      component={motion.div}
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * rank, duration: 0.3 }}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'baseline',
        gap: 2,
        py: 1.4,
        cursor: 'pointer',
        borderBottom: `1px solid ${COLOR_INK_FAINT}40`,
        transition: 'background-color 180ms',
        '&:hover': { bgcolor: 'rgba(244,236,223,0.025)' },
        '&:hover .news-title': { color: COLOR_INK },
      }}
    >
      <Typography
        sx={{
          fontFamily: FONT_DISPLAY,
          fontStyle: 'italic',
          fontWeight: 600,
          fontSize: 14,
          color: important ? COLOR_NEUTRAL : COLOR_INK_FAINT,
          fontFeatureSettings: '"tnum"',
          minWidth: 22,
          fontVariationSettings: '"opsz" 36',
        }}
      >
        {String(rank).padStart(2, '0')}
      </Typography>
      <Typography
        className="news-title"
        sx={{
          fontFamily: FONT_BODY,
          fontSize: 14.5,
          color: COLOR_INK_MUTED,
          lineHeight: 1.55,
          letterSpacing: '0.005em',
          transition: 'color 180ms',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 1,
          WebkitBoxOrient: 'vertical',
          whiteSpace: 'nowrap',
        }}
      >
        {important && (
          <Box
            component="span"
            sx={{
              display: 'inline-block',
              width: 5,
              height: 5,
              borderRadius: '50%',
              bgcolor: COLOR_NEUTRAL,
              mr: 1,
              mb: '2px',
              verticalAlign: 'middle',
            }}
          />
        )}
        {title}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexShrink: 0 }}>
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontSize: 9.5,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: COLOR_INK_FAINT,
          }}
        >
          {source}
        </Typography>
        <Typography
          sx={{
            fontFamily: FONT_BODY,
            fontStyle: 'italic',
            fontSize: 11,
            color: COLOR_INK_FAINT,
            minWidth: 60,
            textAlign: 'right',
          }}
        >
          {formattedTime}
        </Typography>
      </Box>
    </Box>
  );
}

function PullStat({ label, symbol, pct }: { label: string; symbol: string; pct: number }) {
  const sign = pct >= 0;
  return (
    <Box>
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: COLOR_INK_FAINT, mb: 0.75 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
        <Typography
          sx={{
            fontFamily: FONT_DISPLAY,
            fontStyle: 'italic',
            fontWeight: 600,
            fontSize: 26,
            color: COLOR_INK,
            letterSpacing: '-0.01em',
            fontVariationSettings: '"opsz" 36',
          }}
        >
          {symbol}
        </Typography>
        <Typography
          sx={{
            fontFamily: FONT_DISPLAY,
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 22,
            color: sign ? COLOR_GAIN : COLOR_LOSS,
            fontFeatureSettings: '"tnum"',
          }}
        >
          {fmtPct(pct)}
        </Typography>
      </Box>
    </Box>
  );
}

function CtaLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.6,
        cursor: 'pointer',
        fontFamily: FONT_BODY,
        fontStyle: 'italic',
        fontSize: 15,
        color: COLOR_INK,
        borderBottom: `1px solid ${COLOR_INK_FAINT}`,
        pb: 0.5,
        transition: 'border-color 200ms, color 200ms',
        '&:hover': { borderBottomColor: COLOR_INK },
        '&:hover svg': { transform: 'translate(2px, -2px)' },
        '& svg': { transition: 'transform 200ms' },
      }}
    >
      {children}
      <ArrowUpRight size={13} />
    </Box>
  );
}

// ── Slide 2: 持仓 ────────────────────────────────────────────────────────
function SlideHoldings({
  loaded, positions, totalMarket,
}: { loaded: boolean; positions: SnbPosition[]; totalMarket: number }) {
  if (!loaded) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <LoadingNote text="加载持仓" />
        <Box sx={{ mt: 6, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' }, gap: 6 }}>
          <Box>
            {[0, 1, 2, 3, 4].map((i) => (
              <Shimmer key={i} width="100%" height={42} mb={1.5} />
            ))}
          </Box>
          <Shimmer width={220} height={220} />
        </Box>
      </Box>
    );
  }
  if (positions.length === 0) {
    return (
      <EmptyState title="暂无持仓" body="账户内没有标的可展示。前往交易台即可下单。" />
    );
  }

  const sorted = [...positions].sort((a, b) => (b.market_value || 0) - (a.market_value || 0));

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase', color: COLOR_INK_MUTED, mb: 0.5 }}>
        当前持仓 · {positions.length} 个标的
      </Typography>
      <Typography
        sx={{
          fontFamily: FONT_DISPLAY,
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: { xs: 32, md: 44 },
          letterSpacing: '-0.025em',
          color: COLOR_INK,
          mb: 4,
        }}
      >
        持仓矩阵
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' },
          gap: { xs: 4, md: 7 },
          alignItems: 'start',
        }}
      >
        {/* Holdings table */}
        <Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.2fr) repeat(4, minmax(0, 1fr))',
              columnGap: 2,
              pb: 1.25,
              borderBottom: `1px solid ${COLOR_INK_FAINT}`,
            }}
          >
            {['代码', '现价', '市值', '占比', '收益率'].map((h, i) => (
              <Typography
                key={h}
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: 9,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: COLOR_INK_FAINT,
                  textAlign: i === 0 ? 'left' : 'right',
                }}
              >
                {h}
              </Typography>
            ))}
          </Box>

          {sorted.map((p, i) => {
            const cost = p.cost > 0 ? p.cost : (p.quantity || 0) * (p.average_price || 0);
            const ret = cost > 0 ? (p.unrealized_pnl / cost) * 100 : 0;
            const weight = totalMarket > 0 ? ((p.market_value || 0) / totalMarket) * 100 : 0;
            return (
              <Box
                key={p.symbol}
                component={motion.div}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.3 }}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.2fr) repeat(4, minmax(0, 1fr))',
                  columnGap: 2,
                  py: 1.75,
                  alignItems: 'center',
                  borderBottom: `1px solid ${COLOR_INK_FAINT}30`,
                }}
              >
                <Typography
                  sx={{
                    fontFamily: FONT_DISPLAY,
                    fontStyle: 'italic',
                    fontWeight: 600,
                    fontSize: 22,
                    color: COLOR_INK,
                    letterSpacing: '-0.01em',
                    fontVariationSettings: '"opsz" 36',
                  }}
                >
                  {p.symbol}
                </Typography>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 13, color: COLOR_INK_MUTED, textAlign: 'right', fontFeatureSettings: '"tnum"' }}>
                  {fmtUsd(p.market_price)}
                </Typography>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 14, color: COLOR_INK, textAlign: 'right', fontFeatureSettings: '"tnum"', fontWeight: 500 }}>
                  {fmtUsd(p.market_value, { compact: true })}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: 'flex-end' }}>
                  <Box sx={{ flex: 1, height: 2, bgcolor: `${COLOR_INK_FAINT}50`, position: 'relative', maxWidth: 50 }}>
                    <Box sx={{ position: 'absolute', inset: 0, width: `${weight}%`, bgcolor: COLOR_INK_MUTED }} />
                  </Box>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 11, color: COLOR_INK_MUTED, fontFeatureSettings: '"tnum"', minWidth: 30, textAlign: 'right' }}>
                    {weight.toFixed(0)}%
                  </Typography>
                </Box>
                <Typography
                  sx={{
                    fontFamily: FONT_DISPLAY,
                    fontStyle: 'italic',
                    fontWeight: 500,
                    fontSize: 17,
                    color: ret >= 0 ? COLOR_GAIN : COLOR_LOSS,
                    textAlign: 'right',
                    fontFeatureSettings: '"tnum"',
                    fontVariationSettings: '"opsz" 36',
                  }}
                >
                  {fmtPct(ret)}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* Pie */}
        <Box sx={{ pl: { md: 2 } }}>
          <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: COLOR_INK_FAINT, mb: 2 }}>
            资产配比
          </Typography>
          <PortfolioPie
            size={220}
            totalLabel="总市值"
            totalValue={fmtUsd(totalMarket, { compact: true })}
            slices={positions.map((p) => ({
              symbol: p.symbol,
              value: p.market_value || 0,
              pct: totalMarket > 0 ? ((p.market_value || 0) / totalMarket) * 100 : 0,
            }))}
          />
        </Box>
      </Box>
    </Box>
  );
}

// ── Slide 3: 智能体 ────────────────────────────────────────────────────────
function SlideAgents({
  loaded, analyses, onClick,
}: { loaded: boolean; analyses: CompanyAnalysis[]; onClick: (id: string) => void }) {
  if (!loaded) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <LoadingNote text="加载分析记录" />
        <Box sx={{ mt: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Shimmer key={i} width="100%" height={56} />
          ))}
        </Box>
      </Box>
    );
  }
  if (analyses.length === 0) {
    return <EmptyState title="尚无分析记录" body="发起一次公司分析后，最新裁决将出现在这里。" />;
  }
  const buys = analyses.filter((a) => a.verdict_action === 'BUY').slice(0, 4);
  const recent = analyses.slice(0, 7);

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase', color: COLOR_INK_MUTED, mb: 0.5 }}>
        最近的智能体裁决
      </Typography>
      <Typography
        sx={{
          fontFamily: FONT_DISPLAY,
          fontStyle: 'italic',
          fontSize: { xs: 32, md: 44 },
          letterSpacing: '-0.025em',
          color: COLOR_INK,
          mb: 4,
        }}
      >
        智能体提示
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 4, md: 7 } }}>
        {/* Recent verdicts */}
        <Box>
          <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: COLOR_INK_FAINT, mb: 2 }}>
            最近裁决
          </Typography>
          {recent.map((a, i) => (
            <Box
              key={a.id}
              onClick={() => onClick(a.id)}
              component={motion.div}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 * i, duration: 0.3 }}
              sx={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                alignItems: 'center',
                gap: 2,
                py: 1.5,
                cursor: 'pointer',
                borderBottom: i === recent.length - 1 ? 'none' : `1px solid ${COLOR_INK_FAINT}40`,
                transition: 'background-color 180ms',
                '&:hover': { bgcolor: 'rgba(244,236,223,0.025)' },
              }}
            >
              <VerdictIcon action={a.verdict_action} />
              <Box>
                <Typography
                  sx={{
                    fontFamily: FONT_DISPLAY,
                    fontStyle: 'italic',
                    fontWeight: 600,
                    fontSize: 17,
                    color: COLOR_INK,
                    letterSpacing: '-0.01em',
                    fontVariationSettings: '"opsz" 36',
                  }}
                >
                  {a.symbol}
                  <Box component="span" sx={{ ml: 1, fontFamily: FONT_BODY, fontWeight: 400, fontSize: 12, color: COLOR_INK_MUTED }}>
                    {a.company_name?.slice(0, 24) || ''}
                  </Box>
                </Typography>
                <Typography
                  sx={{
                    fontFamily: FONT_MONO,
                    fontSize: 9.5,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: verdictTone(a.verdict_action),
                    mt: 0.25,
                  }}
                >
                  {verdictText(a.verdict_action)} · 置信度 {a.verdict_conviction != null ? `${(a.verdict_conviction * 100).toFixed(0)}%` : '—'}
                </Typography>
              </Box>
              <ArrowUpRight size={14} color={COLOR_INK_FAINT} strokeWidth={1.5} />
            </Box>
          ))}
        </Box>

        {/* Opportunities (BUY only) */}
        <Box>
          <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: COLOR_INK_FAINT, mb: 2 }}>
            建议买入名单
          </Typography>
          {buys.length === 0 ? (
            <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 13, color: COLOR_INK_MUTED, lineHeight: 1.7 }}>
              当前无 BUY 评级。可发起新的公司分析以发现机会。
            </Typography>
          ) : (
            buys.map((a, i) => (
              <Box
                key={a.id}
                onClick={() => onClick(a.id)}
                component={motion.div}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.3 }}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  alignItems: 'center',
                  gap: 2,
                  py: 1.5,
                  px: 2,
                  ml: -2,
                  cursor: 'pointer',
                  borderLeft: `2px solid ${COLOR_GAIN}`,
                  mb: 1,
                  transition: 'all 200ms',
                  '&:hover': {
                    bgcolor: 'rgba(111,175,141,0.06)',
                    borderLeftColor: COLOR_INK,
                  },
                }}
              >
                <Sparkle size={13} color={COLOR_GAIN} strokeWidth={1.5} />
                <Box>
                  <Typography
                    sx={{
                      fontFamily: FONT_DISPLAY,
                      fontStyle: 'italic',
                      fontWeight: 600,
                      fontSize: 18,
                      color: COLOR_INK,
                      fontVariationSettings: '"opsz" 36',
                    }}
                  >
                    {a.symbol}
                  </Typography>
                  <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 11, color: COLOR_INK_MUTED, mt: -0.25 }}>
                    {a.company_name?.slice(0, 32) || ''}
                  </Typography>
                </Box>
                <Typography
                  sx={{
                    fontFamily: FONT_DISPLAY,
                    fontStyle: 'italic',
                    fontSize: 16,
                    color: COLOR_GAIN,
                    fontWeight: 500,
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {a.verdict_conviction != null ? `${(a.verdict_conviction * 100).toFixed(0)}%` : 'BUY'}
                </Typography>
              </Box>
            ))
          )}
        </Box>
      </Box>
    </Box>
  );
}

function VerdictIcon({ action }: { action: string | null | undefined }) {
  const Icon = action === 'BUY' ? TrendingUp : action === 'AVOID' ? TrendingDown : Minus;
  return <Icon size={14} color={verdictTone(action)} strokeWidth={1.5} />;
}

// ── Slide 4: 战绩 ────────────────────────────────────────────────────────
function SlideRecord({
  overviewLoaded, leaderboardLoaded, decisionsLoaded,
  evalOverview, leaderboard, decisions,
}: {
  overviewLoaded: boolean;
  leaderboardLoaded: boolean;
  decisionsLoaded: boolean;
  evalOverview: EvalOverview | null;
  leaderboard: LeaderboardEntry[];
  decisions: DecisionItem[];
}) {
  const allLoaded = overviewLoaded && leaderboardLoaded && decisionsLoaded;
  if (!allLoaded) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <LoadingNote text="加载战绩数据" />
        <Box sx={{ mt: 6 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, mb: 4 }}>
            {[0, 1, 2, 3].map((i) => (
              <Box key={i} sx={{ p: 2.5 }}>
                <Shimmer width={50} height={9} mb={1} />
                <Shimmer width={120} height={32} mb={0.5} />
                <Shimmer width={80} height={11} />
              </Box>
            ))}
          </Box>
          {[0, 1, 2, 3, 4].map((i) => <Shimmer key={i} width="100%" height={48} mb={1} />)}
        </Box>
      </Box>
    );
  }
  if (!evalOverview) {
    return <EmptyState title="尚无战绩数据" body="跑过几次智能体之后，模型评分与胜率将在此呈现。" />;
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase', color: COLOR_INK_MUTED, mb: 0.5 }}>
        模型综合战绩
      </Typography>
      <Typography
        sx={{
          fontFamily: FONT_DISPLAY,
          fontStyle: 'italic',
          fontSize: { xs: 32, md: 44 },
          letterSpacing: '-0.025em',
          color: COLOR_INK,
          mb: 4,
        }}
      >
        模型评分与决策日志
      </Typography>

      {/* KPI strip */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          borderTop: `1px solid ${COLOR_INK_FAINT}`,
          borderBottom: `1px solid ${COLOR_INK_FAINT}`,
          mb: 4,
        }}
      >
        <KpiCell label="累计运行" value={evalOverview.total_arena_runs?.toLocaleString() ?? '—'} />
        <KpiCell label="最佳模型" value={evalOverview.best_model?.split('/').pop() || '—'} isText />
        <KpiCell label="平均胜率" value={evalOverview.avg_win_rate != null ? `${(evalOverview.avg_win_rate * 100).toFixed(1)}%` : '—'} />
        <KpiCell label="累计成本" value={evalOverview.total_cost_usd != null ? `$${evalOverview.total_cost_usd.toFixed(2)}` : '—'} last />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 4, md: 7 } }}>
        {/* Leaderboard */}
        <Box>
          <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: COLOR_INK_FAINT, mb: 1.5 }}>
            模型排行（前 5）
          </Typography>
          {leaderboard.length === 0 ? (
            <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 13, color: COLOR_INK_MUTED }}>
              暂无排行数据
            </Typography>
          ) : (
            leaderboard.slice(0, 5).map((m, i) => (
              <Box
                key={m.id}
                component={motion.div}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.3 }}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr auto auto',
                  alignItems: 'center',
                  gap: 2,
                  py: 1.5,
                  borderBottom: i === Math.min(4, leaderboard.length - 1) ? 'none' : `1px solid ${COLOR_INK_FAINT}40`,
                }}
              >
                <Typography
                  sx={{
                    fontFamily: FONT_DISPLAY,
                    fontStyle: 'italic',
                    fontWeight: 600,
                    fontSize: 22,
                    color: i === 0 ? COLOR_INK : COLOR_INK_FAINT,
                    fontVariationSettings: '"opsz" 36',
                  }}
                >
                  {m.rank}
                </Typography>
                <Box>
                  <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontWeight: 500, fontSize: 15, color: COLOR_INK }}>
                    {m.model_name}
                  </Typography>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: COLOR_INK_FAINT }}>
                    {m.model_provider}
                  </Typography>
                </Box>
                <KpiInline label="胜率" value={`${(m.win_rate * 100).toFixed(0)}%`} />
                <KpiInline
                  label="收益"
                  value={fmtPct(m.avg_return_pct)}
                  tone={m.avg_return_pct >= 0 ? COLOR_GAIN : COLOR_LOSS}
                />
              </Box>
            ))
          )}
        </Box>

        {/* Decision log */}
        <Box>
          <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: COLOR_INK_FAINT, mb: 1.5 }}>
            最近决策
          </Typography>
          {decisions.length === 0 ? (
            <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 13, color: COLOR_INK_MUTED }}>
              尚无决策记录
            </Typography>
          ) : (
            decisions.slice(0, 6).map((d, i) => {
              const t = new Date(d.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
              const action = d.user_action || 'unknown';
              const tone =
                action.includes('approved') ? COLOR_GAIN
                : action.includes('rejected') ? COLOR_LOSS
                : COLOR_INK_MUTED;
              const actionText =
                action.includes('approved') ? '采纳'
                : action.includes('rejected') ? '拒绝'
                : action.includes('auto') ? '自动'
                : action;
              const symbols = (d.original_allocations || []).map((a) => a.symbol || a.etf).filter(Boolean).slice(0, 3).join(' / ');
              return (
                <Box
                  key={d.id}
                  component={motion.div}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.3 }}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'auto auto 1fr auto',
                    alignItems: 'center',
                    gap: 1.5,
                    py: 1.25,
                    borderBottom: i === Math.min(5, decisions.length - 1) ? 'none' : `1px solid ${COLOR_INK_FAINT}40`,
                  }}
                >
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 11, color: COLOR_INK_FAINT, minWidth: 36, fontFeatureSettings: '"tnum"' }}>
                    {t}
                  </Typography>
                  <Zap size={11} color={tone} strokeWidth={1.5} />
                  <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 13, color: COLOR_INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {symbols || d.harness_type || '调仓建议'}
                  </Typography>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.15em', color: tone }}>
                    {actionText}
                  </Typography>
                </Box>
              );
            })
          )}
        </Box>
      </Box>
    </Box>
  );
}

function KpiCell({ label, value, last, isText }: { label: string; value: string; last?: boolean; isText?: boolean }) {
  return (
    <Box sx={{ py: 2.5, px: 2.5, borderRight: last ? 'none' : `1px solid ${COLOR_INK_FAINT}` }}>
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: COLOR_INK_FAINT, mb: 0.75 }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontFamily: isText ? FONT_DISPLAY : FONT_MONO,
          fontStyle: isText ? 'italic' : 'normal',
          fontWeight: isText ? 500 : 400,
          fontSize: isText ? 22 : 26,
          color: COLOR_INK,
          letterSpacing: '-0.02em',
          fontFeatureSettings: '"tnum"',
          fontVariationSettings: isText ? '"opsz" 36' : undefined,
          lineHeight: 1.05,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function KpiInline({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Box sx={{ textAlign: 'right' }}>
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 13, color: tone || COLOR_INK, fontFeatureSettings: '"tnum"' }}>
        {value}
      </Typography>
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: COLOR_INK_FAINT, mt: 0.15 }}>
        {label}
      </Typography>
    </Box>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', mt: 10, textAlign: 'left' }}>
      <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 32, color: COLOR_INK, mb: 1.5, letterSpacing: '-0.02em' }}>
        {title}
      </Typography>
      <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 15, color: COLOR_INK_MUTED, lineHeight: 1.7 }}>
        {body}
      </Typography>
    </Box>
  );
}
