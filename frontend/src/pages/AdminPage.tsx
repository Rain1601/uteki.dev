import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  Alert,
  Tooltip,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  Collapse,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Slider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  Public as PublicIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Star as StarIcon,
} from '@mui/icons-material';
import LoadingDots from '../components/LoadingDots';
import { useTheme } from '../theme/ThemeProvider';
import { useToast } from '../components/Toast';
import { get } from '../api/client';
import { adminApi } from '../api/admin';
import { useSystemHealth } from '../hooks/useAdmin';
import { ModelLogo, getProviderDisplayName } from '../components/index/ModelLogos';
import type { APIKey, LLMProvider } from '../types/admin';

/* ─── constants ─── */

const EXCHANGES = [
  { name: 'snb', label: '雪盈证券 (SNB)', features: ['现货', '港美股'], fields: ['api_key', 'account', 'totp_secret'] },
  { name: 'binance', label: '币安 (Binance)', features: ['现货', '合约', '加密货币'], fields: ['api_key', 'api_secret'] },
];

const PROVIDER_DEFAULTS: Record<string, { model: string; base_url?: string }> = {
  anthropic: { model: 'claude-sonnet-4-20250514' },
  openai: { model: 'gpt-4o' },
  deepseek: { model: 'deepseek-chat', base_url: 'https://api.deepseek.com' },
  google: { model: 'gemini-2.5-pro-thinking' },
  qwen: { model: 'qwen-plus', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  minimax: { model: 'MiniMax-Text-01', base_url: 'https://api.minimax.chat/v1' },
  doubao: { model: 'doubao-seed-2-0-pro-260215', base_url: 'https://ark.cn-beijing.volces.com/api/v3' },
};

const PROVIDERS = Object.keys(PROVIDER_DEFAULTS);

/* ═══════════════ Main Page ═══════════════ */

export default function AdminPage() {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const { showToast } = useToast();
  const [tab, setTab] = useState<'overview' | 'exchanges' | 'models'>('overview');

  const cardBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: theme.text.primary, mb: 0.5 }}>
          Admin
        </Typography>
        <Typography sx={{ fontSize: 13, color: theme.text.muted }}>
          系统配置与管理
        </Typography>
      </Box>

      {/* Tabs */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 3 }}>
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'exchanges', label: 'Exchanges' },
          { key: 'models', label: 'Models' },
        ].map(t => (
          <Chip
            key={t.key}
            label={t.label}
            onClick={() => setTab(t.key as any)}
            sx={{
              fontWeight: 600, fontSize: 12, cursor: 'pointer',
              bgcolor: tab === t.key ? 'rgba(100,149,237,0.15)' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              color: tab === t.key ? theme.brand.primary : theme.text.secondary,
              border: `1px solid ${tab === t.key ? 'rgba(100,149,237,0.3)' : 'transparent'}`,
            }}
          />
        ))}
      </Box>

      {tab === 'overview' && <OverviewTab theme={theme} isDark={isDark} showToast={showToast} />}
      {tab === 'exchanges' && <ExchangesTab theme={theme} isDark={isDark} showToast={showToast} cardBg={cardBg} cardBorder={cardBorder} />}
      {tab === 'models' && <ModelsTab theme={theme} isDark={isDark} showToast={showToast} cardBg={cardBg} cardBorder={cardBorder} />}
    </Box>
  );
}

/* ═══════════════ Overview Tab ═══════════════ */

