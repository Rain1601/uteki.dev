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

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: idx * 0.05 }}
    >
      <Box sx={{ pb: 4, mb: 3, borderBottom: `1px dashed ${COLOR_INK_FAINT}55`, breakInside: 'avoid' }}>
        {/* Chapter header */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.6, mb: 1.6 }}>
          <Typography
            sx={{
              fontFamily: FONT_DISPLAY, fontStyle: 'italic',
              fontSize: 24, color: COLOR_INK_MUTED,
              minWidth: 30, fontVariationSettings: '"opsz" 36',
            }}
          >
            {ROMAN[idx]}
          </Typography>
          <Typography
            sx={{
              fontFamily: FONT_DISPLAY, fontStyle: 'italic',
              fontSize: 24, color: COLOR_INK,
              fontVariationSettings: '"opsz" 36',
            }}
          >
            {title}
          </Typography>
          <Box sx={{ flex: 1 }} />
          {gate.parse_status !== 'structured' && (
            <MonoCaps size={9} color={COLOR_INK_FAINT}>{gate.parse_status}</MonoCaps>
          )}
        </Box>

        {/* Summary lead */}
        {summary && (
          <Box sx={{ ml: 4.7, mb: 2.4 }}>
            <CitedText text={summary} catalog={catalog} size={14.5} color={COLOR_INK} />
          </Box>
        )}

        {/* Type-specific body */}
        <Box sx={{ ml: 4.7 }}>
          <ChapterBody skill={skill} gate={gate} catalog={catalog} />
        </Box>

        {/* Inline citation list (only if summary had no inline citations) */}
        {!summary.includes('[src:') && citations.length > 0 && (
          <Box sx={{ ml: 4.7, mt: 2, display: 'flex', flexWrap: 'wrap', gap: 0.4, alignItems: 'baseline' }}>
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

// ─── Per-gate chapter bodies ──────────────────────────────────────────────

interface ChapterBodyProps {
  skill: string;
  gate: GateResult;
  catalog: Record<string, DataPoint>;
}

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1, mt: 2 }}>
      <MonoCaps size={9}>{children}</MonoCaps>
      <Box sx={{ flex: 1, height: 1, bgcolor: COLOR_INK_FAINT, opacity: 0.4 }} />
    </Box>
  );
}

function StatRow({ stats }: { stats: Array<{ label: string; value: string; color?: string }> }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 1.5 }}>
      {stats.map((s, i) => (
        <Box key={i}>
          <MonoCaps size={9}>{s.label}</MonoCaps>
          <Typography
            sx={{
              fontFamily: FONT_MONO, fontSize: 15,
              color: s.color ?? COLOR_INK,
              fontFeatureSettings: '"tnum"',
              mt: 0.3,
            }}
          >
            {s.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function Bullet({ text, catalog, color = COLOR_INK }: { text: string; catalog: Record<string, DataPoint>; color?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.6 }}>
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, mt: 0.2 }}>·</Typography>
      <Box sx={{ flex: 1 }}>
        <CitedText text={text} catalog={catalog} size={12.5} color={color} />
      </Box>
    </Box>
  );
}

function ScoreBar({ score, max = 10 }: { score: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  const c = score >= 7 ? COLOR_GAIN : score >= 4 ? COLOR_NEUTRAL : COLOR_LOSS;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ flex: 1, height: 3, bgcolor: COLOR_INK_FAINT + '40', position: 'relative' }}>
        <Box sx={{ position: 'absolute', inset: 0, width: `${pct}%`, bgcolor: c }} />
      </Box>
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 11, color: c, fontFeatureSettings: '"tnum"', minWidth: 36, textAlign: 'right' }}>
        {score.toFixed(1)}/{max}
      </Typography>
    </Box>
  );
}

