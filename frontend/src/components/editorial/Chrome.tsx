/**
 * Editorial chrome — shared layout primitives for the editorial-finance UI.
 *
 * Provides:
 *   <EditorialMasthead title="..." kicker="..." date="..." right={...}>
 *   <SectionEyebrow text="..." sub="..." />
 *   <LoadingNote text="..." />
 *   <Shimmer width height mb />
 *   <PageShell> — full-page background with masthead slot
 */
import { Box, Typography } from '@mui/material';
import {
  FONT_DISPLAY,
  FONT_BODY,
  FONT_MONO,
  COLOR_INK,
  COLOR_INK_MUTED,
  COLOR_INK_FAINT,
} from '../../theme/editorialTokens';

// ── Masthead ─────────────────────────────────────────────────────────────
export function EditorialMasthead({
  title,
  kicker,
  date,
  right,
}: {
  title: string;
  kicker?: string;
  date?: string;
  right?: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 3,
        px: { xs: 4, md: 6 },
        py: 3,
        pb: 2,
        borderBottom: `1px solid ${COLOR_INK_FAINT}`,
      }}
    >
      <Box>
        {kicker && (
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              fontSize: 9.5,
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: COLOR_INK_MUTED,
              mb: 0.6,
            }}
          >
            {kicker}
          </Typography>
        )}
        <Typography
          sx={{
            fontFamily: FONT_DISPLAY,
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: { xs: 32, md: 44 },
            letterSpacing: '-0.025em',
            lineHeight: 1,
            color: COLOR_INK,
            fontVariationSettings: '"opsz" 144, "SOFT" 60',
          }}
        >
          {title}
        </Typography>
        {date && (
          <Typography
            sx={{
              fontFamily: FONT_BODY,
              fontStyle: 'italic',
              fontSize: 12,
              color: COLOR_INK_MUTED,
              mt: 0.5,
            }}
          >
            {date}
          </Typography>
        )}
      </Box>
      {right && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>{right}</Box>}
    </Box>
  );
}

// ── Section header ───────────────────────────────────────────────────────
export function SectionEyebrow({ text, sub }: { text: string; sub?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mb: 2 }}>
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: COLOR_INK,
          fontWeight: 600,
        }}
      >
        {text}
      </Typography>
      {sub && (
        <Typography
          sx={{
            fontFamily: FONT_DISPLAY,
            fontStyle: 'italic',
            fontSize: 13,
            color: COLOR_INK_MUTED,
            fontVariationSettings: '"opsz" 36',
          }}
        >
          {sub}
        </Typography>
      )}
      <Box sx={{ flex: 1, height: 1, bgcolor: COLOR_INK_FAINT, alignSelf: 'center' }} />
    </Box>
  );
}

// ── Loading indicator ────────────────────────────────────────────────────
export function LoadingNote({ text = '正在加载' }: { text?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: COLOR_INK_FAINT }}>
      <Box
        sx={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          bgcolor: COLOR_INK_MUTED,
          animation: 'editorial-pulse-dot 1.4s ease-in-out infinite',
          '@keyframes editorial-pulse-dot': {
            '0%, 100%': { opacity: 0.3, transform: 'scale(0.85)' },
            '50%': { opacity: 1, transform: 'scale(1)' },
          },
        }}
      />
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          color: COLOR_INK_FAINT,
        }}
      >
        {text}
      </Typography>
    </Box>
  );
}

// ── Skeleton shimmer ─────────────────────────────────────────────────────
export function Shimmer({
  width = '100%',
  height = 16,
  mb = 0,
}: {
  width?: number | string;
  height?: number;
  mb?: number;
}) {
  return (
    <Box
      sx={{
        width,
        height,
        mb,
        background: `linear-gradient(90deg,
          rgba(244,236,223,0.025) 0%,
          rgba(244,236,223,0.07) 40%,
          rgba(244,236,223,0.025) 80%
        )`,
        backgroundSize: '200% 100%',
        animation: 'editorial-shimmer 1.6s ease-in-out infinite',
        '@keyframes editorial-shimmer': {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      }}
    />
  );
}

// ── Editorial pill button (1px outline, mono caps) ───────────────────────
export function EditorialPill({
  children,
  onClick,
  variant = 'outline',
  startIcon,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'outline' | 'solid';
  startIcon?: React.ReactNode;
  disabled?: boolean;
}) {
  const solid = variant === 'solid';
  return (
    <Box
      onClick={disabled ? undefined : onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.6,
        fontFamily: FONT_MONO,
        fontSize: 11,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        color: solid ? '#15130F' : COLOR_INK_MUTED,
        bgcolor: solid ? COLOR_INK : 'transparent',
        border: solid ? 'none' : `1px solid ${COLOR_INK_FAINT}`,
        px: 2,
        py: 0.85,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 200ms',
        userSelect: 'none',
        '&:hover': solid
          ? { bgcolor: '#FFF8EA' }
          : { borderColor: COLOR_INK, color: COLOR_INK },
      }}
    >
      {startIcon}
      {children}
    </Box>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────
export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', mt: 8, py: 4 }}>
      <Typography
        sx={{
          fontFamily: FONT_DISPLAY,
          fontStyle: 'italic',
          fontSize: 28,
          color: COLOR_INK,
          mb: 1.5,
          letterSpacing: '-0.02em',
          fontVariationSettings: '"opsz" 144',
        }}
      >
        {title}
      </Typography>
      {body && (
        <Typography
          sx={{
            fontFamily: FONT_BODY,
            fontStyle: 'italic',
            fontSize: 14,
            color: COLOR_INK_MUTED,
            lineHeight: 1.7,
          }}
        >
          {body}
        </Typography>
      )}
    </Box>
  );
}
