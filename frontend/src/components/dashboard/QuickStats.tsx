import { Box, Typography, Paper } from '@mui/material';
import { BarChart3, Target, Gauge, Cpu } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import type { EvalOverview, LeaderboardEntry } from '../../api/dashboard';

interface QuickStatsProps {
  compact?: boolean;
  evalOverview?: EvalOverview | null;
  leaderboard?: LeaderboardEntry[];
}

export default function QuickStats({ compact, evalOverview, leaderboard }: QuickStatsProps) {
  const { theme } = useTheme();

  const totalAnalyses = evalOverview?.total_arena_runs ?? 0;
  const modelsUsed = leaderboard?.length ?? 0;

  // Calculate average adoption rate across all models as "win rate"
  const avgAdoptionRate = leaderboard && leaderboard.length > 0
    ? leaderboard.reduce((sum, m) => sum + m.adoption_rate, 0) / leaderboard.length
    : 0;

  // Average score as "conviction" (normalize model_score)
  const avgScore = leaderboard && leaderboard.length > 0
    ? leaderboard.reduce((sum, m) => sum + m.model_score, 0) / leaderboard.length
    : 0;

  const stats = [
    {
      icon: BarChart3,
      label: '总分析次数',
      value: totalAnalyses.toString(),
    },
    {
      icon: Target,
      label: '平均采纳率',
      value: `${avgAdoptionRate.toFixed(1)}%`,
    },
    {
      icon: Gauge,
      label: '平均模型得分',
      value: avgScore.toFixed(0),
    },
    {
      icon: Cpu,
      label: '使用模型数',
      value: modelsUsed.toString(),
    },
  ];

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: compact ? 1.5 : 2,
        height: compact ? '100%' : 'auto',
        alignContent: compact ? 'stretch' : 'start',
      }}
    >
      {stats.map(({ icon: Icon, label, value }) => (
        <Paper
          key={label}
          elevation={0}
          sx={{
            p: compact ? 1.5 : 2.5,
            borderRadius: compact ? '10px' : '12px',
            border: `1px solid ${theme.border.default}`,
            bgcolor: theme.background.secondary,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <Box sx={{ color: theme.brand.primary, mb: compact ? 0.75 : 1.5 }}>
            <Icon size={compact ? 16 : 20} />
          </Box>
          <Typography
            sx={{
              fontSize: compact ? 18 : 22,
              fontWeight: 700,
              color: theme.text.primary,
              fontFamily: 'var(--font-ui)',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            {value}
          </Typography>
          <Typography sx={{ fontSize: 11, color: theme.text.muted, mt: 0.5, fontWeight: 500 }}>
            {label}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}
