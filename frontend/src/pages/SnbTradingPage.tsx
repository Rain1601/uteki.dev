import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Tabs,
  Tab,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  FormControl,
  RadioGroup,
  FormControlLabel,
  Radio,
  IconButton,
  Tooltip,
  Select,
  SelectChangeEvent,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  EditOutlined as EditIcon,
  NoteAdd as AddCommentIcon,
  Add as AddIcon,
  Close as CloseIcon,
  LockOutlined as LockIcon,
  QrCode2 as QrCodeIcon,
} from '@mui/icons-material';
import { useTheme } from '../theme/ThemeProvider';
import LoadingDots from '../components/LoadingDots';
import { useToast } from '../components/Toast';
import {
  SnbBalance,
  SnbPosition,
  SnbOrder,
  SnbTransaction,
  TotpSetupResult,
  fetchBalance,
  fetchPositions,
  fetchOrders,
  fetchTransactions,
  placeOrder,
  cancelOrder,
  upsertTransactionNote,
  fetchStatus,
  fetchTotpStatus,
  setupTotp,
  PlaceOrderParams,
} from '../api/snb';

export default function SnbTradingPage() {
  const { theme, isDark } = useTheme();
  const { showToast } = useToast();

  // Availability state
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [totpConfigured, setTotpConfigured] = useState<boolean | null>(null);
  const [totpSetup, setTotpSetup] = useState<TotpSetupResult | null>(null);
  const [totpSetupLoading, setTotpSetupLoading] = useState(false);

  // Data state
  const [balance, setBalance] = useState<SnbBalance | null>(null);
  const [positions, setPositions] = useState<SnbPosition[]>([]);
  const [orders, setOrders] = useState<SnbOrder[]>([]);
  const [transactions, setTransactions] = useState<SnbTransaction[]>([]);

  // Loading state
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState(0);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');

  // Order dialog
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [orderForm, setOrderForm] = useState<PlaceOrderParams>({
    symbol: '',
    side: 'BUY',
    quantity: 0,
    order_type: 'MKT',
    price: undefined,
    time_in_force: 'DAY',
    totp_code: '',
  });
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  // Cancel dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<string>('');
  const [cancelTotpCode, setCancelTotpCode] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // Notes dialog
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesTransaction, setNotesTransaction] = useState<SnbTransaction | null>(null);
  const [notesForm, setNotesForm] = useState<{ is_reasonable: boolean | null; notes: string }>({
    is_reasonable: null,
    notes: '',
  });
  const [notesSubmitting, setNotesSubmitting] = useState(false);

  // Fetch functions
  const loadBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const result = await fetchBalance();
      if (result.success && result.data) setBalance(result.data);
    } catch (e) {
      console.error('Failed to fetch balance:', e);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const loadPositions = useCallback(async () => {
    setPositionsLoading(true);
    try {
      const result = await fetchPositions();
      if (result.success && result.data) setPositions(result.data);
    } catch (e) {
      console.error('Failed to fetch positions:', e);
    } finally {
      setPositionsLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const result = await fetchOrders();
      if (result.success && result.data) setOrders(result.data);
    } catch (e) {
      console.error('Failed to fetch orders:', e);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    setTransactionsLoading(true);
    try {
      const result = await fetchTransactions(selectedSymbol || undefined);
      if (result.success && result.data) setTransactions(result.data);
    } catch (e) {
      console.error('Failed to fetch transactions:', e);
    } finally {
      setTransactionsLoading(false);
    }
  }, [selectedSymbol]);

  const refreshAll = useCallback(() => {
    loadBalance();
    if (activeTab === 0) {
      loadPositions();
      loadOrders();
    } else {
      loadTransactions();
    }
  }, [activeTab, loadBalance, loadPositions, loadOrders, loadTransactions]);

  // Check if SNB is configured (local env vars) + TOTP status
  useEffect(() => {
    fetchStatus()
      .then(() => {
        setConfigured(true);
        fetchTotpStatus().then((r) => setTotpConfigured(r.configured));
        loadBalance();
        loadPositions();
        loadOrders();
      })
      .catch((e: any) => {
        if (e.response?.status === 503) {
          setConfigured(false);
        } else {
          setConfigured(true);
          fetchTotpStatus().then((r) => setTotpConfigured(r.configured)).catch(() => {});
          loadBalance();
          loadPositions();
          loadOrders();
        }
      });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 1) loadTransactions();
  }, [activeTab, loadTransactions]);

  // TOTP setup handler
  const handleTotpSetup = async () => {
    setTotpSetupLoading(true);
    try {
      const result = await setupTotp();
      setTotpSetup(result);
      // 密钥已自动存入 DB（已登录用户），无需重启后端
      setTotpConfigured(true);
    } catch (e: any) {
      showToast('生成 TOTP 密钥失败', 'error');
    } finally {
      setTotpSetupLoading(false);
    }
  };

  // Order handlers
  const handlePlaceOrder = async () => {
    setOrderSubmitting(true);
    try {
      const result = await placeOrder(orderForm);
      if (result.success) {
        showToast('下单成功', 'success');
        setOrderDialogOpen(false);
        setOrderForm({ symbol: '', side: 'BUY', quantity: 0, order_type: 'MKT', price: undefined, time_in_force: 'DAY', totp_code: '' });
        loadOrders();
      } else {
        showToast(result.error || '下单失败', 'error');
      }
    } catch (e: any) {
      showToast(e.response?.data?.detail || '下单失败', 'error');
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleCancelOrder = async () => {
    setCancelSubmitting(true);
    try {
      const result = await cancelOrder(cancelOrderId, cancelTotpCode);
      if (result.success) {
        showToast('撤单成功', 'success');
        setCancelDialogOpen(false);
        setCancelTotpCode('');
        loadOrders();
      } else {
        showToast(result.error || '撤单失败', 'error');
      }
    } catch (e: any) {
      showToast(e.response?.data?.detail || '撤单失败', 'error');
    } finally {
      setCancelSubmitting(false);
    }
  };

  // Notes handlers
  const openNotesDialog = (tx: SnbTransaction) => {
    setNotesTransaction(tx);
    setNotesForm({
      is_reasonable: tx.note?.is_reasonable ?? null,
      notes: tx.note?.notes ?? '',
    });
    setNotesDialogOpen(true);
  };

  const handleSaveNote = async () => {
    if (!notesTransaction) return;
    setNotesSubmitting(true);
    try {
      const result = await upsertTransactionNote({
        account_id: notesTransaction.account_id,
        symbol: notesTransaction.symbol,
        trade_time: notesTransaction.trade_time,
        side: notesTransaction.side,
        is_reasonable: notesForm.is_reasonable,
        notes: notesForm.notes,
      });
      if (result.success) {
        showToast('备注已保存', 'success');
        setNotesDialogOpen(false);
        loadTransactions();
      } else {
        showToast(result.error || '保存失败', 'error');
      }
    } catch (e: any) {
      showToast('保存失败', 'error');
    } finally {
      setNotesSubmitting(false);
    }
  };

  // Position action helpers
  const openBuyDialog = (symbol: string) => {
    setOrderForm({ symbol, side: 'BUY', quantity: 0, order_type: 'MKT', price: undefined, time_in_force: 'DAY', totp_code: '' });
    setOrderDialogOpen(true);
  };

  const openSellDialog = (symbol: string, quantity: number) => {
    setOrderForm({ symbol, side: 'SELL', quantity, order_type: 'MKT', price: undefined, time_in_force: 'DAY', totp_code: '' });
    setOrderDialogOpen(true);
  };

  const openStopLossDialog = (symbol: string, quantity: number) => {
    setOrderForm({ symbol, side: 'SELL', quantity, order_type: 'LMT', price: undefined, time_in_force: 'GTC', totp_code: '' });
    setOrderDialogOpen(true);
  };

  // Helpers
  const formatCurrency = (v: number | undefined) =>
    v != null ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '--';

  const formatPnl = (v: number) => {
    const formatted = formatCurrency(Math.abs(v));
    return v >= 0 ? `+${formatted}` : `-${formatted}`;
  };

  const pnlColor = (v: number) => (v >= 0 ? '#4caf50' : '#f44336');

  const uniqueSymbols = [...new Set(transactions.map((t) => t.symbol))].sort();

  // TOTP input helper
  const totpInputProps = {
    inputProps: { maxLength: 6, inputMode: 'numeric' as const, pattern: '[0-9]*', style: { letterSpacing: 6, fontFamily: 'monospace', fontSize: 18, textAlign: 'center' as const } },
    InputLabelProps: { sx: { color: theme.text.muted } },
  };

  // Styles
  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const cardBorder = `1px solid ${theme.border.subtle}`;
  const tableCellSx = { color: theme.text.primary, borderBottom: `1px solid ${theme.border.subtle}`, fontSize: 13, py: 1.2 };
  const tableHeadSx = { color: theme.text.muted, borderBottom: `1px solid ${theme.border.default}`, fontSize: 12, fontWeight: 600, py: 1 };

  // Not configured — show local-only notice
  if (configured === false) {
    return (
      <Box
        sx={{
          m: -3, height: 'calc(100vh - 48px)', width: 'calc(100% + 48px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          bgcolor: theme.background.primary, color: theme.text.primary, p: 3,
        }}
      >
        <LockIcon sx={{ fontSize: 48, color: theme.text.muted, mb: 2 }} />
        <Typography sx={{ fontSize: 20, fontWeight: 600, mb: 1 }}>雪盈证券 · 仅限本地使用</Typography>
        <Typography sx={{ fontSize: 14, color: theme.text.muted, textAlign: 'center', maxWidth: 480, lineHeight: 1.8 }}>
          此功能需要在本地部署环境中配置雪盈证券 API 密钥才能使用。
          远端部署不提供此功能，以确保交易密钥的安全性。
        </Typography>
        <Box sx={{ mt: 3, p: 2, bgcolor: cardBg, borderRadius: 2, border: cardBorder }}>
          <Typography sx={{ fontSize: 13, color: theme.text.secondary, fontFamily: 'monospace' }}>
            SNB_ACCOUNT=your_account_id<br />
            SNB_API_KEY=your_api_key<br />
            SNB_ENV=prod
          </Typography>
        </Box>
      </Box>
    );
  }

  // Still checking
  if (configured === null) {
    return (
      <Box sx={{ m: -3, height: 'calc(100vh - 48px)', width: 'calc(100% + 48px)', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: theme.background.primary }}>
        <LoadingDots text="检查 SNB 配置" fontSize={14} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        m: -3, height: 'calc(100vh - 48px)', width: 'calc(100% + 48px)',
        display: 'flex', flexDirection: 'column',
        bgcolor: theme.background.primary, color: theme.text.primary, overflow: 'hidden', p: 3,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, pb: 2, borderBottom: `1px solid ${theme.border.subtle}` }}>
        <Typography sx={{ fontSize: 24, fontWeight: 600, color: theme.text.primary }}>
          雪盈证券 · 美股交易
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setOrderDialogOpen(true)}
            sx={{
              bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none',
              fontWeight: 600, fontSize: 13, borderRadius: 2, px: 2,
              '&:hover': { bgcolor: theme.brand.hover },
            }}
          >
            创建订单
          </Button>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={refreshAll}
            sx={{
              bgcolor: isDark ? 'rgba(100,149,237,0.15)' : 'rgba(100,149,237,0.08)',
              color: theme.brand.primary,
              border: `1px solid ${isDark ? 'rgba(100,149,237,0.3)' : 'rgba(100,149,237,0.2)'}`,
              textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: 2, px: 2,
              '&:hover': { bgcolor: isDark ? 'rgba(100,149,237,0.25)' : 'rgba(100,149,237,0.15)' },
            }}
          >
            刷新
          </Button>
        </Box>
      </Box>

      {/* Balance Dashboard */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {[
          { label: '总资产', value: balance?.total_value, loading: balanceLoading },
          { label: '现金', value: balance?.cash, loading: balanceLoading },
          { label: '持仓市值', value: balance?.market_value, loading: balanceLoading },
          { label: '可用资金', value: balance?.available_funds ?? balance?.cash, loading: balanceLoading },
        ].map((item) => (
          <Grid item xs={6} md={3} key={item.label}>
            <Box sx={{ bgcolor: cardBg, border: cardBorder, borderRadius: 2, p: 2 }}>
              <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 0.5 }}>{item.label}</Typography>
              {item.loading ? (
                <LoadingDots text="" fontSize={14} />
              ) : (
                <Typography sx={{ fontSize: 20, fontWeight: 600, color: theme.text.primary }}>
                  {formatCurrency(item.value)}
                </Typography>
              )}
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          minHeight: 36, mb: 2,
          '& .MuiTab-root': { color: theme.text.muted, textTransform: 'none', fontWeight: 600, fontSize: 14, minHeight: 36, py: 0 },
          '& .Mui-selected': { color: theme.brand.primary },
          '& .MuiTabs-indicator': { bgcolor: theme.brand.primary },
        }}
      >
        <Tab label="持仓与订单" />
        <Tab label="交易历史" />
      </Tabs>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 0 ? (
          <Box>
            {/* Positions Table */}
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.secondary, mb: 1 }}>持仓</Typography>
            {positionsLoading ? (
              <Box sx={{ p: 3, textAlign: 'center' }}><LoadingDots text="加载持仓" fontSize={14} /></Box>
            ) : positions.length === 0 ? (
              <Typography sx={{ p: 3, textAlign: 'center', color: theme.text.muted, fontSize: 14 }}>暂无持仓</Typography>
            ) : (
              <TableContainer sx={{ mb: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {['代码', '数量', '均价', '现价', '市值', '盈亏', '收益率', '操作'].map((h) => (
                        <TableCell key={h} sx={tableHeadSx}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {positions.map((pos, i) => {
                      const returnPct = pos.cost > 0 ? ((pos.unrealized_pnl / pos.cost) * 100) : 0;
                      return (
                        <TableRow key={i}>
                          <TableCell sx={{ ...tableCellSx, fontWeight: 600 }}>{pos.symbol}</TableCell>
                          <TableCell sx={tableCellSx}>{pos.quantity}</TableCell>
                          <TableCell sx={tableCellSx}>{formatCurrency(pos.average_price)}</TableCell>
                          <TableCell sx={tableCellSx}>{formatCurrency(pos.market_price)}</TableCell>
                          <TableCell sx={tableCellSx}>{formatCurrency(pos.market_value)}</TableCell>
                          <TableCell sx={{ ...tableCellSx, color: pnlColor(pos.unrealized_pnl), fontWeight: 600 }}>
                            {formatPnl(pos.unrealized_pnl)}
                          </TableCell>
                          <TableCell sx={{ ...tableCellSx, color: pnlColor(returnPct) }}>
                            {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
                          </TableCell>
                          <TableCell sx={{ ...tableCellSx, whiteSpace: 'nowrap' }}>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <Button
                                size="small"
                                onClick={() => openBuyDialog(pos.symbol)}
                                sx={{ color: '#4caf50', textTransform: 'none', fontSize: 12, minWidth: 'auto', p: '2px 8px', '&:hover': { bgcolor: 'rgba(76,175,80,0.1)' } }}
                              >
                                加仓
                              </Button>
                              <Button
                                size="small"
                                onClick={() => openStopLossDialog(pos.symbol, pos.quantity)}
                                sx={{ color: '#ff9800', textTransform: 'none', fontSize: 12, minWidth: 'auto', p: '2px 8px', '&:hover': { bgcolor: 'rgba(255,152,0,0.1)' } }}
                              >
                                止损
                              </Button>
                              <Button
                                size="small"
                                onClick={() => openSellDialog(pos.symbol, pos.quantity)}
                                sx={{ color: '#f44336', textTransform: 'none', fontSize: 12, minWidth: 'auto', p: '2px 8px', '&:hover': { bgcolor: 'rgba(244,67,54,0.1)' } }}
                              >
                                卖出
                              </Button>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* Orders Table */}
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.secondary, mb: 1 }}>订单</Typography>
            {ordersLoading ? (
              <Box sx={{ p: 3, textAlign: 'center' }}><LoadingDots text="加载订单" fontSize={14} /></Box>
            ) : orders.length === 0 ? (
              <Typography sx={{ p: 3, textAlign: 'center', color: theme.text.muted, fontSize: 14 }}>暂无订单</Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {['代码', '方向', '类型', '数量', '价格', '状态', '操作'].map((h) => (
                        <TableCell key={h} sx={tableHeadSx}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orders.map((order, i) => (
                      <TableRow key={i}>
                        <TableCell sx={{ ...tableCellSx, fontWeight: 600 }}>{order.symbol}</TableCell>
                        <TableCell sx={tableCellSx}>
                          <Chip
                            label={order.side} size="small"
                            sx={{
                              bgcolor: order.side === 'BUY' ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)',
                              color: order.side === 'BUY' ? '#4caf50' : '#f44336',
                              fontWeight: 600, fontSize: 11, height: 22,
                            }}
                          />
                        </TableCell>
                        <TableCell sx={tableCellSx}>{order.order_type}</TableCell>
                        <TableCell sx={tableCellSx}>{order.quantity}</TableCell>
                        <TableCell sx={tableCellSx}>{order.price ? formatCurrency(order.price) : 'MKT'}</TableCell>
                        <TableCell sx={tableCellSx}>
                          <Chip label={order.status} size="small" sx={{ fontSize: 11, height: 22, bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: theme.text.secondary }} />
                        </TableCell>
                        <TableCell sx={tableCellSx}>
                          {(order.status === 'PENDING' || order.status === 'NEW' || order.status === 'SUBMITTED') && (
                            <Button
                              size="small"
                              onClick={() => { setCancelOrderId(order.order_id); setCancelTotpCode(''); setCancelDialogOpen(true); }}
                              sx={{ color: '#f44336', textTransform: 'none', fontSize: 12, minWidth: 'auto', p: '2px 8px' }}
                            >
                              取消
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        ) : (
          <Box>
            {/* Symbol filter */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Typography sx={{ fontSize: 13, color: theme.text.muted }}>筛选:</Typography>
              <Select
                size="small" value={selectedSymbol}
                onChange={(e: SelectChangeEvent) => setSelectedSymbol(e.target.value)}
                displayEmpty
                sx={{
                  minWidth: 120, fontSize: 13, color: theme.text.primary,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.border.default },
                  '& .MuiSelect-icon': { color: theme.text.muted },
                }}
              >
                <MenuItem value="">全部</MenuItem>
                {uniqueSymbols.map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </Select>
            </Box>

            {/* Transactions Table */}
            {transactionsLoading ? (
              <Box sx={{ p: 3, textAlign: 'center' }}><LoadingDots text="加载交易记录" fontSize={14} /></Box>
            ) : transactions.length === 0 ? (
              <Typography sx={{ p: 3, textAlign: 'center', color: theme.text.muted, fontSize: 14 }}>暂无交易记录</Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {['代码', '方向', '数量', '价格', '佣金', '总额', '时间', '评价', '操作'].map((h) => (
                        <TableCell key={h} sx={tableHeadSx}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {transactions.map((tx) => {
                      const total = tx.quantity * tx.price;
                      const time = new Date(tx.trade_time).toLocaleString('zh-CN');
                      return (
                        <TableRow key={tx.id}>
                          <TableCell sx={{ ...tableCellSx, fontWeight: 600 }}>{tx.symbol}</TableCell>
                          <TableCell sx={tableCellSx}>
                            <Chip
                              label={tx.side} size="small"
                              sx={{
                                bgcolor: tx.side === 'BUY' ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)',
                                color: tx.side === 'BUY' ? '#4caf50' : '#f44336',
                                fontWeight: 600, fontSize: 11, height: 22,
                              }}
                            />
                          </TableCell>
                          <TableCell sx={tableCellSx}>{tx.quantity}</TableCell>
                          <TableCell sx={tableCellSx}>{formatCurrency(tx.price)}</TableCell>
                          <TableCell sx={tableCellSx}>{tx.commission != null ? formatCurrency(tx.commission) : '--'}</TableCell>
                          <TableCell sx={tableCellSx}>{formatCurrency(total)}</TableCell>
                          <TableCell sx={{ ...tableCellSx, fontSize: 12 }}>{time}</TableCell>
                          <TableCell sx={tableCellSx}>
                            {tx.note?.is_reasonable != null ? (
                              <Chip
                                label={tx.note.is_reasonable ? '合理' : '不合理'} size="small"
                                sx={{
                                  bgcolor: tx.note.is_reasonable ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)',
                                  color: tx.note.is_reasonable ? '#4caf50' : '#f44336',
                                  fontSize: 11, height: 22,
                                }}
                              />
                            ) : (
                              <Typography sx={{ color: theme.text.muted, fontSize: 12 }}>--</Typography>
                            )}
                          </TableCell>
                          <TableCell sx={tableCellSx}>
                            <Tooltip title={tx.note ? '编辑备注' : '添加备注'}>
                              <IconButton size="small" onClick={() => openNotesDialog(tx)} sx={{ color: theme.text.muted }}>
                                {tx.note ? <EditIcon fontSize="small" /> : <AddCommentIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </Box>

      {/* Create Order Dialog */}
      <Dialog open={orderDialogOpen} onClose={() => setOrderDialogOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { bgcolor: theme.background.secondary, color: theme.text.primary } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          创建订单
          <IconButton size="small" onClick={() => setOrderDialogOpen(false)} sx={{ color: theme.text.muted }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField label="股票代码" size="small" value={orderForm.symbol}
            onChange={(e) => setOrderForm({ ...orderForm, symbol: e.target.value.toUpperCase() })}
            InputProps={{ sx: { color: theme.text.primary } }} InputLabelProps={{ sx: { color: theme.text.muted } }} />
          <TextField label="方向" select size="small" value={orderForm.side}
            onChange={(e) => setOrderForm({ ...orderForm, side: e.target.value })}
            InputProps={{ sx: { color: theme.text.primary } }} InputLabelProps={{ sx: { color: theme.text.muted } }}>
            <MenuItem value="BUY">买入 (BUY)</MenuItem>
            <MenuItem value="SELL">卖出 (SELL)</MenuItem>
          </TextField>
          <TextField label="订单类型" select size="small" value={orderForm.order_type}
            onChange={(e) => setOrderForm({ ...orderForm, order_type: e.target.value })}
            InputProps={{ sx: { color: theme.text.primary } }} InputLabelProps={{ sx: { color: theme.text.muted } }}>
            <MenuItem value="MKT">市价 (MKT)</MenuItem>
            <MenuItem value="LMT">限价 (LMT)</MenuItem>
          </TextField>
          <TextField label="数量" type="number" size="small" value={orderForm.quantity || ''}
            onChange={(e) => setOrderForm({ ...orderForm, quantity: Number(e.target.value) })}
            InputProps={{ sx: { color: theme.text.primary } }} InputLabelProps={{ sx: { color: theme.text.muted } }} />
          {orderForm.order_type === 'LMT' && (
            <TextField label="限价" type="number" size="small" value={orderForm.price || ''}
              onChange={(e) => setOrderForm({ ...orderForm, price: Number(e.target.value) || undefined })}
              InputProps={{ sx: { color: theme.text.primary } }} InputLabelProps={{ sx: { color: theme.text.muted } }} />
          )}
          <TextField label="有效期" select size="small" value={orderForm.time_in_force}
            onChange={(e) => setOrderForm({ ...orderForm, time_in_force: e.target.value })}
            InputProps={{ sx: { color: theme.text.primary } }} InputLabelProps={{ sx: { color: theme.text.muted } }}>
            <MenuItem value="DAY">当日 (DAY)</MenuItem>
            <MenuItem value="GTC">撤销前有效 (GTC)</MenuItem>
          </TextField>
          {/* TOTP Code or Setup */}
          {totpConfigured === false ? (
            <TotpSetupInline
              theme={theme} isDark={isDark} cardBg={cardBg} cardBorder={cardBorder}
              totpSetup={totpSetup} totpSetupLoading={totpSetupLoading}
              onSetup={handleTotpSetup}
              onDone={() => { setTotpSetup(null); setTotpConfigured(true); }}
            />
          ) : (
            <Box>
              <TextField
                label="验证码 (Google Authenticator)"
                size="small"
                fullWidth
                value={orderForm.totp_code}
                onChange={(e) => setOrderForm({ ...orderForm, totp_code: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                placeholder="000000"
                {...totpInputProps}
              />
              <Typography sx={{ fontSize: 11, color: theme.text.muted, mt: 0.5, lineHeight: 1.5 }}>
                打开手机 Google Authenticator App，输入当前显示的 6 位数字验证码
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOrderDialogOpen(false)} sx={{ color: theme.text.muted, textTransform: 'none' }}>取消</Button>
          <Button
            onClick={handlePlaceOrder}
            disabled={orderSubmitting || !orderForm.symbol || !orderForm.quantity || orderForm.totp_code.length !== 6 || totpConfigured === false}
            sx={{ bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: theme.brand.hover } }}
          >
            {orderSubmitting ? <LoadingDots text="提交中" fontSize={13} color="#fff" /> : '确认下单'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cancel Order Dialog */}
      <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)} maxWidth="xs"
        PaperProps={{ sx: { bgcolor: theme.background.secondary, color: theme.text.primary } }}>
        <DialogTitle>确认撤单</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography sx={{ color: theme.text.secondary, fontSize: 14 }}>
            确定要撤销订单 {cancelOrderId} 吗？
          </Typography>
          {/* TOTP Code or Setup */}
          {totpConfigured === false ? (
            <TotpSetupInline
              theme={theme} isDark={isDark} cardBg={cardBg} cardBorder={cardBorder}
              totpSetup={totpSetup} totpSetupLoading={totpSetupLoading}
              onSetup={handleTotpSetup}
              onDone={() => { setTotpSetup(null); setTotpConfigured(true); }}
            />
          ) : (
            <Box>
              <TextField
                label="验证码 (Google Authenticator)"
                size="small"
                fullWidth
                value={cancelTotpCode}
                onChange={(e) => setCancelTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                {...totpInputProps}
              />
              <Typography sx={{ fontSize: 11, color: theme.text.muted, mt: 0.5, lineHeight: 1.5 }}>
                打开手机 Google Authenticator App，输入当前显示的 6 位数字验证码
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelDialogOpen(false)} sx={{ color: theme.text.muted, textTransform: 'none' }}>取消</Button>
          <Button
            onClick={handleCancelOrder}
            disabled={cancelSubmitting || cancelTotpCode.length !== 6 || totpConfigured === false}
            sx={{ bgcolor: '#f44336', color: '#fff', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#d32f2f' } }}
          >
            {cancelSubmitting ? <LoadingDots text="撤销中" fontSize={13} color="#fff" /> : '确认撤单'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={notesDialogOpen} onClose={() => setNotesDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { bgcolor: theme.background.secondary, color: theme.text.primary } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          交易备注
          <IconButton size="small" onClick={() => setNotesDialogOpen(false)} sx={{ color: theme.text.muted }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {notesTransaction && (
            <Box sx={{ mb: 2.5, p: 2, bgcolor: cardBg, borderRadius: 1.5, border: cardBorder }}>
              <Typography sx={{ fontSize: 13, color: theme.text.secondary }}>
                {notesTransaction.symbol} · {notesTransaction.side} · {notesTransaction.quantity}股 @ {formatCurrency(notesTransaction.price)}
              </Typography>
              <Typography sx={{ fontSize: 12, color: theme.text.muted, mt: 0.5 }}>
                {new Date(notesTransaction.trade_time).toLocaleString('zh-CN')}
              </Typography>
            </Box>
          )}
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary, mb: 1 }}>交易评价</Typography>
          <FormControl>
            <RadioGroup
              row
              value={notesForm.is_reasonable === null ? '' : String(notesForm.is_reasonable)}
              onChange={(e) => {
                const val = e.target.value;
                setNotesForm({ ...notesForm, is_reasonable: val === '' ? null : val === 'true' });
              }}
            >
              <FormControlLabel value="true" control={<Radio size="small" />} label="合理" sx={{ '& .MuiTypography-root': { fontSize: 13, color: theme.text.primary } }} />
              <FormControlLabel value="false" control={<Radio size="small" />} label="不合理" sx={{ '& .MuiTypography-root': { fontSize: 13, color: theme.text.primary } }} />
              <FormControlLabel value="" control={<Radio size="small" />} label="未评价" sx={{ '& .MuiTypography-root': { fontSize: 13, color: theme.text.muted } }} />
            </RadioGroup>
          </FormControl>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary, mt: 2, mb: 1 }}>备注内容</Typography>
          <TextField
            multiline rows={4} fullWidth size="small"
            placeholder="记录交易思路、复盘分析..."
            value={notesForm.notes}
            onChange={(e) => setNotesForm({ ...notesForm, notes: e.target.value })}
            InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNotesDialogOpen(false)} sx={{ color: theme.text.muted, textTransform: 'none' }}>取消</Button>
          <Button
            onClick={handleSaveNote}
            disabled={notesSubmitting}
            sx={{ bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: theme.brand.hover } }}
          >
            {notesSubmitting ? <LoadingDots text="保存中" fontSize={13} color="#fff" /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ─── Inline TOTP Setup (shown inside order/cancel dialogs) ─── */

function TotpSetupInline({ theme, isDark, cardBg, cardBorder, totpSetup, totpSetupLoading, onSetup, onDone }: {
  theme: any; isDark: boolean; cardBg: string; cardBorder: string;
  totpSetup: TotpSetupResult | null; totpSetupLoading: boolean;
  onSetup: () => void; onDone: () => void;
}) {
  if (totpSetup) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 1 }}>
        <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 2 }}>
          <img src={totpSetup.qr_code_base64} alt="TOTP QR Code" style={{ width: 160, height: 160, display: 'block' }} />
        </Box>
        <Box sx={{ p: 1.5, bgcolor: cardBg, borderRadius: 1.5, border: cardBorder, width: '100%', textAlign: 'center' }}>
          <Typography sx={{ fontSize: 11, color: theme.text.muted, mb: 0.5 }}>或手动输入密钥:</Typography>
          <Typography sx={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 600, color: theme.text.primary, letterSpacing: 1.5 }}>
            {totpSetup.secret}
          </Typography>
        </Box>
        <Button onClick={onDone} size="small"
          sx={{ bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none', fontWeight: 600, borderRadius: 2, '&:hover': { bgcolor: theme.brand.hover } }}>
          已扫描，继续下单
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, bgcolor: isDark ? 'rgba(255,193,7,0.06)' : 'rgba(255,193,7,0.04)', borderRadius: 2, border: `1px solid ${isDark ? 'rgba(255,193,7,0.2)' : 'rgba(255,193,7,0.15)'}`, textAlign: 'center' }}>
      <QrCodeIcon sx={{ fontSize: 32, color: theme.brand.primary, mb: 1 }} />
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.primary, mb: 0.5 }}>
        需要设置二次验证
      </Typography>
      <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 1.5, lineHeight: 1.6 }}>
        下单和撤单需要 Google Authenticator 验证码保护，请先完成设置。
      </Typography>
      <Button onClick={onSetup} disabled={totpSetupLoading} size="small"
        sx={{ bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none', fontWeight: 600, borderRadius: 2, '&:hover': { bgcolor: theme.brand.hover } }}>
        {totpSetupLoading ? <LoadingDots text="生成中" fontSize={12} color="#fff" /> : '生成 TOTP 密钥'}
      </Button>
    </Box>
  );
}
