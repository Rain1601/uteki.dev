import { Box, Typography } from '@mui/material';
import { useTheme } from '../../theme/ThemeProvider';
import { StatGrid } from './ui';
import type { PositionHoldingOutput } from '../../api/company';

interface Props {
  verdict: PositionHoldingOutput;
  companyName: string;
}

// Muted, desaturated action colors — premium feel
const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  BUY:   { label: 'BUY',   color: '#6dba82', bg: 'rgba(109, 186, 130, 0.06)' },
  WATCH: { label: 'WATCH', color: '#c4a35a', bg: 'rgba(196, 163, 90, 0.06)' },
  AVOID: { label: 'AVOID', color: '#c47060', bg: 'rgba(196, 112, 96, 0.06)' },
};

const QUALITY_COLORS: Record<string, string> = {
  EXCELLENT: '#6dba82',
  GOOD: '#c4a35a',
  MEDIOCRE: '#b8956a',
  POOR: '#c47060',
};

export default function VerdictBanner({ verdict, companyName }: Props) {
  const { theme } = useTheme();
  const config = ACTION_CONFIG[verdict.action] || ACTION_CONFIG.WATCH;
  const qualityColor = QUALITY_COLORS[verdict.quality_verdict] || theme.text.muted;

  const statItems = [
    { label: 'Quality', value: verdict.quality_verdict, color: qualityColor },
    { label: 'Conviction', value: `${Math.round(verdict.conviction * 100)}%` },
    ...(verdict.position_size_pct > 0
      ? [{ label: 'Position', value: `${verdict.position_size_pct}%`, color: config.color }]
      : []),
    { label: 'Horizon', value: verdict.hold_horizon },
  ];

  return (
    <Box
      className="gate-meta"
      sx={{
        fontFamily: "Inter, -apple-system, sans-serif",
        bgcolor: config.bg,
        border: `1px solid ${config.color}18`,
        borderRadius: 2,
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {/* Row 1: Action badge + company name */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            px: 2,
            py: 0.75,
            borderRadius: 1,
            bgcolor: `${config.color}18`,
            color: config.color,
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: 2,
            lineHeight: 1,
          }}
        >
          {config.label}
        </Box>
        <Typography sx={{ fontSize: 15, fontWeight: 600, color: theme.text.primary }}>
          {companyName}
        </Typography>
      </Box>

      {/* Row 2: One sentence description */}
      {verdict.one_sentence && (
        <Typography sx={{ fontSize: 13, color: theme.text.secondary, lineHeight: 1.6 }}>
          {verdict.one_sentence}
        </Typography>
      )}

      {/* Row 3: StatGrid metrics */}
      <StatGrid items={statItems} />
    </Box>
  );
}
