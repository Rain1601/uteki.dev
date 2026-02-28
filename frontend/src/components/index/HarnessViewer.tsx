import { useState } from 'react';
import {
  Box,
  Typography,
  Collapse,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';

interface HarnessViewerProps {
  harness: Record<string, any>;
}

export default function HarnessViewer({ harness }: HarnessViewerProps) {
  const { theme, isDark } = useTheme();

  const cellSx = { color: theme.text.primary, borderBottom: `1px solid ${theme.border.subtle}`, fontSize: 12, py: 0.8 };
  const headSx = { color: theme.text.muted, borderBottom: `1px solid ${theme.border.default}`, fontSize: 11, fontWeight: 600, py: 0.5 };

  return (
    <Box>
      {/* Metadata */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <Chip label={harness.harness_type} size="small" sx={{ fontSize: 10, height: 20, color: theme.text.muted }} />
        {harness.created_at && (
          <Chip
            label={new Date(harness.created_at).toLocaleString()}
            size="small"
            sx={{ fontSize: 10, height: 20, color: theme.text.muted }}
          />
        )}
        {harness.prompt_version_id && (
          <Chip label={`Prompt: ${harness.prompt_version_id.substring(0, 8)}`} size="small" sx={{ fontSize: 10, height: 20, color: theme.text.muted }} />
        )}
      </Box>

      {/* Market Snapshot */}
      <CollapsibleSection title="Market Data" theme={theme} isDark={isDark}>
        {harness.market_snapshot && Object.keys(harness.market_snapshot).length > 0 ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Symbol', 'Price', 'Change', 'PE', 'MA50', 'RSI'].map((h) => (
                    <TableCell key={h} sx={headSx}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(harness.market_snapshot).map(([symbol, data]: [string, any]) => (
                  <TableRow key={symbol}>
                    <TableCell sx={{ ...cellSx, fontWeight: 600 }}>{symbol}</TableCell>
                    <TableCell sx={cellSx}>${data?.price?.toFixed(2) ?? '--'}</TableCell>
                    <TableCell sx={{ ...cellSx, color: (data?.change_pct ?? 0) >= 0 ? '#4caf50' : '#f44336' }}>
                      {data?.change_pct != null ? `${data.change_pct >= 0 ? '+' : ''}${data.change_pct.toFixed(2)}%` : '--'}
                    </TableCell>
                    <TableCell sx={cellSx}>{data?.pe_ratio?.toFixed(1) ?? '--'}</TableCell>
                    <TableCell sx={cellSx}>{data?.ma50?.toFixed(2) ?? '--'}</TableCell>
                    <TableCell sx={cellSx}>{data?.rsi?.toFixed(1) ?? '--'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography sx={{ fontSize: 12, color: theme.text.muted }}>No market data</Typography>
        )}
      </CollapsibleSection>

      {/* Account State */}
      <CollapsibleSection title="Account State" theme={theme} isDark={isDark}>
        {harness.account_state ? (
          <Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
              <Typography sx={{ fontSize: 12, color: theme.text.secondary }}>
                Cash: ${harness.account_state.cash?.toLocaleString() ?? '--'}
              </Typography>
              <Typography sx={{ fontSize: 12, color: theme.text.secondary }}>
                Total: ${harness.account_state.total?.toLocaleString() ?? '--'}
              </Typography>
            </Box>
            {harness.account_state.positions?.map((pos: any, i: number) => (
              <Typography key={i} sx={{ fontSize: 12, color: theme.text.muted }}>
                {pos.symbol}: {pos.quantity} shares
              </Typography>
            ))}
          </Box>
        ) : (
          <Typography sx={{ fontSize: 12, color: theme.text.muted }}>No account data</Typography>
        )}
      </CollapsibleSection>

      {/* Memory Summary */}
      <CollapsibleSection title="Memory Summary" theme={theme} isDark={isDark}>
        {harness.memory_summary ? (
          <Box sx={{ fontSize: 12, color: theme.text.secondary }}>
            {harness.memory_summary.recent_decisions?.map((d: any, i: number) => (
              <Typography key={i} sx={{ fontSize: 12, color: theme.text.secondary, mb: 0.5 }}>
                Decision: {d.content?.substring(0, 100)}
              </Typography>
            ))}
            {harness.memory_summary.recent_reflection && (
              <Typography sx={{ fontSize: 12, color: theme.text.secondary, mb: 0.5 }}>
                Reflection: {harness.memory_summary.recent_reflection.content?.substring(0, 100)}
              </Typography>
            )}
            {harness.memory_summary.experiences?.map((e: any, i: number) => (
              <Typography key={i} sx={{ fontSize: 12, color: theme.text.muted, mb: 0.3 }}>
                Experience: {e.content?.substring(0, 80)}
              </Typography>
            ))}
          </Box>
        ) : (
          <Typography sx={{ fontSize: 12, color: theme.text.muted }}>No memory data</Typography>
        )}
      </CollapsibleSection>

      {/* Task */}
      <CollapsibleSection title="Task" theme={theme} isDark={isDark}>
        {harness.task ? (
          <pre style={{ margin: 0, fontSize: 11, color: theme.text.secondary, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify(harness.task, null, 2)}
          </pre>
        ) : (
          <Typography sx={{ fontSize: 12, color: theme.text.muted }}>No task data</Typography>
        )}
      </CollapsibleSection>
    </Box>
  );
}

function CollapsibleSection({
  title,
  children,
  theme,
  isDark,
}: {
  title: string;
  children: React.ReactNode;
  theme: any;
  isDark: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Box sx={{ mb: 1 }}>
      <Box
        onClick={() => setOpen(!open)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'pointer',
          py: 0.5,
          '&:hover': { color: theme.brand.primary },
        }}
      >
        {open ? <ChevronUp size={16} style={{ color: theme.text.muted }} /> : <ChevronDown size={16} style={{ color: theme.text.muted }} />}
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.text.muted }}>
          {title}
        </Typography>
      </Box>
      <Collapse in={open}>
        <Box sx={{ pl: 2.5, pb: 1 }}>
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}
