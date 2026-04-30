import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Snackbar, Alert, Collapse } from '@mui/material';
import { X, FileText, Download, Maximize2, Minimize2, Link, ChevronDown, ChevronUp, ChevronsUpDown, Search, Loader2 } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { GATE_NAMES, type GateResult, type PositionHoldingOutput, createShareLink } from '../../api/company';
import type { GateStatus } from './GateProgressTracker';
import { DataTable } from './ui';
import VerdictBanner from './VerdictBanner';
import FormattedText from './FormattedText';
import SourcesPanel from './SourcesPanel';
import CitationsRow from './CitationsRow';
import BusinessAnalysisCard from './gates/BusinessAnalysisCard';
import FisherQACard from './gates/FisherQACard';
import MoatAssessmentCard from './gates/MoatAssessmentCard';
import ManagementCard from './gates/ManagementCard';
import ReverseTestCard from './gates/ReverseTestCard';
import ValuationCard from './gates/ValuationCard';
import PositionHoldingCard from './gates/PositionHoldingCard';

interface LiveToolCall {
  gate: number;
  skill: string;
  tool_name: string;
  tool_args?: Record<string, any>;
  ts: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  skills: Record<string, GateResult>;
  verdict?: PositionHoldingOutput;
  companyInfo: { name: string; symbol: string; sector: string; industry: string; price: number } | null;
  totalLatencyMs?: number;
  modelUsed?: string;
  dataFreshness?: { cached: boolean; fetched_at?: string };
  toolCallsCount?: number;
  scrollToGate?: number | null;
  onScrollToGateConsumed?: () => void;
  embedded?: boolean;  // when true, renders without header/border/width constraints (inline mode)
  analysisId?: string | null;
  /** Provenance catalog (β phase). When provided, [src:N] markers in raw text become chips. */
  sourceCatalog?: Record<string, import('../../api/company').DataPoint>;
  // ── Live running state (only meaningful while analysis is in flight) ──
  isLiveRunning?: boolean;
  currentGate?: number | null;
  currentGateStartedAt?: number | null;
  streamingTexts?: Record<string, string>;
  liveToolCalls?: LiveToolCall[];
  gateStatuses?: Record<number, GateStatus>;
  totalElapsedMs?: number;
}

const GATE_ORDER = [
  'business_analysis',
  'fisher_qa',
  'moat_assessment',
  'management_assessment',
  'reverse_test',
  'valuation',
  'final_verdict',
] as const;

const GATE_EN_NAMES: Record<string, string> = {
  business_analysis: 'Business Analysis',
  fisher_qa: 'Fisher 15 Questions',
  moat_assessment: 'Moat Assessment',
  management_assessment: 'Management Assessment',
  reverse_test: 'Reverse Test',
  valuation: 'Valuation & Timing',
  final_verdict: 'Final Verdict',
};

const GATE_COMPONENTS: Record<string, React.FC<{ data: Record<string, any> }>> = {
  business_analysis: BusinessAnalysisCard,
  fisher_qa: FisherQACard,
  moat_assessment: MoatAssessmentCard,
  management_assessment: ManagementCard,
  reverse_test: ReverseTestCard,
  valuation: ValuationCard,
  final_verdict: PositionHoldingCard,
};

