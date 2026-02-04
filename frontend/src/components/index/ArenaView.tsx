import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  Chip,
  Collapse,
  TextField,
  MenuItem,
  Skeleton,
} from '@mui/material';
import {
  PlayArrow as RunIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as AdoptIcon,
  ErrorOutline as ErrorIcon,
  AccessTime as PendingIcon,
} from '@mui/icons-material';
import { useTheme } from '../../theme/ThemeProvider';
import LoadingDots from '../LoadingDots';
import { useToast } from '../Toast';
import {
  ArenaResult,
  ModelIOSummary,
  ModelIODetail,
  runArena,
  fetchModelIODetail,
  adoptModel,
} from '../../api/index';
import { ModelLogo, getProviderDisplayName } from './ModelLogos';

// 当前已配置的模型列表（用于生成占位卡片）
const KNOWN_MODELS = [
  { provider: 'anthropic', name: 'claude-sonnet-4-20250514' },
  { provider: 'openai', name: 'gpt-4o' },
  { provider: 'deepseek', name: 'deepseek-chat' },
  { provider: 'google', name: 'gemini-2.0-flash' },
  { provider: 'qwen', name: 'qwen-plus' },
  { provider: 'minimax', name: 'MiniMax-Text-01' },
];

export default function ArenaView() {
  const { theme, isDark } = useTheme();
  const { showToast } = useToast();

  const [result, setResult] = useState<ArenaResult | null>(null);
  const [running, setRunning] = useState(false);
  const [harnessType, setHarnessType] = useState('monthly_dca');
  const [budget, setBudget] = useState(1000);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 计时器
  useEffect(() => {
    if (running) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await runArena({ harness_type: harnessType, budget });
      if (res.success && res.data) {
        setResult(res.data);
      } else {
        showToast(res.error || 'Arena run failed', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Arena run failed', 'error');
    } finally {
      setRunning(false);
    }
  }, [harnessType, budget, showToast]);

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const cardBorder = `1px solid ${theme.border.subtle}`;

  // 已完成的结果按 provider 索引
  const completedByProvider = new Map<string, ModelIOSummary>();
  if (result) {
    for (const m of result.models) {
      completedByProvider.set(m.model_provider, m);
    }
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto', px: 3, py: 2 }}>
      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 3, flexWrap: 'wrap' }}>
        <TextField
          select
          size="small"
          label="Harness Type"
          value={harnessType}
          onChange={(e) => setHarnessType(e.target.value)}
          sx={{ minWidth: 160 }}
          InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
          InputLabelProps={{ sx: { color: theme.text.muted } }}
        >
          <MenuItem value="monthly_dca">Monthly DCA</MenuItem>
          <MenuItem value="weekly_check">Weekly Check</MenuItem>
          <MenuItem value="adhoc">Ad Hoc</MenuItem>
        </TextField>

        <TextField
          size="small"
          label="Budget ($)"
          type="number"
          value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
          sx={{ width: 120 }}
          InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
          InputLabelProps={{ sx: { color: theme.text.muted } }}
        />

        <Button
          startIcon={running ? undefined : <RunIcon />}
          onClick={handleRun}
          disabled={running}
          sx={{
            bgcolor: theme.brand.primary,
            color: '#fff',
            textTransform: 'none',
            fontWeight: 600,
            fontSize: 13,
            borderRadius: 2,
            px: 3,
            '&:hover': { bgcolor: theme.brand.hover },
          }}
        >
          {running ? <LoadingDots text="Running Arena" fontSize={13} color="#fff" /> : 'Run Arena'}
        </Button>

        {running && (
          <Typography sx={{ fontSize: 12, color: theme.text.muted, ml: 1 }}>
            {elapsedSeconds}s
          </Typography>
        )}
      </Box>

      {/* Arena 说明 */}
      {!result && !running && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: theme.text.muted }}>
            Multi-Model Arena
          </Typography>
          <Typography sx={{ fontSize: 13, color: theme.text.muted, textAlign: 'center', maxWidth: 480 }}>
            Arena 将同一份市场数据快照（Decision Harness）同时发送给多个 LLM，
            让它们独立给出投资建议，方便你对比不同模型的分析能力和决策质量。
          </Typography>
        </Box>
      )}

      {/* Model Cards — 运行中显示骨架，完成后显示结果 */}
      {(running || result) && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.secondary }}>
              Arena Results
            </Typography>
            {result && (
              <Chip
                label={result.harness_type}
                size="small"
                sx={{ fontSize: 11, bgcolor: cardBg, color: theme.text.muted }}
              />
            )}
          </Box>

          <Grid container spacing={2}>
            {running && !result
              ? KNOWN_MODELS.map((m) => (
                  <Grid item xs={12} md={6} lg={4} key={m.provider}>
                    <SkeletonModelCard
                      provider={m.provider}
                      modelName={m.name}
                      theme={theme}
                      isDark={isDark}
                      cardBg={cardBg}
                      cardBorder={cardBorder}
                      elapsedSeconds={elapsedSeconds}
                    />
                  </Grid>
                ))
              : result?.models.map((model) => (
                  <Grid item xs={12} md={6} lg={4} key={model.id}>
                    <ModelCard
                      model={model}
                      harnessId={result!.harness_id}
                      theme={theme}
                      isDark={isDark}
                      cardBg={cardBg}
                      cardBorder={cardBorder}
                    />
                  </Grid>
                ))}
          </Grid>
        </>
      )}
    </Box>
  );
}

