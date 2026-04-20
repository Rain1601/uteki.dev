import { Box, Typography, Paper } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Activity, DollarSign } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import type { EvalOverview } from '../../api/dashboard';
import { ShimmerLine, FadeIn } from './SkeletonPrimitives';

interface PortfolioSummaryProps {
  compact?: boolean;
  loading?: boolean;
  evalOverview?: EvalOverview | null;
}

export default function PortfolioSummary({ compact, loading, evalOverview }: PortfolioSummaryProps) {
  const { theme } = useTheme();

  const totalCost = evalOverview?.total_cost_usd ?? 0;
  const totalDecisions = evalOverview?.total_decisions ?? 0;
  const avgLatency = evalOverview?.avg_latency_ms ?? 0;
  const bestModel = evalOverview?.best_model?.split(':')[1] || '—';

  // Build allocation pie from decision breakdown
  const breakdown = evalOverview?.decision_breakdown ?? {};
  const allocationColors: Record<string, string> = {
    auto_voted: '#3B82F6',
    benchmark_dca: '#10B981',
    approved: '#F59E0B',
    modified: '#8B5CF6',
    skipped: '#6B7280',
    rejected: '#EF4444',
  };
  const allocation = Object.entries(breakdown).map(([name, value]) => ({
    name,
    value,
    color: allocationColors[name] || '#6B7280',
  }));

  return (
    <Paper
      elevation={0}
      sx={{
        p: compact ? 2 : 3,
        borderRadius: compact ? '12px' : '16px',
        border: `1px solid ${theme.border.default}`,
        bgcolor: theme.background.secondary,
        height: compact ? '100%' : 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 0.5, fontWeight: 500 }}>
        运营总览
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ mt: 0.5 }}>
            <ShimmerLine width={80} height={compact ? 28 : 32} radius={6} theme={theme} />
          </Box>
          <ShimmerLine width={70} height={10} theme={theme} delay={0.1} />
          <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <ShimmerLine width="80%" height={12} theme={theme} delay={0.15} />
            <ShimmerLine width="70%" height={12} theme={theme} delay={0.2} />
            <ShimmerLine width="60%" height={10} theme={theme} delay={0.25} />
          </Box>
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
            <Box
              sx={{
                width: compact ? 100 : 140,
                height: compact ? 100 : 140,
                borderRadius: '50%',
                border: `${compact ? 20 : 25}px solid ${theme.background.tertiary}`,
                opacity: 0.6,
                animation: 'dash-shimmer 1.8s ease-in-out infinite',
              }}
            />
          </Box>
        </Box>
      ) : (
        <FadeIn show>
          {/* Total decisions */}
          <Typography
            sx={{
              fontSize: compact ? 24 : 28,
              fontWeight: 700,
              color: theme.text.primary,
              fontFamily: 'var(--font-ui)',
              letterSpacing: '-0.02em',
            }}
          >
            {totalDecisions}
          </Typography>
          <Typography sx={{ fontSize: 11, color: theme.text.muted, mb: 1 }}>
            总决策次数
          </Typography>

          {/* Key metrics */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: compact ? 1.5 : 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <DollarSign size={12} color={theme.text.muted} />
              <Typography sx={{ fontSize: 12, color: theme.text.secondary }}>
                总成本: <strong>${totalCost.toFixed(2)}</strong>
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Activity size={12} color={theme.text.muted} />
              <Typography sx={{ fontSize: 12, color: theme.text.secondary }}>
                平均延迟: <strong>{(avgLatency / 1000).toFixed(1)}s</strong>
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 11, color: theme.text.muted }}>
              最佳模型: <strong style={{ color: theme.text.primary }}>{bestModel}</strong>
            </Typography>
          </Box>

          {/* Pie Chart — decision breakdown */}
          {allocation.length > 0 && (
            <Box sx={{ flex: 1, minHeight: compact ? 100 : 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocation}
                    cx="50%"
                    cy="50%"
                    innerRadius={compact ? 30 : 45}
                    outerRadius={compact ? 50 : 70}
                    dataKey="value"
                    stroke="none"
                  >
                    {allocation.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: theme.background.tertiary,
                      border: `1px solid ${theme.border.default}`,
                      borderRadius: 8,
                      fontSize: 12,
                      color: theme.text.primary,
                    }}
                    formatter={(value: number, name: string) => [`${value} 次`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          )}

          {/* Legend */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
            {allocation.map((item) => (
              <Box key={item.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: item.color,
                    flexShrink: 0,
                  }}
                />
                <Typography sx={{ fontSize: 10, color: theme.text.muted }}>
                  {item.name} ({item.value})
                </Typography>
              </Box>
            ))}
          </Box>
        </FadeIn>
      )}
    </Paper>
  );
}
