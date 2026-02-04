import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  PlayArrow as TriggerIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useTheme } from '../../theme/ThemeProvider';
import LoadingDots from '../LoadingDots';
import { useToast } from '../Toast';
import {
  WatchlistItem,
  PromptVersion,
  ScheduleTask,
  fetchWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  refreshData,
  fetchCurrentPrompt,
  updatePrompt,
  fetchPromptHistory,
  fetchSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  triggerSchedule,
  createIndexTables,
  seedIndexDefaults,
} from '../../api/index';

export default function SettingsPanel() {
  const { theme, isDark } = useTheme();
  const { showToast } = useToast();

  // Section state
  const [section, setSection] = useState<'watchlist' | 'prompt' | 'schedules' | 'debug'>('watchlist');

  return (
    <Box sx={{ height: '100%', overflow: 'auto', px: 3, py: 2 }}>
      {/* Section Tabs */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        {[
          { key: 'watchlist', label: 'Watchlist' },
          { key: 'prompt', label: 'System Prompt' },
          { key: 'schedules', label: 'Schedules' },
          { key: 'debug', label: 'Debug' },
        ].map(({ key, label }) => (
          <Chip
            key={key}
            label={label}
            onClick={() => setSection(key as any)}
            sx={{
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              bgcolor: section === key ? 'rgba(100,149,237,0.15)' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              color: section === key ? theme.brand.primary : theme.text.secondary,
              border: `1px solid ${section === key ? 'rgba(100,149,237,0.3)' : 'transparent'}`,
            }}
          />
        ))}
      </Box>

      {section === 'watchlist' && <WatchlistSection theme={theme} isDark={isDark} showToast={showToast} />}
      {section === 'prompt' && <PromptSection theme={theme} isDark={isDark} showToast={showToast} />}
      {section === 'schedules' && <ScheduleSection theme={theme} isDark={isDark} showToast={showToast} />}
      {section === 'debug' && <DebugSection theme={theme} isDark={isDark} showToast={showToast} />}
    </Box>
  );
}

// ── Watchlist ──

function WatchlistSection({ theme, isDark, showToast }: { theme: any; isDark: boolean; showToast: any }) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSymbol, setNewSymbol] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWatchlist();
      if (res.success && res.data) setItems(res.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;
    try {
      const res = await addToWatchlist(sym);
      if (res.success) {
        showToast(`Added ${sym}`, 'success');
        setNewSymbol('');
        load();
      } else {
        showToast(res.error || 'Failed to add', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
    }
  };

  const handleRemove = async (symbol: string) => {
    try {
      await removeFromWatchlist(symbol);
      showToast(`Removed ${symbol}`, 'success');
      load();
    } catch {
      showToast('Failed to remove', 'error');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshData();
      showToast('Data refresh triggered', 'success');
    } catch {
      showToast('Refresh failed', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const cardBorder = `1px solid ${theme.border.subtle}`;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Add symbol (e.g. VOO)"
          value={newSymbol}
          onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
          sx={{ width: 180 }}
        />
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={handleAdd}
          disabled={!newSymbol.trim()}
          sx={{ bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none', fontSize: 13, fontWeight: 600, borderRadius: 2, '&:hover': { bgcolor: theme.brand.hover } }}
        >
          Add
        </Button>
        <Button
          size="small"
          startIcon={refreshing ? undefined : <RefreshIcon />}
          onClick={handleRefresh}
          disabled={refreshing}
          sx={{ color: theme.brand.primary, textTransform: 'none', fontSize: 13 }}
        >
          {refreshing ? <LoadingDots text="Refreshing" fontSize={12} /> : 'Refresh Data'}
        </Button>
      </Box>

      {loading ? (
        <LoadingDots text="Loading watchlist" fontSize={13} />
      ) : (
        <Grid container spacing={1.5}>
          {items.map((item) => (
            <Grid item xs={6} sm={4} md={3} key={item.id}>
              <Box sx={{ p: 1.5, bgcolor: cardBg, border: cardBorder, borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.primary }}>{item.symbol}</Typography>
                  {item.etf_type && <Typography sx={{ fontSize: 11, color: theme.text.muted }}>{item.etf_type}</Typography>}
                </Box>
                <IconButton size="small" onClick={() => handleRemove(item.symbol)} sx={{ color: theme.text.muted, '&:hover': { color: '#f44336' } }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}

// ── Prompt ──

function PromptSection({ theme, isDark, showToast }: { theme: any; isDark: boolean; showToast: any }) {
  const [current, setCurrent] = useState<PromptVersion | null>(null);
  const [history, setHistory] = useState<PromptVersion[]>([]);
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetchCurrentPrompt(), fetchPromptHistory()]).then(([curRes, histRes]) => {
      if (curRes.success && curRes.data) {
        setCurrent(curRes.data);
        setContent(curRes.data.content);
      }
      if (histRes.success && histRes.data) setHistory(histRes.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!content.trim() || !description.trim()) return;
    setSaving(true);
    try {
      const res = await updatePrompt(content, description);
      if (res.success && res.data) {
        setCurrent(res.data);
        showToast('Prompt updated', 'success');
        setDescription('');
        // reload history
        const histRes = await fetchPromptHistory();
        if (histRes.success && histRes.data) setHistory(histRes.data);
      } else {
        showToast(res.error || 'Update failed', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingDots text="Loading prompt" fontSize={13} />;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.secondary }}>
          System Prompt
        </Typography>
        {current && (
          <Chip label={current.version} size="small" sx={{ fontSize: 11, bgcolor: 'rgba(100,149,237,0.15)', color: theme.brand.primary }} />
        )}
      </Box>

      <TextField
        fullWidth
        multiline
        rows={12}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        InputProps={{ sx: { color: theme.text.primary, fontSize: 13, fontFamily: 'monospace', lineHeight: 1.6 } }}
        sx={{ mb: 2, '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.border.default } }}
      />

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 3 }}>
        <TextField
          size="small"
          placeholder="Version description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
          sx={{ flex: 1 }}
        />
        <Button
          startIcon={saving ? undefined : <SaveIcon />}
          onClick={handleSave}
          disabled={saving || !content.trim() || !description.trim()}
          sx={{ bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: 2, px: 3, '&:hover': { bgcolor: theme.brand.hover } }}
        >
          {saving ? <LoadingDots text="Saving" fontSize={12} color="#fff" /> : 'Save'}
        </Button>
      </Box>

      {/* History */}
      {history.length > 0 && (
        <>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.muted, mb: 1 }}>
            Version History
          </Typography>
          {history.map((v) => (
            <Box
              key={v.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 1,
                borderBottom: `1px solid ${theme.border.subtle}`,
                cursor: 'pointer',
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' },
              }}
              onClick={() => { setContent(v.content); }}
            >
              <Chip
                label={v.version}
                size="small"
                sx={{
                  fontSize: 11,
                  bgcolor: v.is_current ? 'rgba(76,175,80,0.15)' : 'transparent',
                  color: v.is_current ? '#4caf50' : theme.text.muted,
                }}
              />
              <Typography sx={{ fontSize: 12, color: theme.text.secondary, flex: 1 }}>
                {v.description}
              </Typography>
              <Typography sx={{ fontSize: 11, color: theme.text.muted }}>
                {v.created_at ? new Date(v.created_at).toLocaleDateString() : ''}
              </Typography>
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}

// ── Schedules ──

function ScheduleSection({ theme, isDark, showToast }: { theme: any; isDark: boolean; showToast: any }) {
  const [schedules, setSchedules] = useState<ScheduleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', cron_expression: '', task_type: 'arena_run' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSchedules();
      if (res.success && res.data) setSchedules(res.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name || !form.cron_expression) return;
    try {
      const res = await createSchedule(form);
      if (res.success) {
        showToast('Schedule created', 'success');
        setDialogOpen(false);
        setForm({ name: '', cron_expression: '', task_type: 'arena_run' });
        load();
      } else {
        showToast(res.error || 'Failed', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
    }
  };

  const handleToggle = async (task: ScheduleTask) => {
    try {
      await updateSchedule(task.id, { is_enabled: !task.is_enabled });
      load();
    } catch {
      showToast('Toggle failed', 'error');
    }
  };

  const handleTrigger = async (taskId: string) => {
    try {
      await triggerSchedule(taskId);
      showToast('Triggered', 'success');
      load();
    } catch {
      showToast('Trigger failed', 'error');
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await deleteSchedule(taskId);
      showToast('Deleted', 'success');
      load();
    } catch {
      showToast('Delete failed', 'error');
    }
  };

  const tableCellSx = { color: theme.text.primary, borderBottom: `1px solid ${theme.border.subtle}`, fontSize: 13, py: 1.2 };
  const tableHeadSx = { color: theme.text.muted, borderBottom: `1px solid ${theme.border.default}`, fontSize: 12, fontWeight: 600, py: 1 };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.secondary }}>
          Scheduled Tasks
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
          sx={{ bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none', fontSize: 13, fontWeight: 600, borderRadius: 2, '&:hover': { bgcolor: theme.brand.hover } }}
        >
          Add Schedule
        </Button>
      </Box>

      {loading ? (
        <LoadingDots text="Loading schedules" fontSize={13} />
      ) : schedules.length === 0 ? (
        <Typography sx={{ py: 4, textAlign: 'center', color: theme.text.muted, fontSize: 13 }}>No schedules</Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Name', 'Cron', 'Type', 'Enabled', 'Last Run', 'Status', 'Actions'].map((h) => (
                  <TableCell key={h} sx={tableHeadSx}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {schedules.map((s) => (
                <TableRow key={s.id}>
                  <TableCell sx={{ ...tableCellSx, fontWeight: 600 }}>{s.name}</TableCell>
                  <TableCell sx={{ ...tableCellSx, fontFamily: 'monospace', fontSize: 12 }}>{s.cron_expression}</TableCell>
                  <TableCell sx={tableCellSx}>{s.task_type}</TableCell>
                  <TableCell sx={tableCellSx}>
                    <Switch
                      checked={s.is_enabled}
                      onChange={() => handleToggle(s)}
                      size="small"
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': { color: theme.brand.primary },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: theme.brand.primary },
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ ...tableCellSx, fontSize: 12 }}>
                    {s.last_run_at ? new Date(s.last_run_at).toLocaleString() : '--'}
                  </TableCell>
                  <TableCell sx={tableCellSx}>
                    {s.last_run_status ? (
                      <Chip
                        label={s.last_run_status}
                        size="small"
                        sx={{
                          fontSize: 10,
                          height: 20,
                          bgcolor: s.last_run_status === 'success' ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)',
                          color: s.last_run_status === 'success' ? '#4caf50' : '#f44336',
                        }}
                      />
                    ) : '--'}
                  </TableCell>
                  <TableCell sx={{ ...tableCellSx, whiteSpace: 'nowrap' }}>
                    <Tooltip title="Trigger now">
                      <IconButton size="small" onClick={() => handleTrigger(s.id)} sx={{ color: theme.brand.primary }}>
                        <TriggerIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => handleDelete(s.id)} sx={{ color: theme.text.muted, '&:hover': { color: '#f44336' } }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { bgcolor: theme.background.secondary, color: theme.text.primary } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          New Schedule
          <IconButton size="small" onClick={() => setDialogOpen(false)} sx={{ color: theme.text.muted }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField
            label="Name"
            size="small"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            InputProps={{ sx: { color: theme.text.primary } }}
            InputLabelProps={{ sx: { color: theme.text.muted } }}
          />
          <TextField
            label="Cron Expression"
            size="small"
            placeholder="0 9 1 * *"
            value={form.cron_expression}
            onChange={(e) => setForm({ ...form, cron_expression: e.target.value })}
            InputProps={{ sx: { color: theme.text.primary, fontFamily: 'monospace' } }}
            InputLabelProps={{ sx: { color: theme.text.muted } }}
          />
          <TextField
            label="Task Type"
            select
            size="small"
            value={form.task_type}
            onChange={(e) => setForm({ ...form, task_type: e.target.value })}
            InputProps={{ sx: { color: theme.text.primary } }}
            InputLabelProps={{ sx: { color: theme.text.muted } }}
          >
            <MenuItem value="arena_run">Arena Run</MenuItem>
            <MenuItem value="data_refresh">Data Refresh</MenuItem>
            <MenuItem value="counterfactual">Counterfactual Calc</MenuItem>
            <MenuItem value="reflection">Reflection</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ color: theme.text.muted, textTransform: 'none' }}>Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={!form.name || !form.cron_expression}
            sx={{ bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: theme.brand.hover } }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ── Debug ──

function DebugSection({ theme, isDark, showToast }: { theme: any; isDark: boolean; showToast: any }) {
  const [tableLoading, setTableLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);

  const handleCreateTables = async () => {
    setTableLoading(true);
    try {
      const res = await createIndexTables();
      if (res.success) showToast('Tables created', 'success');
      else showToast(res.error || 'Failed', 'error');
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
    } finally {
      setTableLoading(false);
    }
  };

  const handleSeed = async () => {
    setSeedLoading(true);
    try {
      const res = await seedIndexDefaults();
      if (res.success) showToast('Defaults seeded', 'success');
      else showToast(res.error || 'Failed', 'error');
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
    } finally {
      setSeedLoading(false);
    }
  };

  return (
    <Box>
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.secondary, mb: 2 }}>
        Debug Tools
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button
          onClick={handleCreateTables}
          disabled={tableLoading}
          sx={{
            bgcolor: isDark ? 'rgba(255,152,0,0.15)' : 'rgba(255,152,0,0.08)',
            color: '#ff9800',
            border: `1px solid ${isDark ? 'rgba(255,152,0,0.3)' : 'rgba(255,152,0,0.2)'}`,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: 13,
            borderRadius: 2,
            px: 3,
          }}
        >
          {tableLoading ? <LoadingDots text="Creating" fontSize={12} /> : 'Create Tables'}
        </Button>
        <Button
          onClick={handleSeed}
          disabled={seedLoading}
          sx={{
            bgcolor: isDark ? 'rgba(76,175,80,0.15)' : 'rgba(76,175,80,0.08)',
            color: '#4caf50',
            border: `1px solid ${isDark ? 'rgba(76,175,80,0.3)' : 'rgba(76,175,80,0.2)'}`,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: 13,
            borderRadius: 2,
            px: 3,
          }}
        >
          {seedLoading ? <LoadingDots text="Seeding" fontSize={12} /> : 'Seed Defaults'}
        </Button>
      </Box>
    </Box>
  );
}
