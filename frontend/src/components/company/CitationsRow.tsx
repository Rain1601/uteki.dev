import { Box, Typography } from '@mui/material';
import { useTheme } from '../../theme/ThemeProvider';
import CitationChip from './CitationChip';
import type { DataPoint } from '../../api/company';

interface Props {
  ids: number[];
  orphans?: number[];
  catalog: Record<string, DataPoint>;
}

/**
 * Compact citations row, rendered at the bottom of a structured gate card so
 * users can see which sources the gate's conclusions are grounded in even
 * when the structured Card components don't render `[src:N]` chips inline.
 *
 * Groups chips by source_type so users can quickly see the mix
 * (yfinance vs google_cse vs sec_edgar).
 */
export default function CitationsRow({ ids, orphans = [], catalog }: Props) {
  const { theme } = useTheme();

  if ((!ids || ids.length === 0) && (!orphans || orphans.length === 0)) {
    return null;
  }

  // Resolve and group by source_type
  const grouped: Record<string, DataPoint[]> = {};
  for (const id of ids) {
    const dp = catalog[String(id)] ?? catalog[id as unknown as string];
    if (!dp) continue;
    const t = dp.source_type;
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(dp);
  }

  const typeLabel: Record<string, string> = {
    yfinance: 'yfinance',
    fmp: 'FMP',
    sec_edgar: 'SEC',
    google_cse: '搜索',
    computed: '派生',
    company_data: '财务',
  };

  return (
    <Box
      data-ui="true"
      sx={{
        mt: 1.5,
        pt: 1,
        borderTop: `1px dashed ${theme.border.subtle}`,
        display: 'flex',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 0.75,
      }}
    >
      <Typography
        sx={{
          fontSize: 10,
          fontWeight: 600,
          color: theme.text.disabled,
          fontFamily: "Inter, -apple-system, sans-serif",
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          flexShrink: 0,
          mt: 0.3,
        }}
      >
        引用 {ids.length}
      </Typography>

      {Object.entries(grouped).map(([type, pts]) => (
        <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 0.4, flexWrap: 'wrap' }}>
          <Typography
            sx={{
              fontSize: 9.5,
              color: theme.text.muted,
              fontFamily: "Inter, -apple-system, sans-serif",
              fontStyle: 'italic',
              alignSelf: 'center',
            }}
          >
            {typeLabel[type] ?? type}:
          </Typography>
          {pts.map((dp) => (
            <CitationChip key={dp.id} ids={[dp.id]} catalog={catalog} />
          ))}
        </Box>
      ))}

      {orphans.length > 0 && (
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}
          title={`模型引用了 ${orphans.length} 个不存在的来源 ID — 疑似幻觉。原始 IDs: ${orphans.slice(0, 30).join(', ')}${orphans.length > 30 ? '…' : ''}`}
        >
          <Typography
            sx={{
              fontSize: 9.5,
              color: '#ef4444',
              fontFamily: "Inter, -apple-system, sans-serif",
              fontStyle: 'italic',
              alignSelf: 'center',
            }}
          >
            幻觉:
          </Typography>
          {orphans.length <= 5 ? (
            // Few orphans — show each as its own chip (broken state)
            <CitationChip ids={orphans} catalog={{}} />
          ) : (
            // Many orphans — collapse to a single warning badge
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 0.6,
                py: 0.05,
                borderRadius: '4px',
                fontSize: '0.7em',
                fontFamily: "Inter, -apple-system, sans-serif",
                fontWeight: 700,
                color: '#ef4444',
                bgcolor: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.35)',
                lineHeight: 1.4,
                cursor: 'help',
              }}
            >
              ⚠ {orphans.length} 个伪造引用
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
