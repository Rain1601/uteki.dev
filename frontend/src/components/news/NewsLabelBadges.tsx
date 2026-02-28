/**
 * News Label Badge Components
 * Display importance, impact, and confidence labels with color-coded badges
 */

import { Box, Typography } from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { ImportanceLevel, ImpactDirection, ConfidenceLevel } from '../../types/news';

// Color mappings for importance levels
const IMPORTANCE_COLORS: Record<ImportanceLevel, { bg: string; border: string; text: string }> = {
  critical: {
    bg: 'rgba(244, 67, 54, 0.15)',
    border: 'rgba(244, 67, 54, 0.4)',
    text: '#f44336',
  },
  high: {
    bg: 'rgba(255, 152, 0, 0.15)',
    border: 'rgba(255, 152, 0, 0.4)',
    text: '#ff9800',
  },
  medium: {
    bg: 'rgba(33, 150, 243, 0.15)',
    border: 'rgba(33, 150, 243, 0.4)',
    text: '#2196f3',
  },
  low: {
    bg: 'rgba(158, 158, 158, 0.15)',
    border: 'rgba(158, 158, 158, 0.4)',
    text: '#9e9e9e',
  },
};

// Color mappings for impact direction (supports both bullish/bearish and positive/negative naming)
const IMPACT_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  bullish: {
    bg: 'rgba(76, 175, 80, 0.15)',
    border: 'rgba(76, 175, 80, 0.4)',
    text: '#4caf50',
    label: 'Bullish',
  },
  positive: {
    bg: 'rgba(76, 175, 80, 0.15)',
    border: 'rgba(76, 175, 80, 0.4)',
    text: '#4caf50',
    label: 'Positive',
  },
  bearish: {
    bg: 'rgba(244, 67, 54, 0.15)',
    border: 'rgba(244, 67, 54, 0.4)',
    text: '#f44336',
    label: 'Bearish',
  },
  negative: {
    bg: 'rgba(244, 67, 54, 0.15)',
    border: 'rgba(244, 67, 54, 0.4)',
    text: '#f44336',
    label: 'Negative',
  },
  neutral: {
    bg: 'rgba(158, 158, 158, 0.15)',
    border: 'rgba(158, 158, 158, 0.4)',
    text: '#9e9e9e',
    label: 'Neutral',
  },
};

// Confidence level styling
const CONFIDENCE_STYLES: Record<ConfidenceLevel, { opacity: number; variant: 'solid' | 'semi' | 'outline' }> = {
  high: { opacity: 1, variant: 'solid' },
  medium: { opacity: 0.7, variant: 'semi' },
  low: { opacity: 0.5, variant: 'outline' },
};

interface ImportanceBadgeProps {
  level: ImportanceLevel;
  size?: 'small' | 'medium';
}

export function ImportanceBadge({ level, size = 'small' }: ImportanceBadgeProps) {
  // Validate level value - return null if invalid
  const colors = IMPORTANCE_COLORS[level];
  if (!colors) {
    return null;
  }

  const fontSize = size === 'small' ? 10 : 12;
  const padding = size === 'small' ? '2px 6px' : '4px 10px';

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: size === 'small' ? 0.75 : 1.25,
        py: size === 'small' ? 0.25 : 0.5,
        borderRadius: 0.75,
        bgcolor: colors.bg,
        border: `1px solid ${colors.border}`,
      }}
    >
      <Typography
        sx={{
          fontSize,
          fontWeight: 600,
          color: colors.text,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {level}
      </Typography>
    </Box>
  );
}

interface ImpactBadgeProps {
  impact: ImpactDirection | string;
  confidence?: ConfidenceLevel;
  size?: 'small' | 'medium';
}

export function ImpactBadge({ impact, confidence = 'high', size = 'small' }: ImpactBadgeProps) {
  // Validate impact value - return null if invalid
  const colors = IMPACT_COLORS[impact];
  if (!colors) {
    return null;
  }

  // Validate confidence value - fallback to 'high' if invalid
  const confStyle = CONFIDENCE_STYLES[confidence] || CONFIDENCE_STYLES['high'];
  const fontSize = size === 'small' ? 10 : 12;
  const iconSize = size === 'small' ? 12 : 16;

  // Support both bullish/bearish and positive/negative naming
  const isPositive = impact === 'bullish' || impact === 'positive';
  const isNegative = impact === 'bearish' || impact === 'negative';
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  // Apply confidence styling
  const bgOpacity = confStyle.variant === 'outline' ? 0 : confStyle.opacity;
  const borderOpacity = confStyle.opacity;

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: size === 'small' ? 0.75 : 1.25,
        py: size === 'small' ? 0.25 : 0.5,
        borderRadius: 0.75,
        bgcolor: confStyle.variant === 'outline' ? 'transparent' : colors.bg,
        border: `1px solid ${colors.border}`,
        opacity: confStyle.opacity,
      }}
    >
      <Icon size={iconSize} style={{ color: colors.text }} />
      <Typography
        sx={{
          fontSize,
          fontWeight: 600,
          color: colors.text,
        }}
      >
        {colors.label}
      </Typography>
    </Box>
  );
}

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  size?: 'small' | 'medium';
}

export function ConfidenceBadge({ level, size = 'small' }: ConfidenceBadgeProps) {
  const { theme } = useTheme();

  // Validate level value - return null if invalid
  const confStyle = CONFIDENCE_STYLES[level];
  if (!confStyle) {
    return null;
  }

  const fontSize = size === 'small' ? 9 : 11;

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: size === 'small' ? 0.5 : 0.75,
        py: 0.125,
        borderRadius: 0.5,
        bgcolor: confStyle.variant === 'outline' ? 'transparent' : `rgba(255,255,255,${0.05 * confStyle.opacity})`,
        border: `1px solid rgba(255,255,255,${0.2 * confStyle.opacity})`,
      }}
    >
      <Typography
        sx={{
          fontSize,
          fontWeight: 500,
          color: theme.text.muted,
          opacity: confStyle.opacity,
        }}
      >
        {level} conf.
      </Typography>
    </Box>
  );
}

interface NewsLabelStripProps {
  importanceLevel?: ImportanceLevel;
  impact?: ImpactDirection | string;
  confidence?: ConfidenceLevel;
  size?: 'small' | 'medium';
  showConfidence?: boolean;
}

export function NewsLabelStrip({
  importanceLevel,
  impact,
  confidence,
  size = 'small',
  showConfidence = false,
}: NewsLabelStripProps) {
  // Don't render if no labels
  if (!importanceLevel && !impact) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
      {importanceLevel && <ImportanceBadge level={importanceLevel} size={size} />}
      {impact && <ImpactBadge impact={impact} confidence={confidence} size={size} />}
      {showConfidence && confidence && <ConfidenceBadge level={confidence} size={size} />}
    </Box>
  );
}

export default NewsLabelStrip;
