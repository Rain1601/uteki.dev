import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  Collapse,
  Button,
  TextField,
  MenuItem,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { useTheme } from '../../theme/ThemeProvider';
import LoadingDots from '../LoadingDots';
import {
  DecisionLogItem,
  DecisionDetail,
  CounterfactualItem,
  fetchDecisions,
  fetchDecisionDetail,
  fetchCounterfactuals,
} from '../../api/index';
import HarnessViewer from './HarnessViewer';

export default function DecisionTimeline() {
  const { theme, isDark } = useTheme();
  const [decisions, setDecisions] = useState<DecisionLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterType, setFilterType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchDecisions({
        limit: 50,
        user_action: filterAction || undefined,
        harness_type: filterType || undefined,
      });
      if (res.success && res.data) setDecisions(res.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterType]);

  useEffect(() => {
    load();
  }, [load]);

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const cardBorder = `1px solid ${theme.border.subtle}`;

  const actionColor = (action: string) => {
    switch (action) {
      case 'approved': return '#4caf50';
      case 'modified': return '#ff9800';
      case 'skipped': return theme.text.muted;
      case 'rejected': return '#f44336';
      default: return theme.text.secondary;
    }
  };

  // Group by month
  const grouped: Record<string, DecisionLogItem[]> = {};
  decisions.forEach((d) => {
    const month = d.created_at ? d.created_at.substring(0, 7) : 'Unknown';
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(d);
  });

  return (
    <Box sx={{ height: '100%', overflow: 'auto', px: 3, py: 2 }}>
      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          select
          size="small"
          label="Action"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          sx={{ minWidth: 130 }}
          InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
          InputLabelProps={{ sx: { color: theme.text.muted } }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="approved">Approved</MenuItem>
          <MenuItem value="modified">Modified</MenuItem>
          <MenuItem value="skipped">Skipped</MenuItem>
          <MenuItem value="rejected">Rejected</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Type"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          sx={{ minWidth: 150 }}
          InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
          InputLabelProps={{ sx: { color: theme.text.muted } }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="monthly_dca">Monthly DCA</MenuItem>
          <MenuItem value="weekly_check">Weekly Check</MenuItem>
          <MenuItem value="adhoc">Ad Hoc</MenuItem>
        </TextField>
      </Box>

      {loading ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <LoadingDots text="Loading decisions" fontSize={14} />
        </Box>
      ) : decisions.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 14, color: theme.text.muted }}>No decisions found</Typography>
        </Box>
      ) : (
        Object.entries(grouped).map(([month, items]) => (
          <Box key={month} sx={{ mb: 3 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.muted, mb: 1.5, textTransform: 'uppercase' }}>
              {month}
            </Typography>
            {items.map((d) => (
              <DecisionItem
                key={d.id}
                decision={d}
                theme={theme}
                isDark={isDark}
                cardBg={cardBg}
                cardBorder={cardBorder}
                actionColor={actionColor}
              />
            ))}
          </Box>
        ))
      )}
    </Box>
  );
}