function ChapterBody({ skill, gate, catalog }: ChapterBodyProps) {
  const p = gate.parsed ?? {};

  // ── I. Business analysis ──
  if (skill === 'business_analysis') {
    const streams = Array.isArray(p.revenue_streams) ? p.revenue_streams : [];
    const reasons = Array.isArray(p.quality_reasons) ? p.quality_reasons : [];
    return (
      <>
        <StatRow stats={[
          p.business_quality && { label: 'quality', value: String(p.business_quality), color: p.business_quality === 'excellent' ? COLOR_GAIN : p.business_quality === 'poor' ? COLOR_LOSS : COLOR_INK },
          typeof p.sustainability_score === 'number' && { label: 'sustainability', value: `${p.sustainability_score.toFixed(1)} / 10` },
          typeof p.is_good_business === 'boolean' && { label: 'good business', value: p.is_good_business ? '✓' : '✕', color: p.is_good_business ? COLOR_GAIN : COLOR_LOSS },
        ].filter(Boolean) as any}/>

        {streams.length > 0 && (
          <>
            <SubHead>营收结构 · revenue streams</SubHead>
            {streams.slice(0, 5).map((s: any, i: number) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 0.8 }}>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 11, color: COLOR_INK_MUTED, fontFeatureSettings: '"tnum"', minWidth: 38, textAlign: 'right' }}>
                  {typeof s.percentage === 'number' ? `${s.percentage.toFixed(0)}%` : '—'}
                </Typography>
                <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 13, color: COLOR_INK, fontWeight: 500, minWidth: 100 }}>
                  {s.name}
                </Typography>
                <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 12, color: COLOR_INK_MUTED, flex: 1 }}>
                  {s.description}
                </Typography>
                {s.growth && (
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_FAINT, letterSpacing: '0.14em' }}>
                    {s.growth}
                  </Typography>
                )}
              </Box>
            ))}
          </>
        )}

        {reasons.length > 0 && (
          <>
            <SubHead>质量论据 · why</SubHead>
            {reasons.slice(0, 4).map((r: string, i: number) => <Bullet key={i} text={r} catalog={catalog} />)}
          </>
        )}
      </>
    );
  }

  // ── II. Fisher's Fifteen ──
  if (skill === 'fisher_qa') {
    const questions: any[] = Array.isArray(p.questions) ? p.questions : [];
    const greens: string[] = Array.isArray(p.green_flags) ? p.green_flags : [];
    const reds: string[] = Array.isArray(p.red_flags) ? p.red_flags : [];
    const sortedQs = [...questions].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const topQs = sortedQs.slice(0, 4);
    const lowQs = sortedQs.slice(-2).filter((q) => (q.score ?? 0) < 6);
    return (
      <>
        <StatRow stats={[
          typeof p.total_score === 'number' && { label: 'fisher score', value: `${p.total_score.toFixed(1)} / 10` },
          p.growth_verdict && { label: 'growth verdict', value: String(p.growth_verdict), color: p.growth_verdict === 'compounder' ? COLOR_GAIN : p.growth_verdict === 'declining' ? COLOR_LOSS : COLOR_INK },
          typeof questions.length === 'number' && questions.length > 0 && { label: 'answered', value: `${questions.length} / 15` },
        ].filter(Boolean) as any}/>

        {topQs.length > 0 && (
          <>
            <SubHead>强项答题 · highest scores</SubHead>
            {topQs.map((q: any, i: number) => (
              <Box key={i} sx={{ mb: 1.4 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.2, mb: 0.4 }}>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: COLOR_INK_FAINT, letterSpacing: '0.14em', minWidth: 28 }}>
                    Q{q.id ?? i + 1}
                  </Typography>
                  <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 12, color: COLOR_INK_MUTED, flex: 1, lineHeight: 1.4 }}>
                    {q.question}
                  </Typography>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: (q.score ?? 0) >= 8 ? COLOR_GAIN : COLOR_INK, fontFeatureSettings: '"tnum"' }}>
                    {typeof q.score === 'number' ? q.score.toFixed(1) : '—'}
                  </Typography>
                </Box>
                <Box sx={{ ml: 4 }}>
                  <CitedText text={q.answer ?? ''} catalog={catalog} size={12.5} color={COLOR_INK} />
                </Box>
              </Box>
            ))}
          </>
        )}

        {lowQs.length > 0 && (
          <>
            <SubHead>弱项 · concerns</SubHead>
            {lowQs.map((q: any, i: number) => (
              <Box key={i} sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.2, mb: 0.4 }}>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: COLOR_LOSS, letterSpacing: '0.14em', minWidth: 28 }}>
                    Q{q.id ?? '?'}
                  </Typography>
                  <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 12, color: COLOR_INK_MUTED, flex: 1, lineHeight: 1.4 }}>
                    {q.question}
                  </Typography>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_LOSS, fontFeatureSettings: '"tnum"' }}>
                    {typeof q.score === 'number' ? q.score.toFixed(1) : '—'}
                  </Typography>
                </Box>
                <Box sx={{ ml: 4 }}>
                  <CitedText text={q.answer ?? ''} catalog={catalog} size={12} color={COLOR_INK_MUTED} />
                </Box>
              </Box>
            ))}
          </>
        )}

        {greens.length > 0 && (
          <>
            <SubHead>green flags</SubHead>
            {greens.slice(0, 4).map((g, i) => <Bullet key={i} text={g} catalog={catalog} color={COLOR_GAIN} />)}
          </>
        )}
        {reds.length > 0 && (
          <>
            <SubHead>red flags</SubHead>
            {reds.slice(0, 3).map((r, i) => <Bullet key={i} text={r} catalog={catalog} color={COLOR_LOSS} />)}
          </>
        )}
      </>
    );
  }

  // ── III. Moat ──
  if (skill === 'moat_assessment') {
    const types: any[] = Array.isArray(p.moat_types) ? p.moat_types : [];
    const evidence: string[] = Array.isArray(p.moat_evidence) ? p.moat_evidence : [];
    const threats: string[] = Array.isArray(p.moat_threats) ? p.moat_threats : [];
    return (
      <>
        <StatRow stats={[
          p.moat_width && { label: 'width', value: String(p.moat_width), color: p.moat_width === 'wide' ? COLOR_GAIN : p.moat_width === 'none' ? COLOR_LOSS : COLOR_INK },
          p.moat_trend && { label: 'trend', value: String(p.moat_trend), color: p.moat_trend === 'eroding' ? COLOR_LOSS : p.moat_trend === 'strengthening' ? COLOR_GAIN : COLOR_INK },
          typeof p.moat_durability_years === 'number' && { label: 'durability', value: `${p.moat_durability_years} 年` },
        ].filter(Boolean) as any}/>

        {p.competitive_position && (
          <Box sx={{ mb: 2 }}>
            <MonoCaps size={9}>竞争位置</MonoCaps>
            <Box sx={{ mt: 0.6 }}>
              <CitedText text={String(p.competitive_position)} catalog={catalog} size={12.5} color={COLOR_INK} />
            </Box>
          </Box>
        )}

        {types.length > 0 && (
          <>
            <SubHead>护城河类型 · moat types</SubHead>
            {types.map((t: any, i: number) => {
              const c = t.strength === 'strong' ? COLOR_GAIN : t.strength === 'weak' ? COLOR_LOSS : COLOR_NEUTRAL;
              return (
                <Box key={i} sx={{ mb: 1.2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.2, mb: 0.4 }}>
                    <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 13, color: COLOR_INK, fontWeight: 600, minWidth: 110 }}>
                      {t.type}
                    </Typography>
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: c, letterSpacing: '0.18em', fontWeight: 600 }}>
                      {t.strength}
                    </Typography>
                  </Box>
                  <Box sx={{ ml: 1.5 }}>
                    <CitedText text={t.evidence ?? ''} catalog={catalog} size={12} color={COLOR_INK_MUTED} />
                  </Box>
                </Box>
              );
            })}
          </>
        )}

        {evidence.length > 0 && (
          <>
            <SubHead>证据 · evidence</SubHead>
            {evidence.slice(0, 3).map((e, i) => <Bullet key={i} text={e} catalog={catalog} />)}
          </>
        )}
        {threats.length > 0 && (
          <>
            <SubHead>威胁 · threats</SubHead>
            {threats.slice(0, 3).map((t, i) => <Bullet key={i} text={t} catalog={catalog} color={COLOR_LOSS} />)}
          </>
        )}
      </>
    );
  }

  // ── IV. Management ──
  if (skill === 'management_assessment') {
    return (
      <>
        <StatRow stats={[
          typeof p.management_score === 'number' && { label: 'overall', value: `${p.management_score.toFixed(1)} / 10` },
          p.succession_risk && { label: 'succession', value: String(p.succession_risk), color: p.succession_risk === 'high' ? COLOR_LOSS : p.succession_risk === 'low' ? COLOR_GAIN : COLOR_INK },
        ].filter(Boolean) as any}/>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1.4, mb: 2 }}>
          {[
            { label: '诚信 · integrity', score: p.integrity_score, detail: p.integrity_evidence },
            { label: '资本配置 · capital alloc', score: p.capital_allocation_score, detail: p.capital_allocation_detail },
            { label: '股东导向 · shareholder', score: p.shareholder_orientation_score, detail: p.shareholder_orientation_detail },
          ].filter((x) => typeof x.score === 'number').map((row, i) => (
            <Box key={i}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.5 }}>
                <MonoCaps size={9}>{row.label}</MonoCaps>
              </Box>
              <ScoreBar score={row.score!} />
              {row.detail && (
                <Box sx={{ mt: 0.5 }}>
                  <CitedText text={String(row.detail)} catalog={catalog} size={11.5} color={COLOR_INK_MUTED} />
                </Box>
              )}
            </Box>
          ))}
        </Box>

        {p.insider_signal && (
          <Box sx={{ mb: 1.4 }}>
            <MonoCaps size={9}>insider signal</MonoCaps>
            <Box sx={{ mt: 0.5 }}>
              <CitedText text={String(p.insider_signal)} catalog={catalog} size={12} color={COLOR_INK} />
            </Box>
          </Box>
        )}
        {p.key_person_risk && (
          <Box sx={{ mb: 1.4 }}>
            <MonoCaps size={9}>key person risk</MonoCaps>
            <Box sx={{ mt: 0.5 }}>
              <CitedText text={String(p.key_person_risk)} catalog={catalog} size={12} color={COLOR_INK_MUTED} />
            </Box>
          </Box>
        )}
      </>
    );
  }

  // ── V. Reverse test ──
  if (skill === 'reverse_test') {
    const scenarios: any[] = Array.isArray(p.destruction_scenarios) ? p.destruction_scenarios : [];
    const flags: any[] = Array.isArray(p.red_flags) ? p.red_flags : [];
    const triggered = flags.filter((f) => f.triggered);
    const biases: string[] = Array.isArray(p.cognitive_biases) ? p.cognitive_biases : [];
    return (
      <>
        <StatRow stats={[
          typeof p.resilience_score === 'number' && { label: 'resilience', value: `${p.resilience_score.toFixed(1)} / 10` },
          { label: 'scenarios', value: String(scenarios.length) },
          { label: 'red flags', value: `${triggered.length} / ${flags.length}`, color: triggered.length > 0 ? COLOR_LOSS : COLOR_GAIN },
        ]}/>

        {scenarios.length > 0 && (
          <>
            <SubHead>毁灭场景 · destruction scenarios</SubHead>
            {scenarios.slice(0, 4).map((s: any, i: number) => {
              const prob = typeof s.probability === 'number' ? Math.max(0, Math.min(1, s.probability)) : 0;
              const impact = typeof s.impact === 'number' ? Math.max(0, Math.min(10, s.impact)) : 0;
              const severity = prob * impact;
              const c = severity >= 4 ? COLOR_LOSS : severity >= 2 ? COLOR_NEUTRAL : COLOR_INK_MUTED;
              return (
                <Box key={i} sx={{ mb: 1.4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.2, mb: 0.4 }}>
                    <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 13, color: COLOR_INK, fontWeight: 500, flex: 1 }}>
                      {s.scenario}
                    </Typography>
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: c, fontFeatureSettings: '"tnum"', letterSpacing: '0.1em' }}>
                      P {(prob * 100).toFixed(0)}% · I {impact.toFixed(1)}/10
                    </Typography>
                  </Box>
                  {s.timeline && (
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: COLOR_INK_FAINT, letterSpacing: '0.14em', ml: 0.5, mb: 0.4 }}>
                      {s.timeline}
                    </Typography>
                  )}
                  {s.reasoning && (
                    <Box sx={{ ml: 0.5 }}>
                      <CitedText text={s.reasoning} catalog={catalog} size={12} color={COLOR_INK_MUTED} />
                    </Box>
                  )}
                </Box>
              );
            })}
          </>
        )}

        {triggered.length > 0 && (
          <>
            <SubHead>已触发红旗</SubHead>
            {triggered.slice(0, 3).map((f: any, i: number) => (
              <Box key={i} sx={{ mb: 0.8 }}>
                <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 12.5, color: COLOR_LOSS, fontWeight: 500 }}>
                  ⚠ {f.flag}
                </Typography>
                {f.detail && (
                  <Box sx={{ ml: 2 }}>
                    <CitedText text={f.detail} catalog={catalog} size={11.5} color={COLOR_INK_MUTED} />
                  </Box>
                )}
              </Box>
            ))}
          </>
        )}

        {p.worst_case_narrative && (
          <Box sx={{ mt: 2, pl: 2, borderLeft: `2px solid ${COLOR_LOSS}55` }}>
            <MonoCaps size={9} color={COLOR_LOSS}>worst case</MonoCaps>
            <Box sx={{ mt: 0.6 }}>
              <CitedText text={String(p.worst_case_narrative)} catalog={catalog} size={12.5} color={COLOR_INK_MUTED} />
            </Box>
          </Box>
        )}

        {biases.length > 0 && (
          <>
            <SubHead>认知偏差 · cognitive biases</SubHead>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
              {biases.map((b, i) => (
                <Typography key={i} sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_NEUTRAL, letterSpacing: '0.14em', border: `1px solid ${COLOR_NEUTRAL}55`, px: 0.8, py: 0.2 }}>
                  {b}
                </Typography>
              ))}
            </Box>
          </>
        )}
      </>
    );
  }

  // ── VI. Valuation ──
  if (skill === 'valuation') {
    return (
      <>
        <StatRow stats={[
          p.price_assessment && { label: 'price', value: String(p.price_assessment), color: p.price_assessment === 'cheap' ? COLOR_GAIN : p.price_assessment === 'bubble' || p.price_assessment === 'expensive' ? COLOR_LOSS : COLOR_INK },
          p.safety_margin && { label: 'safety margin', value: String(p.safety_margin), color: p.safety_margin === 'large' ? COLOR_GAIN : p.safety_margin === 'negative' ? COLOR_LOSS : COLOR_INK },
          p.market_sentiment && { label: 'sentiment', value: String(p.market_sentiment), color: p.market_sentiment === 'fear' ? COLOR_GAIN : p.market_sentiment === 'euphoria' ? COLOR_LOSS : COLOR_INK },
          typeof p.buy_confidence === 'number' && { label: 'buy confidence', value: `${(p.buy_confidence * 100).toFixed(0)}%` },
        ].filter(Boolean) as any}/>

        {p.price_reasoning && (
          <Box sx={{ mb: 1.4 }}>
            <MonoCaps size={9}>价格逻辑</MonoCaps>
            <Box sx={{ mt: 0.5 }}>
              <CitedText text={String(p.price_reasoning)} catalog={catalog} size={12.5} color={COLOR_INK} />
            </Box>
          </Box>
        )}
        {p.safety_margin_detail && (
          <Box sx={{ mb: 1.4 }}>
            <MonoCaps size={9}>安全边际</MonoCaps>
            <Box sx={{ mt: 0.5 }}>
              <CitedText text={String(p.safety_margin_detail)} catalog={catalog} size={12} color={COLOR_INK_MUTED} />
            </Box>
          </Box>
        )}
        {p.comparable_assessment && (
          <Box sx={{ mb: 1.4 }}>
            <MonoCaps size={9}>同业对比</MonoCaps>
            <Box sx={{ mt: 0.5 }}>
              <CitedText text={String(p.comparable_assessment)} catalog={catalog} size={12} color={COLOR_INK_MUTED} />
            </Box>
          </Box>
        )}
        {p.price_vs_quality && (
          <Box sx={{ mb: 1.4 }}>
            <MonoCaps size={9}>价格 vs 质量</MonoCaps>
            <Box sx={{ mt: 0.5 }}>
              <CitedText text={String(p.price_vs_quality)} catalog={catalog} size={12} color={COLOR_INK_MUTED} />
            </Box>
          </Box>
        )}
      </>
    );
  }

  // ── VII. Final verdict ──
  if (skill === 'final_verdict') {
    // Backend nests the actual verdict fields under .position_holding;
    // older runs may have them at top level. Fall back gracefully.
    const v = (p.position_holding && typeof p.position_holding === 'object') ? p.position_holding as Record<string, any> : p;
    const sells: string[] = Array.isArray(v.sell_triggers) ? v.sell_triggers : [];
    const adds: string[] = Array.isArray(v.add_triggers) ? v.add_triggers : [];
    const philo = (v.philosophy_scores && typeof v.philosophy_scores === 'object') ? v.philosophy_scores as Record<string, number> : {};
    return (
      <>
        <StatRow stats={[
          v.action && { label: 'action', value: String(v.action), color: v.action === 'BUY' ? COLOR_GAIN : v.action === 'AVOID' ? COLOR_LOSS : COLOR_NEUTRAL },
          typeof v.conviction === 'number' && { label: 'conviction', value: v.conviction.toFixed(2) },
          typeof v.position_size_pct === 'number' && { label: 'position size', value: `${v.position_size_pct.toFixed(1)}%` },
          v.hold_horizon && { label: 'horizon', value: String(v.hold_horizon) },
          v.quality_verdict && { label: 'quality', value: String(v.quality_verdict) },
        ].filter(Boolean) as any}/>

        {/* Position reasoning prose (if it exists at this level) */}
        {v.position_reasoning && (
          <Box sx={{ mb: 2.5 }}>
            <CitedText text={String(v.position_reasoning)} catalog={catalog} size={13.5} color={COLOR_INK} />
          </Box>
        )}

        {v.one_sentence && (
          <Box sx={{ mb: 2, pl: 2, borderLeft: `2px solid ${COLOR_INK}` }}>
            <MonoCaps size={9}>one sentence</MonoCaps>
            <Typography sx={{ mt: 0.4, fontFamily: FONT_DISPLAY, fontStyle: 'italic', fontSize: 16, color: COLOR_INK, lineHeight: 1.5 }}>
              {String(v.one_sentence)}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 4, mt: 2 }}>
          {adds.length > 0 && (
            <Box>
              <SubHead>add triggers · 加仓信号</SubHead>
              {adds.slice(0, 6).map((a, i) => <Bullet key={i} text={a} catalog={catalog} color={COLOR_GAIN} />)}
            </Box>
          )}
          {sells.length > 0 && (
            <Box>
              <SubHead>sell triggers · 止损/卖出</SubHead>
              {sells.slice(0, 6).map((s, i) => <Bullet key={i} text={s} catalog={catalog} color={COLOR_LOSS} />)}
            </Box>
          )}
        </Box>

        {Object.keys(philo).length > 0 && (
          <>
            <SubHead>philosophy match · 哲学契合度</SubHead>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 4, rowGap: 1.2, mt: 0.5 }}>
              {Object.entries(philo).slice(0, 8).map(([name, score], i) => (
                <Box key={i}>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_MUTED, letterSpacing: '0.14em', mb: 0.3 }}>
                    {name}
                  </Typography>
                  <ScoreBar score={Number(score)} />
                </Box>
              ))}
            </Box>
          </>
        )}

        {(v.buffett_comment || v.fisher_comment || v.munger_comment) && (
          <>
            <SubHead>大师评语</SubHead>
            {v.buffett_comment && (
              <Box sx={{ mb: 1.2, pl: 2, borderLeft: `2px solid ${COLOR_INK_FAINT}` }}>
                <MonoCaps size={9}>buffett</MonoCaps>
                <Box sx={{ mt: 0.4 }}>
                  <CitedText text={String(v.buffett_comment)} catalog={catalog} size={12.5} color={COLOR_INK} />
                </Box>
              </Box>
            )}
            {v.fisher_comment && (
              <Box sx={{ mb: 1.2, pl: 2, borderLeft: `2px solid ${COLOR_INK_FAINT}` }}>
                <MonoCaps size={9}>fisher</MonoCaps>
                <Box sx={{ mt: 0.4 }}>
                  <CitedText text={String(v.fisher_comment)} catalog={catalog} size={12.5} color={COLOR_INK} />
                </Box>
              </Box>
            )}
            {v.munger_comment && (
              <Box sx={{ mb: 1.2, pl: 2, borderLeft: `2px solid ${COLOR_INK_FAINT}` }}>
                <MonoCaps size={9}>munger</MonoCaps>
                <Box sx={{ mt: 0.4 }}>
                  <CitedText text={String(v.munger_comment)} catalog={catalog} size={12.5} color={COLOR_INK} />
                </Box>
              </Box>
            )}
          </>
        )}
      </>
    );
  }

  return null;
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
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 480px', gap: 6, alignItems: 'start', mb: 7 }}>
            {/* Left — verdict + symbol + summary + meta */}
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

              {verdict?.position_reasoning && (
                <Box sx={{ mt: 4, maxWidth: 620 }}>
                  <CitedText
                    text={verdict.position_reasoning}
                    catalog={catalog}
                    size={16}
                    color={COLOR_INK}
                  />
                </Box>
              )}

              {verdict?.position_size_pct != null && (
                <Box sx={{ mt: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
                  {fullReport.current_price > 0 && (
                    <Box>
                      <MonoCaps size={9}>price</MonoCaps>
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 14, color: COLOR_INK, fontFeatureSettings: '"tnum"', mt: 0.4 }}>
                        ${fullReport.current_price.toFixed(2)}
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Box>

            {/* Right — companion K-line + prior verdicts (compact) */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
                <MonoCaps size={9}>price</MonoCaps>
                <ItalicSerif size={11} color={COLOR_INK_FAINT}>9 months</ItalicSerif>
              </Box>
              <Box sx={{ height: 360, position: 'relative', border: `1px solid ${COLOR_INK_FAINT}33` }}>
                <TradingViewChart symbol={detail.symbol} />
              </Box>

              {history.length > 0 && (
                <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px dashed ${COLOR_INK_FAINT}33` }}>
                  <MonoCaps size={9}>prior verdicts · {history.length}</MonoCaps>
                  <Box sx={{ mt: 1.4, display: 'flex', flexDirection: 'column', gap: 0.8, maxHeight: 180, overflowY: 'auto' }}>
                    {[...history]
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((h) => {
                        const c = verdictColor(h.verdict_action);
                        const isCurrent = h.id === detail.id;
                        return (
                          <Box key={h.id} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8, opacity: isCurrent ? 1 : 0.85 }}>
                            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, fontFeatureSettings: '"tnum"', minWidth: 64 }}>
                              {fmtDate(h.created_at)}
                            </Typography>
                            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: c, letterSpacing: '0.18em', fontWeight: isCurrent ? 700 : 500, minWidth: 38 }}>
                              {h.verdict_action}
                            </Typography>
                            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_MUTED, fontFeatureSettings: '"tnum"' }}>
                              ·{h.verdict_conviction.toFixed(2)}
                            </Typography>
                            <Box sx={{ flex: 1, minWidth: 0 }} />
                            {isCurrent && (
                              <Typography sx={{ fontFamily: FONT_MONO, fontSize: 8, color: COLOR_INK, letterSpacing: '0.28em' }}>
                                ←
                              </Typography>
                            )}
                          </Box>
                        );
                      })}
                  </Box>
                </Box>
              )}
            </Box>
          </Box>

          {/* ── Seven Chapters · main report content (full width, 2-col) ── */}
          <Box sx={{ mt: 6 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 4, pb: 1.5, borderBottom: `1px solid ${COLOR_INK_FAINT}` }}>
              <Typography
                sx={{
                  fontFamily: FONT_DISPLAY, fontStyle: 'italic',
                  fontSize: 28, color: COLOR_INK,
                  letterSpacing: '-0.02em',
                  fontVariationSettings: '"opsz" 72, "SOFT" 60',
                }}
              >
                七章档案
              </Typography>
              <ItalicSerif size={14} color={COLOR_INK_MUTED}>seven chapters · {Object.keys(skills).length} 章</ItalicSerif>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 6, rowGap: 0 }}>
              {SKILL_ORDER.map((skill, i) => {
                const gate = skills[skill];
                if (!gate) return null;
                // Final verdict spans both columns
                const isFinal = skill === 'final_verdict';
                return (
                  <Box key={skill} sx={isFinal ? { gridColumn: { xs: '1', md: '1 / span 2' }, mt: 3, pt: 3, borderTop: `1px solid ${COLOR_INK_FAINT}` } : undefined}>
                    <ChapterCard idx={i} skill={skill} gate={gate} catalog={catalog} />
                  </Box>
                );
              })}
            </Box>
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
