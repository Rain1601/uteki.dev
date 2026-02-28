import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, Button, TextField, IconButton } from '@mui/material';
import {
  RefreshCw,
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
} from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import LoadingDots from '../LoadingDots';
import { toast } from 'sonner';
import TradingViewChart from './TradingViewChart';
import {
  WatchlistItem,
  fetchWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  refreshData,
  syncData,
  updateWatchlistNotes,
} from '../../api/index';

export default function WatchlistPanel() {
  const { theme, isDark } = useTheme();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSymbol, setNewSymbol] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  // Notes editing state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedItem = items.find((i) => i.symbol === selectedSymbol);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWatchlist();
      if (res.success && res.data) {
        setItems(res.data);
        if (!selectedSymbol && res.data.length > 0) {
          setSelectedSymbol(res.data[0].symbol);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [selectedSymbol]);

  useEffect(() => { load(); }, [load]);

  // Auto-sync on mount: check data freshness and backfill if needed
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSyncing(true);
      setSyncResult(null);
      try {
        const res = await syncData();
        if (cancelled) return;
        if (res.success && res.data) {
          const { synced, failed } = res.data;
          if (synced.length > 0) {
            const symbols = synced.map((s: any) => s.symbol).join(', ');
            const totalRecords = synced.reduce((sum: number, s: any) => sum + (s.records || 0), 0);
            setSyncResult(`Synced ${symbols} (+${totalRecords} records)`);
            if (totalRecords > 0) {
              toast.success(`Data synced: ${symbols} (+${totalRecords} records)`);
            }
            load(); // Reload watchlist to reflect fresh data
          }
          if (failed.length > 0) {
            toast.error(`Sync failed for: ${failed.map((f: any) => f.symbol).join(', ')}`);
          }
        }
      } catch {
        /* silent — sync is best-effort */
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset editing when symbol changes
  useEffect(() => {
    setEditing(false);
  }, [selectedSymbol]);

  const handleAdd = async () => {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;
    try {
      const res = await addToWatchlist(sym);
      if (res.success) {
        toast.success(`Added ${sym}`);
        setNewSymbol('');
        setSelectedSymbol(sym);
        load();
      } else {
        toast.error(res.error || 'Failed to add');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    }
  };

  const handleRemove = async (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeFromWatchlist(symbol);
      toast.success(`Removed ${symbol}`);
      if (selectedSymbol === symbol) {
        setSelectedSymbol(null);
      }
      load();
    } catch {
      toast.error('Failed to remove');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshData();
      toast.success('Data refresh triggered');
    } catch {
      toast.error('Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const handleEditStart = () => {
    setDraft(selectedItem?.notes || '');
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleSave = async () => {
    if (!selectedSymbol) return;
    setSaving(true);
    try {
      const res = await updateWatchlistNotes(selectedSymbol, draft);
      if (res.success && res.data) {
        setItems((prev) =>
          prev.map((it) => (it.symbol === selectedSymbol ? { ...it, notes: res.data!.notes } : it))
        );
        setEditing(false);
        toast.success('Notes saved');
      } else {
        toast.error('Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft('');
  };

  return (
    <Box sx={{ display: 'flex', gap: 0, position: 'absolute', inset: 0 }}>
      {/* Left: Symbol List */}
      <Box
        sx={{
          width: 200,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1px solid ${theme.border.subtle}`,
          px: 2,
          py: 2,
        }}
      >
        {/* Add symbol input */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            size="small"
            placeholder="Add (e.g. VOO)"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            InputProps={{ sx: { color: theme.text.primary, fontSize: 12 } }}
            sx={{ flex: 1 }}
          />
          <IconButton
            size="small"
            onClick={handleAdd}
            disabled={!newSymbol.trim()}
            sx={{ bgcolor: theme.brand.primary, color: '#fff', borderRadius: 1, '&:hover': { bgcolor: theme.brand.hover }, '&.Mui-disabled': { bgcolor: theme.border.subtle } }}
          >
            <Plus size={18} />
          </IconButton>
        </Box>

        {/* Refresh / Sync status */}
        <Button
          size="small"
          startIcon={refreshing || syncing ? undefined : <RefreshCw size={18} />}
          onClick={handleRefresh}
          disabled={refreshing || syncing}
          sx={{ color: theme.brand.primary, textTransform: 'none', fontSize: 12, mb: syncing || syncResult ? 0.5 : 2, justifyContent: 'flex-start' }}
        >
          {syncing ? <LoadingDots text="Syncing" fontSize={11} /> : refreshing ? <LoadingDots text="Refreshing" fontSize={11} /> : 'Refresh Data'}
        </Button>
        {syncResult && (
          <Typography sx={{ fontSize: 10, color: theme.text.muted, mb: 2, px: 0.5 }}>
            {syncResult}
          </Typography>
        )}

        {/* Symbol list */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <LoadingDots text="Loading" fontSize={12} />
          ) : items.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: theme.text.muted, py: 2 }}>No symbols. Add one above.</Typography>
          ) : (
            items.map((item) => (
              <Box
                key={item.id}
                onClick={() => setSelectedSymbol(item.symbol)}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  px: 1.5,
                  py: 1,
                  mb: 0.5,
                  borderRadius: 1,
                  cursor: 'pointer',
                  bgcolor: selectedSymbol === item.symbol
                    ? isDark ? 'rgba(100,149,237,0.15)' : 'rgba(100,149,237,0.1)'
                    : 'transparent',
                  border: selectedSymbol === item.symbol
                    ? `1px solid rgba(100,149,237,0.3)`
                    : '1px solid transparent',
                  '&:hover': {
                    bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                  },
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: selectedSymbol === item.symbol ? 600 : 500,
                      color: selectedSymbol === item.symbol ? theme.brand.primary : theme.text.primary,
                    }}
                  >
                    {item.symbol}
                  </Typography>
                  {item.etf_type && (
                    <Typography sx={{ fontSize: 10, color: theme.text.muted }}>{item.etf_type}</Typography>
                  )}
                </Box>
                <IconButton
                  size="small"
                  onClick={(e) => handleRemove(item.symbol, e)}
                  sx={{ color: theme.text.muted, opacity: 0.5, '&:hover': { color: '#f44336', opacity: 1 } }}
                >
                  <Trash2 size={16} />
                </IconButton>
              </Box>
            ))
          )}
        </Box>
      </Box>

      {/* Center: K-Line Chart */}
      <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <TradingViewChart symbol={selectedSymbol} />
      </Box>

      {/* Right: Notes Panel */}
      <Box
        sx={{
          width: 280,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: `1px solid ${theme.border.subtle}`,
          px: 2,
          py: 2,
          overflow: 'hidden',
        }}
      >
        {selectedItem ? (
          <>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 600, color: theme.text.primary }}>
                  {selectedItem.symbol}
                </Typography>
                {selectedItem.name && (
                  <Typography sx={{ fontSize: 11, color: theme.text.muted, mt: 0.25 }}>
                    {selectedItem.name}
                  </Typography>
                )}
              </Box>
              {!editing ? (
                <IconButton size="small" onClick={handleEditStart} sx={{ color: theme.text.muted }}>
                  <Pencil size={16} />
                </IconButton>
              ) : (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton
                    size="small"
                    onClick={handleSave}
                    disabled={saving}
                    sx={{ color: theme.brand.primary }}
                  >
                    <Save size={16} />
                  </IconButton>
                  <IconButton size="small" onClick={handleCancel} sx={{ color: theme.text.muted }}>
                    <X size={16} />
                  </IconButton>
                </Box>
              )}
            </Box>

            {/* Notes content */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {editing ? (
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') handleCancel();
                    if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSave();
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    resize: 'none',
                    border: `1px solid ${theme.border.subtle}`,
                    borderRadius: 6,
                    padding: 10,
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: theme.text.primary,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                  placeholder="Add your notes about this ETF..."
                />
              ) : (
                <Typography
                  sx={{
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: selectedItem.notes ? theme.text.secondary : theme.text.muted,
                    whiteSpace: 'pre-wrap',
                    cursor: 'pointer',
                    '&:hover': { color: theme.text.primary },
                  }}
                  onClick={handleEditStart}
                >
                  {selectedItem.notes || 'Click to add notes...'}
                </Typography>
              )}
            </Box>
          </>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ fontSize: 13, color: theme.text.muted }}>
              Select a symbol to view notes
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
