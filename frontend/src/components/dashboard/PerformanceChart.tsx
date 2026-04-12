import { Box, Typography, Paper } from '@mui/material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTheme } from '../../theme/ThemeProvider';
import { performanceData } from '../../data/mockDashboard';

// Show only monthly ticks
const monthLabels = performanceData.filter((_, i) => i % 30 === 0).map((d) => d.date);

export default function PerformanceChart({ compact }: { compact?: boolean }) {
  const { theme, isDark } = useTheme();

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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: compact ? 1 : 2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.primary }}>
          收益走势
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 12, height: 3, borderRadius: 1, bgcolor: '#3B82F6' }} />
            <Typography sx={{ fontSize: 11, color: theme.text.muted }}>Portfolio</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 12,
                height: 3,
                borderRadius: 1,
                bgcolor: '#6B7280',
                opacity: 0.5,
              }}
            />
            <Typography sx={{ fontSize: 11, color: theme.text.muted }}>Benchmark</Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ flex: compact ? 1 : undefined, height: compact ? undefined : 280, minHeight: compact ? 0 : undefined }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={performanceData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: theme.text.muted }}
              tickLine={false}
              axisLine={false}
              ticks={monthLabels}
              tickFormatter={(v: string) => {
                const d = new Date(v);
                return `${d.getMonth() + 1}月`;
              }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: theme.text.muted }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
              width={45}
            />
            <Tooltip
              contentStyle={{
                background: theme.background.tertiary,
                border: `1px solid ${theme.border.default}`,
                borderRadius: 8,
                fontSize: 12,
                color: theme.text.primary,
              }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
              labelFormatter={(label: string) => label}
            />
            <Area
              type="monotone"
              dataKey="portfolio"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#portfolioGrad)"
              name="Portfolio"
            />
            <Area
              type="monotone"
              dataKey="benchmark"
              stroke="#6B7280"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              fill="none"
              name="Benchmark"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}
