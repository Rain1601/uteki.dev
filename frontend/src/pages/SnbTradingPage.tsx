import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { RefreshCw as RefreshIcon, Pencil as EditIcon, FilePlus as AddCommentIcon, Plus as AddIcon, X as CloseIcon, Lock as LockIcon, QrCode as QrCodeIcon } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import LoadingDots from '../components/LoadingDots';
import PortfolioPie from '../components/snb/PortfolioPie';
import { toast } from 'sonner';

// ── Editorial-finance type stack ──────────────────────────────────────────
// Display: Fraunces (variable serif w/ optical sizing + SOFT axis)
// Body:    Newsreader (warm body serif)
// Numbers: JetBrains Mono (tabular figures)
const FONT_DISPLAY = "'Fraunces', 'Newsreader', Georgia, 'Times New Roman', serif";
const FONT_BODY = "'Newsreader', Georgia, serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

// Refined accents — softer than UI standard greens/reds, magazine-grade
const COLOR_GAIN = '#6FAF8D';
const COLOR_LOSS = '#B0524A';
const COLOR_NEUTRAL = '#C9A97E';   // amber accent — for hold / pending
const COLOR_INK = '#F4ECDF';      // warm off-white
const COLOR_INK_MUTED = '#A8A097'; // warm gray
const COLOR_INK_FAINT = '#5C5750';
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
  const { theme: baseTheme, isDark } = useTheme();
  // Editorial theme override — same shape, warm dark palette so all
  // `theme.X` references downstream (1389-line page + dialogs) inherit
  // the editorial-finance look without per-line edits.
  const theme = {
    ...baseTheme,
    mode: 'dark' as const,
    background: {
      ...baseTheme.background,
      primary: '#15130F',
      secondary: '#1B1814',
      tertiary: '#221E18',
    },
    text: {
      ...baseTheme.text,
      primary: COLOR_INK,
      secondary: '#D8CFBF',
      muted: COLOR_INK_MUTED,
      disabled: COLOR_INK_FAINT,
    },
    border: {
      ...baseTheme.border,
      subtle: '#2A2620',
      default: '#3A342D',
      divider: '#2A2620',
    },
    brand: {
      ...baseTheme.brand,
      primary: COLOR_NEUTRAL,  // amber accent
      hover: '#D9BB91',
    },
  };

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
      toast.error('生成 TOTP 密钥失败');
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
        toast.success('下单成功');
        setOrderDialogOpen(false);
        setOrderForm({ symbol: '', side: 'BUY', quantity: 0, order_type: 'MKT', price: undefined, time_in_force: 'DAY', totp_code: '' });
        loadOrders();
      } else {
        toast.error(result.error || '下单失败');
      }
    } catch (e: any) {
      toast.error(e.response?.data?.detail || '下单失败');
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleCancelOrder = async () => {
    setCancelSubmitting(true);
    try {
      const result = await cancelOrder(cancelOrderId, cancelTotpCode);
      if (result.success) {
        toast.success('撤单成功');
        setCancelDialogOpen(false);
        setCancelTotpCode('');
        loadOrders();
      } else {
        toast.error(result.error || '撤单失败');
      }
    } catch (e: any) {
      toast.error(e.response?.data?.detail || '撤单失败');
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
        toast.success('备注已保存');
        setNotesDialogOpen(false);
        loadTransactions();
      } else {
        toast.error(result.error || '保存失败');
      }
    } catch (e: any) {
      toast.error('保存失败');
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

  const pnlColor = (v: number) => (v >= 0 ? COLOR_GAIN : COLOR_LOSS);
  void pnlColor; // retained for transactions table below

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

  // Portfolio aggregate stats — derived from current positions only (unrealized P&L on held positions).
  // Note: this is "持仓收益率" (return on currently held positions), not full account return —
  // it doesn't account for closed positions, dividends, or interest costs.
  const portfolioStats = useMemo(() => {
    if (!positions || positions.length === 0) {
      return { totalCost: 0, totalMarket: 0, totalPnl: 0, returnPct: 0, count: 0 };
    }
    let totalCost = 0;
    let totalMarket = 0;
    let totalPnl = 0;
    for (const p of positions) {
      const cost = (typeof p.cost === 'number' && p.cost > 0)
        ? p.cost
        : (p.quantity || 0) * (p.average_price || 0);
      totalCost += cost;
      totalMarket += p.market_value || 0;
      totalPnl += p.unrealized_pnl || 0;
    }
    const returnPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    return { totalCost, totalMarket, totalPnl, returnPct, count: positions.length };
  }, [positions]);

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
        <LockIcon size={48} style={{ color: theme.text.muted, marginBottom: 16 }} />
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

  // Editorial palette pulled from constants for terse use below
  const pnlSign = portfolioStats.totalPnl >= 0;
  const dateLine = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <Box
      sx={{
        m: -3,
        minHeight: 'calc(100vh - 48px)',
        width: 'calc(100% + 48px)',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#15130F',
        color: COLOR_INK,
        overflow: 'auto',
        // Subtle paper-grain backdrop and warm ambient glow
        backgroundImage: `
          radial-gradient(ellipse 1200px 600px at 12% -10%, rgba(168,137,110,0.06), transparent 60%),
          radial-gradient(ellipse 800px 500px at 95% 105%, rgba(91,123,106,0.05), transparent 65%),
          repeating-linear-gradient(0deg, rgba(255,255,255,0.005) 0 1px, transparent 1px 3px)
        `,
        px: { xs: 3, md: 5 },
        py: { xs: 3, md: 4 },
        fontFamily: FONT_BODY,
      }}
    >
      {/* ── Editorial masthead ────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          mb: 4,
          pb: 2,
          borderBottom: `1px solid ${COLOR_INK_FAINT}`,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: COLOR_INK_MUTED,
              mb: 0.5,
            }}
          >
            Snowball Securities — US Equities
          </Typography>
          <Typography
            sx={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 400,
              fontStyle: 'italic',
              fontSize: { xs: 36, md: 52 },
              letterSpacing: '-0.025em',
              color: COLOR_INK,
              lineHeight: 1,
              fontVariationSettings: '"opsz" 144, "SOFT" 60, "WONK" 1',
            }}
          >
            雪盈证券
            <Box component="span" sx={{ color: COLOR_INK_FAINT, mx: 1.5, fontStyle: 'normal' }}>·</Box>
            <Box component="span" sx={{ fontStyle: 'normal', fontWeight: 300 }}>美股</Box>
          </Typography>
          <Typography
            sx={{
              fontFamily: FONT_BODY,
              fontStyle: 'italic',
              fontSize: 13,
              color: COLOR_INK_MUTED,
              mt: 1,
              letterSpacing: '0.01em',
            }}
          >
            {dateLine}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center' }}>
          <Button
            onClick={refreshAll}
            startIcon={<RefreshIcon size={13} />}
            sx={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: COLOR_INK_MUTED,
              border: `1px solid ${COLOR_INK_FAINT}`,
              borderRadius: 0,
              px: 2,
              py: 0.75,
              '&:hover': {
                borderColor: COLOR_INK,
                color: COLOR_INK,
                bgcolor: 'transparent',
              },
            }}
          >
            Refresh
          </Button>
          <Button
            onClick={() => setOrderDialogOpen(true)}
            startIcon={<AddIcon size={13} />}
            sx={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#15130F',
              bgcolor: COLOR_INK,
              borderRadius: 0,
              px: 2,
              py: 0.75,
              '&:hover': { bgcolor: '#FFF8EA' },
            }}
          >
            New Order
          </Button>
        </Box>
      </Box>

      {/* ── Hero panel: 总资产 dominant + 3 secondary stacked ─────────── */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.7fr 1fr' },
          gap: { xs: 3, md: 5 },
          mb: 4.5,
        }}
      >
        {/* HERO: total assets */}
        <Box>
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: COLOR_INK_MUTED,
              mb: 1,
            }}
          >
            总资产 — Total Assets
          </Typography>
          {balanceLoading ? (
            <LoadingDots text="" fontSize={14} />
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography
                  sx={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 300,
                    fontSize: { xs: 56, md: 84 },
                    letterSpacing: '-0.04em',
                    color: COLOR_INK,
                    fontFeatureSettings: '"tnum", "lnum"',
                    fontVariationSettings: '"opsz" 144, "SOFT" 30',
                    lineHeight: 0.95,
                  }}
                >
                  {balance?.total_value !== undefined
                    ? formatCurrency(balance.total_value)
                    : '—'}
                </Typography>
              </Box>
              {portfolioStats.count > 0 && (
                <Typography
                  sx={{
                    mt: 1.5,
                    fontFamily: FONT_BODY,
                    fontStyle: 'italic',
                    fontSize: 14,
                    color: COLOR_INK_MUTED,
                    maxWidth: 480,
                    lineHeight: 1.55,
                  }}
                >
                  {portfolioStats.count} positions, with a combined unrealised return of{' '}
                  <Box
                    component="span"
                    sx={{
                      fontFamily: FONT_DISPLAY,
                      fontStyle: 'italic',
                      fontWeight: 600,
                      color: pnlSign ? COLOR_GAIN : COLOR_LOSS,
                    }}
                  >
                    {pnlSign ? '+' : ''}{portfolioStats.returnPct.toFixed(2)}%
                  </Box>{' '}
                  on{' '}
                  <Box component="span" sx={{ fontFamily: FONT_MONO, fontFeatureSettings: '"tnum"' }}>
                    {formatCurrency(portfolioStats.totalCost)}
                  </Box>{' '}
                  cost basis.
                </Typography>
              )}
            </>
          )}
        </Box>

        {/* Secondary stats stacked */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(3, 1fr)', md: '1fr' },
            gap: { xs: 2, md: 0 },
            alignContent: 'end',
          }}
        >
          {[
            { label: '现金', en: 'Cash', value: balance?.cash },
            { label: '持仓市值', en: 'Market Value', value: balance?.market_value },
            { label: '可用资金', en: 'Available', value: balance?.available_funds ?? balance?.cash },
          ].map((it, i) => (
            <Box
              key={it.label}
              sx={{
                py: 1.25,
                borderTop: { md: i === 0 ? `1px solid ${COLOR_INK_FAINT}` : 'none' },
                borderBottom: { md: `1px solid ${COLOR_INK_FAINT}` },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  flexDirection: { xs: 'column', md: 'row' },
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      fontFamily: FONT_BODY,
                      fontStyle: 'italic',
                      fontSize: 13,
                      color: COLOR_INK,
                    }}
                  >
                    {it.label}
                  </Typography>
                  <Typography
                    sx={{
                      fontFamily: FONT_MONO,
                      fontSize: 9,
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      color: COLOR_INK_FAINT,
                    }}
                  >
                    {it.en}
                  </Typography>
                </Box>
                <Typography
                  sx={{
                    fontFamily: FONT_MONO,
                    fontSize: { xs: 18, md: 22 },
                    fontWeight: 400,
                    color: COLOR_INK,
                    fontFeatureSettings: '"tnum"',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {balanceLoading ? '…' : formatCurrency(it.value)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── Performance panel: P&L headline + pie ─────────────────────── */}
      {portfolioStats.count > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1.2fr' },
            gap: { xs: 3, md: 5 },
            mb: 5,
            pt: 3.5,
            borderTop: `1px solid ${COLOR_INK_FAINT}`,
          }}
        >
          {/* Big P&L headline — newspaper style */}
          <Box>
            <Typography
              sx={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: COLOR_INK_MUTED,
                mb: 1,
              }}
            >
              Unrealised Gain / Loss
            </Typography>
            <Typography
              sx={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 400,
                fontStyle: 'italic',
                fontSize: { xs: 64, md: 96 },
                letterSpacing: '-0.04em',
                color: pnlSign ? COLOR_GAIN : COLOR_LOSS,
                fontFeatureSettings: '"tnum", "lnum"',
                fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 0',
                lineHeight: 0.92,
                mb: 0.5,
              }}
            >
              {pnlSign ? '+' : ''}{portfolioStats.returnPct.toFixed(2)}%
            </Typography>
            <Typography
              sx={{
                fontFamily: FONT_MONO,
                fontSize: 16,
                color: COLOR_INK,
                fontFeatureSettings: '"tnum"',
                mt: 1.5,
                letterSpacing: '-0.01em',
              }}
            >
              {pnlSign ? '+' : ''}{formatCurrency(portfolioStats.totalPnl)}
              <Box component="span" sx={{ color: COLOR_INK_FAINT, mx: 1, fontFamily: FONT_BODY, fontStyle: 'italic' }}>
                on
              </Box>
              {formatCurrency(portfolioStats.totalCost)}
            </Typography>
          </Box>

          {/* Pie chart */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 1.5,
            }}
          >
            <Typography
              sx={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: COLOR_INK_MUTED,
              }}
            >
              Allocation by Market Value
            </Typography>
            <PortfolioPie
              size={200}
              totalLabel="Market Value"
              totalValue={formatCurrency(portfolioStats.totalMarket)}
              slices={positions.map((p) => ({
                symbol: p.symbol,
                value: p.market_value || 0,
                pct:
                  portfolioStats.totalMarket > 0
                    ? ((p.market_value || 0) / portfolioStats.totalMarket) * 100
                    : 0,
              }))}
            />
          </Box>
        </Box>
      )}

      {/* Editorial section nav — pure boxes, no MUI Tabs (avoids stray bg quirks) */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 4,
          mb: 2.5,
          borderBottom: `1px solid ${COLOR_INK_FAINT}`,
        }}
      >
        {[
          { label: '持仓与订单', en: 'Holdings & Orders' },
          { label: '交易历史', en: 'Transactions' },
        ].map((tab, i) => {
          const active = i === activeTab;
          return (
            <Box
              key={tab.en}
              onClick={() => setActiveTab(i)}
              sx={{
                cursor: 'pointer',
                position: 'relative',
                pb: 1.25,
                pt: 1,
              }}
            >
              <Typography
                sx={{
                  fontFamily: FONT_DISPLAY,
                  fontStyle: 'italic',
                  fontSize: 18,
                  color: active ? COLOR_INK : COLOR_INK_MUTED,
                  fontWeight: active ? 500 : 400,
                  letterSpacing: '-0.01em',
                  fontVariationSettings: '"opsz" 36',
                  transition: 'color 200ms',
                }}
              >
                {tab.label}
              </Typography>
              <Typography
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: 8.5,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: active ? COLOR_INK_MUTED : COLOR_INK_FAINT,
                  mt: 0.25,
                }}
              >
                {tab.en}
              </Typography>
              {active && (
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: -1,
                    left: 0,
                    right: 0,
                    height: 1,
                    bgcolor: COLOR_INK,
                  }}
                />
              )}
            </Box>
          );
        })}
      </Box>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 0 ? (
          <Box>
            {/* Editorial section header */}
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 2 }}>
              <Typography
                sx={{
                  fontFamily: FONT_DISPLAY,
                  fontStyle: 'italic',
                  fontWeight: 500,
                  fontSize: 22,
                  color: COLOR_INK,
                  letterSpacing: '-0.015em',
                  fontVariationSettings: '"opsz" 36, "SOFT" 50',
                }}
              >
                持仓
              </Typography>
              <Typography
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: 9,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: COLOR_INK_FAINT,
                  pb: 0.5,
                }}
              >
                Holdings
              </Typography>
              <Box sx={{ flex: 1, height: 1, bgcolor: COLOR_INK_FAINT, mb: 0.5 }} />
            </Box>
            {positionsLoading ? (
              <Box sx={{ p: 3, textAlign: 'center' }}><LoadingDots text="加载持仓" fontSize={14} /></Box>
            ) : positions.length === 0 ? (
              <Typography
                sx={{
                  p: 3, textAlign: 'center', color: COLOR_INK_MUTED, fontSize: 14,
                  fontFamily: FONT_BODY, fontStyle: 'italic',
                }}
              >
                no holdings.
              </Typography>
            ) : (
              <Box sx={{ mb: 4 }}>
                {/* Custom editorial table — no MUI Table */}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(80px, 1fr) 70px 1fr 1fr 1.1fr 1.1fr 0.9fr 1.4fr',
                    gap: 0,
                    pb: 1.25,
                    borderBottom: `1px solid ${COLOR_INK_FAINT}`,
                  }}
                >
                  {[
                    ['Symbol', '代码', 'left'],
                    ['Qty', '数量', 'right'],
                    ['Avg', '均价', 'right'],
                    ['Last', '现价', 'right'],
                    ['Market Value', '市值', 'right'],
                    ['P&L', '盈亏', 'right'],
                    ['Return', '收益率', 'right'],
                    ['', '操作', 'right'],
                  ].map(([en, , align]) => (
                    <Typography
                      key={en || 'actions'}
                      sx={{
                        fontFamily: FONT_MONO,
                        fontSize: 9,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: COLOR_INK_FAINT,
                        textAlign: align as 'left' | 'right',
                        px: 1.25,
                      }}
                    >
                      {en}
                    </Typography>
                  ))}
                </Box>

                {[...positions].sort((a, b) => (b.market_value || 0) - (a.market_value || 0)).map((pos, i) => {
                  const returnPct = pos.cost > 0 ? ((pos.unrealized_pnl / pos.cost) * 100) : 0;
                  const pnlSignRow = pos.unrealized_pnl >= 0;
                  return (
                    <Box
                      key={i}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(80px, 1fr) 70px 1fr 1fr 1.1fr 1.1fr 0.9fr 1.4fr',
                        alignItems: 'center',
                        py: 1.5,
                        borderBottom: `1px solid ${COLOR_INK_FAINT}40`,
                        transition: 'background-color 180ms',
                        '&:hover': { bgcolor: 'rgba(244,236,223,0.025)' },
                        '& > *': { px: 1.25 },
                      }}
                    >
                      {/* Symbol — serif italic, distinctive */}
                      <Typography
                        sx={{
                          fontFamily: FONT_DISPLAY,
                          fontStyle: 'italic',
                          fontWeight: 600,
                          fontSize: 18,
                          color: COLOR_INK,
                          letterSpacing: '-0.01em',
                          fontVariationSettings: '"opsz" 36',
                        }}
                      >
                        {pos.symbol}
                      </Typography>
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 13, color: COLOR_INK_MUTED, textAlign: 'right', fontFeatureSettings: '"tnum"' }}>
                        {pos.quantity}
                      </Typography>
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 13, color: COLOR_INK_MUTED, textAlign: 'right', fontFeatureSettings: '"tnum"' }}>
                        {formatCurrency(pos.average_price)}
                      </Typography>
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 13, color: COLOR_INK, textAlign: 'right', fontFeatureSettings: '"tnum"' }}>
                        {formatCurrency(pos.market_price)}
                      </Typography>
                      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 14, color: COLOR_INK, textAlign: 'right', fontFeatureSettings: '"tnum"', fontWeight: 500 }}>
                        {formatCurrency(pos.market_value)}
                      </Typography>
                      <Typography
                        sx={{
                          fontFamily: FONT_MONO,
                          fontSize: 13,
                          color: pnlSignRow ? COLOR_GAIN : COLOR_LOSS,
                          textAlign: 'right',
                          fontFeatureSettings: '"tnum"',
                        }}
                      >
                        {formatPnl(pos.unrealized_pnl)}
                      </Typography>
                      <Typography
                        sx={{
                          fontFamily: FONT_DISPLAY,
                          fontStyle: 'italic',
                          fontWeight: 500,
                          fontSize: 16,
                          color: returnPct >= 0 ? COLOR_GAIN : COLOR_LOSS,
                          textAlign: 'right',
                          fontFeatureSettings: '"tnum"',
                          fontVariationSettings: '"opsz" 36',
                        }}
                      >
                        {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end' }}>
                        {[
                          { label: '加仓', en: 'Buy', onClick: () => openBuyDialog(pos.symbol), tone: COLOR_GAIN },
                          { label: '止损', en: 'Stop', onClick: () => openStopLossDialog(pos.symbol, pos.quantity), tone: '#C9A97E' },
                          { label: '卖出', en: 'Sell', onClick: () => openSellDialog(pos.symbol, pos.quantity), tone: COLOR_LOSS },
                        ].map((btn) => (
                          <Box
                            key={btn.label}
                            onClick={btn.onClick}
                            sx={{
                              fontFamily: FONT_MONO,
                              fontSize: 9.5,
                              letterSpacing: '0.18em',
                              textTransform: 'uppercase',
                              color: btn.tone,
                              border: `1px solid ${btn.tone}40`,
                              px: 1,
                              py: 0.4,
                              cursor: 'pointer',
                              transition: 'all 150ms',
                              '&:hover': {
                                borderColor: btn.tone,
                                bgcolor: `${btn.tone}15`,
                              },
                            }}
                          >
                            {btn.en}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}

            {/* Orders section header — editorial */}
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 2, mt: 1 }}>
              <Typography
                sx={{
                  fontFamily: FONT_DISPLAY,
                  fontStyle: 'italic',
                  fontWeight: 500,
                  fontSize: 22,
                  color: COLOR_INK,
                  letterSpacing: '-0.015em',
                  fontVariationSettings: '"opsz" 36, "SOFT" 50',
                }}
              >
                订单
              </Typography>
              <Typography
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: 9,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: COLOR_INK_FAINT,
                  pb: 0.5,
                }}
              >
                Orders
              </Typography>
              <Box sx={{ flex: 1, height: 1, bgcolor: COLOR_INK_FAINT, mb: 0.5 }} />
            </Box>
            {ordersLoading ? (
              <Box sx={{ p: 3, textAlign: 'center' }}><LoadingDots text="加载订单" fontSize={14} /></Box>
            ) : orders.length === 0 ? (
              <Typography
                sx={{
                  p: 3, textAlign: 'center', color: COLOR_INK_MUTED, fontSize: 14,
                  fontFamily: FONT_BODY, fontStyle: 'italic',
                }}
              >
                no open orders.
              </Typography>
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
                                {tx.note ? <EditIcon size={18} /> : <AddCommentIcon size={18} />}
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
      <QrCodeIcon size={32} style={{ color: theme.brand.primary, marginBottom: 8 }} />
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