export default function ReportPanel({
  open,
  onClose,
  skills,
  verdict,
  companyInfo,
  totalLatencyMs,
  modelUsed,
  dataFreshness,
  toolCallsCount,
  scrollToGate,
  onScrollToGateConsumed,
  embedded = false,
  analysisId,
  sourceCatalog,
  onActiveGateChange,
  isLiveRunning = false,
  currentGate = null,
  currentGateStartedAt = null,
  streamingTexts = {},
  liveToolCalls = [],
  gateStatuses = {},
  totalElapsedMs = 0,
}: Props & { onActiveGateChange?: (gate: number | null) => void }) {
  const { theme } = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const streamPreviewRef = useRef<HTMLDivElement>(null);

  // ── Collapse/expand state ──
  const [collapsedGates, setCollapsedGates] = useState<Set<string>>(new Set(GATE_ORDER as unknown as string[]));
  const allCollapsed = collapsedGates.size === GATE_ORDER.length;
  const toggleGate = (skillName: string) => {
    setCollapsedGates((prev) => {
      const next = new Set(prev);
      if (next.has(skillName)) next.delete(skillName); else next.add(skillName);
      return next;
    });
  };
  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsedGates(new Set());
    } else {
      setCollapsedGates(new Set(GATE_ORDER as unknown as string[]));
    }
  };

  // ── Share state ──
  const [shareSnackbar, setShareSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });
  const handleShare = useCallback(async () => {
    if (!analysisId) return;
    try {
      const { share_url } = await createShareLink(analysisId);
      await navigator.clipboard.writeText(share_url);
      setShareSnackbar({ open: true, message: '分享链接已复制到剪贴板', severity: 'success' });
    } catch {
      setShareSnackbar({ open: true, message: '创建分享链接失败', severity: 'error' });
    }
  }, [analysisId]);

  useEffect(() => {
    if (scrollToGate == null || !open) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`gate-section-${scrollToGate}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      onScrollToGateConsumed?.();
    }, 350);
    return () => clearTimeout(timer);
  }, [scrollToGate, open]);

  const hasVerdict = verdict && verdict.action;
  const companyName = companyInfo?.name || companyInfo?.symbol || '';
  const [exporting, setExporting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // ── Live running derivations ──
  const currentSkillName = currentGate != null && currentGate >= 1 && currentGate <= GATE_ORDER.length
    ? GATE_ORDER[currentGate - 1]
    : null;
  const currentStreamText = currentSkillName ? (streamingTexts[currentSkillName] || '') : '';
  const latestToolCall = liveToolCalls.length > 0 ? liveToolCalls[liveToolCalls.length - 1] : null;
  const showLivePreview = isLiveRunning && currentGate != null;

  // Per-gate elapsed (live, ticks via totalElapsedMs prop bumping)
  const currentGateElapsedMs = currentGateStartedAt != null && totalElapsedMs > 0
    ? Math.max(0, Date.now() - currentGateStartedAt)
    : 0;

  // Auto-scroll streaming preview to bottom as text arrives
  useEffect(() => {
    if (showLivePreview && streamPreviewRef.current) {
      const el = streamPreviewRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [currentStreamText, showLivePreview]);

  const formatLiveTime = (ms: number) => {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m${s % 60}s`;
  };

  // Format tool args concisely (e.g. "TSMC market share 2024")
  const summarizeToolArgs = (args: Record<string, any> | undefined) => {
    if (!args) return '';
    const q = args.query ?? args.q ?? args.search ?? args.symbol ?? args.url ?? '';
    if (typeof q === 'string') return q.length > 60 ? q.slice(0, 57) + '…' : q;
    return '';
  };

  // ── Client-side JSON fallback: if Gate 7 raw is JSON but parsed failed ──
  const enhancedSkills = useMemo(() => {
    const gate7 = skills['final_verdict'];
    if (!gate7?.raw) return skills;

    // Check if any gate already has parsed data
    const anyParsed = GATE_ORDER.some((s) => {
      const r = skills[s];
      return r?.parsed && Object.keys(r.parsed).length > 0;
    });
    if (anyParsed) return skills;

    // Try to extract JSON from Gate 7 raw text
    try {
      const jsonMatch = gate7.raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return skills;
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed !== 'object') return skills;

      // Distribute parsed sections back to each gate
      const result = { ...skills };
      const gateSkillNames = ['business_analysis', 'fisher_qa', 'moat_assessment', 'management_assessment', 'reverse_test', 'valuation'];
      for (const sn of gateSkillNames) {
        if (parsed[sn] && result[sn]) {
          result[sn] = { ...result[sn], parsed: parsed[sn], parse_status: 'structured' };
        }
      }
      if (parsed.position_holding && result['final_verdict']) {
        result['final_verdict'] = { ...result['final_verdict'], parsed: parsed, parse_status: 'structured' };
      }
      return result;
    } catch {
      return skills;
    }
  }, [skills]);

  // ── Scroll-based gate tracking ──
  useEffect(() => {
    if (!onActiveGateChange || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;

    const handleScroll = () => {
      const sections = container.querySelectorAll('[id^="gate-section-"]');
      let activeGate: number | null = null;
      const containerTop = container.getBoundingClientRect().top;

      for (const section of Array.from(sections)) {
        const rect = section.getBoundingClientRect();
        const relativeTop = rect.top - containerTop;
        if (relativeTop <= 80) {
          const gateNum = parseInt(section.id.replace('gate-section-', ''), 10);
          if (!isNaN(gateNum)) activeGate = gateNum;
        }
      }
      onActiveGateChange(activeGate);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [onActiveGateChange]);

  const handleExportPDF = useCallback(async () => {
    const container = scrollContainerRef.current;
    if (!container || exporting) return;

    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      const symbol = companyInfo?.symbol || 'report';
      const dateStr = new Date().toISOString().slice(0, 10);

      // Temporarily expand to full height for capture
      const origHeight = container.style.height;
      const origOverflow = container.style.overflow;
      container.style.height = 'auto';
      container.style.overflow = 'visible';

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#181c1f',
        scrollY: 0,
        windowWidth: container.scrollWidth,
      });

      container.style.height = origHeight;
      container.style.overflow = origOverflow;

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const imgW = canvas.width;
      const imgH = canvas.height;

      // A4 dimensions in mm
      const pdfW = 210;
      const pdfH = 297;
      const margin = 8;
      const contentW = pdfW - margin * 2;
      const contentH = (imgH * contentW) / imgW;

      const pdf = new jsPDF({
        orientation: contentH > pdfH * 1.5 ? 'portrait' : 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Paginate: split the image across pages
      const pageContentH = pdfH - margin * 2;
      let yOffset = 0;
      let page = 0;

      while (yOffset < contentH) {
        if (page > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', margin, margin - yOffset, contentW, contentH);
        yOffset += pageContentH;
        page++;
      }

      pdf.save(`${symbol}_投研报告_${dateStr}.pdf`);
    } catch (e) {
      console.error('PDF export failed:', e);
    } finally {
      setExporting(false);
    }
  }, [companyInfo, exporting]);

  // Escape key exits fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  return (
    <Box
      sx={{
        ...(embedded ? {
          width: '100%',
          position: 'relative',
        } : fullscreen ? {
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          width: '100%', minWidth: 0, maxWidth: 'none',
          zIndex: 1300,
        } : {
          width: open ? '55%' : 0,
          minWidth: open ? 480 : 0,
          maxWidth: open ? 800 : 0,
          position: 'relative',
        }),
        height: embedded ? 'auto' : '100%',
        overflow: embedded ? 'visible' : 'hidden',
        transition: embedded || fullscreen ? 'none' : 'width 0.3s ease, min-width 0.3s ease, max-width 0.3s ease',
        borderLeft: !embedded && open && !fullscreen ? `1px solid ${theme.border.subtle}` : 'none',
        flexShrink: 0,
      }}
    >
      <Box
        ref={scrollContainerRef}
        sx={{
          height: '100%',
          overflowY: 'auto',
          bgcolor: theme.background.primary,
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: `${theme.text.muted}20`,
            borderRadius: 4,
            '&:hover': { bgcolor: `${theme.text.muted}40` },
          },
        }}
      >
        {/* Header — hidden in embedded mode */}
        {!embedded && <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            bgcolor: theme.background.primary,
            borderBottom: `1px solid ${theme.border.subtle}`,
            px: 2.5,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minWidth: 460,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <FileText size={16} color={theme.text.muted} />
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: theme.text.primary, lineHeight: 1.3 }}>
                {companyInfo?.symbol || ''} 投研报告
              </Typography>
              <Typography sx={{ fontSize: 11, color: theme.text.disabled }}>
                {companyName}{companyInfo?.sector ? ` · ${companyInfo.sector}` : ''}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {/* Share link */}
            {analysisId && (
              <Box
                onClick={handleShare}
                sx={{
                  cursor: 'pointer',
                  p: 0.5,
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  color: theme.text.disabled,
                  transition: 'all 0.15s',
                  '&:hover': { bgcolor: theme.background.hover, color: theme.text.secondary },
                }}
                title="分享报告"
              >
                <Link size={15} />
              </Box>
            )}
            {/* Export PDF */}
            <Box
              onClick={handleExportPDF}
              sx={{
                cursor: exporting ? 'wait' : 'pointer',
                p: 0.5,
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                color: theme.text.disabled,
                opacity: exporting ? 0.5 : 1,
                transition: 'all 0.15s',
                '&:hover': { bgcolor: theme.background.hover, color: theme.text.secondary },
              }}
            >
              <Download size={15} />
              <Typography sx={{ fontSize: 11, fontWeight: 600 }}>PDF</Typography>
            </Box>
            {/* Fullscreen toggle */}
            <Box
              onClick={() => setFullscreen((f) => !f)}
              sx={{
                cursor: 'pointer',
                p: 0.5,
                borderRadius: 1,
                display: 'flex',
                color: theme.text.disabled,
                transition: 'all 0.15s',
                '&:hover': { bgcolor: theme.background.hover, color: theme.text.secondary },
              }}
              title={fullscreen ? '退出全屏 (Esc)' : '全屏查看'}
            >
              {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </Box>
            {/* Close */}
            <Box
              onClick={() => { setFullscreen(false); onClose(); }}
              sx={{
                cursor: 'pointer',
                p: 0.5,
                borderRadius: 1,
                display: 'flex',
                color: theme.text.disabled,
                '&:hover': { bgcolor: theme.background.hover, color: theme.text.secondary },
              }}
            >
              <X size={16} />
            </Box>
          </Box>
        </Box>}

        {/* Body — serif reading experience for report content */}
        <Box sx={{
          px: fullscreen ? 4 : 2.5,
          py: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2.5,
          minWidth: 460,
          maxWidth: fullscreen ? 840 : 'none',
          // Serif font for reading content — Anthropic design principle
          fontFamily: "'Times New Roman', 'SimSun', '宋体', Georgia, serif",
          lineHeight: 1.8,
          // Override specific elements back to sans-serif
          '& .MuiTypography-root': {
            fontFamily: 'inherit',
          },
          // Labels, badges, meta info stay sans-serif
          '& [data-ui="true"], & .gate-header, & .gate-meta': {
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            lineHeight: 1.5,
          },
          mx: fullscreen ? 'auto' : 0,
        }}>
          {/* Verdict Banner */}
          {hasVerdict && (
            <VerdictBanner verdict={verdict!} companyName={companyName} />
          )}

          {/* Live running preview — only while analysis is in flight */}
          {showLivePreview && (
            <Box
              data-ui="true"
              sx={{
                bgcolor: theme.background.secondary,
                border: `1px solid ${theme.brand.primary}30`,
                borderRadius: 1,
                overflow: 'hidden',
                boxShadow: `0 0 0 1px ${theme.brand.primary}08, 0 4px 16px rgba(0,0,0,0.12)`,
              }}
            >
              {/* Header strip */}
              <Box
                className="gate-header"
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1,
                  px: 1.5, py: 0.85,
                  borderBottom: `1px solid ${theme.border.subtle}`,
                  bgcolor: `${theme.brand.primary}08`,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Subtle shimmer line on left edge */}
                <Box sx={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
                  bgcolor: theme.brand.primary,
                  animation: 'analyzing-pulse 1.5s ease-in-out infinite',
                }} />
                <Loader2
                  size={12}
                  color={theme.brand.primary}
                  style={{ animation: 'spin 1.2s linear infinite', flexShrink: 0 }}
                />
                <Typography sx={{
                  fontSize: 11, fontWeight: 700, color: theme.brand.primary,
                  fontFamily: "Inter, -apple-system, sans-serif", letterSpacing: '0.01em',
                }}>
                  正在分析{currentSkillName ? `: ${GATE_NAMES[currentGate!] || ''}` : '…'}
                </Typography>
                <Typography sx={{
                  fontSize: 10, color: theme.text.muted,
                  fontFamily: "Inter, -apple-system, sans-serif",
                }}>
                  Gate {currentGate} / 7
                </Typography>
                <Box sx={{ flex: 1 }} />
                {currentGateElapsedMs > 0 && (
                  <Typography sx={{
                    fontSize: 10, color: theme.text.muted,
                    fontFeatureSettings: '"tnum"',
                    fontFamily: "'SF Mono', Monaco, Consolas, monospace",
                  }}>
                    {formatLiveTime(currentGateElapsedMs)}
                  </Typography>
                )}
              </Box>

              {/* Latest tool call (if any) */}
              {latestToolCall && (
                <Box
                  className="gate-meta"
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.6,
                    px: 1.5, py: 0.6,
                    borderBottom: `1px solid ${theme.border.subtle}`,
                    bgcolor: theme.background.primary,
                  }}
                >
                  <Search size={11} color={theme.text.muted} style={{ flexShrink: 0 }} />
                  <Typography sx={{
                    fontSize: 10, color: theme.text.muted,
                    fontFamily: "Inter, -apple-system, sans-serif",
                    flexShrink: 0,
                  }}>
                    {latestToolCall.tool_name}
                  </Typography>
                  {summarizeToolArgs(latestToolCall.tool_args) && (
                    <Typography sx={{
                      fontSize: 10, color: theme.text.secondary,
                      fontFamily: "'SF Mono', Monaco, Consolas, monospace",
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}>
                      {summarizeToolArgs(latestToolCall.tool_args)}
                    </Typography>
                  )}
                  {liveToolCalls.length > 1 && (
                    <Typography sx={{
                      fontSize: 9, color: theme.text.disabled,
                      fontFamily: "Inter, -apple-system, sans-serif",
                      ml: 'auto', flexShrink: 0,
                    }}>
                      +{liveToolCalls.length - 1}
                    </Typography>
                  )}
                </Box>
              )}

              {/* Streaming text body */}
              <Box
                ref={streamPreviewRef}
                sx={{
                  px: 1.5, py: 1,
                  maxHeight: 240,
                  minHeight: currentStreamText ? 80 : 56,
                  overflowY: 'auto',
                  fontFamily: "'Times New Roman', 'SimSun', '宋体', Georgia, serif",
                  lineHeight: 1.7,
                  '&::-webkit-scrollbar': { width: 3 },
                  '&::-webkit-scrollbar-thumb': { bgcolor: `${theme.text.muted}18`, borderRadius: 4 },
                }}
              >
                {currentStreamText ? (
                  <>
                    <FormattedText text={currentStreamText} theme={theme} streaming />
                    {/* Blinking caret */}
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-block',
                        width: 6, height: 13,
                        bgcolor: theme.brand.primary,
                        ml: 0.3,
                        verticalAlign: 'text-bottom',
                        animation: 'analyzing-pulse 1s step-end infinite',
                      }}
                    />
                  </>
                ) : (
                  <Typography
                    data-ui="true"
                    sx={{
                      fontSize: 11, color: theme.text.disabled,
                      fontFamily: "Inter, -apple-system, sans-serif",
                      fontStyle: 'italic', py: 1,
                    }}
                  >
                    模型思考中{latestToolCall ? '，正在调用工具…' : '…'}
                  </Typography>
                )}
              </Box>

              {/* Footer: completed gate count */}
              <Box
                className="gate-meta"
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1,
                  px: 1.5, py: 0.5,
                  borderTop: `1px solid ${theme.border.subtle}`,
                  bgcolor: theme.background.primary,
                }}
              >
                <Typography sx={{
                  fontSize: 9.5, color: theme.text.disabled,
                  fontFamily: "Inter, -apple-system, sans-serif",
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  {Object.values(gateStatuses).filter(s => s === 'complete').length} / 7 gates · {formatLiveTime(totalElapsedMs)}
                </Typography>
              </Box>
            </Box>
          )}

          {/* Expand/Collapse All */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Box
              onClick={toggleAll}
              data-ui="true"
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.4,
                px: 1, py: 0.3, borderRadius: '6px', cursor: 'pointer',
                fontSize: 10, fontWeight: 500, color: theme.text.muted,
                '&:hover': { bgcolor: `${theme.text.primary}06`, color: theme.text.secondary },
              }}
            >
              <ChevronsUpDown size={12} />
              <span>{allCollapsed ? '全部展开' : '全部折叠'}</span>
            </Box>
          </Box>

          {/* Gate Sections */}
          {GATE_ORDER.map((skillName) => {
            const result = enhancedSkills[skillName];
            if (!result) return null;

            const gateNum = result.gate ?? (GATE_ORDER.indexOf(skillName) + 1);
            const parsedData = skillName === 'final_verdict' && result.parsed?.position_holding
              ? result.parsed.position_holding
              : result.parsed;
            const hasParsed = parsedData && Object.keys(parsedData).length > 0;
            const Component = GATE_COMPONENTS[skillName];

            const isCollapsed = collapsedGates.has(skillName);
            // Key metric for collapsed view
            const keyMetric = (() => {
              if (!hasParsed) return null;
              if (skillName === 'final_verdict') return parsedData?.action ? `${parsedData.action} ${Math.round((parsedData.conviction || 0) * 100)}%` : null;
              if (skillName === 'business_analysis') return parsedData?.business_quality || parsedData?.quality || null;
              if (skillName === 'fisher_qa') return parsedData?.growth_verdict || (parsedData?.total_score != null ? `${parsedData.total_score}/15` : null);
              if (skillName === 'moat_assessment') return parsedData?.moat_width || null;
              if (skillName === 'management_assessment') return parsedData?.management_score != null ? `${parsedData.management_score}/10` : null;
              if (skillName === 'reverse_test') return parsedData?.resilience_score != null ? `${parsedData.resilience_score}/10` : null;
              if (skillName === 'valuation') return parsedData?.price_assessment || null;
              return null;
            })();

            return (
              <Box key={skillName} id={`gate-section-${gateNum}`}>
                {/* Section header — sans-serif UI element, clickable for collapse */}
                <Box
                  className="gate-header"
                  onClick={() => toggleGate(skillName)}
                  sx={{ borderTop: `1px solid ${theme.border.subtle}`, pt: 1.5, mb: isCollapsed ? 0 : 1.5, cursor: 'pointer', '&:hover': { opacity: 0.85 } }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        bgcolor: `${theme.brand.primary}12`,
                        color: `${theme.brand.primary}aa`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                        fontFamily: "Inter, -apple-system, sans-serif",
                      }}
                    >
                      {gateNum}
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: theme.text.primary, fontFamily: "Inter, -apple-system, sans-serif", letterSpacing: '-0.01em' }}>
                      {GATE_NAMES[gateNum] || skillName}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: theme.text.disabled, fontFamily: "Inter, -apple-system, sans-serif" }}>
                      {GATE_EN_NAMES[skillName] || ''}
                    </Typography>
                    {isCollapsed && keyMetric && (
                      <Typography sx={{ fontSize: 11, fontWeight: 600, color: theme.text.muted, fontFamily: "Inter, -apple-system, sans-serif" }}>
                        {keyMetric}
                      </Typography>
                    )}
                    <Box sx={{ flex: 1 }} />
                    {result.latency_ms != null && (
                      <Typography sx={{ fontSize: 11, color: theme.text.disabled, flexShrink: 0, fontFamily: "'SF Mono', Monaco, Consolas, monospace", fontFeatureSettings: '"tnum"' }}>
                        {(result.latency_ms / 1000).toFixed(1)}s
                      </Typography>
                    )}
                    <Box sx={{ color: theme.text.disabled, display: 'flex', alignItems: 'center' }}>
                      {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </Box>
                  </Box>
                </Box>

                {/* Content — collapsible */}
                <Collapse in={!isCollapsed} timeout={200}>
                  <Box sx={{ bgcolor: theme.background.secondary, borderRadius: 1, p: 2, border: `1px solid ${theme.border.subtle}`, mb: 0.5 }}>
                    {hasParsed && Component ? (
                      <Component data={parsedData} />
                    ) : result.raw ? (
                      <FormattedText text={result.raw} theme={theme} catalog={sourceCatalog} />
                    ) : (
                      <Typography sx={{ fontSize: 12, color: theme.text.disabled, fontStyle: 'italic' }}>
                        无输出数据
                      </Typography>
                    )}
                    {/* Citations (visible even when structured) */}
                    {(result as any).citations && (result as any).citations.length > 0 && sourceCatalog && (
                      <CitationsRow
                        ids={(result as any).citations}
                        orphans={(result as any).citation_orphans}
                        catalog={sourceCatalog}
                      />
                    )}
                    {result.tool_calls && result.tool_calls.length > 0 && (
                      <SourcesPanel toolCalls={result.tool_calls} />
                    )}
                  </Box>
                </Collapse>
              </Box>
            );
          })}

          {/* Metadata footer */}
          <Box sx={{ mt: 0.5, opacity: 0.7 }}>
            <DataTable
              rows={[
                ...(modelUsed ? [{ label: 'Model', value: modelUsed }] : []),
                ...(totalLatencyMs != null ? [{ label: 'Total Time', value: `${(totalLatencyMs / 1000).toFixed(1)}s` }] : []),
                ...(dataFreshness ? [{
                  label: 'Data',
                  value: `${dataFreshness.cached ? 'Cached' : 'Fresh'}${dataFreshness.fetched_at ? ` (${new Date(dataFreshness.fetched_at).toLocaleDateString()})` : ''}`,
                }] : []),
                ...(toolCallsCount != null && toolCallsCount > 0 ? [{ label: 'Web Searches', value: String(toolCallsCount) }] : []),
              ]}
            />
          </Box>
        </Box>
      </Box>

      <Snackbar
        open={shareSnackbar.open}
        autoHideDuration={3000}
        onClose={() => setShareSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={shareSnackbar.severity} variant="filled" sx={{ fontSize: 12 }}>
          {shareSnackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
