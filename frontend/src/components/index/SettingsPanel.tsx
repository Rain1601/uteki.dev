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
  PlayArrow as TriggerIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useTheme } from '../../theme/ThemeProvider';
import LoadingDots from '../LoadingDots';
import { useToast } from '../Toast';
import {
  Slider,
  Select,
  FormControl,
  InputLabel,
  Collapse,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Save as SaveIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
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
  createIndexTables,
  seedIndexDefaults,
} from '../../api/index';
import { ModelLogo, getProviderDisplayName } from './ModelLogos';
import SystemPromptTab from './context/SystemPromptTab';
import UserPromptTab from './context/UserPromptTab';
import MemoryTab from './context/MemoryTab';
import ToolsTab from './context/ToolsTab';

export default function SettingsPanel() {
  const { theme, isDark } = useTheme();
  const { showToast } = useToast();

  // Section state
  const [section, setSection] = useState<'context' | 'models' | 'schedules' | 'debug'>('context');

  return (
    <Box sx={{ height: '100%', overflow: 'auto', px: 3, py: 2 }}>
      {/* Section Tabs */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        {[
          { key: 'context', label: 'Context' },
          { key: 'models', label: 'Models' },
          { key: 'schedules', label: 'Schedules' },
          ...(import.meta.env.DEV ? [{ key: 'debug', label: 'Debug' }] : []),
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

      {section === 'context' && <ContextSection theme={theme} isDark={isDark} showToast={showToast} />}
      {section === 'models' && <ModelsSection theme={theme} isDark={isDark} showToast={showToast} />}
      {section === 'schedules' && <ScheduleSection theme={theme} isDark={isDark} showToast={showToast} />}
      {import.meta.env.DEV && section === 'debug' && <DebugSection theme={theme} isDark={isDark} showToast={showToast} />}
    </Box>
  );
}

// ── Context ──

function ContextSection({ theme, isDark, showToast }: { theme: any; isDark: boolean; showToast: any }) {
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

      {subTab === 'system' && <SystemPromptTab theme={theme} isDark={isDark} showToast={showToast} />}
      {subTab === 'user' && <UserPromptTab theme={theme} isDark={isDark} showToast={showToast} />}
      {subTab === 'memory' && <MemoryTab theme={theme} isDark={isDark} showToast={showToast} />}
      {subTab === 'tools' && <ToolsTab theme={theme} isDark={isDark} showToast={showToast} />}
    </Box>
  );
}

// ── Models ──

const PROVIDER_DEFAULTS: Record<string, Omit<ModelConfig, 'api_key' | 'enabled'>> = {
  anthropic: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', temperature: 0, max_tokens: 4096 },
  openai: { provider: 'openai', model: 'gpt-4o', temperature: 0, max_tokens: 4096 },
  deepseek: { provider: 'deepseek', model: 'deepseek-chat', base_url: 'https://api.deepseek.com', temperature: 0, max_tokens: 4096 },
  google: { provider: 'google', model: 'gemini-2.5-pro-thinking', temperature: 0, max_tokens: 4096 },
  qwen: { provider: 'qwen', model: 'qwen-plus', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', temperature: 0, max_tokens: 4096 },
  minimax: { provider: 'minimax', model: 'MiniMax-Text-01', base_url: 'https://api.minimax.chat/v1', temperature: 0, max_tokens: 4096 },
};

const PROVIDERS = Object.keys(PROVIDER_DEFAULTS);

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

function ModelsSection({ theme, isDark, showToast }: { theme: any; isDark: boolean; showToast: any }) {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchModelConfig();
      if (res.success && res.data) setModels(res.data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await saveModelConfig(models);
      if (res.success) {
        showToast('Model config saved', 'success');
        setDirty(false);
      } else {
        showToast(res.error || 'Save failed', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddModel = (provider: string) => {
    const defaults = PROVIDER_DEFAULTS[provider];
    const newModel: ModelConfig = {
      ...defaults,
      api_key: '',
      enabled: true,
    };
    setModels([...models, newModel]);
    setExpandedIdx(models.length);
    setAddDialogOpen(false);
    setDirty(true);
  };

  const handleDelete = (idx: number) => {
    setModels(models.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
    else if (expandedIdx !== null && expandedIdx > idx) setExpandedIdx(expandedIdx - 1);
    setDirty(true);
  };

  const updateModel = (idx: number, updates: Partial<ModelConfig>) => {
    setModels(models.map((m, i) => i === idx ? { ...m, ...updates } : m));
    setDirty(true);
  };

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.secondary }}>
          Arena Models
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setAddDialogOpen(true)}
            sx={{ textTransform: 'none', fontSize: 13, fontWeight: 600, borderRadius: 2, color: theme.brand.primary, border: `1px solid ${theme.brand.primary}40` }}
          >
            Add Model
          </Button>
          <Button
            size="small"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving || !dirty}
            sx={{ bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none', fontSize: 13, fontWeight: 600, borderRadius: 2, '&:hover': { bgcolor: theme.brand.hover }, '&.Mui-disabled': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: theme.text.muted } }}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Box>
      </Box>

      {loading ? (
        <LoadingDots text="Loading models" fontSize={13} />
      ) : models.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography sx={{ color: theme.text.muted, fontSize: 13, mb: 2 }}>
            No models configured. Add models to use in Arena.
          </Typography>
          <Button
            startIcon={<AddIcon />}
            onClick={() => setAddDialogOpen(true)}
            sx={{ textTransform: 'none', fontSize: 13, fontWeight: 600, color: theme.brand.primary }}
          >
            Add Your First Model
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {models.map((model, idx) => (
            <ModelCard
              key={idx}
              model={model}
              expanded={expandedIdx === idx}
              onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              onUpdate={(updates) => updateModel(idx, updates)}
              onDelete={() => handleDelete(idx)}
              theme={theme}
              isDark={isDark}
              cardBg={cardBg}
              cardBorder={cardBorder}
            />
          ))}
        </Box>
      )}

      {/* Add Model Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { bgcolor: theme.background.secondary, color: theme.text.primary } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>Select Provider</Typography>
          <IconButton size="small" onClick={() => setAddDialogOpen(false)} sx={{ color: theme.text.muted }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {PROVIDERS.map((p) => (
              <Button
                key={p}
                onClick={() => handleAddModel(p)}
                sx={{
                  justifyContent: 'flex-start',
                  gap: 1.5,
                  px: 2,
                  py: 1.2,
                  textTransform: 'none',
                  color: theme.text.primary,
                  bgcolor: cardBg,
                  border: `1px solid ${cardBorder}`,
                  borderRadius: 2,
                  '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                }}
              >
                <ModelLogo provider={p} size={24} isDark={isDark} />
                <Box sx={{ textAlign: 'left' }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                    {getProviderDisplayName(p)}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: theme.text.muted }}>
                    {PROVIDER_DEFAULTS[p].model}
                  </Typography>
                </Box>
              </Button>
            ))}
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

function ModelCard({
  model,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
  theme,
  isDark,
  cardBg,
  cardBorder,
}: {
  model: ModelConfig;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<ModelConfig>) => void;
  onDelete: () => void;
  theme: any;
  isDark: boolean;
  cardBg: string;
  cardBorder: string;
}) {
  const [showKey, setShowKey] = useState(false);

  return (
    <Box
      sx={{
        border: `1px solid ${expanded ? theme.brand.primary + '40' : cardBorder}`,
        borderRadius: 2,
        bgcolor: cardBg,
        overflow: 'hidden',
      }}
    >
      {/* Collapsed header */}
      <Box
        onClick={onToggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1.2,
          cursor: 'pointer',
          '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' },
        }}
      >
        <ModelLogo provider={model.provider} size={24} isDark={isDark} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {model.model}
          </Typography>
          <Typography sx={{ fontSize: 11, color: theme.text.muted }}>
            {getProviderDisplayName(model.provider)}
            {model.api_key ? ` \u00B7 ${maskApiKey(model.api_key)}` : ''}
            {` \u00B7 temp=${model.temperature} \u00B7 max=${model.max_tokens}`}
          </Typography>
        </Box>
        <Switch
          checked={model.enabled}
          onChange={(e) => { e.stopPropagation(); onUpdate({ enabled: !model.enabled }); }}
          size="small"
          onClick={(e) => e.stopPropagation()}
          sx={{
            '& .MuiSwitch-switchBase.Mui-checked': { color: theme.brand.primary },
            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: theme.brand.primary },
          }}
        />
        {expanded ? <ExpandLessIcon sx={{ color: theme.text.muted, fontSize: 20 }} /> : <ExpandMoreIcon sx={{ color: theme.text.muted, fontSize: 20 }} />}
      </Box>

      {/* Expanded form */}
      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 2, pt: 0.5, display: 'flex', flexDirection: 'column', gap: 1.5, borderTop: `1px solid ${cardBorder}` }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ color: theme.text.muted, fontSize: 13 }}>Provider</InputLabel>
              <Select
                value={model.provider}
                label="Provider"
                onChange={(e) => {
                  const p = e.target.value as string;
                  const defaults = PROVIDER_DEFAULTS[p];
                  if (defaults) {
                    onUpdate({ provider: p, model: defaults.model, base_url: defaults.base_url });
                  } else {
                    onUpdate({ provider: p });
                  }
                }}
                sx={{ color: theme.text.primary, fontSize: 13, '.MuiOutlinedInput-notchedOutline': { borderColor: cardBorder } }}
              >
                {PROVIDERS.map((p) => (
                  <MenuItem key={p} value={p}>{getProviderDisplayName(p)}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Model"
              size="small"
              fullWidth
              value={model.model}
              onChange={(e) => onUpdate({ model: e.target.value })}
              InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
              InputLabelProps={{ sx: { color: theme.text.muted, fontSize: 13 } }}
              sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: cardBorder } }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <TextField
              label="API Key"
              size="small"
              fullWidth
              type={showKey ? 'text' : 'password'}
              value={model.api_key}
              onChange={(e) => onUpdate({ api_key: e.target.value })}
              InputProps={{
                sx: { color: theme.text.primary, fontSize: 13, fontFamily: 'monospace' },
                endAdornment: (
                  <IconButton size="small" onClick={() => setShowKey(!showKey)} sx={{ color: theme.text.muted }}>
                    {showKey ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                ),
              }}
              InputLabelProps={{ sx: { color: theme.text.muted, fontSize: 13 } }}
              sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: cardBorder } }}
            />
          </Box>

          <TextField
            label="Base URL (optional)"
            size="small"
            fullWidth
            value={model.base_url || ''}
            onChange={(e) => onUpdate({ base_url: e.target.value || undefined })}
            placeholder="Leave empty for default"
            InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
            InputLabelProps={{ sx: { color: theme.text.muted, fontSize: 13 } }}
            sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: cardBorder } }}
          />

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 11, color: theme.text.muted, mb: 0.5 }}>
                Temperature: {model.temperature}
              </Typography>
              <Slider
                value={model.temperature}
                onChange={(_, v) => onUpdate({ temperature: v as number })}
                min={0}
                max={2}
                step={0.1}
                size="small"
                sx={{ color: theme.brand.primary }}
              />
            </Box>
            <TextField
              label="Max Tokens"
              size="small"
              type="number"
              value={model.max_tokens}
              onChange={(e) => onUpdate({ max_tokens: parseInt(e.target.value) || 4096 })}
              InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
              InputLabelProps={{ sx: { color: theme.text.muted, fontSize: 13 } }}
              sx={{ width: 120, '.MuiOutlinedInput-notchedOutline': { borderColor: cardBorder } }}
            />
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 0.5 }}>
            <Button
              size="small"
              startIcon={<DeleteIcon />}
              onClick={onDelete}
              sx={{ color: '#f44336', textTransform: 'none', fontSize: 12, '&:hover': { bgcolor: 'rgba(244,67,54,0.08)' } }}
            >
              Delete
            </Button>
          </Box>
        </Box>
      </Collapse>
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
