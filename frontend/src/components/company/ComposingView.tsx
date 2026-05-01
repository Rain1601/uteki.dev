/**
 * ComposingView — three-column manuscript view for an in-flight analysis.
 *
 *   ┌──────────┬────────────────────────────────┬──────────┐
 *   │ chapters │ active chapter                 │ tool log │
 *   │ ledger   │ - Roman numeral + title        │ chrono   │
 *   │ (I-VII)  │ - streaming thinking text      │ list of  │
 *   │          │ - cursor                       │ tool     │
 *   │          │ - tool calls inline marginalia │ calls    │
 *   └──────────┴────────────────────────────────┴──────────┘
 *
 * Reads from `useCompanyAgentRunStore`. When run.done, transitions to the
 * Filed dossier view (the parent component handles that switch).
 */
import { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FONT_DISPLAY,
  FONT_BODY,
  FONT_MONO,
  COLOR_INK,
  COLOR_INK_MUTED,
  COLOR_INK_FAINT,
  COLOR_GAIN,
  COLOR_LOSS,
  COLOR_NEUTRAL,
  COLOR_ACCENT,
} from '../../theme/editorialTokens';
import type { RunningRun } from '../../stores/companyAgentRunStore';

const SKILL_ORDER = [
  'business_analysis', 'fisher_qa', 'moat_assessment',
  'management_assessment', 'reverse_test', 'valuation', 'final_verdict',
] as const;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const SKILL_TITLES: Record<string, string> = {
  business_analysis: '生意分析 · The Business',
  fisher_qa: '费雪十五问 · Fisher’s Fifteen',
  moat_assessment: '护城河 · The Moat',
  management_assessment: '管理层 · Management',
  reverse_test: '逆向检验 · Reverse Test',
  valuation: '估值 · Valuation',
  final_verdict: '综合裁决 · Final Verdict',
};

const TOOL_COLOR: Record<string, string> = {
  fetch_yfinance: '#8FA0B8',
  fetch_fmp: COLOR_GAIN,
  fetch_sec_edgar: COLOR_NEUTRAL,
  web_search: COLOR_ACCENT,
  fetch_company_data: COLOR_INK_MUTED,
};

const TOOL_LABEL: Record<string, string> = {
  fetch_yfinance: 'Y!FIN',
  fetch_fmp: 'FMP',
  fetch_sec_edgar: 'EDGAR',
  web_search: 'NEWS',
  fetch_company_data: 'CO',
};

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

function fmtElapsedMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function ComposingView({ run }: { run: RunningRun }) {
  const TOTAL = SKILL_ORDER.length;
  const activeIdx = Math.max(0, Math.min(TOTAL - 1, run.currentGate - 1));
  const activeSkill = SKILL_ORDER[activeIdx];
  const activeStreaming = run.streamingTexts[activeSkill] ?? '';
  const activeToolCalls = run.toolCalls.filter((tc) => tc.skill === activeSkill);

  // Auto-scroll the streaming text container as content arrives
  const streamRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeStreaming]);

  // Tick to refresh elapsed display
  const tickRef = useRef(0);
  useEffect(() => {
    const t = setInterval(() => { tickRef.current++; }, 500);
    return () => clearInterval(t);
  }, []);
  const elapsedMs = Date.now() - run.startTime;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Subject ribbon */}
      <Box
        sx={{
          flexShrink: 0,
          px: 5, py: 2,
          display: 'flex', alignItems: 'center', gap: 3,
          borderBottom: `1px solid ${COLOR_INK_FAINT}44`,
        }}
      >
        <Typography
          sx={{
            fontFamily: FONT_DISPLAY, fontStyle: 'italic',
            fontSize: 36, color: COLOR_INK, lineHeight: 1,
            letterSpacing: '-0.02em',
            fontVariationSettings: '"opsz" 144, "WONK" 1',
            fontWeight: 600,
          }}
        >
          {run.symbol}
        </Typography>
        <ItalicSerif size={14} color={COLOR_INK_MUTED}>{run.name}</ItalicSerif>
        <MonoCaps size={9}>{run.provider}</MonoCaps>
        {run.asOf && <MonoCaps size={9}>as_of {run.asOf}</MonoCaps>}
        <Box sx={{ flex: 1 }} />
        <MonoCaps>composing · gate {Math.max(1, run.currentGate)}/{TOTAL}</MonoCaps>
        <Typography sx={{ fontFamily: FONT_MONO, fontSize: 11, color: COLOR_INK_MUTED, letterSpacing: '0.14em', fontFeatureSettings: '"tnum"' }}>
          {fmtElapsedMs(elapsedMs)}
        </Typography>
      </Box>

      {/* Three columns */}
      <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: '240px 1fr 320px', overflow: 'hidden' }}>
        {/* ── Chapter ledger ── */}
        <Box sx={{ borderRight: `1px solid ${COLOR_INK_FAINT}33`, py: 4, px: 3, overflow: 'auto' }}>
          <MonoCaps size={9}>chapters · gates</MonoCaps>
          <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {SKILL_ORDER.map((skill, i) => {
              const gateNum = i + 1;
              const status = run.gateStatuses[gateNum];
              const done = status === 'complete';
              const errored = status === 'error' || status === 'timeout';
              const active = i === activeIdx && !done && !errored;
              const pending = !done && !errored && !active;
              return (
                <Box
                  key={skill}
                  sx={{
                    display: 'flex', alignItems: 'baseline', gap: 1.4,
                    opacity: pending ? 0.32 : 1,
                    transition: 'opacity 400ms',
                  }}
                >
                  <Typography
                    sx={{
                      fontFamily: FONT_DISPLAY, fontStyle: 'italic',
                      fontSize: 16, color: active ? COLOR_INK : COLOR_INK_MUTED,
                      minWidth: 24, textAlign: 'right',
                      fontVariationSettings: '"opsz" 36',
                    }}
                  >
                    {ROMAN[i]}
                  </Typography>
                  <Box sx={{ flex: 1, position: 'relative' }}>
                    <Typography
                      sx={{
                        fontFamily: FONT_BODY, fontStyle: 'italic',
                        fontSize: 13, lineHeight: 1.3,
                        color: active ? COLOR_INK : done ? COLOR_INK_MUTED : errored ? COLOR_LOSS : COLOR_INK_FAINT,
                        textDecoration: done ? 'line-through' : 'none',
                        textDecorationColor: COLOR_INK_FAINT,
                        textDecorationThickness: '0.5px',
                      }}
                    >
                      {SKILL_TITLES[skill].split(' · ')[0]}
                    </Typography>
                    {active && (
                      <Box
                        sx={{
                          position: 'absolute', left: -12, top: 6,
                          width: 4, height: 4, borderRadius: '50%',
                          bgcolor: COLOR_INK,
                          animation: 'composing-active-dot 1.2s ease-in-out infinite',
                          '@keyframes composing-active-dot': {
                            '0%, 100%': { opacity: 1 },
                            '50%': { opacity: 0.3 },
                          },
                        }}
                      />
                    )}
                  </Box>
                  {done && (
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, letterSpacing: '0.18em' }}>
                      ✓
                    </Typography>
                  )}
                  {errored && (
                    <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_LOSS, letterSpacing: '0.18em' }}>
                      ⚠
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>

          {run.error && (
            <Box sx={{ mt: 4, p: 2, border: `1px solid ${COLOR_LOSS}55`, bgcolor: 'rgba(176,82,74,0.06)' }}>
              <MonoCaps size={9} color={COLOR_LOSS}>error</MonoCaps>
              <Typography sx={{ mt: 0.6, fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 12, color: COLOR_LOSS, lineHeight: 1.5 }}>
                {run.error}
              </Typography>
            </Box>
          )}
        </Box>

        {/* ── Active chapter ── */}
        <Box sx={{ position: 'relative', overflow: 'hidden' }}>
          <Box ref={streamRef} sx={{ height: '100%', overflowY: 'auto', px: 6, py: 5 }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={`gate-${activeSkill}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.45 }}
              >
                <MonoCaps size={9.5}>chapter {ROMAN[activeIdx]}</MonoCaps>
                <Typography
                  sx={{
                    fontFamily: FONT_DISPLAY, fontStyle: 'italic',
                    fontSize: 52, color: COLOR_INK,
                    lineHeight: 1, letterSpacing: '-0.025em',
                    mt: 1.4, mb: 4,
                    fontVariationSettings: '"opsz" 144, "SOFT" 60, "WONK" 1',
                    fontWeight: 600,
                  }}
                >
                  {SKILL_TITLES[activeSkill].split(' · ')[0]}
                </Typography>

                {/* Streaming thought */}
                {activeStreaming ? (
                  <Box sx={{ maxWidth: 720 }}>
                    <Typography
                      component="div"
                      sx={{
                        fontFamily: FONT_BODY, fontStyle: 'italic',
                        fontSize: 16, color: COLOR_INK,
                        lineHeight: 1.7, whiteSpace: 'pre-wrap',
                      }}
                    >
                      {activeStreaming}
                      <motion.span
                        animate={{ opacity: [1, 0.2, 1] }}
                        transition={{ duration: 0.9, repeat: Infinity }}
                        style={{
                          display: 'inline-block',
                          width: 7, height: 16,
                          backgroundColor: COLOR_INK,
                          marginLeft: 3,
                          verticalAlign: 'text-bottom',
                        }}
                      />
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{ maxWidth: 720, py: 2 }}>
                    <ItalicSerif size={15} color={COLOR_INK_FAINT}>
                      正在思考⋯⋯
                    </ItalicSerif>
                  </Box>
                )}

                {/* Inline marginalia: tool calls for this chapter */}
                {activeToolCalls.length > 0 && (
                  <Box sx={{ mt: 4, pt: 3, borderTop: `1px dashed ${COLOR_INK_FAINT}33`, maxWidth: 720 }}>
                    <MonoCaps size={9}>tools used in this chapter · {activeToolCalls.length}</MonoCaps>
                    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {activeToolCalls.map((tc, i) => {
                        const c = TOOL_COLOR[tc.tool_name] ?? COLOR_INK_MUTED;
                        const label = TOOL_LABEL[tc.tool_name] ?? tc.tool_name.replace('fetch_', '').toUpperCase();
                        const args = tc.tool_args ? Object.entries(tc.tool_args).map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v).slice(0, 60)}`).join(' · ') : '';
                        return (
                          <motion.div
                            key={`tc-${i}`}
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4 }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8 }}>
                              <Box sx={{ width: 16, height: 1, bgcolor: c }} />
                              <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: c, letterSpacing: '0.18em', fontWeight: 600, minWidth: 50 }}>
                                ↦ {label}
                              </Typography>
                              <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 11.5, color: COLOR_INK, lineHeight: 1.5, flex: 1 }}>
                                {tc.tool_name.replace('fetch_', '')} {args && `· ${args}`}
                              </Typography>
                            </Box>
                          </motion.div>
                        );
                      })}
                    </Box>
                  </Box>
                )}
              </motion.div>
            </AnimatePresence>
          </Box>
        </Box>

        {/* ── Tool log (right rail) ── */}
        <Box sx={{ borderLeft: `1px solid ${COLOR_INK_FAINT}33`, py: 4, px: 3, overflow: 'auto', bgcolor: 'rgba(0,0,0,0.12)' }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 2.5 }}>
            <MonoCaps size={9}>tool log · all chapters</MonoCaps>
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 10, color: COLOR_INK_MUTED, fontFeatureSettings: '"tnum"' }}>
              {run.toolCalls.length}
            </Typography>
          </Box>

          {run.toolCalls.length === 0 && (
            <ItalicSerif size={12} color={COLOR_INK_FAINT}>暂无工具调用</ItalicSerif>
          )}

          {run.toolCalls.slice().reverse().map((tc, i) => {
            const c = TOOL_COLOR[tc.tool_name] ?? COLOR_INK_MUTED;
            const label = TOOL_LABEL[tc.tool_name] ?? tc.tool_name.replace('fetch_', '').toUpperCase();
            return (
              <Box
                key={`log-${i}`}
                sx={{
                  py: 0.85, display: 'flex', alignItems: 'baseline', gap: 0.8,
                  borderBottom: `1px dashed ${COLOR_INK_FAINT}40`,
                }}
              >
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, fontFeatureSettings: '"tnum"', minWidth: 18 }}>
                  {ROMAN[Math.max(0, tc.gate - 1)]}
                </Typography>
                <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: c, flexShrink: 0 }} />
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: c, letterSpacing: '0.18em', fontWeight: 600, minWidth: 44 }}>
                  {label}
                </Typography>
                <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 11, color: COLOR_INK, lineHeight: 1.4, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tc.tool_name.replace('fetch_', '')}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Bottom hash progress */}
      <Box sx={{ flexShrink: 0, px: 5, py: 2, borderTop: `1px solid ${COLOR_INK_FAINT}44`, display: 'flex', alignItems: 'center', gap: 3 }}>
        <MonoCaps size={9}>progress</MonoCaps>
        <Box sx={{ display: 'flex', gap: 1, flex: 1 }}>
          {SKILL_ORDER.map((skill, i) => {
            const gateNum = i + 1;
            const status = run.gateStatuses[gateNum];
            const done = status === 'complete';
            const errored = status === 'error' || status === 'timeout';
            const active = i === activeIdx && !done && !errored;
            const c = errored ? COLOR_LOSS : (done || active ? COLOR_INK : COLOR_INK_FAINT);
            return (
              <Box key={skill} sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                <Box
                  sx={{
                    height: 2,
                    bgcolor: c,
                    transition: 'background-color 600ms',
                    position: 'relative',
                    '&::after': active ? {
                      content: '""',
                      position: 'absolute', top: -2, right: 0,
                      width: 2, height: 6, bgcolor: COLOR_INK,
                      animation: 'compose-pulse 1s ease-in-out infinite',
                      '@keyframes compose-pulse': {
                        '0%, 100%': { opacity: 1 },
                        '50%': { opacity: 0.3 },
                      },
                    } : undefined,
                  }}
                />
                <Typography
                  sx={{
                    fontFamily: FONT_MONO, fontSize: 8.5,
                    letterSpacing: '0.18em',
                    color: active ? COLOR_INK : done ? COLOR_INK_MUTED : errored ? COLOR_LOSS : COLOR_INK_FAINT,
                  }}
                >
                  {ROMAN[i]}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
