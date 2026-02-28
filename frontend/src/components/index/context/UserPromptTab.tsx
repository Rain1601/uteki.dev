import { useState, useCallback } from 'react';
import {
  Box, Typography, Chip, Collapse,
} from '@mui/material';
import {
  Eye,
  Pencil,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import LoadingDots from '../../LoadingDots';
import { previewUserPrompt } from '../../../api/index';
import SystemPromptTab from './SystemPromptTab';

interface Props {
  theme: any;
  isDark: boolean;
}

const TEMPLATE_VARIABLES = [
  { name: 'date', desc: '当前日期 (ISO 格式)' },
  { name: 'harness_type', desc: '决策类型 (monthly_dca / rebalance / weekly_check)' },
  { name: 'market_quotes', desc: '市场行情数据（价格、PE、MA、RSI）' },
  { name: 'valuations', desc: '估值数据（PE、CAPE、股息率等）' },
  { name: 'macro', desc: '宏观经济数据' },
  { name: 'sentiment', desc: '市场情绪数据' },
  { name: 'cash', desc: '账户现金余额' },
  { name: 'total', desc: '账户总资产' },
  { name: 'positions', desc: '当前持仓列表' },
  { name: 'available_cash', desc: '可用现金（预计算）' },
  { name: 'budget', desc: '本次定投预算（预计算）' },
  { name: 'per_etf_limits', desc: '各 ETF 最大可买金额（预计算）' },
  { name: 'memory_summary', desc: '记忆摘要（近期决策、反思、经验）' },
  { name: 'task', desc: '任务定义（类型、预算、约束、标的）' },
];

export default function UserPromptTab({ theme, isDark }: Props) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [previewText, setPreviewText] = useState('');
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showVarRef, setShowVarRef] = useState(false);

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await previewUserPrompt();
      if (res.success && res.data) {
        setPreviewText(res.data.rendered);
        setPreviewVars(res.data.variables);
        setMode('preview');
      } else {
        toast.error(res.error || 'Preview failed');
      }
    } catch (e: any) {
      toast.error(e.message || 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  }, [toast]);

  return (
    <Box>
      {/* Mode toggle */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
        <Chip
          icon={<Pencil size={14} />}
          label="Edit"
          onClick={() => setMode('edit')}
          size="small"
          sx={{
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
            bgcolor: mode === 'edit' ? 'rgba(100,149,237,0.15)' : 'transparent',
            color: mode === 'edit' ? theme.brand.primary : theme.text.muted,
            border: `1px solid ${mode === 'edit' ? 'rgba(100,149,237,0.3)' : 'transparent'}`,
          }}
        />
        <Chip
          icon={previewLoading ? undefined : <Eye size={14} />}
          label={previewLoading ? 'Loading...' : 'Preview'}
          onClick={handlePreview}
          size="small"
          sx={{
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
            bgcolor: mode === 'preview' ? 'rgba(100,149,237,0.15)' : 'transparent',
            color: mode === 'preview' ? theme.brand.primary : theme.text.muted,
            border: `1px solid ${mode === 'preview' ? 'rgba(100,149,237,0.3)' : 'transparent'}`,
          }}
        />
      </Box>

      {mode === 'edit' ? (
        <>
          <SystemPromptTab
            theme={theme}
            isDark={isDark}
            promptType="user"
          />

          {/* Variable reference */}
          <Box sx={{ mt: 3 }}>
            <Box
              sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 0.5 }}
              onClick={() => setShowVarRef(!showVarRef)}
            >
              {showVarRef ? <ChevronUp size={16} style={{ color: theme.text.muted }} /> : <ChevronDown size={16} style={{ color: theme.text.muted }} />}
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.text.muted }}>
                Available Variables
              </Typography>
            </Box>
            <Collapse in={showVarRef}>
              <Box sx={{ mt: 1, pl: 1 }}>
                {TEMPLATE_VARIABLES.map((v) => (
                  <Box key={v.name} sx={{ display: 'flex', gap: 1, py: 0.3 }}>
                    <Typography sx={{
                      fontSize: 12, fontFamily: 'monospace', color: theme.brand.primary,
                      bgcolor: 'rgba(100,149,237,0.08)', px: 0.8, borderRadius: 1, flexShrink: 0,
                    }}>
                      {'{{' + v.name + '}}'}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: theme.text.muted }}>
                      {v.desc}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Collapse>
          </Box>
        </>
      ) : (
        <Box>
          {/* Highlight precomputed fields */}
          {previewVars.available_cash && (
            <Box sx={{
              display: 'flex', gap: 2, mb: 2, p: 1.5, borderRadius: 2,
              bgcolor: isDark ? 'rgba(76,175,80,0.08)' : 'rgba(76,175,80,0.04)',
              border: `1px solid rgba(76,175,80,0.2)`,
            }}>
              <Box>
                <Typography sx={{ fontSize: 10, color: theme.text.muted, textTransform: 'uppercase' }}>Available Cash</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#4caf50' }}>${previewVars.available_cash}</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 10, color: theme.text.muted, textTransform: 'uppercase' }}>Budget</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#4caf50' }}>${previewVars.budget}</Typography>
              </Box>
            </Box>
          )}

          {previewLoading ? (
            <LoadingDots text="Rendering preview" fontSize={13} />
          ) : (
            <Box sx={{
              p: 2, borderRadius: 2, fontFamily: 'monospace', fontSize: 12,
              lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              color: theme.text.primary,
              bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              border: `1px solid ${theme.border.default}`,
              maxHeight: 500, overflow: 'auto',
            }}>
              {previewText || 'No preview data. Click "Preview" to render.'}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
