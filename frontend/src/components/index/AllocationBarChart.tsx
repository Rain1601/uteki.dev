import { useState } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { AlertCircle } from 'lucide-react';
import { ModelIOSummary } from '../../api/index';
import { ModelLogo } from './ModelLogos';

// Matte, muted palette — good hue separation, soft on dark backgrounds
const ETF_COLORS: Record<string, string> = {
  VOO: '#6B9E78',   // sage green
  QQQ: '#7B8CBA',   // slate blue
  VTI: '#C4956A',   // warm tan
  SCHD: '#9B7EAD',  // dusty lavender
  VGT: '#5BA3A3',   // muted teal
  ARKK: '#C07878',  // muted rose
  SPY: '#8AAD6B',   // olive green
  IWM: '#B87D9E',   // mauve
  ACWI: '#D4A95A',  // muted gold
  EFA: '#6A9BAD',   // steel blue
  BND: '#A08B76',   // warm grey
  GLD: '#C9B06B',   // antique gold
  TLT: '#7E8E9E',   // cool grey
};

const CASH_COLOR_DARK = 'rgba(255,255,255,0.05)';
const CASH_COLOR_LIGHT = 'rgba(0,0,0,0.04)';

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = ((hash % 360) + 360) % 360;
  return `hsl(${h}, 35%, 58%)`;
}

function getEtfColor(etf: string): string {
  return ETF_COLORS[etf.toUpperCase()] || hashColor(etf);
}

interface Segment {
  etf: string;
  percentage: number;
  amount: number;
}

function parseAllocations(model: ModelIOSummary): Segment[] {
  const structured = model.output_structured || {};
  const allocations = structured.allocations || structured['分配'] || [];
  const segments: Segment[] = allocations.map((a: any) => ({
    etf: a.etf || a.symbol || a['标的'] || '?',
    percentage: a.percentage || a['比例'] || 0,
    amount: a.amount || a['金额'] || 0,
  }));
  const totalPct = segments.reduce((s, a) => s + a.percentage, 0);
  if (totalPct < 100) {
    segments.push({ etf: 'CASH', percentage: Math.round((100 - totalPct) * 100) / 100, amount: 0 });
  }
  return segments;
}

interface AllocationBarChartProps {
  models: ModelIOSummary[];
  isDark: boolean;
  theme: any;
  onSelectModel?: (modelId: string) => void;
  selectedModelId?: string | null;
}

export default function AllocationBarChart({
  models,
  isDark,
  theme,
  onSelectModel,
  selectedModelId,
}: AllocationBarChartProps) {
  const [hoveredSegment, setHoveredSegment] = useState<{ modelId: string; etf: string } | null>(null);

  // Collect all unique ETFs across all models for the legend
  const allEtfs = new Set<string>();
  models.forEach((m) => {
    const isError = m.status === 'error' || m.status === 'timeout';
    if (!isError) {
      parseAllocations(m).forEach((seg) => {
        if (seg.etf !== 'CASH') allEtfs.add(seg.etf);
      });
    }
  });

  const cashColor = isDark ? CASH_COLOR_DARK : CASH_COLOR_LIGHT;

  return (
    <Box>
      {/* Bars */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {models.map((model) => {
          const isError = model.status === 'error' || model.status === 'timeout';
          const isSelected = selectedModelId === model.id;
          const segments = isError ? [] : parseAllocations(model);

          return (
            <Box
              key={model.id}
              onClick={() => onSelectModel?.(model.id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.8,
                cursor: 'pointer',
                py: 0.3,
                px: 0.5,
                borderRadius: 1,
                borderLeft: isSelected ? `2px solid ${theme.brand.primary}` : '2px solid transparent',
                bgcolor: isSelected
                  ? isDark ? 'rgba(100,149,237,0.06)' : 'rgba(100,149,237,0.04)'
                  : 'transparent',
                transition: 'all 0.15s',
                '&:hover': {
                  bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                },
              }}
            >
              {/* Model logo */}
              <Box sx={{ flexShrink: 0, width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ModelLogo provider={model.model_provider} size={18} isDark={isDark} />
              </Box>

              {/* Bar */}
              {isError ? (
                <Box sx={{
                  flex: 1,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1,
                  borderRadius: 0.5,
                  bgcolor: isDark ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.05)',
                  border: '1px solid rgba(244,67,54,0.2)',
                }}>
                  <AlertCircle size={12} style={{ color: '#f44336' }} />
                  <Typography sx={{ fontSize: 10, color: '#f44336' }}>
                    {model.status === 'timeout' ? 'timeout' : 'error'}
                  </Typography>
                </Box>
              ) : (
                <Box sx={{
                  flex: 1,
                  height: 28,
                  display: 'flex',
                  borderRadius: 0.5,
                  overflow: 'hidden',
                }}>
                  {segments.map((seg, i) => {
                    const pct = Math.max(seg.percentage, 2); // min 2% width for visibility
                    const color = seg.etf === 'CASH' ? cashColor : getEtfColor(seg.etf);
                    const isHovered = hoveredSegment?.modelId === model.id && hoveredSegment?.etf === seg.etf;
                    const showLabel = seg.percentage >= 8;

                    return (
                      <Tooltip
                        key={`${seg.etf}-${i}`}
                        title={
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{seg.etf}</Typography>
                            {seg.amount > 0 && (
                              <Typography sx={{ fontSize: 11 }}>${seg.amount.toLocaleString()}</Typography>
                            )}
                            <Typography sx={{ fontSize: 11 }}>{seg.percentage}%</Typography>
                          </Box>
                        }
                        arrow
                        placement="top"
                      >
                        <Box
                          onMouseEnter={() => setHoveredSegment({ modelId: model.id, etf: seg.etf })}
                          onMouseLeave={() => setHoveredSegment(null)}
                          sx={{
                            width: `${pct}%`,
                            height: '100%',
                            bgcolor: color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'opacity 0.15s',
                            opacity: isHovered ? 0.85 : 1,
                            borderRight: i < segments.length - 1
                              ? `1px solid ${isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)'}`
                              : 'none',
                          }}
                        >
                          {showLabel && (
                            <Typography sx={{
                              fontSize: 9,
                              fontWeight: 600,
                              color: seg.etf === 'CASH'
                                ? theme.text.muted
                                : '#fff',
                              textShadow: seg.etf === 'CASH' ? 'none' : '0 1px 2px rgba(0,0,0,0.3)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              px: 0.3,
                            }}>
                              {seg.etf} {seg.percentage}%
                            </Typography>
                          )}
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Legend */}
      {allEtfs.size > 0 && (
        <Box sx={{ display: 'flex', gap: 1.5, mt: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
          {Array.from(allEtfs).map((etf) => (
            <Box key={etf} sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
              <Box sx={{
                width: 8,
                height: 8,
                borderRadius: 0.5,
                bgcolor: getEtfColor(etf),
                flexShrink: 0,
              }} />
              <Typography sx={{ fontSize: 10, color: theme.text.muted }}>{etf}</Typography>
            </Box>
          ))}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
            <Box sx={{
              width: 8,
              height: 8,
              borderRadius: 0.5,
              bgcolor: cashColor,
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
              flexShrink: 0,
            }} />
            <Typography sx={{ fontSize: 10, color: theme.text.muted }}>CASH</Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}
