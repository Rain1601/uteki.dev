import { useMemo } from 'react';
import { Box, Card, Chip, Typography, Tooltip } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, MinusCircle, Trophy, Target } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────

export interface VoteData {
  voter: string;
  target: string;
  voteType: 'agree' | 'disagree' | 'partial';
  reasoning: string;
}

interface VotingVisualizationProps {
  votes: VoteData[];
  models: string[];
  isStreaming: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────

const VOTE_COLORS: Record<VoteData['voteType'], string> = {
  agree: '#22c55e',
  disagree: '#ef4444',
  partial: '#eab308',
};

const VOTE_BG: Record<VoteData['voteType'], string> = {
  agree: 'rgba(34,197,94,0.12)',
  disagree: 'rgba(239,68,68,0.12)',
  partial: 'rgba(234,179,8,0.12)',
};

const VOTE_ICONS: Record<VoteData['voteType'], typeof CheckCircle2> = {
  agree: CheckCircle2,
  disagree: XCircle,
  partial: MinusCircle,
};

const VOTE_LABELS: Record<VoteData['voteType'], string> = {
  agree: 'Agree',
  disagree: 'Disagree',
  partial: 'Partial',
};

/** Shorten model name for display in cells */
function shortName(model: string): string {
  const map: Record<string, string> = {
    'claude-sonnet-4-20250514': 'Sonnet',
    'deepseek-chat': 'DeepSeek',
    'gpt-4.1': 'GPT-4.1',
    'gemini-2.5-flash': 'Gemini',
    'qwen-plus': 'Qwen',
    'grok-3-mini': 'Grok',
    'claude-haiku': 'Haiku',
  };
  return map[model] || model.split('-').slice(0, 2).join('-');
}

// ─── Component ───────────────────────────────────────────────────

export default function VotingVisualization({
  votes,
  models,
  isStreaming,
}: VotingVisualizationProps) {
  // Build lookup: voter -> target -> VoteData
  const voteMap = useMemo(() => {
    const m = new Map<string, VoteData>();
    for (const v of votes) {
      m.set(`${v.voter}::${v.target}`, v);
    }
    return m;
  }, [votes]);

  // Tally: how many agree/disagree/partial each model received
  const tally = useMemo(() => {
    const t: Record<string, { agree: number; disagree: number; partial: number; score: number }> =
      {};
    for (const model of models) {
      t[model] = { agree: 0, disagree: 0, partial: 0, score: 0 };
    }
    for (const v of votes) {
      if (!t[v.target]) continue;
      t[v.target][v.voteType]++;
      t[v.target].score +=
        v.voteType === 'agree' ? 1 : v.voteType === 'partial' ? 0.5 : 0;
    }
    return t;
  }, [votes, models]);

  // Determine winner
  const winner = useMemo(() => {
    let best = '';
    let bestScore = -1;
    for (const model of models) {
      const s = tally[model]?.score ?? 0;
      if (s > bestScore) {
        bestScore = s;
        best = model;
      }
    }
    return { model: best, score: bestScore };
  }, [tally, models]);

  const totalPossible = models.length - 1;

  return (
    <Box className="space-y-6">
      {/* ── Matrix Card ─────────────────────────────────────── */}
      <Card
        sx={{
          bgcolor: 'rgba(15,15,20,0.7)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 3,
          overflow: 'auto',
        }}
      >
        <Box sx={{ p: 3 }}>
          <Box className="flex items-center gap-2 mb-4">
            <Target size={18} className="text-orange-400" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#fff' }}>
              Cross-Vote Matrix
            </Typography>
            {isStreaming && (
              <Chip
                label="Streaming..."
                size="small"
                sx={{
                  ml: 1,
                  bgcolor: 'rgba(234,179,8,0.15)',
                  color: '#eab308',
                  fontSize: 11,
                  animation: 'pulse 1.5s infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.5 },
                  },
                }}
              />
            )}
          </Box>

          {/* Legend */}
          <Box className="flex gap-4 mb-4">
            {(['agree', 'disagree', 'partial'] as const).map((type) => {
              const Icon = VOTE_ICONS[type];
              return (
                <Box key={type} className="flex items-center gap-1.5">
                  <Icon size={14} color={VOTE_COLORS[type]} />
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {VOTE_LABELS[type]}
                  </Typography>
                </Box>
              );
            })}
          </Box>

          {/* Grid */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `140px repeat(${models.length}, 1fr)`,
              gap: '2px',
              minWidth: models.length * 80 + 140,
            }}
          >
            {/* Header row */}
            <Box
              sx={{
                p: 1,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', fontSize: 10 }}
              >
                voter \ target
              </Typography>
            </Box>
            {models.map((target) => (
              <Box
                key={`hdr-${target}`}
                sx={{
                  p: 1,
                  textAlign: 'center',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: winner.model === target && votes.length > 0
                      ? '#f59e0b'
                      : 'rgba(255,255,255,0.6)',
                    fontWeight: winner.model === target ? 700 : 500,
                    fontSize: 11,
                    lineHeight: 1.2,
                    display: 'block',
                  }}
                >
                  {shortName(target)}
                </Typography>
              </Box>
            ))}

            {/* Data rows */}
            {models.map((voter) => (
              <Box key={`row-${voter}`} sx={{ display: 'contents' }}>
                {/* Row label */}
                <Box
                  sx={{
                    p: 1,
                    display: 'flex',
                    alignItems: 'center',
                    borderRight: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'rgba(255,255,255,0.6)',
                      fontWeight: 500,
                      fontSize: 11,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {shortName(voter)}
                  </Typography>
                </Box>

                {/* Cells */}
                {models.map((target) => {
                  const cellKey = `${voter}::${target}`;
                  const vote = voteMap.get(cellKey);
                  const isSelf = voter === target;

                  if (isSelf) {
                    return (
                      <Box
                        key={cellKey}
                        sx={{
                          bgcolor: 'rgba(255,255,255,0.02)',
                          borderRadius: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 40,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ color: 'rgba(255,255,255,0.1)', fontSize: 10 }}
                        >
                          --
                        </Typography>
                      </Box>
                    );
                  }

                  return (
                    <Box key={cellKey} sx={{ minHeight: 40 }}>
                      <AnimatePresence>
                        {vote ? (
                          <Tooltip
                            title={
                              <Box sx={{ maxWidth: 280 }}>
                                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                  {shortName(voter)} on {shortName(target)}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{ display: 'block', mt: 0.5, opacity: 0.85 }}
                                >
                                  {vote.reasoning}
                                </Typography>
                              </Box>
                            }
                            arrow
                            placement="top"
                          >
                            <motion.div
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                              style={{
                                background: VOTE_BG[vote.voteType],
                                borderRadius: 6,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minHeight: 40,
                                cursor: 'pointer',
                                border: `1px solid ${VOTE_COLORS[vote.voteType]}22`,
                              }}
                            >
                              {(() => {
                                const Icon = VOTE_ICONS[vote.voteType];
                                return <Icon size={16} color={VOTE_COLORS[vote.voteType]} />;
                              })()}
                            </motion.div>
                          </Tooltip>
                        ) : (
                          <Box
                            sx={{
                              bgcolor: 'rgba(255,255,255,0.02)',
                              borderRadius: 1,
                              minHeight: 40,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {isStreaming && (
                              <motion.div
                                animate={{ opacity: [0.2, 0.5, 0.2] }}
                                transition={{ repeat: Infinity, duration: 1.5 }}
                              >
                                <Box
                                  sx={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    bgcolor: 'rgba(255,255,255,0.15)',
                                  }}
                                />
                              </motion.div>
                            )}
                          </Box>
                        )}
                      </AnimatePresence>
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
      </Card>

      {/* ── Summary Card ────────────────────────────────────── */}
      <Card
        sx={{
          bgcolor: 'rgba(15,15,20,0.7)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 3,
        }}
      >
        <Box sx={{ p: 3 }}>
          <Box className="flex items-center gap-2 mb-4">
            <Trophy size={18} className="text-amber-400" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#fff' }}>
              Vote Summary
            </Typography>
          </Box>

          <Box className="space-y-2">
            {models
              .slice()
              .sort((a, b) => (tally[b]?.score ?? 0) - (tally[a]?.score ?? 0))
              .map((model, idx) => {
                const t = tally[model];
                if (!t) return null;
                const pct = totalPossible > 0 ? (t.score / totalPossible) * 100 : 0;
                const isWinner = model === winner.model && votes.length > 0;

                return (
                  <motion.div
                    key={model}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: isWinner
                          ? 'rgba(245,158,11,0.08)'
                          : 'rgba(255,255,255,0.02)',
                        border: isWinner
                          ? '1px solid rgba(245,158,11,0.2)'
                          : '1px solid transparent',
                      }}
                    >
                      {/* Rank */}
                      <Typography
                        variant="caption"
                        sx={{
                          color: isWinner ? '#f59e0b' : 'rgba(255,255,255,0.3)',
                          fontWeight: 700,
                          width: 20,
                          textAlign: 'center',
                          fontSize: 12,
                        }}
                      >
                        #{idx + 1}
                      </Typography>

                      {/* Model name */}
                      <Typography
                        variant="body2"
                        sx={{
                          color: isWinner ? '#f59e0b' : 'rgba(255,255,255,0.8)',
                          fontWeight: isWinner ? 700 : 500,
                          minWidth: 80,
                          fontSize: 13,
                        }}
                      >
                        {shortName(model)}
                      </Typography>

                      {/* Bar */}
                      <Box sx={{ flex: 1, position: 'relative', height: 8, borderRadius: 4 }}>
                        <Box
                          sx={{
                            position: 'absolute',
                            inset: 0,
                            bgcolor: 'rgba(255,255,255,0.04)',
                            borderRadius: 4,
                          }}
                        />
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            bottom: 0,
                            borderRadius: 4,
                            background: isWinner
                              ? 'linear-gradient(90deg, #f59e0b, #f97316)'
                              : 'linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.25))',
                          }}
                        />
                      </Box>

                      {/* Vote chips */}
                      <Box className="flex gap-1">
                        <Chip
                          label={t.agree}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: 10,
                            bgcolor: 'rgba(34,197,94,0.12)',
                            color: '#22c55e',
                            '& .MuiChip-label': { px: 0.8 },
                          }}
                        />
                        <Chip
                          label={t.partial}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: 10,
                            bgcolor: 'rgba(234,179,8,0.12)',
                            color: '#eab308',
                            '& .MuiChip-label': { px: 0.8 },
                          }}
                        />
                        <Chip
                          label={t.disagree}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: 10,
                            bgcolor: 'rgba(239,68,68,0.12)',
                            color: '#ef4444',
                            '& .MuiChip-label': { px: 0.8 },
                          }}
                        />
                      </Box>

                      {/* Score */}
                      <Typography
                        variant="caption"
                        sx={{
                          color: isWinner ? '#f59e0b' : 'rgba(255,255,255,0.5)',
                          fontWeight: 600,
                          minWidth: 40,
                          textAlign: 'right',
                          fontSize: 12,
                        }}
                      >
                        {t.score.toFixed(1)}
                      </Typography>
                    </Box>
                  </motion.div>
                );
              })}
          </Box>
        </Box>
      </Card>
    </Box>
  );
}
