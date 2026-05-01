/**
 * /company-agent/new — Request phase (M4)
 *
 * The carrel desk: brass-lit settings (model swatches, vintage as_of tape)
 * on the left | prospectus page filling with subject as you type on the
 * right. Submit kicks off SSE via the run store, then navigates to
 * `/company-agent/:id` (Composing view) once the analysis_id arrives.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import {
  FONT_DISPLAY,
  FONT_BODY,
  FONT_MONO,
  COLOR_BG,
  COLOR_INK,
  COLOR_INK_MUTED,
  COLOR_INK_FAINT,
  COLOR_GAIN,
  BACKGROUND_PAPER,
} from '../theme/editorialTokens';
import { useCompanyAgentRunStore } from '../stores/companyAgentRunStore';

interface ModelOption {
  id: string;       // provider value passed to API ('openai/deepseek-v3.2')
  name: string;     // short display
  initials: string; // 2-char swatch
}

const MODELS: ModelOption[] = [
  { id: 'openai/deepseek-v3.2', name: 'deepseek-v3.2', initials: 'DS' },
  { id: 'openai/claude-sonnet-4-5', name: 'claude-sonnet', initials: 'CS' },
  { id: 'openai/gpt-5', name: 'gpt-5', initials: 'G5' },
  { id: 'auto', name: 'auto', initials: 'AU' },
];

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

export default function CompanyAgentRequest() {
  const navigate = useNavigate();
  const startRun = useCompanyAgentRunStore((s) => s.start);

  const [symbol, setSymbol] = useState('');
  const [provider, setProvider] = useState<string>(MODELS[0].id);
  const [asOf, setAsOf] = useState<string>(''); // empty = today
  const [submitting, setSubmitting] = useState(false);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);

  // After submit, watch the store for the run; once analysisId arrives, navigate
  const runs = useCompanyAgentRunStore((s) => s.runs);
  useEffect(() => {
    if (!pendingRunId) return;
    const run = runs.get(pendingRunId);
    if (run?.analysisId) {
      navigate(`/company-agent/${run.analysisId}`);
    }
  }, [runs, pendingRunId, navigate]);

  const handleSubmit = () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym || submitting) return;
    setSubmitting(true);
    const runId = startRun({
      symbol: sym,
      provider,
      asOf: asOf || undefined,
    });
    setPendingRunId(runId);
    // Fallback: if analysisId hasn't appeared in 12s, navigate to studio
    setTimeout(() => {
      const r = useCompanyAgentRunStore.getState().runs.get(runId);
      if (!r?.analysisId) navigate('/company-agent');
    }, 12000);
  };

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
      <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: '38% 62%', height: '100%' }}>
        {/* ── Left: brass-lit carrel ── */}
        <Box
          sx={{
            position: 'relative',
            borderRight: `1px solid ${COLOR_INK_FAINT}66`,
            p: 6,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            background: `radial-gradient(ellipse at 30% 20%, rgba(168,137,110,0.08), transparent 60%)`,
          }}
        >
          {/* Top: title */}
          <Box>
            <Box
              onClick={() => navigate('/company-agent')}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.6,
                fontFamily: FONT_MONO, fontSize: 9.5, color: COLOR_INK_FAINT,
                letterSpacing: '0.28em', textTransform: 'uppercase',
                cursor: 'pointer', mb: 3,
                '&:hover': { color: COLOR_INK },
              }}
            >
              ← 研究台
            </Box>
            <MonoCaps>研究台 · Carrel No. 04</MonoCaps>
            <Typography
              sx={{
                fontFamily: FONT_DISPLAY, fontStyle: 'italic',
                fontSize: 38, color: COLOR_INK, lineHeight: 1, mt: 2,
                fontVariationSettings: '"opsz" 144, "SOFT" 60',
              }}
            >
              新建一份研究
            </Typography>
            <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 13, color: COLOR_INK_MUTED, mt: 1.2 }}>
              选择主题、研究员、与时间锚点。提交后档案将由七个 gate 顺序起草。
            </Typography>
          </Box>

          {/* Middle: form */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, my: 4 }}>
            {/* Symbol input */}
            <Box>
              <MonoCaps size={9.5}>主题 · symbol</MonoCaps>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                placeholder="GOOGL · TSM · NVDA …"
                autoFocus
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${COLOR_INK_FAINT}`,
                  color: COLOR_INK,
                  fontFamily: FONT_DISPLAY,
                  fontStyle: 'italic',
                  fontSize: 28,
                  fontWeight: 400,
                  letterSpacing: '0.04em',
                  padding: '8px 0',
                  outline: 'none',
                  marginTop: 8,
                }}
              />
            </Box>

            {/* Researcher */}
            <Box>
              <MonoCaps size={9.5}>研究员 · researcher</MonoCaps>
              <Box sx={{ display: 'flex', gap: 2, mt: 1.5 }}>
                {MODELS.map((m) => {
                  const selected = provider === m.id;
                  return (
                    <Box
                      key={m.id}
                      onClick={() => setProvider(m.id)}
                      sx={{ width: 64, textAlign: 'center', cursor: 'pointer' }}
                    >
                      <Box
                        sx={{
                          width: 56, height: 56,
                          border: `1.5px solid ${selected ? COLOR_INK : COLOR_INK_FAINT}`,
                          bgcolor: selected ? 'rgba(244,236,223,0.06)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          mb: 0.8, position: 'relative',
                          transition: 'all 180ms',
                          '&::after': selected ? {
                            content: '""',
                            position: 'absolute', inset: -3,
                            border: `1px solid ${COLOR_INK}88`,
                            pointerEvents: 'none',
                          } : undefined,
                        }}
                      >
                        <Typography
                          sx={{
                            fontFamily: FONT_DISPLAY, fontStyle: 'italic',
                            fontSize: 20,
                            color: selected ? COLOR_INK : COLOR_INK_MUTED,
                          }}
                        >
                          {m.initials}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: '0.12em', color: selected ? COLOR_INK : COLOR_INK_FAINT }}>
                        {m.name}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>

            {/* As_of */}
            <Box>
              <MonoCaps size={9.5}>时间锚点 · as_of</MonoCaps>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1.5 }}>
                <Box sx={{ flex: 1, borderBottom: `1px solid ${COLOR_INK_FAINT}` }}>
                  <input
                    value={asOf}
                    onChange={(e) => setAsOf(e.target.value)}
                    placeholder="今日 · 留空=最新数据"
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      color: COLOR_INK,
                      fontFamily: FONT_DISPLAY,
                      fontStyle: 'italic',
                      fontSize: 22,
                      padding: '6px 0',
                      outline: 'none',
                    }}
                  />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, letterSpacing: '0.18em', cursor: 'pointer', '&:hover': { color: COLOR_INK } }} onClick={() => setAsOf('')}>
                    今日
                  </Typography>
                  <Typography sx={{ fontFamily: FONT_MONO, fontSize: 9, color: COLOR_INK_FAINT, letterSpacing: '0.18em' }}>
                    YYYY-MM-DD
                  </Typography>
                </Box>
              </Box>
              <Typography sx={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 11, color: COLOR_INK_FAINT, mt: 0.8 }}>
                可指定历史日期；档案会按当时已有的数据起草，禁止 future-data 泄漏。
              </Typography>
            </Box>
          </Box>

          {/* Bottom: submit */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <MonoCaps>预计 · 4-6 min</MonoCaps>
            <Box
              onClick={handleSubmit}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 1.2,
                fontFamily: FONT_MONO, fontSize: 11,
                letterSpacing: '0.32em', textTransform: 'uppercase',
                color: !symbol.trim() || submitting ? COLOR_INK_FAINT : COLOR_BG,
                bgcolor: !symbol.trim() || submitting ? 'transparent' : COLOR_INK,
                border: !symbol.trim() || submitting ? `1px solid ${COLOR_INK_FAINT}` : 'none',
                px: 3, py: 1.2,
                cursor: !symbol.trim() || submitting ? 'not-allowed' : 'pointer',
                userSelect: 'none', transition: 'all 200ms',
                '&:hover': !symbol.trim() || submitting ? {} : { bgcolor: '#FFF8EA', transform: 'translateY(-1px)' },
              }}
            >
              {submitting ? '正在起草⋯⋯' : '起草 · Begin Draft →'}
            </Box>
          </Box>
        </Box>

        {/* ── Right: prospectus page ── */}
        <Box
          sx={{
            position: 'relative',
            p: 6,
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            backgroundImage: `repeating-linear-gradient(0deg, transparent 0 27px, ${COLOR_INK_FAINT}14 27px 28px)`,
          }}
        >
          <Box sx={{ position: 'absolute', top: 24, right: 24 }}>
            <MonoCaps size={9}>prospectus · draft</MonoCaps>
          </Box>
          <Box sx={{ position: 'absolute', top: 24, left: 24 }}>
            <MonoCaps size={9}>folio · {new Date().toISOString().slice(5, 10).replace('-', '/')}</MonoCaps>
          </Box>

          <Box>
            <MonoCaps size={10}>主题 · subject</MonoCaps>
            <motion.div
              key={symbol || 'empty'}
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <Typography
                sx={{
                  fontFamily: FONT_DISPLAY, fontStyle: 'italic',
                  fontSize: 132, lineHeight: 0.9,
                  color: symbol ? COLOR_INK : COLOR_INK_FAINT,
                  letterSpacing: '-0.04em', mt: 1,
                  fontVariationSettings: '"opsz" 144, "SOFT" 100, "WONK" 1',
                  fontWeight: 600,
                }}
              >
                {symbol || '——'}
              </Typography>
            </motion.div>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mt: 1.5 }}>
              <ItalicSerif size={20} color={COLOR_INK_MUTED}>
                {symbol ? '研究主题' : '请在左侧输入股票代码'}
              </ItalicSerif>
            </Box>

            <Box sx={{ mt: 6, maxWidth: 480 }}>
              <ItalicSerif size={15} color={COLOR_INK_MUTED}>
                — 即将由七个 gate 起草。先看生意结构，再依次过 Fisher 十五题、护城河、管理、reverse stress test、估值，最终落定 verdict。
              </ItalicSerif>
            </Box>

            {submitting && pendingRunId && (
              <Box sx={{ mt: 6, display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 6, height: 6, borderRadius: '50%',
                    bgcolor: COLOR_GAIN,
                    animation: 'request-pulse 1.4s ease-in-out infinite',
                    '@keyframes request-pulse': {
                      '0%, 100%': { opacity: 0.3, transform: 'scale(0.85)' },
                      '50%': { opacity: 1, transform: 'scale(1)' },
                    },
                  }}
                />
                <MonoCaps size={9.5} color={COLOR_GAIN}>
                  正在初始化 · 即将进入 composing
                </MonoCaps>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