function OverviewTab({ theme, isDark, showToast }: { theme: any; isDark: boolean; showToast: any }) {
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [ipLoading, setIpLoading] = useState(false);
  const [ipCopied, setIpCopied] = useState(false);
  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useSystemHealth();

  const fetchIp = async () => {
    setIpLoading(true);
    try {
      const data = await get<{ ip: string | null }>('/api/admin/system/server-ip');
      setIpAddress(data.ip);
    } catch { setIpAddress(null); }
    finally { setIpLoading(false); }
  };

  const copyIp = async () => {
    if (!ipAddress) return;
    try {
      await navigator.clipboard.writeText(ipAddress);
      setIpCopied(true);
      showToast('IP 已复制', 'success');
      setTimeout(() => setIpCopied(false), 2000);
    } catch { showToast('复制失败', 'error'); }
  };

  useEffect(() => { fetchIp(); }, []);

  const statusChip = (s: string) => {
    const cfg: Record<string, { label: string; color: string; bg: string }> = {
      connected: { label: '已连接', color: theme.brand.primary, bg: 'rgba(46,229,172,0.2)' },
      disconnected: { label: '断开', color: theme.status.error, bg: 'rgba(244,67,54,0.2)' },
      degraded: { label: '降级', color: theme.status.warning, bg: 'rgba(255,167,38,0.2)' },
      disabled: { label: '禁用', color: theme.status.warning, bg: 'rgba(255,167,38,0.2)' },
    };
    const c = cfg[s] || cfg.disconnected;
    return <Chip label={c.label} size="small" sx={{ mt: 1, bgcolor: c.bg, color: c.color }} />;
  };

  return (
    <Grid container spacing={3}>
      {/* IP */}
      <Grid item xs={12} md={4}>
        <Card sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.02)' : undefined }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PublicIcon sx={{ color: theme.brand.primary }} />
                <Typography sx={{ fontWeight: 600, fontSize: 15 }}>服务器 IP</Typography>
              </Box>
              <IconButton size="small" onClick={fetchIp} disabled={ipLoading}><RefreshIcon /></IconButton>
            </Box>
            {ipLoading ? <LoadingDots text="获取中" /> : ipAddress ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderRadius: 1, border: `1px solid ${theme.border.default}` }}>
                <Typography sx={{ flex: 1, fontFamily: 'monospace', fontSize: 18, fontWeight: 600, color: theme.brand.primary }}>{ipAddress}</Typography>
                <Tooltip title={ipCopied ? '已复制!' : '复制'}><IconButton size="small" onClick={copyIp}><CopyIcon fontSize="small" /></IconButton></Tooltip>
              </Box>
            ) : <Alert severity="error">无法获取 IP</Alert>}
          </CardContent>
        </Card>
      </Grid>

      {/* Health */}
      <Grid item xs={12} md={8}>
        <Card sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.02)' : undefined }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography sx={{ fontWeight: 600, fontSize: 15 }}>系统健康状态</Typography>
              <IconButton size="small" onClick={() => refetchHealth()}><RefreshIcon /></IconButton>
            </Box>
            {healthLoading ? <LoadingDots text="检查中" /> : healthData ? (
              <Grid container spacing={2}>
                {Object.entries(healthData.databases).map(([name, db]) => (
                  <Grid item xs={6} sm={4} md={2.4} key={name}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{name}</Typography>
                      {statusChip((db as any).status)}
                    </Box>
                  </Grid>
                ))}
              </Grid>
            ) : <Alert severity="error">无法获取状态</Alert>}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

/* ═══════════════ Exchanges Tab ═══════════════ */

