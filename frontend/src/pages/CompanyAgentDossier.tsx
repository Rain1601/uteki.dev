/**
 * /company-agent/:id — Filed dossier (M2)
 *
 * Magazine-spread view of a single completed analysis. Replaces the legacy
 * CompanyAgentPage detail view at this route.
 *
 *   ── Top: breadcrumb back to Studio + meta (model · created · duration)
 *   ── Hero: 96px symbol · Alphabet Inc. · stamped verdict · summary paragraph
 *   ── Seven chapters: I-VII findings with key metrics + citation chips
 *   ── Featured TradingView K-line (full width, real symbol)
 *   ── Prior-verdict timeline strip (every analysis ever run on this symbol)
 *   ── Source ledger footer (every DataPoint cited, grouped by source type)
 *
 * Running analyses get an "in flight" placeholder; M3 will replace that with
 * the live Composing manuscript view.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { motion } from 'framer-motion';
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
import {
  getCompanyAnalysis,
  listCompanyAnalyses,
  type CompanyAnalysisDetail,
  type CompanyAnalysisSummary,
  type DataPoint,
  type GateResult,
} from '../api/company';
import { useCompanyAgentRunStore } from '../stores/companyAgentRunStore';
import ComposingView from '../components/company/ComposingView';

// ─── Constants ────────────────────────────────────────────────────────────

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const SKILL_ORDER = [
  'business_analysis', 'fisher_qa', 'moat_assessment',
  'management_assessment', 'reverse_test', 'valuation', 'final_verdict',
] as const;
const SKILL_TITLES: Record<string, string> = {
  business_analysis: '生意分析',
  fisher_qa: '费雪十五问',
  moat_assessment: '护城河',
  management_assessment: '管理层',
  reverse_test: '逆向检验',
  valuation: '估值',
  final_verdict: '综合裁决',
};

const SOURCE_COLORS: Record<DataPoint['source_type'], string> = {
  yfinance: '#8FA0B8',
  fmp: COLOR_GAIN,
  sec_edgar: COLOR_NEUTRAL,
  google_cse: COLOR_ACCENT,
  computed: COLOR_INK_MUTED,
  company_data: COLOR_INK_MUTED,
};

const SOURCE_LABELS: Record<DataPoint['source_type'], string> = {
  yfinance: 'Y!FIN',
  fmp: 'FMP',
  sec_edgar: 'EDGAR',
  google_cse: 'NEWS',
  computed: 'CALC',
  company_data: 'CO',
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

// ─── Editorial atoms ──────────────────────────────────────────────────────

function MonoCaps({ children, color, size = 10 }: { children: React.ReactNode; color?: string; size?: number }) {
  return (
    <Typography
      component="span"
      sx={{
        fontFamily: FONT_MONO, fontSize: size, letterSpacing: '0.28em',
        textTransform: 'uppercase', color: color ?? COLOR_INK_MUTED,
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
        fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: size,
        color: color ?? COLOR_INK, fontVariationSettings: '"opsz" 36',
        lineHeight: 1.5,
      }}
    >
      {children}
    </Typography>
  );
}

// ─── Stamp verdict ────────────────────────────────────────────────────────

function StampedVerdict({ action, conviction }: { action: string; conviction: number }) {
  const c = verdictColor(action);
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0, rotate: 0 }}
      animate={{ scale: 1, opacity: 1, rotate: -2.4 }}
      transition={{ type: 'spring', stiffness: 110, damping: 11, delay: 0.2 }}
      style={{ display: 'inline-block' }}
    >
      <Box
        sx={{
          display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
          border: `3px double ${c}`, px: 4, py: 1.6,
          position: 'relative', bgcolor: 'rgba(176,82,74,0.04)',
          boxShadow: `0 0 0 1px ${c}33 inset, 0 4px 14px rgba(0,0,0,0.4)`,
          '&::before': {
            content: '""', position: 'absolute', inset: 4,
            border: `1px solid ${c}55`, pointerEvents: 'none',
          },
        }}
      >
        <Typography
          sx={{
            fontFamily: FONT_DISPLAY, fontStyle: 'italic',
            fontSize: 48, lineHeight: 1, letterSpacing: '0.08em',
            color: c, fontVariationSettings: '"opsz" 144, "WONK" 1', fontWeight: 600,
          }}
        >
          {action}
        </Typography>
        <Typography
          sx={{
            fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '0.32em',
            textTransform: 'uppercase', color: c, mt: 0.6, opacity: 0.85,
          }}
        >
          conviction · {conviction.toFixed(2)}
        </Typography>
      </Box>
    </motion.div>
  );
}

// ─── Citation chip ────────────────────────────────────────────────────────

function CitationChip({ id, dp }: { id: number; dp: DataPoint | null }) {
  const c = dp ? SOURCE_COLORS[dp.source_type] : COLOR_INK_FAINT;
  const label = dp ? SOURCE_LABELS[dp.source_type] : 'src';
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex', alignItems: 'baseline',
        gap: 0.3, ml: 0.4,
        fontFamily: FONT_MONO, fontSize: 9, color: c,
        verticalAlign: 'baseline',
        cursor: dp?.source_url ? 'pointer' : 'default',
      }}
      title={dp ? `${label} · ${dp.publisher ?? ''} · ${dp.published_at ?? dp.fetched_at}\n${dp.excerpt ?? ''}` : `src ${id}`}
      onClick={(e) => {
        e.stopPropagation();
        if (dp?.source_url) window.open(dp.source_url, '_blank');
      }}
    >
      <sup>[{id}]</sup>
    </Box>
  );
}

/**
 * Render a body of text that may contain `[src:1,2]` citation markers.
 * Splits on the citation pattern and renders chips inline.
 */