function DecisionItem({
  decision,
  theme,
  isDark,
  cardBg,
  cardBorder,
  actionColor,
}: {
  decision: DecisionLogItem;
  theme: any;
  isDark: boolean;
  cardBg: string;
  cardBorder: string;
  actionColor: (a: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<DecisionDetail | null>(null);
  const [counterfactuals, setCounterfactuals] = useState<CounterfactualItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleExpand = async () => {
    if (!expanded && !detail) {
      setDetailLoading(true);
      try {
        const [detailRes, cfRes] = await Promise.all([
          fetchDecisionDetail(decision.id),
          fetchCounterfactuals(decision.id),
        ]);
        if (detailRes.success && detailRes.data) setDetail(detailRes.data);
        if (cfRes.success && cfRes.data) setCounterfactuals(cfRes.data);
      } catch {
        /* ignore */
      } finally {
        setDetailLoading(false);
      }
    }
    setExpanded(!expanded);
  };

  const date = decision.created_at
    ? new Date(decision.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '';

  return (
    <Box
      sx={{
        mb: 1.5,
        bgcolor: cardBg,
        border: cardBorder,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {/* Summary Row */}
      <Box
        onClick={handleExpand}
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          cursor: 'pointer',
          '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' },
        }}
      >
        <Typography sx={{ fontSize: 12, color: theme.text.muted, minWidth: 110 }}>
          {date}
        </Typography>
        <Chip
          label={decision.user_action}
          size="small"
          sx={{
            fontSize: 11,
            height: 22,
            fontWeight: 600,
            bgcolor: `${actionColor(decision.user_action)}20`,
            color: actionColor(decision.user_action),
          }}
        />
        {decision.harness_type && (
          <Chip
            label={decision.harness_type}
            size="small"
            variant="outlined"
            sx={{ fontSize: 10, height: 20, color: theme.text.muted, borderColor: theme.border.default }}
          />
        )}
        {decision.adopted_model && (
          <Typography sx={{ fontSize: 12, color: theme.text.secondary, ml: 'auto' }}>
            {decision.adopted_model.name}
          </Typography>
        )}
        {decision.model_count != null && (
          <Chip
            label={`${decision.model_count} models`}
            size="small"
            sx={{ fontSize: 10, height: 20, bgcolor: 'transparent', color: theme.text.muted }}
          />
        )}
        {expanded ? <ExpandLessIcon sx={{ color: theme.text.muted, fontSize: 18 }} /> : <ExpandMoreIcon sx={{ color: theme.text.muted, fontSize: 18 }} />}
      </Box>

      {/* Detail */}
      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 2, borderTop: `1px solid ${theme.border.subtle}` }}>
          {detailLoading ? (
            <Box sx={{ py: 2, textAlign: 'center' }}>
              <LoadingDots text="Loading" fontSize={12} />
            </Box>
          ) : (
            <Box sx={{ pt: 1.5 }}>
              {/* Harness */}
              {detail?.harness && (
                <Box sx={{ mb: 1.5 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: theme.text.muted, mb: 0.5 }}>
                    Harness:
                  </Typography>
                  <HarnessViewer harness={detail.harness} />
                </Box>
              )}

              {/* Allocations */}
              {decision.executed_allocations?.length ? (
                <Box sx={{ mb: 1.5 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: theme.text.muted, mb: 0.5 }}>
                    Executed Allocations:
                  </Typography>
                  {decision.executed_allocations.map((a: any, i: number) => (
                    <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.3 }}>
                      <Typography sx={{ fontSize: 12, color: theme.text.primary }}>{a.etf || a.symbol}</Typography>
                      <Typography sx={{ fontSize: 12, color: theme.text.secondary }}>
                        ${a.amount?.toLocaleString()} ({a.percentage}%)
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : null}

              {/* User Notes */}
              {decision.user_notes && (
                <Box sx={{ mb: 1.5 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: theme.text.muted, mb: 0.5 }}>
                    Notes:
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: theme.text.secondary, lineHeight: 1.6 }}>
                    {decision.user_notes}
                  </Typography>
                </Box>
              )}

              {/* Counterfactuals */}
              {counterfactuals.length > 0 && (
                <Box>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: theme.text.muted, mb: 0.5 }}>
                    Counterfactuals:
                  </Typography>
                  {counterfactuals.map((cf) => (
                    <Box
                      key={cf.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        py: 0.5,
                      }}
                    >
                      <Chip
                        label={cf.was_adopted ? 'Adopted' : 'Alternative'}
                        size="small"
                        sx={{
                          fontSize: 10,
                          height: 18,
                          bgcolor: cf.was_adopted ? 'rgba(100,149,237,0.15)' : 'transparent',
                          color: cf.was_adopted ? theme.brand.primary : theme.text.muted,
                        }}
                      />
                      <Typography sx={{ fontSize: 12, color: theme.text.secondary }}>
                        {cf.tracking_days}d:
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: cf.hypothetical_return_pct >= 0 ? '#4caf50' : '#f44336',
                        }}
                      >
                        {cf.hypothetical_return_pct >= 0 ? '+' : ''}{cf.hypothetical_return_pct.toFixed(2)}%
                      </Typography>
                      {!cf.was_adopted && cf.hypothetical_return_pct > 0 && (
                        <Chip label="Missed" size="small" sx={{ fontSize: 9, height: 16, bgcolor: 'rgba(255,152,0,0.15)', color: '#ff9800' }} />
                      )}
                      {!cf.was_adopted && cf.hypothetical_return_pct < 0 && (
                        <Chip label="Dodged" size="small" sx={{ fontSize: 9, height: 16, bgcolor: 'rgba(76,175,80,0.15)', color: '#4caf50' }} />
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
