import { Box, Typography } from '@mui/material';
import { useTheme } from '../theme/ThemeProvider';

interface LoadingDotsProps {
  text?: string;
  fontSize?: number;
  color?: string;
}

/**
 * Animated loading text with bouncing dots
 */
export default function LoadingDots({ text = 'Loading', fontSize = 14, color }: LoadingDotsProps) {
  const { theme } = useTheme();
  const dotColor = color || theme.text.muted;

  return (
    <Typography
      component="span"
      sx={{
        fontSize,
        color: color || theme.text.muted,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.25,
      }}
    >
      {text}
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          component="span"
          sx={{
            width: fontSize * 0.3,
            height: fontSize * 0.3,
            borderRadius: '50%',
            bgcolor: dotColor,
            display: 'inline-block',
            mx: '1px',
            animation: 'dotBounce 1.4s infinite ease-in-out both',
            animationDelay: `${i * 0.16}s`,
            '@keyframes dotBounce': {
              '0%, 80%, 100%': { transform: 'scale(0.4)', opacity: 0.4 },
              '40%': { transform: 'scale(1)', opacity: 1 },
            },
          }}
        />
      ))}
    </Typography>
  );
}