function CitedText({
  text,
  catalog,
  size = 14,
  color = COLOR_INK,
}: {
  text: string;
  catalog: Record<string, DataPoint>;
  size?: number;
  color?: string;
}) {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  const re = /\[src:([\d,\s]+)\]/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const ids = match[1].split(',').map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);
    for (const id of ids) {
      parts.push(<CitationChip key={`c-${key++}`} id={id} dp={catalog[String(id)] ?? null} />);
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return (
    <Typography
      component="span"
      sx={{
        fontFamily: FONT_BODY, fontStyle: 'italic',
        fontSize: size, color, lineHeight: 1.7,
      }}
    >
      {parts}
    </Typography>
  );
}

// ─── Chapter card ─────────────────────────────────────────────────────────

function ChapterCard({
  idx,
  skill,
  gate,
  catalog,
}: {
  idx: number;
  skill: string;
  gate: GateResult;
  catalog: Record<string, DataPoint>;
}) {
  const title = SKILL_TITLES[skill] ?? gate.display_name ?? skill;
  const summary: string = gate.parsed?.summary ?? '';
  const citations: number[] = gate.citations ?? [];

  // Pluck a few highlight metrics per gate
  const highlights = extractHighlights(skill, gate);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: idx * 0.05 }}
    >
      <Box
        sx={{
          pb: 3, mb: 2.5,
          borderBottom: `1px dashed ${COLOR_INK_FAINT}55`,
          breakInside: 'avoid',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.6, mb: 1.4 }}>
          <Typography
            sx={{
              fontFamily: FONT_DISPLAY, fontStyle: 'italic',
              fontSize: 22, color: COLOR_INK_MUTED,
              minWidth: 28, fontVariationSettings: '"opsz" 36',
            }}
          >
            {ROMAN[idx]}
          </Typography>
          <Typography
            sx={{
              fontFamily: FONT_DISPLAY, fontStyle: 'italic',
              fontSize: 22, color: COLOR_INK,
              fontVariationSettings: '"opsz" 36',
            }}
          >
            {title}
          </Typography>
          <Box sx={{ flex: 1 }} />
          {gate.parse_status !== 'structured' && (
            <MonoCaps size={9} color={COLOR_INK_FAINT}>
              {gate.parse_status}
            </MonoCaps>
          )}
        </Box>

        {/* Summary with citations */}
        {summary && (
          <Box sx={{ ml: 4.5, mb: highlights.length > 0 ? 2 : 0 }}>
            <CitedText text={summary} catalog={catalog} size={14} color={COLOR_INK} />
          </Box>
        )}

        {/* Highlights */}
        {highlights.length > 0 && (
          <Box sx={{ ml: 4.5, display: 'flex', flexWrap: 'wrap', gap: 2.5, mt: summary ? 1.2 : 0 }}>
            {highlights.map((h, i) => (
              <Box key={i}>
                <MonoCaps size={9}>{h.label}</MonoCaps>
                <Typography
                  sx={{
                    fontFamily: FONT_MONO, fontSize: 14,
                    color: h.color ?? COLOR_INK,
                    fontFeatureSettings: '"tnum"',
                    mt: 0.3,
                  }}
                >
                  {h.value}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* Inline citation list (if not in summary) */}
        {!summary.includes('[src:') && citations.length > 0 && (
          <Box sx={{ ml: 4.5, mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.4, alignItems: 'baseline' }}>
            <MonoCaps size={9}>cited</MonoCaps>
            {citations.map((id) => (
              <CitationChip key={id} id={id} dp={catalog[String(id)] ?? null} />
            ))}
          </Box>
        )}
      </Box>
    </motion.div>
  );
}

interface Highlight { label: string; value: string; color?: string }

function extractHighlights(skill: string, gate: GateResult): Highlight[] {
  const p = gate.parsed ?? {};
  switch (skill) {
    case 'business_analysis':
      return [
        p.business_quality && { label: 'quality', value: String(p.business_quality), color: p.business_quality === 'excellent' ? COLOR_GAIN : COLOR_INK },
        typeof p.sustainability_score === 'number' && { label: 'sustainability', value: `${p.sustainability_score.toFixed(1)} / 10` },
      ].filter(Boolean) as Highlight[];
    case 'fisher_qa':
      return [
        typeof p.total_score === 'number' && { label: 'fisher score', value: `${p.total_score.toFixed(1)} / 10` },
        p.growth_verdict && { label: 'growth', value: String(p.growth_verdict), color: p.growth_verdict === 'compounder' ? COLOR_GAIN : COLOR_INK },
      ].filter(Boolean) as Highlight[];
    case 'moat_assessment':
      return [
        p.moat_width && { label: 'moat', value: String(p.moat_width), color: p.moat_width === 'wide' ? COLOR_GAIN : p.moat_width === 'none' ? COLOR_LOSS : COLOR_INK },
        p.moat_trend && { label: 'trend', value: String(p.moat_trend), color: p.moat_trend === 'eroding' ? COLOR_LOSS : COLOR_INK },
        typeof p.moat_durability_years === 'number' && { label: 'durability', value: `${p.moat_durability_years}y` },
      ].filter(Boolean) as Highlight[];
    case 'management_assessment':
      return [
        typeof p.management_score === 'number' && { label: 'management', value: `${p.management_score.toFixed(1)} / 10` },
        p.succession_risk && { label: 'succession', value: String(p.succession_risk), color: p.succession_risk === 'high' ? COLOR_LOSS : COLOR_INK },
      ].filter(Boolean) as Highlight[];
    case 'reverse_test':
      return [
        typeof p.resilience_score === 'number' && { label: 'resilience', value: `${p.resilience_score.toFixed(1)} / 10` },
        Array.isArray(p.destruction_scenarios) && { label: 'scenarios', value: `${p.destruction_scenarios.length} 个` },
      ].filter(Boolean) as Highlight[];
    case 'valuation':
      return [
        p.price_assessment && { label: 'price', value: String(p.price_assessment), color: p.price_assessment === 'cheap' ? COLOR_GAIN : p.price_assessment === 'bubble' ? COLOR_LOSS : COLOR_INK },
        p.safety_margin && { label: 'safety', value: String(p.safety_margin), color: p.safety_margin === 'large' ? COLOR_GAIN : p.safety_margin === 'negative' ? COLOR_LOSS : COLOR_INK },
        p.market_sentiment && { label: 'sentiment', value: String(p.market_sentiment) },
      ].filter(Boolean) as Highlight[];
    case 'final_verdict':
      return [
        typeof p.position_size_pct === 'number' && { label: 'size', value: `${p.position_size_pct.toFixed(1)}%` },
        p.hold_horizon && { label: 'horizon', value: String(p.hold_horizon) },
      ].filter(Boolean) as Highlight[];
    default:
      return [];
  }
}

// ─── Source ledger ────────────────────────────────────────────────────────

function SourceLedger({ catalog }: { catalog: Record<string, DataPoint> }) {
  const entries = Object.values(catalog).sort((a, b) => a.id - b.id);
  if (entries.length === 0) return null;
  return (
    <Box>
      <MonoCaps>source ledger · {entries.length} entries</MonoCaps>
      <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', columnGap: 6 }}>
        {entries.map((e) => {
          const c = SOURCE_COLORS[e.source_type];
          return (
            <Box
              key={e.id}
              sx={{
                display: 'flex', alignItems: 'baseline', gap: 1, py: 0.85,
                borderBottom: `1px dashed ${COLOR_INK_FAINT}40`,
                cursor: e.source_url ? 'pointer' : 'default',
                '&:hover': e.source_url ? { bgcolor: 'rgba(244,236,223,0.03)' } : {},
              }}
              onClick={() => e.source_url && window.open(e.source_url, '_blank')}
            >
              <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_FAINT, minWidth: 22, fontFeatureSettings: '"tnum"' }}>
                {String(e.id).padStart(2, '0')}
              </Typography>
              <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: c, mt: 0.5, flexShrink: 0 }} />
              <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: c, letterSpacing: '0.18em', fontWeight: 600, minWidth: 48 }}>
                {SOURCE_LABELS[e.source_type]}
              </Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 12, color: COLOR_INK, lineHeight: 1.4 }}>
                  {e.excerpt ?? e.key}
                </Typography>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, letterSpacing: '0.14em', fontFeatureSettings: '"tnum"' }}>
                  {e.publisher ?? '—'} · {e.published_at ?? e.fetched_at?.slice(0, 10) ?? '—'}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// ─── Prior-verdict timeline strip ─────────────────────────────────────────

