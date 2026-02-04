import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Grid,
  Chip,
} from '@mui/material';
import {
  PlayArrow as RunIcon,
} from '@mui/icons-material';
import { useTheme } from '../../theme/ThemeProvider';
import LoadingDots from '../LoadingDots';
import { useToast } from '../Toast';
import {
  BacktestResult,
  runBacktest,
  runBacktestCompare,
} from '../../api/index';

export default function BacktestPanel() {
  const { theme, isDark } = useTheme();
  const { showToast } = useToast();

  const [symbols, setSymbols] = useState('VOO');
  const [start, setStart] = useState('2020-01');
  const [end, setEnd] = useState('2024-12');
  const [initialCapital, setInitialCapital] = useState(10000);
  const [monthlyDca, setMonthlyDca] = useState(500);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [running, setRunning] = useState(false);

  const handleRun = useCallback(async () => {
    const syms = symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (syms.length === 0) return;

    setRunning(true);
    setResults([]);
    try {
      if (syms.length === 1) {
        const res = await runBacktest({
          symbol: syms[0],
          start,
          end,
          initial_capital: initialCapital,
          monthly_dca: monthlyDca,
        });
        if (res.success && res.data) {
          setResults([res.data]);
        } else {
          showToast(res.error || 'Backtest failed', 'error');
        }
      } else {
        const res = await runBacktestCompare({
          symbols: syms,
          start,
          end,
          initial_capital: initialCapital,
          monthly_dca: monthlyDca,
        });
        if (res.success && res.data) {
          setResults(res.data);
        } else {
          showToast(res.error || 'Backtest failed', 'error');
        }
      }
    } catch (e: any) {
      showToast(e.response?.data?.detail || e.message || 'Backtest failed', 'error');
    } finally {
      setRunning(false);
    }
  }, [symbols, start, end, initialCapital, monthlyDca, showToast]);

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const cardBorder = `1px solid ${theme.border.subtle}`;

  const formatCurrency = (v: number) =>
    `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const pctColor = (v: number) => (v >= 0 ? '#4caf50' : '#f44336');

  return (
    <Box sx={{ height: '100%', overflow: 'auto', px: 3, py: 2 }}>
      {/* Input Form */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <TextField
          size="small"
          label="Symbol(s)"
          placeholder="VOO, QQQ"
          value={symbols}
          onChange={(e) => setSymbols(e.target.value.toUpperCase())}
          InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
          InputLabelProps={{ sx: { color: theme.text.muted } }}
          sx={{ width: 160 }}
          helperText="Comma-separated for compare"
          FormHelperTextProps={{ sx: { color: theme.text.muted, fontSize: 10, mt: 0.3 } }}
        />
        <TextField
          size="small"
          label="Start"
          placeholder="YYYY-MM"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
          InputLabelProps={{ sx: { color: theme.text.muted } }}
          sx={{ width: 120 }}
        />
        <TextField
          size="small"
          label="End"
          placeholder="YYYY-MM"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
          InputLabelProps={{ sx: { color: theme.text.muted } }}
          sx={{ width: 120 }}
        />
        <TextField
          size="small"
          label="Initial Capital"
          type="number"
          value={initialCapital}
          onChange={(e) => setInitialCapital(Number(e.target.value))}
          InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
          InputLabelProps={{ sx: { color: theme.text.muted } }}
          sx={{ width: 130 }}
        />
        <TextField
          size="small"
          label="Monthly DCA"
          type="number"
          value={monthlyDca}
          onChange={(e) => setMonthlyDca(Number(e.target.value))}
          InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
          InputLabelProps={{ sx: { color: theme.text.muted } }}
          sx={{ width: 130 }}
        />
        <Button
          startIcon={running ? undefined : <RunIcon />}
          onClick={handleRun}
          disabled={running || !symbols.trim()}
          sx={{
            bgcolor: theme.brand.primary,
            color: '#fff',
            textTransform: 'none',
            fontWeight: 600,
            fontSize: 13,
            borderRadius: 2,
            px: 3,
            height: 40,
            '&:hover': { bgcolor: theme.brand.hover },
          }}
        >
          {running ? <LoadingDots text="Running" fontSize={13} color="#fff" /> : 'Run Backtest'}
        </Button>
      </Box>

      {/* Results */}
      {results.length > 0 && (
        <>
          {/* Summary Metrics */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {results.map((r) => (
              <Grid item xs={12} md={results.length > 1 ? 6 : 12} key={r.symbol}>
                <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: 2, p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Typography sx={{ fontSize: 16, fontWeight: 600, color: theme.text.primary }}>
                      {r.symbol}
                    </Typography>
                    {r.error && (
                      <Chip label="Error" size="small" sx={{ bgcolor: 'rgba(244,67,54,0.15)', color: '#f44336', fontSize: 10 }} />
                    )}
                  </Box>

                  {r.error ? (
                    <Typography sx={{ fontSize: 13, color: '#f44336' }}>{r.error}</Typography>
                  ) : (
                    <Grid container spacing={1.5}>
                      {[
                        { label: 'Total Return', value: `${r.total_return_pct >= 0 ? '+' : ''}${r.total_return_pct.toFixed(2)}%`, color: pctColor(r.total_return_pct) },
                        { label: 'Annualized', value: `${r.annualized_return_pct >= 0 ? '+' : ''}${r.annualized_return_pct.toFixed(2)}%`, color: pctColor(r.annualized_return_pct) },
                        { label: 'Max Drawdown', value: `-${r.max_drawdown_pct.toFixed(2)}%`, color: '#f44336' },
                        { label: 'Sharpe Ratio', value: r.sharpe_ratio.toFixed(2), color: theme.text.primary },
                        { label: 'Final Value', value: formatCurrency(r.final_value), color: pctColor(r.final_value - r.total_invested) },
                        { label: 'Total Invested', value: formatCurrency(r.total_invested), color: theme.text.secondary },
                      ].map(({ label, value, color }) => (
                        <Grid item xs={4} key={label}>
                          <Typography sx={{ fontSize: 11, color: theme.text.muted }}>{label}</Typography>
                          <Typography sx={{ fontSize: 16, fontWeight: 600, color }}>{value}</Typography>
                        </Grid>
                      ))}
                    </Grid>
                  )}
                </Box>
              </Grid>
            ))}
          </Grid>

          {/* Simple ASCII Chart (monthly values) */}
          {results.filter((r) => !r.error && r.monthly_values?.length > 0).map((r) => (
            <Box key={r.symbol} sx={{ mb: 3 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary, mb: 1 }}>
                {r.symbol} — Portfolio Value Over Time
              </Typography>
              <Box sx={{ display: 'flex', gap: 0, alignItems: 'flex-end', height: 120, overflow: 'auto' }}>
                {r.monthly_values.map((mv, i) => {
                  const maxVal = Math.max(...r.monthly_values.map((m) => m.value));
                  const minVal = Math.min(...r.monthly_values.map((m) => m.value));
                  const range = maxVal - minVal || 1;
                  const height = ((mv.value - minVal) / range) * 100 + 10;
                  const isAboveInvested = mv.value >= mv.invested;

                  return (
                    <Box
                      key={i}
                      sx={{
                        flex: 1,
                        minWidth: 4,
                        maxWidth: 12,
                        height: `${height}%`,
                        bgcolor: isAboveInvested ? 'rgba(76,175,80,0.5)' : 'rgba(244,67,54,0.5)',
                        borderRadius: '2px 2px 0 0',
                        transition: 'background-color 0.2s',
                        cursor: 'pointer',
                        '&:hover': {
                          bgcolor: isAboveInvested ? 'rgba(76,175,80,0.8)' : 'rgba(244,67,54,0.8)',
                        },
                      }}
                      title={`${mv.month}: ${formatCurrency(mv.value)} (invested: ${formatCurrency(mv.invested)})`}
                    />
                  );
                })}
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                <Typography sx={{ fontSize: 10, color: theme.text.muted }}>
                  {r.monthly_values[0]?.month}
                </Typography>
                <Typography sx={{ fontSize: 10, color: theme.text.muted }}>
                  {r.monthly_values[r.monthly_values.length - 1]?.month}
                </Typography>
              </Box>
            </Box>
          ))}

          {/* Comparison Table (multi-symbol) */}
          {results.length > 1 && (
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary, mb: 1 }}>
                Comparison
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Symbol', 'Total Return', 'Annualized', 'Max DD', 'Sharpe', 'Final Value'].map((h) => (
                        <th key={h} style={{ padding: '6px 8px', borderBottom: `1px solid ${theme.border.default}`, color: theme.text.muted, fontWeight: 600, textAlign: 'left' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.filter((r) => !r.error).map((r) => (
                      <tr key={r.symbol}>
                        <td style={{ padding: '6px 8px', borderBottom: `1px solid ${theme.border.subtle}`, color: theme.text.primary, fontWeight: 600 }}>{r.symbol}</td>
                        <td style={{ padding: '6px 8px', borderBottom: `1px solid ${theme.border.subtle}`, color: pctColor(r.total_return_pct), fontWeight: 500 }}>
                          {r.total_return_pct >= 0 ? '+' : ''}{r.total_return_pct.toFixed(2)}%
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: `1px solid ${theme.border.subtle}`, color: pctColor(r.annualized_return_pct) }}>
                          {r.annualized_return_pct >= 0 ? '+' : ''}{r.annualized_return_pct.toFixed(2)}%
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: `1px solid ${theme.border.subtle}`, color: '#f44336' }}>
                          -{r.max_drawdown_pct.toFixed(2)}%
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: `1px solid ${theme.border.subtle}`, color: theme.text.primary }}>
                          {r.sharpe_ratio.toFixed(2)}
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: `1px solid ${theme.border.subtle}`, color: theme.text.primary }}>
                          {formatCurrency(r.final_value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            </Box>
          )}
        </>
      )}

      {results.length === 0 && !running && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: theme.text.muted }}>
            No Backtest Results
          </Typography>
          <Typography sx={{ fontSize: 13, color: theme.text.muted }}>
            Configure parameters and run a backtest to see historical performance.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
