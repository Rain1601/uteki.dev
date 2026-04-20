import { Box, Typography, Paper } from '@mui/material';
import { Trophy } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import type { LeaderboardEntry } from '../../api/dashboard';
import { ShimmerLine, FadeIn } from './SkeletonPrimitives';

interface ModelLeaderboardProps {
  compact?: boolean;
  loading?: boolean;
  leaderboard?: LeaderboardEntry[];
}

export default function ModelLeaderboard({ compact, loading, leaderboard }: ModelLeaderboardProps) {
  const { theme, isDark } = useTheme();

  const sorted = leaderboard && leaderboard.length > 0
    ? [...leaderboard].sort((a, b) => b.model_score - a.model_score)
    : [];

  const COLS = '30px 1fr 55px 55px 50px';

  return (
    <Paper
      elevation={0}
      sx={{
        p: compact ? 2 : 3,
        borderRadius: '12px',
        border: `1px solid ${theme.border.default}`,
        bgcolor: theme.background.secondary,
        height: compact ? '100%' : 'auto',
        overflow: 'auto',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: compact ? 1 : 2 }}>
        <Trophy size={16} color={theme.brand.primary} />
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 600,
            color: theme.text.primary,
            letterSpacing: '-0.01em',
          }}
        >
          模型排行榜
        </Typography>
      </Box>

      {loading ? (
        <>
          {/* Header skeleton */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: COLS,
              gap: 1,
              px: 1,
              pb: 1,
              borderBottom: `1px solid ${theme.border.default}`,
              mb: 0.5,
            }}
          >
            {['#', '模型', '采纳率', '得分', '投票'].map((h) => (
              <Typography
                key={h}
                sx={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: theme.text.disabled,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  textAlign: h === '#' || h === '模型' ? 'left' : 'right',
                }}
              >
                {h}
              </Typography>
            ))}
          </Box>

          {/* 6 shimmer rows */}
          {Array.from({ length: 6 }).map((_, i) => (
            <Box
              key={i}
              sx={{
                display: 'grid',
                gridTemplateColumns: COLS,
                gap: 1,
                px: 1,
                py: 1.2,
                alignItems: 'center',
              }}
            >
              <ShimmerLine width={14} height={12} theme={theme} delay={i * 0.05} />
              <Box>
                <ShimmerLine width="85%" height={12} theme={theme} delay={i * 0.05 + 0.05} />
                <Box sx={{ mt: 0.5 }}>
                  <ShimmerLine width="50%" height={8} theme={theme} delay={i * 0.05 + 0.1} />
                </Box>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <ShimmerLine width={36} height={12} theme={theme} delay={i * 0.05 + 0.15} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <ShimmerLine width={28} height={12} theme={theme} delay={i * 0.05 + 0.2} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <ShimmerLine width={32} height={10} theme={theme} delay={i * 0.05 + 0.25} />
              </Box>
            </Box>
          ))}
        </>
      ) : sorted.length === 0 ? (
        <FadeIn show>
          <Typography sx={{ fontSize: 12, color: theme.text.muted, textAlign: 'center', py: 3 }}>
            暂无数据
          </Typography>
        </FadeIn>
      ) : (
        <FadeIn show>
          {/* Header */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: COLS,
              gap: 1,
              px: 1,
              pb: 1,
              borderBottom: `1px solid ${theme.border.default}`,
              mb: 0.5,
            }}
          >
            {['#', '模型', '采纳率', '得分', '投票'].map((h) => (
              <Typography
                key={h}
                sx={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: theme.text.disabled,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  textAlign: h === '#' || h === '模型' ? 'left' : 'right',
                }}
              >
                {h}
              </Typography>
            ))}
          </Box>

          {/* Rows */}
          {sorted.map((m, idx) => {
            const isFirst = idx === 0;
            return (
              <Box
                key={m.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: COLS,
                  gap: 1,
                  px: 1,
                  py: 1,
                  borderRadius: '6px',
                  bgcolor: isFirst
                    ? isDark
                      ? `${theme.brand.primary}10`
                      : `${theme.brand.primary}08`
                    : 'transparent',
                  transition: 'background-color 0.15s ease',
                  '&:hover': {
                    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  },
                }}
              >
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: isFirst ? 700 : 500,
                    color: isFirst ? theme.brand.primary : theme.text.muted,
                  }}
                >
                  {idx + 1}
                </Typography>

                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    noWrap
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: theme.text.primary,
                      fontFamily: "'SF Mono', Monaco, monospace",
                      lineHeight: 1.3,
                    }}
                  >
                    {m.model_name}
                  </Typography>
                  <Typography
                    noWrap
                    sx={{ fontSize: 10, color: theme.text.disabled, lineHeight: 1.3 }}
                  >
                    {m.model_provider}
                  </Typography>
                </Box>

                <Box sx={{ textAlign: 'right' }}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: m.adoption_rate >= 30 ? '#10b981' : theme.text.secondary,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {m.adoption_rate.toFixed(0)}%
                  </Typography>
                  <Box
                    sx={{
                      mt: 0.3,
                      height: 3,
                      borderRadius: 2,
                      bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      sx={{
                        width: `${Math.min(m.adoption_rate, 100)}%`,
                        height: '100%',
                        borderRadius: 2,
                        bgcolor:
                          m.adoption_rate >= 50
                            ? '#10b981'
                            : m.adoption_rate >= 20
                              ? '#f59e0b'
                              : '#ef4444',
                      }}
                    />
                  </Box>
                </Box>

                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: m.model_score > 0 ? '#10b981' : m.model_score < 0 ? '#ef4444' : theme.text.secondary,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {m.model_score > 0 ? '+' : ''}{m.model_score}
                </Typography>

                <Typography
                  sx={{
                    fontSize: 11,
                    color: theme.text.muted,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {m.approve_vote_count}/{m.approve_vote_count + m.rejection_count}
                </Typography>
              </Box>
            );
          })}
        </FadeIn>
      )}
    </Paper>
  );
}