function PriorVerdictStrip({
  history,
  currentId,
}: {
  history: CompanyAnalysisSummary[];
  currentId: string;
}) {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return (
    <Box sx={{ mt: 3, pt: 2, borderTop: `1px dashed ${COLOR_INK_FAINT}33` }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 2 }}>
        <MonoCaps size={9}>prior verdicts</MonoCaps>
        <ItalicSerif size={12} color={COLOR_INK_FAINT}>
          {sorted.length} 次研究 · 时间倒排
        </ItalicSerif>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'baseline' }}>
        {sorted.map((h) => {
          const c = verdictColor(h.verdict_action);
          const isCurrent = h.id === currentId;
          return (
            <Box key={h.id} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8 }}>
              <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_FAINT, letterSpacing: '0.14em', fontFeatureSettings: '"tnum"' }}>
                {fmtDate(h.created_at)}
              </Typography>
              <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: c, letterSpacing: '0.18em', fontWeight: isCurrent ? 700 : 500 }}>
                {h.verdict_action}
              </Typography>
              <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_MUTED, fontFeatureSettings: '"tnum"' }}>
                ·{h.verdict_conviction.toFixed(2)}
              </Typography>
              <ItalicSerif size={11} color={COLOR_INK_FAINT}>
                {h.provider}{h.model ? `/${h.model}` : ''}
              </ItalicSerif>
              {isCurrent && (
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 8.5, color: COLOR_INK, letterSpacing: '0.32em', ml: 0.4 }}>
                  ← 当前
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// ─── In-flight placeholder (running analyses) ─────────────────────────────

