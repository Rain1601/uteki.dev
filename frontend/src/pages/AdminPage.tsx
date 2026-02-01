import { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import { useToast } from '../components/Toast';
import {
  useAPIKeys,
  useCreateAPIKey,
  useDeleteAPIKey,
  useLLMProviders,
  useCreateLLMProvider,
  useDeleteLLMProvider,
  useExchangeConfigs,
  useDataSourceConfigs,
  useSystemHealth,
} from '../hooks/useAdmin';

export default function AdminPage() {
  const { theme } = useTheme();
  const { isMobile } = useResponsive();
  const { showToast } = useToast();
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [llmDialogOpen, setLlmDialogOpen] = useState(false);

  // API Keys状态
  const { data: apiKeysData, isLoading: apiKeysLoading, refetch: refetchApiKeys } = useAPIKeys();
  const createApiKeyMutation = useCreateAPIKey();
  const deleteApiKeyMutation = useDeleteAPIKey();

  // LLM Providers状态
  const { data: llmProvidersData, isLoading: llmLoading, refetch: refetchLLM } = useLLMProviders();
  const createLLMProviderMutation = useCreateLLMProvider();
  const deleteLLMProviderMutation = useDeleteLLMProvider();

  // Exchange Configs状态
  const { data: exchangeConfigsData, isLoading: exchangesLoading } = useExchangeConfigs();

  // Data Source Configs状态
  const { data: dataSourcesData, isLoading: dataSourcesLoading } = useDataSourceConfigs();

  // System Health状态
  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useSystemHealth();

  // API Key表单状态
  const [apiKeyForm, setApiKeyForm] = useState({
    service_name: '',
    key_name: '',
    api_key: '',
    api_secret: '',
  });

  // LLM Provider表单状态
  const [llmForm, setLlmForm] = useState({
    provider_name: '',
    model_name: '',
    api_key_id: '',
    is_default: false,
  });

  // 处理创建API Key
  const handleCreateApiKey = async () => {
    try {
      await createApiKeyMutation.mutateAsync(apiKeyForm);
      setApiKeyDialogOpen(false);
      setApiKeyForm({ service_name: '', key_name: '', api_key: '', api_secret: '' });
      showToast('API密钥创建成功', 'success');
    } catch (error) {
      console.error('Failed to create API key:', error);
      showToast('创建API密钥失败，请重试', 'error');
    }
  };

  // 处理删除API Key
  const handleDeleteApiKey = async (id: string) => {
    if (confirm('确定要删除这个API密钥吗？')) {
      try {
        await deleteApiKeyMutation.mutateAsync(id);
        showToast('API密钥删除成功', 'success');
      } catch (error) {
        console.error('Failed to delete API key:', error);
        showToast('删除API密钥失败，请重试', 'error');
      }
    }
  };

  // 处理创建LLM Provider
  const handleCreateLLMProvider = async () => {
    try {
      await createLLMProviderMutation.mutateAsync(llmForm);
      setLlmDialogOpen(false);
      setLlmForm({ provider_name: '', model_name: '', api_key_id: '', is_default: false });
      showToast('LLM Provider创建成功', 'success');
    } catch (error) {
      console.error('Failed to create LLM provider:', error);
      showToast('创建LLM Provider失败，请重试', 'error');
    }
  };

  // 处理删除LLM Provider
  const handleDeleteLLMProvider = async (id: string) => {
    if (confirm('确定要删除这个LLM Provider吗？')) {
      try {
        await deleteLLMProviderMutation.mutateAsync(id);
        showToast('LLM Provider删除成功', 'success');
      } catch (error) {
        console.error('Failed to delete LLM provider:', error);
        showToast('删除LLM Provider失败，请重试', 'error');
      }
    }
  };

  // 渲染数据库状态
  const renderDatabaseStatus = (status: string) => {
    const statusConfig: Record<string, { label: string; color: string; bgcolor: string }> = {
      connected: { label: '✓ 已连接', color: theme.brand.primary, bgcolor: 'rgba(46, 229, 172, 0.2)' },
      disconnected: { label: '✗ 断开', color: theme.status.error, bgcolor: 'rgba(244, 67, 54, 0.2)' },
      degraded: { label: '⚠ 降级', color: theme.status.warning, bgcolor: 'rgba(255, 167, 38, 0.2)' },
      disabled: { label: '⚠ 禁用', color: theme.status.warning, bgcolor: 'rgba(255, 167, 38, 0.2)' },
    };

    const config = statusConfig[status] || statusConfig.disconnected;

    return (
      <Chip
        label={config.label}
        size="small"
        sx={{
          mt: 1,
          bgcolor: config.bgcolor,
          color: config.color,
        }}
      />
    );
  };

  return (
    <Box>
      {/* 标题区域 */}
      <Typography
        variant="h4"
        sx={{
          fontWeight: 700,
          mb: 1,
          background: `linear-gradient(135deg, ${theme.brand.primary} 0%, ${theme.brand.accent} 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        Admin 管理后台
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        系统配置与管理功能
      </Typography>

      <Grid container spacing={3}>
        {/* API Keys 管理 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 1 : 0, mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  API Keys 管理
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <IconButton size="small" onClick={() => refetchApiKeys()} sx={{ minWidth: 44, minHeight: 44 }}>
                    <RefreshIcon />
                  </IconButton>
                  {isMobile ? (
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => setApiKeyDialogOpen(true)}
                      sx={{ minWidth: 44, minHeight: 44, bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}
                    >
                      <AddIcon />
                    </IconButton>
                  ) : (
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      size="small"
                      onClick={() => setApiKeyDialogOpen(true)}
                    >
                      添加密钥
                    </Button>
                  )}
                </Box>
              </Box>

              {apiKeysLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : apiKeysData && apiKeysData.items.length > 0 ? (
                <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>服务名</TableCell>
                        <TableCell>密钥名</TableCell>
                        <TableCell>状态</TableCell>
                        <TableCell align="right">操作</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {apiKeysData.items.map((key) => (
                        <TableRow key={key.id}>
                          <TableCell>{key.service_name}</TableCell>
                          <TableCell>{key.key_name}</TableCell>
                          <TableCell>
                            <Chip
                              label={key.is_active ? '启用' : '禁用'}
                              size="small"
                              color={key.is_active ? 'success' : 'default'}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteApiKey(key.id)}
                              sx={{ minWidth: 44, minHeight: 44 }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Alert severity="info">暂无API密钥，点击"添加密钥"创建</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* LLM Providers */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 1 : 0, mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  LLM Providers
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <IconButton size="small" onClick={() => refetchLLM()} sx={{ minWidth: 44, minHeight: 44 }}>
                    <RefreshIcon />
                  </IconButton>
                  {isMobile ? (
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => setLlmDialogOpen(true)}
                      sx={{ minWidth: 44, minHeight: 44, bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}
                    >
                      <AddIcon />
                    </IconButton>
                  ) : (
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      size="small"
                      onClick={() => setLlmDialogOpen(true)}
                    >
                      添加 Provider
                    </Button>
                  )}
                </Box>
              </Box>

              {llmLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : llmProvidersData && llmProvidersData.items.length > 0 ? (
                <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Provider</TableCell>
                        <TableCell>Model</TableCell>
                        <TableCell>状态</TableCell>
                        <TableCell align="right">操作</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {llmProvidersData.items.map((provider) => (
                        <TableRow key={provider.id}>
                          <TableCell>{provider.provider_name}</TableCell>
                          <TableCell>{provider.model_name}</TableCell>
                          <TableCell>
                            <Chip
                              label={provider.is_default ? '默认' : '备用'}
                              size="small"
                              color={provider.is_default ? 'primary' : 'default'}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteLLMProvider(provider.id)}
                              sx={{ minWidth: 44, minHeight: 44 }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Alert severity="info">暂无LLM Provider，点击"添加 Provider"创建</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 交易所配置 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                交易所配置
              </Typography>
              {exchangesLoading ? (
                <CircularProgress size={24} />
              ) : exchangeConfigsData && exchangeConfigsData.items.length > 0 ? (
                <Box sx={{ mt: 2 }}>
                  {exchangeConfigsData.items.map((exchange) => (
                    <Chip
                      key={exchange.id}
                      label={exchange.exchange_name}
                      size="small"
                      color="success"
                      sx={{ mr: 1, mb: 1 }}
                    />
                  ))}
                </Box>
              ) : (
                <Alert severity="info" sx={{ mt: 2 }}>暂无交易所配置</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 数据源配置 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                数据源配置
              </Typography>
              {dataSourcesLoading ? (
                <CircularProgress size={24} />
              ) : dataSourcesData && dataSourcesData.items.length > 0 ? (
                <Box sx={{ mt: 2 }}>
                  {dataSourcesData.items.map((source) => (
                    <Chip
                      key={source.id}
                      label={`${source.source_name} (${source.data_type})`}
                      size="small"
                      color={source.is_active ? 'success' : 'default'}
                      sx={{ mr: 1, mb: 1 }}
                    />
                  ))}
                </Box>
              ) : (
                <Alert severity="info" sx={{ mt: 2 }}>暂无数据源配置</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 系统健康状态 */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  系统健康状态
                </Typography>
                <IconButton size="small" onClick={() => refetchHealth()}>
                  <RefreshIcon />
                </IconButton>
              </Box>

              {healthLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress />
                </Box>
              ) : healthData ? (
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        PostgreSQL
                      </Typography>
                      {renderDatabaseStatus(healthData.databases.postgresql.status)}
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Redis
                      </Typography>
                      {renderDatabaseStatus(healthData.databases.redis.status)}
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        ClickHouse
                      </Typography>
                      {renderDatabaseStatus(healthData.databases.clickhouse.status)}
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Qdrant
                      </Typography>
                      {renderDatabaseStatus(healthData.databases.qdrant.status)}
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        MinIO
                      </Typography>
                      {renderDatabaseStatus(healthData.databases.minio.status)}
                    </Box>
                  </Grid>
                </Grid>
              ) : (
                <Alert severity="error">无法获取系统健康状态</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 添加API Key对话框 */}
      <Dialog open={apiKeyDialogOpen} onClose={() => setApiKeyDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>添加 API 密钥</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="服务名称"
              placeholder="例如: OpenAI, Binance, OKX"
              fullWidth
              value={apiKeyForm.service_name}
              onChange={(e) => setApiKeyForm({ ...apiKeyForm, service_name: e.target.value })}
            />
            <TextField
              label="密钥名称"
              placeholder="例如: Production Key"
              fullWidth
              value={apiKeyForm.key_name}
              onChange={(e) => setApiKeyForm({ ...apiKeyForm, key_name: e.target.value })}
            />
            <TextField
              label="API Key"
              type="password"
              fullWidth
              value={apiKeyForm.api_key}
              onChange={(e) => setApiKeyForm({ ...apiKeyForm, api_key: e.target.value })}
            />
            <TextField
              label="API Secret (可选)"
              type="password"
              fullWidth
              value={apiKeyForm.api_secret}
              onChange={(e) => setApiKeyForm({ ...apiKeyForm, api_secret: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: isMobile ? 2 : 1, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 1 : 0 }}>
          <Button onClick={() => setApiKeyDialogOpen(false)} fullWidth={isMobile} sx={{ minHeight: isMobile ? 44 : 'auto' }}>取消</Button>
          <Button
            onClick={handleCreateApiKey}
            variant="contained"
            fullWidth={isMobile}
            sx={{ minHeight: isMobile ? 44 : 'auto' }}
            disabled={!apiKeyForm.service_name || !apiKeyForm.key_name || !apiKeyForm.api_key}
          >
            创建
          </Button>
        </DialogActions>
      </Dialog>

      {/* 添加LLM Provider对话框 */}
      <Dialog open={llmDialogOpen} onClose={() => setLlmDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>添加 LLM Provider</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Provider 名称"
              placeholder="例如: OpenAI, Claude, DeepSeek"
              fullWidth
              value={llmForm.provider_name}
              onChange={(e) => setLlmForm({ ...llmForm, provider_name: e.target.value })}
            />
            <TextField
              label="Model 名称"
              placeholder="例如: gpt-4, claude-3-opus"
              fullWidth
              value={llmForm.model_name}
              onChange={(e) => setLlmForm({ ...llmForm, model_name: e.target.value })}
            />
            <TextField
              label="API Key ID"
              placeholder="输入已创建的API Key的ID"
              fullWidth
              value={llmForm.api_key_id}
              onChange={(e) => setLlmForm({ ...llmForm, api_key_id: e.target.value })}
              helperText="需要先创建对应的API Key"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={llmForm.is_default}
                  onChange={(e) => setLlmForm({ ...llmForm, is_default: e.target.checked })}
                />
              }
              label="设为默认 Provider"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: isMobile ? 2 : 1, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 1 : 0 }}>
          <Button onClick={() => setLlmDialogOpen(false)} fullWidth={isMobile} sx={{ minHeight: isMobile ? 44 : 'auto' }}>取消</Button>
          <Button
            onClick={handleCreateLLMProvider}
            variant="contained"
            fullWidth={isMobile}
            sx={{ minHeight: isMobile ? 44 : 'auto' }}
            disabled={!llmForm.provider_name || !llmForm.model_name || !llmForm.api_key_id}
          >
            创建
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