function ExchangesTab({ theme, isDark, showToast, cardBg, cardBorder }: { theme: any; isDark: boolean; showToast: any; cardBg: string; cardBorder: string }) {
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [editExchange, setEditExchange] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.apiKeys.list();
      setApiKeys(res.items);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getExchangeKey = (name: string) => apiKeys.find(k => k.provider === name && k.is_active);

  const handleSave = async (exchangeName: string) => {
    setSaving(true);
    try {
      const existing = getExchangeKey(exchangeName);
      const extraConfig: Record<string, string> = {};
      const ex = EXCHANGES.find(e => e.name === exchangeName)!;

      // Separate api_key/api_secret from extra fields
      const apiKey = form.api_key || '';
      const apiSecret = form.api_secret || undefined;
      ex.fields.filter(f => f !== 'api_key' && f !== 'api_secret').forEach(f => {
        if (form[f]) extraConfig[f] = form[f];
      });

      if (existing) {
        // Update
        await adminApi.apiKeys.update(existing.id, {
          ...(apiKey ? { api_key: apiKey } : {}),
          ...(apiSecret ? { api_secret: apiSecret } : {}),
          extra_config: Object.keys(extraConfig).length > 0 ? extraConfig : undefined,
        });
        showToast('已更新', 'success');
      } else {
        // Create
        if (!apiKey) { showToast('请输入 API Key', 'error'); setSaving(false); return; }
        await adminApi.apiKeys.create({
          provider: exchangeName,
          display_name: ex.label,
          api_key: apiKey,
          api_secret: apiSecret,
          extra_config: Object.keys(extraConfig).length > 0 ? extraConfig : undefined,
          environment: 'production',
          is_active: true,
        });
        showToast('已创建', 'success');
      }
      setEditExchange(null);
      setForm({});
      load();
    } catch (e: any) {
      showToast(e.message || '保存失败', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (exchangeName: string) => {
    const key = getExchangeKey(exchangeName);
    if (!key) return;
    try {
      await adminApi.apiKeys.delete(key.id);
      showToast('已删除', 'success');
      setDeleteConfirm(null);
      load();
    } catch (e: any) { showToast(e.message || '删除失败', 'error'); }
  };

  if (loading) return <LoadingDots text="加载中" fontSize={13} />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {EXCHANGES.map(ex => {
        const key = getExchangeKey(ex.name);
        const configured = !!key;
        const isEditing = editExchange === ex.name;

        return (
          <Box key={ex.name} sx={{ border: `1px solid ${isEditing ? theme.brand.primary + '40' : cardBorder}`, borderRadius: 2, bgcolor: cardBg, overflow: 'hidden' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5 }}>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 600, color: theme.text.primary }}>{ex.label}</Typography>
                  <Chip
                    label={configured ? '已配置' : '未配置'}
                    size="small"
                    sx={{
                      fontSize: 10, height: 20,
                      bgcolor: configured ? 'rgba(46,229,172,0.15)' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                      color: configured ? theme.brand.primary : theme.text.muted,
                    }}
                  />
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                  {ex.features.map(f => (
                    <Chip key={f} label={f} size="small" variant="outlined" sx={{ fontSize: 10, height: 18, color: theme.text.muted, borderColor: theme.border.subtle }} />
                  ))}
                  {configured && key && (
                    <Typography sx={{ fontSize: 11, color: theme.text.muted, ml: 1, fontFamily: 'monospace' }}>
                      {key.api_key_masked}
                    </Typography>
                  )}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Button
                  size="small"
                  startIcon={configured ? <EditIcon /> : <AddIcon />}
                  onClick={() => { setEditExchange(isEditing ? null : ex.name); setForm({}); }}
                  sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, color: theme.brand.primary }}
                >
                  {configured ? '编辑' : '配置'}
                </Button>
                {configured && (
                  <IconButton size="small" onClick={() => setDeleteConfirm(ex.name)} sx={{ color: theme.text.muted, '&:hover': { color: '#f44336' } }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            </Box>

            {/* Edit form */}
            <Collapse in={isEditing}>
              <Box sx={{ px: 2, pb: 2, pt: 0.5, display: 'flex', flexDirection: 'column', gap: 1.5, borderTop: `1px solid ${cardBorder}` }}>
                {ex.fields.map(field => (
                  <TextField
                    key={field}
                    label={field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    size="small"
                    fullWidth
                    type={showSecret[field] ? 'text' : 'password'}
                    value={form[field] || ''}
                    onChange={e => setForm({ ...form, [field]: e.target.value })}
                    placeholder={configured ? '留空不修改' : ''}
                    InputProps={{
                      sx: { color: theme.text.primary, fontSize: 13, fontFamily: 'monospace' },
                      endAdornment: (
                        <IconButton size="small" onClick={() => setShowSecret({ ...showSecret, [field]: !showSecret[field] })} sx={{ color: theme.text.muted }}>
                          {showSecret[field] ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                        </IconButton>
                      ),
                    }}
                    InputLabelProps={{ sx: { color: theme.text.muted, fontSize: 13 } }}
                    sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: cardBorder } }}
                  />
                ))}
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                  <Button size="small" onClick={() => setEditExchange(null)} sx={{ textTransform: 'none', color: theme.text.muted }}>取消</Button>
                  <Button
                    size="small"
                    startIcon={<SaveIcon />}
                    onClick={() => handleSave(ex.name)}
                    disabled={saving}
                    sx={{ bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none', fontWeight: 600, fontSize: 12, borderRadius: 2, '&:hover': { bgcolor: theme.brand.hover } }}
                  >
                    {saving ? '保存中...' : '保存'}
                  </Button>
                </Box>
              </Box>
            </Collapse>
          </Box>
        );
      })}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: theme.background.secondary, color: theme.text.primary } }}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14 }}>确定要删除此交易所的 API Key 配置吗？此操作不可撤销。</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirm(null)} sx={{ color: theme.text.muted, textTransform: 'none' }}>取消</Button>
          <Button onClick={() => deleteConfirm && handleDelete(deleteConfirm)} sx={{ bgcolor: '#f44336', color: '#fff', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#d32f2f' } }}>删除</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ═══════════════ Models Tab ═══════════════ */

function ModelsTab({ theme, isDark, showToast, cardBg, cardBorder }: { theme: any; isDark: boolean; showToast: any; cardBg: string; cardBorder: string }) {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Edit state
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const provRes = await adminApi.llmProviders.list();
      setProviders(provRes.items);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAddModel = async (providerName: string) => {
    setAddDialogOpen(false);
    const defaults = PROVIDER_DEFAULTS[providerName];
    // Open a pre-filled edit form for the new model
    setEditForm({
      _isNew: true,
      provider: providerName,
      model: defaults.model,
      display_name: getProviderDisplayName(providerName),
      api_key: '',
      base_url: defaults.base_url || '',
      temperature: 0,
      max_tokens: 4096,
      is_default: false,
    });
    setExpandedId('_new');
  };

  const handleSaveNew = async () => {
    if (!editForm.api_key) { showToast('请输入 API Key', 'error'); return; }
    setSaving(true);
    try {
      await adminApi.llmProviders.createWithKey({
        provider: editForm.provider,
        model: editForm.model,
        display_name: editForm.display_name,
        api_key: editForm.api_key,
        base_url: editForm.base_url || undefined,
        temperature: editForm.temperature,
        max_tokens: editForm.max_tokens,
        is_default: editForm.is_default,
      });
      showToast('模型已添加', 'success');
      setExpandedId(null);
      setEditForm({});
      load();
    } catch (e: any) { showToast(e.message || '创建失败', 'error'); }
    finally { setSaving(false); }
  };

  const handleSaveEdit = async (id: string) => {
    setSaving(true);
    try {
      const update: Record<string, any> = {};
      if (editForm.model) update.model = editForm.model;
      if (editForm.display_name) update.display_name = editForm.display_name;
      if (editForm.api_key) update.api_key = editForm.api_key;
      if (editForm.is_default !== undefined) update.is_default = editForm.is_default;
      if (editForm.is_active !== undefined) update.is_active = editForm.is_active;
      const config: Record<string, any> = {};
      if (editForm.base_url !== undefined) config.base_url = editForm.base_url;
      if (editForm.temperature !== undefined) config.temperature = editForm.temperature;
      if (editForm.max_tokens !== undefined) config.max_tokens = editForm.max_tokens;
      if (Object.keys(config).length > 0) update.config = config;

      await adminApi.llmProviders.update(id, update);
      showToast('已更新', 'success');
      setExpandedId(null);
      setEditForm({});
      load();
    } catch (e: any) { showToast(e.message || '更新失败', 'error'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (id: string, field: 'is_active' | 'is_default', value: boolean) => {
    try {
      await adminApi.llmProviders.update(id, { [field]: value });
      load();
    } catch { showToast('操作失败', 'error'); }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.llmProviders.delete(id);
      showToast('已删除', 'success');
      setDeleteConfirm(null);
      load();
    } catch (e: any) { showToast(e.message || '删除失败', 'error'); }
  };

  const startEdit = (p: LLMProvider) => {
    setEditForm({
      model: p.model,
      display_name: p.display_name,
      api_key: '',
      base_url: p.config?.base_url || '',
      temperature: p.config?.temperature ?? 0,
      max_tokens: p.config?.max_tokens ?? 4096,
      is_default: p.is_default,
      is_active: p.is_active,
    });
    setShowKey(false);
    setExpandedId(expandedId === p.id ? null : p.id);
  };

  if (loading) return <LoadingDots text="加载中" fontSize={13} />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.secondary }}>
          LLM Models ({providers.length})
        </Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setAddDialogOpen(true)}
          sx={{ textTransform: 'none', fontSize: 13, fontWeight: 600, borderRadius: 2, color: theme.brand.primary, border: `1px solid ${theme.brand.primary}40` }}>
          添加模型
        </Button>
      </Box>

      {providers.length === 0 && expandedId !== '_new' ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography sx={{ color: theme.text.muted, fontSize: 13, mb: 2 }}>未配置任何模型</Typography>
          <Button startIcon={<AddIcon />} onClick={() => setAddDialogOpen(true)} sx={{ textTransform: 'none', fontSize: 13, fontWeight: 600, color: theme.brand.primary }}>添加第一个模型</Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {/* New model form (inline) */}
          {expandedId === '_new' && editForm._isNew && (
            <ModelEditCard
              theme={theme} isDark={isDark} cardBg={cardBg} cardBorder={cardBorder}
              editForm={editForm} setEditForm={setEditForm}
              showKey={showKey} setShowKey={setShowKey}
              saving={saving}
              isNew
              onSave={handleSaveNew}
              onCancel={() => { setExpandedId(null); setEditForm({}); }}
            />
          )}

          {/* Existing models */}
          {providers.map(p => (
            <Box key={p.id} sx={{ border: `1px solid ${expandedId === p.id ? theme.brand.primary + '40' : cardBorder}`, borderRadius: 1.5, bgcolor: cardBg, overflow: 'hidden' }}>
              {/* Row */}
              <Box onClick={() => startEdit(p)} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 0.8, cursor: 'pointer', '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' } }}>
                <ModelLogo provider={p.provider} size={22} isDark={isDark} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.primary }}>{p.model}</Typography>
                    {p.is_default && (
                      <Chip icon={<StarIcon sx={{ fontSize: 10 }} />} label="默认" size="small" sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(255,193,7,0.15)', color: '#ffc107', '& .MuiChip-icon': { color: '#ffc107' } }} />
                    )}
                  </Box>
                  <Typography sx={{ fontSize: 11, color: theme.text.muted, lineHeight: 1.3 }}>
                    {getProviderDisplayName(p.provider)}
                    {p.config?.temperature != null ? ` · temp=${p.config.temperature}` : ''}
                  </Typography>
                </Box>
                <Switch
                  checked={p.is_active}
                  onChange={e => { e.stopPropagation(); handleToggle(p.id, 'is_active', !p.is_active); }}
                  size="small"
                  onClick={e => e.stopPropagation()}
                  sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: theme.brand.primary }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: theme.brand.primary } }}
                />
                {expandedId === p.id ? <ExpandLessIcon sx={{ color: theme.text.muted, fontSize: 18 }} /> : <ExpandMoreIcon sx={{ color: theme.text.muted, fontSize: 18 }} />}
              </Box>

              {/* Expanded edit */}
              <Collapse in={expandedId === p.id}>
                <ModelEditCard
                  theme={theme} isDark={isDark} cardBg={cardBg} cardBorder={cardBorder}
                  editForm={editForm} setEditForm={setEditForm}
                  showKey={showKey} setShowKey={setShowKey}
                  saving={saving}
                  isNew={false}
                  onSave={() => handleSaveEdit(p.id)}
                  onCancel={() => { setExpandedId(null); setEditForm({}); }}
                  onDelete={() => setDeleteConfirm(p.id)}
                  onToggleDefault={() => handleToggle(p.id, 'is_default', !p.is_default)}
                  isDefault={p.is_default}
                />
              </Collapse>
            </Box>
          ))}
        </Box>
      )}

      {/* Add Model Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: theme.background.secondary, color: theme.text.primary } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>选择 LLM 厂商</Typography>
          <IconButton size="small" onClick={() => setAddDialogOpen(false)} sx={{ color: theme.text.muted }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {PROVIDERS.map(p => (
              <Button key={p} onClick={() => handleAddModel(p)} sx={{
                justifyContent: 'flex-start', gap: 1.5, px: 2, py: 1.2, textTransform: 'none', color: theme.text.primary,
                bgcolor: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 2,
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
              }}>
                <ModelLogo provider={p} size={24} isDark={isDark} />
                <Box sx={{ textAlign: 'left' }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{getProviderDisplayName(p)}</Typography>
                  <Typography sx={{ fontSize: 11, color: theme.text.muted }}>{PROVIDER_DEFAULTS[p].model}</Typography>
                </Box>
              </Button>
            ))}
          </Box>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: theme.background.secondary, color: theme.text.primary } }}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent><Typography sx={{ fontSize: 14 }}>确定要删除此模型配置吗？关联的 API Key 也会被删除。</Typography></DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirm(null)} sx={{ color: theme.text.muted, textTransform: 'none' }}>取消</Button>
          <Button onClick={() => deleteConfirm && handleDelete(deleteConfirm)} sx={{ bgcolor: '#f44336', color: '#fff', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#d32f2f' } }}>删除</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ─── Shared Model Edit Card ─── */

function ModelEditCard({ theme, isDark, cardBorder, editForm, setEditForm, showKey, setShowKey, saving, isNew, onSave, onCancel, onDelete, onToggleDefault, isDefault }: {
  theme: any; isDark: boolean; cardBg: string; cardBorder: string;
  editForm: Record<string, any>; setEditForm: (f: Record<string, any>) => void;
  showKey: boolean; setShowKey: (v: boolean) => void;
  saving: boolean; isNew: boolean;
  onSave: () => void; onCancel: () => void;
  onDelete?: () => void; onToggleDefault?: () => void; isDefault?: boolean;
}) {
  const inputSx = { '.MuiOutlinedInput-notchedOutline': { borderColor: cardBorder } };
  const labelSx = { sx: { color: theme.text.muted, fontSize: 12 } };
  const fieldSx = { sx: { color: theme.text.primary, fontSize: 13 } };

  return (
    <Box sx={{ px: 2, pb: 1.5, pt: isNew ? 1.5 : 0.5, display: 'flex', flexDirection: 'column', gap: 1, borderTop: isNew ? undefined : `1px solid ${cardBorder}`, border: isNew ? `1px solid ${theme.brand.primary}40` : undefined, borderRadius: isNew ? 2 : 0, bgcolor: isNew ? (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)') : undefined }}>
      {isNew && <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.primary, mb: 0.5 }}>添加新模型</Typography>}

      {/* Row 1: Provider + Model */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        {isNew ? (
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel sx={{ color: theme.text.muted, fontSize: 12 }}>LLM 厂商</InputLabel>
            <Select value={editForm.provider || ''} label="LLM 厂商"
              onChange={e => {
                const p = e.target.value;
                const d = PROVIDER_DEFAULTS[p];
                if (d) setEditForm({ ...editForm, provider: p, model: d.model, base_url: d.base_url || '' });
              }}
              sx={{ color: theme.text.primary, fontSize: 13, ...inputSx }}>
              {PROVIDERS.map(p => <MenuItem key={p} value={p}>{getProviderDisplayName(p)}</MenuItem>)}
            </Select>
          </FormControl>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.75, borderRadius: 1, bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', minWidth: 100 }}>
            <ModelLogo provider={editForm.provider || ''} size={18} isDark={isDark} />
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.text.secondary, whiteSpace: 'nowrap' }}>
              {getProviderDisplayName(editForm.provider || '')}
            </Typography>
          </Box>
        )}
        <TextField label="模型 ID" size="small" fullWidth value={editForm.model || ''} onChange={e => setEditForm({ ...editForm, model: e.target.value })}
          InputProps={fieldSx} InputLabelProps={labelSx} sx={inputSx} />
      </Box>

      {/* Row 2: API Key + Base URL side by side */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label={isNew ? 'API Key' : 'API Key (留空不修改)'}
          size="small" type={showKey ? 'text' : 'password'}
          value={editForm.api_key || ''} onChange={e => setEditForm({ ...editForm, api_key: e.target.value })}
          InputProps={{
            sx: { color: theme.text.primary, fontSize: 12, fontFamily: 'monospace' },
            endAdornment: <IconButton size="small" onClick={() => setShowKey(!showKey)} sx={{ color: theme.text.muted }}>{showKey ? <VisibilityOffIcon sx={{ fontSize: 16 }} /> : <VisibilityIcon sx={{ fontSize: 16 }} />}</IconButton>,
          }}
          InputLabelProps={labelSx} sx={{ flex: 1, ...inputSx }}
        />
        <TextField label="Base URL (可选)" size="small" value={editForm.base_url || ''} onChange={e => setEditForm({ ...editForm, base_url: e.target.value })}
          placeholder="默认" InputProps={{ sx: { color: theme.text.primary, fontSize: 12 } }} InputLabelProps={labelSx} sx={{ flex: 1, ...inputSx }} />
      </Box>

      {/* Row 3: Temperature + Max Tokens + Actions */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ fontSize: 11, color: theme.text.muted, whiteSpace: 'nowrap' }}>Temp: {editForm.temperature ?? 0}</Typography>
          <Slider value={editForm.temperature ?? 0} onChange={(_, v) => setEditForm({ ...editForm, temperature: v as number })} min={0} max={2} step={0.1} size="small" sx={{ color: theme.brand.primary, maxWidth: 160 }} />
        </Box>
        <TextField label="Max Tokens" size="small" type="number" value={editForm.max_tokens ?? 4096} onChange={e => setEditForm({ ...editForm, max_tokens: parseInt(e.target.value) || 4096 })}
          InputProps={{ sx: { color: theme.text.primary, fontSize: 12 } }} InputLabelProps={labelSx}
          sx={{ width: 100, ...inputSx }} />
        <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto' }}>
          {onToggleDefault && (
            <IconButton size="small" onClick={onToggleDefault} sx={{ color: isDefault ? '#ffc107' : theme.text.muted }}>
              <StarIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
          {onDelete && (
            <IconButton size="small" onClick={onDelete} sx={{ color: theme.text.muted, '&:hover': { color: '#f44336' } }}>
              <DeleteIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
          <Button size="small" onClick={onCancel} sx={{ textTransform: 'none', fontSize: 12, color: theme.text.muted, minWidth: 'auto', px: 1 }}>取消</Button>
          <Button size="small" startIcon={<SaveIcon sx={{ fontSize: 14 }} />} onClick={onSave} disabled={saving}
            sx={{ bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none', fontWeight: 600, fontSize: 12, borderRadius: 1.5, minWidth: 'auto', px: 1.5, '&:hover': { bgcolor: theme.brand.hover }, '&.Mui-disabled': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: theme.text.muted } }}>
            {saving ? '...' : '保存'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