/* ── 骨架加载卡片 ── */
function SkeletonModelCard({
  provider,
  modelName,
  theme,
  isDark,
  cardBg,
  cardBorder,
  elapsedSeconds,
}: {
  provider: string;
  modelName: string;
  theme: any;
  isDark: boolean;
  cardBg: string;
  cardBorder: string;
  elapsedSeconds: number;
}) {
  return (
    <Box
      sx={{
        bgcolor: cardBg,
        border: cardBorder,
        borderRadius: 2,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Header — 真实名称 + Logo */}
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
          <ModelLogo provider={provider} size={24} isDark={isDark} />
          <Box>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.primary, lineHeight: 1.3 }}>
              {modelName}
            </Typography>
            <Typography sx={{ fontSize: 12, color: theme.text.muted, lineHeight: 1.2 }}>
              {getProviderDisplayName(provider)}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <PendingIcon sx={{ fontSize: 14, color: theme.text.muted, animation: 'spin 2s linear infinite', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }} />
          <Typography sx={{ fontSize: 11, color: theme.text.muted }}>
            {elapsedSeconds}s
          </Typography>
        </Box>
      </Box>

      {/* Skeleton body */}
      <Box sx={{ px: 2, pb: 2 }}>
        <Skeleton variant="rounded" width={60} height={22} sx={{ mb: 1, bgcolor: 'rgba(128,128,128,0.1)' }} />
        <Skeleton variant="text" width="80%" sx={{ bgcolor: 'rgba(128,128,128,0.08)' }} />
        <Skeleton variant="text" width="65%" sx={{ bgcolor: 'rgba(128,128,128,0.08)' }} />
        <Skeleton variant="text" width="45%" sx={{ bgcolor: 'rgba(128,128,128,0.08)' }} />
      </Box>

      {/* Pulsing bottom bar */}
      <Box
        sx={{
          height: 3,
          bgcolor: theme.brand.primary,
          opacity: 0.5,
          animation: 'pulse 1.5s ease-in-out infinite',
          '@keyframes pulse': {
            '0%, 100%': { opacity: 0.2 },
            '50%': { opacity: 0.6 },
          },
        }}
      />
    </Box>
  );
}

