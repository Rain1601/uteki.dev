import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Snackbar, Alert, Collapse } from '@mui/material';
import { X, FileText, Download, Maximize2, Minimize2, Link, ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { GATE_NAMES, type GateResult, type PositionHoldingOutput, createShareLink } from '../../api/company';
import { DataTable } from './ui';
import VerdictBanner from './VerdictBanner';
import FormattedText from './FormattedText';
import BusinessAnalysisCard from './gates/BusinessAnalysisCard';
import FisherQACard from './gates/FisherQACard';
import MoatAssessmentCard from './gates/MoatAssessmentCard';
import ManagementCard from './gates/ManagementCard';
import ReverseTestCard from './gates/ReverseTestCard';
import ValuationCard from './gates/ValuationCard';
import PositionHoldingCard from './gates/PositionHoldingCard';

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
  onActiveGateChange,
}: Props & { onActiveGateChange?: (gate: number | null) => void }) {
  const { theme } = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
                      <FormattedText text={result.raw} theme={theme} />
                    ) : (
                      <Typography sx={{ fontSize: 12, color: theme.text.disabled, fontStyle: 'italic' }}>
                        无输出数据
                      </Typography>
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
