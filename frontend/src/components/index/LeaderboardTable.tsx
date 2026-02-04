import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  MenuItem,
} from '@mui/material';
import { useTheme } from '../../theme/ThemeProvider';
import LoadingDots from '../LoadingDots';
import {
  LeaderboardEntry,
  PromptVersion,
  fetchLeaderboard,
  fetchPromptHistory,
} from '../../api/index';
import { ModelLogo, getProviderDisplayName } from './ModelLogos';

export default function LeaderboardTable() {
  const { theme, isDark } = useTheme();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [promptVersions, setPromptVersions] = useState<PromptVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchLeaderboard(selectedVersion || undefined);
      if (res.success && res.data) setEntries(res.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [selectedVersion]);

  useEffect(() => {
    fetchPromptHistory().then((res) => {
      if (res.success && res.data) setPromptVersions(res.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tableCellSx = {
    color: theme.text.primary,
    borderBottom: `1px solid ${theme.border.subtle}`,
    fontSize: 13,
    py: 1.2,
  };
  const tableHeadSx = {
    color: theme.text.muted,
    borderBottom: `1px solid ${theme.border.default}`,
    fontSize: 12,
    fontWeight: 600,
    py: 1,
  };

  const pctColor = (v: number) => (v >= 50 ? '#4caf50' : v >= 30 ? '#ff9800' : '#f44336');

  return (
    <Box sx={{ height: '100%', overflow: 'auto', px: 3, py: 2 }}>
      {/* Version filter */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.secondary }}>
          Model Leaderboard
        </Typography>
        <TextField
          select
          size="small"
          label="Prompt Version"
          value={selectedVersion}
          onChange={(e) => setSelectedVersion(e.target.value)}
          sx={{ minWidth: 160 }}
          InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
          InputLabelProps={{ sx: { color: theme.text.muted } }}
        >
          <MenuItem value="">All Versions</MenuItem>
          {promptVersions.map((v) => (
            <MenuItem key={v.id} value={v.id}>
              {v.version} {v.is_current ? '(current)' : ''}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {loading ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <LoadingDots text="Loading leaderboard" fontSize={14} />
        </Box>
      ) : entries.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 14, color: theme.text.muted }}>
            No leaderboard data yet. Run Arena and make decisions to populate.
          </Typography>
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['#', 'Model', 'Adoptions', 'Adoption %', 'Wins', 'Win %', 'Avg Return', 'CF Win %', 'Decisions'].map((h) => (
                  <TableCell key={h} sx={tableHeadSx}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={`${entry.model_provider}-${entry.model_name}`}>
                  <TableCell sx={{ ...tableCellSx, fontWeight: 600, color: theme.text.muted, width: 40 }}>
                    {entry.rank}
                  </TableCell>
                  <TableCell sx={tableCellSx}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                      <ModelLogo provider={entry.model_provider} size={22} isDark={isDark} />
                      <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.primary, lineHeight: 1.3 }}>
                          {entry.model_name}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: theme.text.muted, lineHeight: 1.2 }}>
                          {getProviderDisplayName(entry.model_provider)}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={tableCellSx}>{entry.adoption_count}</TableCell>
                  <TableCell sx={{ ...tableCellSx, color: pctColor(entry.adoption_rate), fontWeight: 500 }}>
                    {entry.adoption_rate.toFixed(1)}%
                  </TableCell>
                  <TableCell sx={tableCellSx}>{entry.win_count}</TableCell>
                  <TableCell sx={{ ...tableCellSx, color: pctColor(entry.win_rate), fontWeight: 500 }}>
                    {entry.win_rate.toFixed(1)}%
                  </TableCell>
                  <TableCell
                    sx={{
                      ...tableCellSx,
                      fontWeight: 600,
                      color: entry.avg_return_pct >= 0 ? '#4caf50' : '#f44336',
                    }}
                  >
                    {entry.avg_return_pct >= 0 ? '+' : ''}{entry.avg_return_pct.toFixed(2)}%
                  </TableCell>
                  <TableCell sx={{ ...tableCellSx, color: pctColor(entry.counterfactual_win_rate), fontWeight: 500 }}>
                    {entry.counterfactual_win_rate.toFixed(1)}%
                  </TableCell>
                  <TableCell sx={tableCellSx}>{entry.total_decisions}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