function InFlightPlaceholder({
  detail,
  onBack,
}: {
  detail: CompanyAnalysisDetail;
  onBack: () => void;
}) {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <Box sx={{ textAlign: 'center' }}>
        <MonoCaps>正在起草中 · in flight</MonoCaps>
        <Typography
          sx={{
            mt: 2, fontFamily: FONT_DISPLAY, fontStyle: 'italic',
            fontSize: 88, color: COLOR_INK, lineHeight: 0.95,
            letterSpacing: '-0.025em', fontVariationSettings: '"opsz" 144, "SOFT" 60',
            fontWeight: 600,
          }}
        >
          {detail.symbol}
        </Typography>
        <Typography sx={{ mt: 1, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 18, color: COLOR_INK_MUTED }}>
          {detail.company_name}
        </Typography>
        <Typography sx={{ mt: 4, fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 14, color: COLOR_INK_FAINT, lineHeight: 1.7, maxWidth: 480, mx: 'auto' }}>
          研究尚在进行中，七章档案正在依次起草。完整呈现将在 Composing 视图（M3）中以稿件实时显示。
        </Typography>
      </Box>

      <Box
        onClick={onBack}
        sx={{
          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.32em',
          textTransform: 'uppercase', color: COLOR_BG, bgcolor: COLOR_INK,
          px: 3, py: 1.2, cursor: 'pointer',
          '&:hover': { bgcolor: '#FFF8EA' },
        }}
      >
        ← 回到研究台
      </Box>
    </Box>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function CompanyAgentDossier() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<CompanyAnalysisDetail | null>(null);
  const [history, setHistory] = useState<CompanyAnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live run for this analysis (if any). When present, render Composing.
  const liveRun = useCompanyAgentRunStore((s) =>
    id ? Array.from(s.runs.values()).find((r) => r.analysisId === id) ?? null : null,
  );

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const d = await getCompanyAnalysis(id);
      setDetail(d);
      try {
        const { analyses } = await listCompanyAnalyses({ symbol: d.symbol, limit: 50 });
        setHistory(analyses);
      } catch { /* ignore */ }
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    void reload();
  }, [id, reload]);

  // When a live run finishes, refresh the detail to flip into Filed view
  useEffect(() => {
    if (liveRun?.done) void reload();
  }, [liveRun?.done, reload]);

  const fullReport = detail?.full_report;
  const catalog: Record<string, DataPoint> = useMemo(() => fullReport?.source_catalog ?? {}, [fullReport]);
  const skills = fullReport?.skills ?? {};
  const verdict = fullReport?.verdict;

  return (
    <Box
      sx={{
        m: -3,
        minHeight: '100vh',
        width: 'calc(100% + 48px)',
        bgcolor: COLOR_BG,
        backgroundImage: BACKGROUND_PAPER,
        color: COLOR_INK,
        fontFamily: FONT_BODY,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      {/* ── Top bar ── */}
      <Box
        sx={{
          flexShrink: 0,
          px: 5, py: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${COLOR_INK_FAINT}33`,
          bgcolor: COLOR_BG_RAISED,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <Typography
            onClick={() => navigate('/company-agent')}
            sx={{
              fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_MUTED,
              letterSpacing: '0.28em', textTransform: 'uppercase', cursor: 'pointer',
              '&:hover': { color: COLOR_INK },
            }}
          >
            ← 研究台
          </Typography>
          {detail && (
            <>
              <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, letterSpacing: '0.32em' }}>·</Typography>
              <MonoCaps size={9.5}>folio · {fmtDate(detail.created_at)}</MonoCaps>
              <ItalicSerif size={12} color={COLOR_INK_MUTED}>
                {detail.provider}{detail.model ? ` / ${detail.model}` : ''}
              </ItalicSerif>
              <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, letterSpacing: '0.14em', fontFeatureSettings: '"tnum"' }}>
                · {fmtDuration(detail.total_latency_ms)}
              </Typography>
            </>
          )}
        </Box>
      </Box>

      {/* ── Body ── */}
      {loading && (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MonoCaps>loading…</MonoCaps>
        </Box>
      )}

      {!loading && error && (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
          <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 28, color: COLOR_LOSS }}>
            档案加载失败
          </Typography>
          <ItalicSerif size={14} color={COLOR_INK_MUTED}>{error}</ItalicSerif>
          <Typography
            onClick={() => navigate('/company-agent')}
            sx={{
              fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_MUTED,
              letterSpacing: '0.28em', cursor: 'pointer', mt: 2,
              '&:hover': { color: COLOR_INK },
            }}
          >
            ← 回到研究台
          </Typography>
        </Box>
      )}

      {!loading && !error && detail && detail.status === 'running' && liveRun && !liveRun.done && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ComposingView run={liveRun} />
        </Box>
      )}

      {!loading && !error && detail && detail.status === 'running' && (!liveRun || liveRun.done) && (
        <Box sx={{ flex: 1 }}>
          <InFlightPlaceholder detail={detail} onBack={() => navigate('/company-agent')} />
        </Box>
      )}

      {!loading && !error && detail && detail.status !== 'running' && fullReport && (
        <Box sx={{ maxWidth: 1180, mx: 'auto', px: { xs: 4, md: 6 }, py: 5, width: '100%' }}>
          {/* ── Hero ── */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, alignItems: 'start', mb: 6 }}>
            <Box>
              <MonoCaps size={10}>verdict</MonoCaps>
              <Box sx={{ mt: 2, mb: 4 }}>
                {verdict && <StampedVerdict action={verdict.action} conviction={verdict.conviction} />}
              </Box>
              <Typography
                sx={{
                  fontFamily: FONT_DISPLAY, fontStyle: 'italic',
                  fontSize: 96, color: COLOR_INK,
                  lineHeight: 0.92, letterSpacing: '-0.04em',
                  fontVariationSettings: '"opsz" 144, "SOFT" 60', fontWeight: 600,
                }}
              >
                {detail.symbol}
              </Typography>
              <Typography sx={{ fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 22, color: COLOR_INK_MUTED, mt: 1 }}>
                {detail.company_name}
              </Typography>

              {/* Verdict prose with citations */}
              {verdict?.position_reasoning && (
                <Box sx={{ mt: 4, maxWidth: 520 }}>
                  <CitedText
                    text={verdict.position_reasoning}
                    catalog={catalog}
                    size={15}
                    color={COLOR_INK}
                  />
                </Box>
              )}

              {verdict?.position_size_pct != null && (
                <Box sx={{ mt: 4, display: 'flex', gap: 4 }}>
                  <Box>
                    <MonoCaps size={9}>position size</MonoCaps>
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 22, color: COLOR_INK, fontFeatureSettings: '"tnum"', mt: 0.4 }}>
                      {verdict.position_size_pct.toFixed(1)}%
                    </Typography>
                  </Box>
                  <Box>
                    <MonoCaps size={9}>quality</MonoCaps>
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 14, color: COLOR_INK, mt: 0.4 }}>
                      {verdict.quality_verdict}
                    </Typography>
                  </Box>
                  {verdict.hold_horizon && (
                    <Box>
                      <MonoCaps size={9}>horizon</MonoCaps>
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 14, color: COLOR_INK, mt: 0.4 }}>
                        {verdict.hold_horizon}
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Box>

            <Box>
              <MonoCaps size={10}>七章摘要 · seven chapters</MonoCaps>
              <Box sx={{ mt: 3 }}>
                {SKILL_ORDER.map((skill, i) => {
                  const gate = skills[skill];
                  if (!gate) return null;
                  return <ChapterCard key={skill} idx={i} skill={skill} gate={gate} catalog={catalog} />;
                })}
              </Box>
            </Box>
          </Box>

          {/* ── K-line + prior-verdict timeline ── */}
          <Box sx={{ mt: 4, mb: 6 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
                <MonoCaps size={10}>price · live</MonoCaps>
                <ItalicSerif size={13} color={COLOR_INK_MUTED}>{detail.symbol} · 实时行情</ItalicSerif>
              </Box>
              {fullReport.current_price > 0 && (
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 16, color: COLOR_INK, fontFeatureSettings: '"tnum"' }}>
                  ${fullReport.current_price.toFixed(2)}
                </Typography>
              )}
            </Box>
            <Box sx={{ height: 420, border: `1px solid ${COLOR_INK_FAINT}33` }}>
              <TradingViewChart symbol={detail.symbol} />
            </Box>
            <PriorVerdictStrip history={history} currentId={detail.id} />
          </Box>

          {/* ── Source ledger ── */}
          {Object.keys(catalog).length > 0 && (
            <Box sx={{ mt: 6, pt: 4, borderTop: `1px solid ${COLOR_INK_FAINT}` }}>
              <SourceLedger catalog={catalog} />
            </Box>
          )}

          {/* ── Footer ── */}
          <Box sx={{ mt: 6, pt: 3, pb: 4, borderTop: `1px dashed ${COLOR_INK_FAINT}55`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <MonoCaps size={9}>filed · {fmtDate(detail.created_at)} · {fmtDuration(detail.total_latency_ms)}</MonoCaps>
            <Typography
              onClick={() => navigate('/company-agent')}
              sx={{
                fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_MUTED,
                letterSpacing: '0.28em', cursor: 'pointer',
                textTransform: 'uppercase',
                '&:hover': { color: COLOR_INK },
              }}
            >
              ← 回到研究台
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}