/* ── 结果卡片 ── */
function ModelCard({
  model,
  harnessId,
  theme,
  isDark,
  cardBg,
  cardBorder,
}: {
  model: ModelIOSummary;
  harnessId: string;
  theme: any;
  isDark: boolean;
  cardBg: string;
  cardBorder: string;
}) {
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<ModelIODetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adopting, setAdopting] = useState(false);

  const isError = model.status === 'error' || model.status === 'timeout';
  const structured = model.output_structured || {};

  const handleExpand = async () => {
    if (!expanded && !detail) {
      setDetailLoading(true);
      try {
        const res = await fetchModelIODetail(harnessId, model.id);
        if (res.success && res.data) setDetail(res.data);
      } catch {
        /* ignore */
      } finally {
        setDetailLoading(false);
      }
    }
    setExpanded(!expanded);
  };

  const handleAdopt = async () => {
    setAdopting(true);
    try {
      const res = await adoptModel(harnessId, model.id);
      if (res.success) {
        showToast(`Adopted ${model.model_name}`, 'success');
      } else {
        showToast(res.error || 'Adopt failed', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Adopt failed', 'error');
    } finally {
      setAdopting(false);
    }
  };

  // 状态颜色
  const statusColor = isError ? '#f44336' : model.parse_status === 'structured' ? '#4caf50' : '#ff9800';
  const statusBg = isError ? 'rgba(244,67,54,0.12)' : model.parse_status === 'structured' ? 'rgba(76,175,80,0.12)' : 'rgba(255,152,0,0.12)';
  const statusLabel = isError ? (model.status === 'timeout' ? 'timeout' : 'error') : model.parse_status || 'ok';

  return (
    <Box
      sx={{
        bgcolor: cardBg,
        border: isError ? '1px solid rgba(244,67,54,0.3)' : cardBorder,
        borderRadius: 2,
        overflow: 'hidden',
        opacity: isError ? 0.75 : 1,
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
          <ModelLogo provider={model.model_provider} size={24} isDark={isDark} />
          <Box>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.primary, lineHeight: 1.3 }}>
              {model.model_name}
            </Typography>
            <Typography sx={{ fontSize: 12, color: theme.text.muted, lineHeight: 1.2 }}>
              {getProviderDisplayName(model.model_provider)}
            </Typography>
          </Box>
        </Box>
        <Chip
          icon={isError ? <ErrorIcon sx={{ fontSize: '14px !important' }} /> : undefined}
          label={statusLabel}
          size="small"
          sx={{ fontSize: 10, height: 20, bgcolor: statusBg, color: statusColor }}
        />
      </Box>

      {/* Error message */}
      {isError && model.error_message && (
        <Box sx={{ px: 2, pb: 1.5 }}>
          <Typography sx={{ fontSize: 12, color: '#f44336', lineHeight: 1.5 }}>
            {model.error_message.length > 120 ? model.error_message.slice(0, 120) + '...' : model.error_message}
          </Typography>
        </Box>
      )}

      {/* Summary — 仅成功时显示 */}
      {!isError && (
        <Box sx={{ px: 2, pb: 1.5 }}>
          {structured.action && (
            <Chip
              label={structured.action}
              size="small"
              sx={{
                mb: 1,
                fontWeight: 600,
                fontSize: 11,
                bgcolor: structured.action === 'BUY' ? 'rgba(76,175,80,0.15)' : structured.action === 'SELL' ? 'rgba(244,67,54,0.15)' : 'rgba(255,152,0,0.15)',
                color: structured.action === 'BUY' ? '#4caf50' : structured.action === 'SELL' ? '#f44336' : '#ff9800',
              }}
            />
          )}

          {structured.allocations?.map((alloc: any, i: number) => (
            <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.3 }}>
              <Typography sx={{ fontSize: 12, color: theme.text.primary }}>{alloc.etf}</Typography>
              <Typography sx={{ fontSize: 12, color: theme.text.secondary }}>
                ${alloc.amount?.toLocaleString()} ({alloc.percentage}%)
              </Typography>
            </Box>
          ))}

          {structured.confidence != null && (
            <Typography sx={{ fontSize: 11, color: theme.text.muted, mt: 0.5 }}>
              Confidence: {(structured.confidence * 100).toFixed(0)}%
            </Typography>
          )}
        </Box>
      )}

      {/* Metrics — 始终显示 */}
      <Box sx={{ px: 2, pb: 1.5, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {model.latency_ms != null && model.latency_ms > 0 && (
          <Typography sx={{ fontSize: 11, color: theme.text.muted }}>
            {(model.latency_ms / 1000).toFixed(1)}s
          </Typography>
        )}
        {model.cost_usd != null && model.cost_usd > 0 && (
          <Typography sx={{ fontSize: 11, color: theme.text.muted }}>
            ${model.cost_usd.toFixed(4)}
          </Typography>
        )}
        {model.output_token_count != null && model.output_token_count > 0 && (
          <Typography sx={{ fontSize: 11, color: theme.text.muted }}>
            {model.output_token_count} tokens
          </Typography>
        )}
      </Box>

      {/* Actions */}
      <Box sx={{ display: 'flex', borderTop: `1px solid ${theme.border.subtle}` }}>
        <Button
          fullWidth
          size="small"
          onClick={handleExpand}
          endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          sx={{ color: theme.text.muted, textTransform: 'none', fontSize: 12, borderRadius: 0 }}
        >
          {expanded ? 'Collapse' : 'Details'}
        </Button>
        {!isError && (
          <Button
            fullWidth
            size="small"
            startIcon={<AdoptIcon />}
            onClick={handleAdopt}
            disabled={adopting}
            sx={{
              color: theme.brand.primary,
              textTransform: 'none',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 0,
              borderLeft: `1px solid ${theme.border.subtle}`,
            }}
          >
            {adopting ? 'Adopting...' : 'Adopt'}
          </Button>
        )}
      </Box>

      {/* Detail */}
      <Collapse in={expanded}>
        <Box sx={{ p: 2, borderTop: `1px solid ${theme.border.subtle}`, maxHeight: 300, overflow: 'auto' }}>
          {detailLoading ? (
            <LoadingDots text="Loading" fontSize={12} />
          ) : detail ? (
            <Box sx={{ fontSize: 12, fontFamily: 'monospace', color: theme.text.secondary }}>
              {detail.error_message && (
                <>
                  <Typography sx={{ fontSize: 11, color: '#f44336', mb: 0.5, fontWeight: 600 }}>
                    Error:
                  </Typography>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#f44336', marginBottom: 12 }}>
                    {detail.error_message}
                  </pre>
                </>
              )}
              {detail.output_raw && (
                <>
                  <Typography sx={{ fontSize: 11, color: theme.text.muted, mb: 0.5, fontWeight: 600 }}>
                    Raw Output:
                  </Typography>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 12 }}>
                    {detail.output_raw}
                  </pre>
                </>
              )}
              {structured.reasoning && (
                <>
                  <Typography sx={{ fontSize: 11, color: theme.text.muted, mb: 0.5, fontWeight: 600 }}>
                    Reasoning:
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: theme.text.secondary, lineHeight: 1.6 }}>
                    {structured.reasoning}
                  </Typography>
                </>
              )}
              {!detail.output_raw && !detail.error_message && !structured.reasoning && (
                <Typography sx={{ fontSize: 12, color: theme.text.muted }}>No details available</Typography>
              )}
            </Box>
          ) : (
            <Typography sx={{ fontSize: 12, color: theme.text.muted }}>No details available</Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
