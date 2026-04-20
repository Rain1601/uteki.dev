import { Box, Typography, Paper, Chip } from '@mui/material';
import { useTheme } from '../../theme/ThemeProvider';
import type { DecisionItem, CompanyAnalysis } from '../../api/dashboard';
import { ShimmerLine, FadeIn } from './SkeletonPrimitives';

const actionColors: Record<string, { bg: string; text: string }> = {
  auto_voted: { bg: '#10b98120', text: '#10b981' },
  benchmark_dca: { bg: '#3B82F620', text: '#3B82F6' },
  approved: { bg: '#10b98120', text: '#10b981' },
  modified: { bg: '#f59e0b20', text: '#f59e0b' },
  skipped: { bg: '#6B728020', text: '#6B7280' },
  rejected: { bg: '#ef444420', text: '#ef4444' },
  BUY: { bg: '#10b98120', text: '#10b981' },
  WATCH: { bg: '#f59e0b20', text: '#f59e0b' },
  AVOID: { bg: '#ef444420', text: '#ef4444' },
};

const actionLabels: Record<string, string> = {
  auto_voted: 'AUTO',
  benchmark_dca: 'DCA',
  approved: 'APPROVED',
  modified: 'MODIFIED',
  skipped: 'SKIP',
  rejected: 'REJECT',
};

interface RecentDecisionsProps {
  compact?: boolean;
  loading?: boolean;
  decisions?: DecisionItem[];
  companyAnalyses?: CompanyAnalysis[];
}

interface UnifiedRow {
  date: string;
  type: string;
  symbols: string;
  action: string;
  model: string;
}

export default function RecentDecisions({ compact, loading, decisions, companyAnalyses }: RecentDecisionsProps) {
  const { theme, isDark } = useTheme();
  const COLS = '70px 55px 80px 50px 70px';

  // Build unified rows from both index decisions and company analyses
  const rows: UnifiedRow[] = [];

  if (decisions) {
    for (const d of decisions) {
      const symbols = d.original_allocations
        ?.map(a => a.symbol || a.etf || '')
        .filter(Boolean)
        .slice(0, 3)
        .join(',') || '—';
      rows.push({
        date: d.created_at.slice(0, 10),
        type: 'Index',
        symbols,
        action: d.user_action,
        model: d.adopted_model?.name?.split('-').slice(0, 2).join('-') || '—',
      });
    }
  }

  if (companyAnalyses) {
    for (const c of companyAnalyses) {
      rows.push({
        date: c.created_at.slice(0, 10),
        type: 'Company',
        symbols: c.symbol,
        action: c.verdict_action || c.status,
        model: c.model?.split('-').slice(0, 2).join('-') || c.provider,
      });
    }
  }

  // Sort by date descending
  rows.sort((a, b) => b.date.localeCompare(a.date));
  const displayRows = rows.slice(0, 10);

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: compact ? '12px' : '16px',
        border: `1px solid ${theme.border.default}`,
        bgcolor: theme.background.secondary,
        overflow: 'hidden',
        height: compact ? '100%' : 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${theme.border.divider}` }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
          近期决策
        </Typography>
      </Box>

      {/* Header row */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: COLS,
          gap: 1,
          px: 2,
          py: 1,
          borderBottom: `1px solid ${theme.border.divider}`,
        }}
      >
        {['日期', '类型', '标的', '操作', '模型'].map((h) => (
          <Typography key={h} sx={{ fontSize: 11, fontWeight: 600, color: theme.text.muted }}>
            {h}
          </Typography>
        ))}
      </Box>

      {/* Rows */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          // 8 shimmer rows matching real row grid
          Array.from({ length: 8 }).map((_, i) => (
            <Box
              key={i}
              sx={{
                display: 'grid',
                gridTemplateColumns: COLS,
                gap: 1,
                px: 2,
                py: 1.25,
                alignItems: 'center',
              }}
            >
              <ShimmerLine width={42} height={10} theme={theme} delay={i * 0.04} />
              <ShimmerLine width={36} height={10} theme={theme} delay={i * 0.04 + 0.05} />
              <ShimmerLine width="70%" height={12} theme={theme} delay={i * 0.04 + 0.1} />
              <ShimmerLine width={36} height={14} radius={6} theme={theme} delay={i * 0.04 + 0.15} />
              <ShimmerLine width="60%" height={10} theme={theme} delay={i * 0.04 + 0.2} />
            </Box>
          ))
        ) : displayRows.length === 0 ? (
          <FadeIn show>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
              <Typography sx={{ fontSize: 12, color: theme.text.muted }}>暂无决策记录</Typography>
            </Box>
          </FadeIn>
        ) : (
          <FadeIn show>{displayRows.map((d, i) => {
            const ac = actionColors[d.action] || actionColors.skipped;
            const label = actionLabels[d.action] || d.action;
            return (
              <Box
                key={i}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: COLS,
                  gap: 1,
                  px: 2,
                  py: 1.25,
                  alignItems: 'center',
                  '&:hover': {
                    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  },
                }}
              >
                <Typography sx={{ fontSize: 12, color: theme.text.secondary }}>
                  {d.date.slice(5)}
                </Typography>
                <Typography sx={{ fontSize: 11, color: theme.text.muted }}>
                  {d.type}
                </Typography>
                <Typography noWrap sx={{ fontSize: 12, fontWeight: 600, color: theme.text.primary }}>
                  {d.symbols}
                </Typography>
                <Chip
                  label={label}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: 9,
                    fontWeight: 700,
                    bgcolor: ac.bg,
                    color: ac.text,
                    '& .MuiChip-label': { px: 0.5 },
                  }}
                />
                <Typography noWrap sx={{ fontSize: 11, color: theme.text.muted }}>
                  {d.model}
                </Typography>
              </Box>
            );
          })}</FadeIn>
        )}
      </Box>
    </Paper>
  );
}
