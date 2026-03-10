import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
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
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import LoadingDots from '../LoadingDots';
import { toast } from 'sonner';
import {
  ScheduleTask,
  ModelConfig,
  fetchSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  triggerSchedule,
  fetchModelConfig,
  saveModelConfig,
} from '../../api/index';
import SystemPromptTab from './context/SystemPromptTab';
import UserPromptTab from './context/UserPromptTab';
import MemoryTab from './context/MemoryTab';
import ToolsTab from './context/ToolsTab';

export default function SettingsPanel() {
  const { theme, isDark } = useTheme();

  // Section state
  const [section, setSection] = useState<'context' | 'models' | 'schedules'>('context');

  return (
    <Box sx={{ height: '100%', overflow: 'auto', px: 3, py: 2 }}>
      {/* Section Tabs */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        {[
          { key: 'context', label: 'Context' },
          { key: 'models', label: 'Models' },
          { key: 'schedules', label: 'Schedules' },
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

      {section === 'context' && <ContextSection theme={theme} isDark={isDark} />}
      {section === 'models' && <ModelsSection theme={theme} isDark={isDark} />}
      {section === 'schedules' && <ScheduleSection theme={theme} isDark={isDark} />}
    </Box>
  );
}

// ── Context ──

function ContextSection({ theme, isDark }: { theme: any; isDark: boolean }) {
  const [subTab, setSubTab] = useState<'system' | 'user' | 'memory' | 'tools'>('system');

  const subTabs = [
    { key: 'system', label: 'System Prompt' },
    { key: 'user', label: 'User Prompt' },
    { key: 'memory', label: 'Memory' },
    { key: 'tools', label: 'Tools' },
  ] as const;

  return (
    <Box>
      {/* Sub-tabs */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
        {subTabs.map(({ key, label }) => (
          <Chip
            key={key}
            label={label}
            size="small"
            onClick={() => setSubTab(key)}
            sx={{
              fontSize: 11, cursor: 'pointer', fontWeight: 600,
              bgcolor: subTab === key ? 'rgba(100,149,237,0.12)' : 'transparent',
              color: subTab === key ? theme.brand.primary : theme.text.muted,
              border: `1px solid ${subTab === key ? 'rgba(100,149,237,0.25)' : 'transparent'}`,
            }}
          />
        ))}
      </Box>

      {subTab === 'system' && <SystemPromptTab theme={theme} isDark={isDark} />}
      {subTab === 'user' && <UserPromptTab theme={theme} isDark={isDark} />}
      {subTab === 'memory' && <MemoryTab theme={theme} isDark={isDark} />}
      {subTab === 'tools' && <ToolsTab theme={theme} isDark={isDark} />}
    </Box>
  );
}

// ── Models (per-model web search config) ──

const NATIVE_SEARCH_PROVIDERS = new Set(['anthropic', 'google', 'qwen']);

function ModelsSection({ theme, isDark }: { theme: any; isDark: boolean }) {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchModelConfig();
      if (res.success && res.data) {
        // Ensure web_search fields have defaults
        const normalized = (res.data as ModelConfig[]).map(m => ({
          ...m,
          web_search_enabled: m.web_search_enabled ?? false,
          web_search_provider: m.web_search_provider ?? 'google',
        }));
        setModels(normalized);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleSearch = (idx: number) => {
    setModels(prev => prev.map((m, i) =>
      i === idx ? { ...m, web_search_enabled: !m.web_search_enabled } : m
    ));
    setDirty(true);
  };

  const handleProviderChange = (idx: number, provider: 'native' | 'google') => {
    setModels(prev => prev.map((m, i) =>
      i === idx ? { ...m, web_search_provider: provider } : m
    ));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await saveModelConfig(models);
      if (res.success) {
        toast.success('Model config saved');
        setDirty(false);
      } else {
        toast.error('Save failed');
      }
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const tableCellSx = { color: theme.text.primary, borderBottom: `1px solid ${theme.border.subtle}`, fontSize: 13, py: 1.2 };
  const tableHeadSx = { color: theme.text.muted, borderBottom: `1px solid ${theme.border.default}`, fontSize: 12, fontWeight: 600, py: 1 };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.secondary }}>
          Arena Model Config
        </Typography>
        <Button
          size="small"
          onClick={handleSave}
          disabled={saving || !dirty}
          sx={{
            bgcolor: theme.brand.primary,
            color: '#fff',
            textTransform: 'none', fontSize: 13, fontWeight: 600, borderRadius: 2,
            visibility: dirty ? 'visible' : 'hidden',
            '&:hover': { bgcolor: theme.brand.hover },
          }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </Box>

      {loading ? (
        <LoadingDots text="Loading models" fontSize={13} />
      ) : models.length === 0 ? (
        <Typography sx={{ py: 4, textAlign: 'center', color: theme.text.muted, fontSize: 13 }}>
          No models configured. Add models in Admin {'>'} Models first.
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Provider', 'Model', 'Enabled', 'Web Search', 'Search Provider'].map(h => (
                  <TableCell key={h} sx={tableHeadSx}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {models.map((m, idx) => {
                const supportsNative = NATIVE_SEARCH_PROVIDERS.has(m.provider);
                return (
                  <TableRow key={`${m.provider}-${m.model}`}>
                    <TableCell sx={{ ...tableCellSx, fontWeight: 600 }}>{m.provider}</TableCell>
                    <TableCell sx={{ ...tableCellSx, fontFamily: 'monospace', fontSize: 12 }}>{m.model}</TableCell>
                    <TableCell sx={tableCellSx}>
                      <Chip
                        label={m.enabled ? 'ON' : 'OFF'}
                        size="small"
                        sx={{
                          fontSize: 10, height: 20,
                          bgcolor: m.enabled ? 'rgba(76,175,80,0.15)' : 'rgba(158,158,158,0.15)',
                          color: m.enabled ? '#4caf50' : theme.text.muted,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={tableCellSx}>
                      <Switch
                        checked={m.web_search_enabled}
                        onChange={() => handleToggleSearch(idx)}
                        size="small"
                        sx={{
                          '& .MuiSwitch-switchBase.Mui-checked': { color: theme.brand.primary },
                          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: theme.brand.primary },
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ ...tableCellSx, width: 180 }}>
                      <TextField
                        select
                        size="small"
                        value={m.web_search_provider}
                        onChange={(e) => handleProviderChange(idx, e.target.value as 'native' | 'google')}
                        variant="standard"
                        disabled={!m.web_search_enabled}
                        sx={{ minWidth: 140 }}
                        InputProps={{ sx: { color: m.web_search_enabled ? theme.text.primary : theme.text.muted, fontSize: 12 } }}
                      >
                        <MenuItem value="google">Google Search</MenuItem>
                        {supportsNative ? (
                          <MenuItem value="native">Native ({m.provider})</MenuItem>
                        ) : (
                          <MenuItem value="native" disabled>
                            Native (not supported)
                          </MenuItem>
                        )}
                      </TextField>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography sx={{ mt: 2, fontSize: 11, color: theme.text.muted, lineHeight: 1.6 }}>
        Web Search: Google uses Google Custom Search API (requires API key in env). Native search is available for Anthropic, Google Gemini, and Qwen only. Settings only affect this Index Agent's Arena pipeline.
      </Typography>
    </Box>
  );
}

// ── Schedules ──

function ScheduleSection({ theme, isDark }: { theme: any; isDark: boolean }) {
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
        toast.success('Schedule created');
        setDialogOpen(false);
        setForm({ name: '', cron_expression: '', task_type: 'arena_run' });
        load();
      } else {
        toast.error(res.error || 'Failed');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    }
  };

  const handleToggle = async (task: ScheduleTask) => {
    try {
      await updateSchedule(task.id, { is_enabled: !task.is_enabled });
      load();
    } catch {
      toast.error('Toggle failed');
    }
  };

  const handleTrigger = async (taskId: string) => {
    try {
      await triggerSchedule(taskId);
      toast.success('Triggered');
      load();
    } catch {
      toast.error('Trigger failed');
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await deleteSchedule(taskId);
      toast.success('Deleted');
      load();
    } catch {
      toast.error('Delete failed');
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
          startIcon={<Plus size={18} />}
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
                        <Play size={18} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => handleDelete(s.id)} sx={{ color: theme.text.muted, '&:hover': { color: '#f44336' } }}>
                        <Trash2 size={18} />
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
            <X size={24} />
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

