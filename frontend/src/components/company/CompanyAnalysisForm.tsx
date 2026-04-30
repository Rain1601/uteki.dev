import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, TextField, IconButton, Select, MenuItem, FormControl, Typography, Checkbox } from '@mui/material';
import { ArrowRight, Trash2, GitCompare, Clock } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { invalidateCompanyCache } from '../../api/company';

interface Props {
  onAnalyze: (symbol: string, provider?: string, asOf?: string) => void;
  isRunning?: boolean;
  runningCount?: number;
  elapsedMs: number;
  compareMode?: boolean;
  onCompareModeChange?: (on: boolean) => void;
  onCompare?: (symbol: string, models: string[]) => void;
}

interface SuggestItem {
  symbol: string;
  description: string;
  exchange: string;
  type: string;
}

const MODEL_OPTIONS = [
  { value: '', label: 'Auto' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'anthropic', label: 'Claude' },
  { value: 'openai', label: 'GPT-4.1' },
  { value: 'google', label: 'Gemini' },
  { value: 'qwen', label: 'Qwen' },
];

export default function CompanyAnalysisForm({ onAnalyze, runningCount = 0, compareMode = false, onCompareModeChange, onCompare }: Props) {
  const { theme } = useTheme();
  const [symbol, setSymbol] = useState('');
  const [provider, setProvider] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  // Backtest mode (Phase γ): when set, restricts analysis to data published on or before this date.
  const [asOf, setAsOf] = useState('');
  const [showAsOf, setShowAsOf] = useState(false);

  // Suggest list state
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 1) { setSuggestions([]); setShowSuggest(false); return; }
    try {
      const res = await fetch(`/api/udf/search?query=${encodeURIComponent(query)}&limit=8`);
      if (res.ok) {
        const data: SuggestItem[] = await res.json();
        setSuggestions(data);
        setShowSuggest(data.length > 0);
        setActiveIdx(-1);
      }
    } catch { /* ignore */ }
  }, []);

  // Debounced search on input change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = symbol.trim();
    if (q.length < 1) { setSuggestions([]); setShowSuggest(false); return; }
    debounceRef.current = setTimeout(() => fetchSuggestions(q), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [symbol, fetchSuggestions]);

  // Click outside to close suggest dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggest(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectSuggestion = (item: SuggestItem) => {
    setSymbol(item.symbol);
    setShowSuggest(false);
    setSuggestions([]);
    setTimeout(() => {
      if (compareMode && onCompare && selectedModels.length >= 2) {
        onCompare(item.symbol, selectedModels);
      } else {
        onAnalyze(item.symbol, provider || undefined, asOf || undefined);
      }
    }, 50);
  };

  const handleSubmit = () => {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    setShowSuggest(false);
    if (compareMode && onCompare && selectedModels.length >= 2) {
      onCompare(s, selectedModels);
    } else {
      onAnalyze(s, provider || undefined, asOf || undefined);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggest && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggest(false);
        return;
      }
    }
    if (e.key === 'Enter') handleSubmit();
  };

  const toggleModel = (value: string) => {
    setSelectedModels((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value],
    );
  };

  const handleClearCache = async () => {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    try {
      await invalidateCompanyCache(s);
    } catch { /* ignore */ }
  };

  const hasSymbol = symbol.trim().length > 0;

  return (
    <Box ref={containerRef} sx={{ position: 'relative' }}>
      {/* ── Main form ── */}
      <Box
        sx={{
          position: 'relative',
          bgcolor: theme.background.secondary,
          border: `1px solid ${theme.border.default}`,
          borderRadius: '10px',
          overflow: 'hidden',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          '&:focus-within': {
            borderColor: theme.border.active,
            boxShadow: `0 0 0 3px ${theme.brand.primary}10`,
          },
        }}
      >
        {/* Input row */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <TextField
            fullWidth
            size="small"
            placeholder="输入股票代码  AAPL, TSLA, 700.HK ..."
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (suggestions.length > 0) setShowSuggest(true); }}
            autoComplete="off"
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'transparent',
                fontSize: '0.95rem',
                fontWeight: 500,
                color: theme.text.primary,
                letterSpacing: '0.03em',
                '& fieldset': { border: 'none' },
                '&:hover fieldset': { border: 'none' },
                '&.Mui-focused fieldset': { border: 'none' },
              },
              '& .MuiInputBase-input': {
                py: 1.5,
                px: 2,
                '&::placeholder': {
                  color: theme.text.muted,
                  opacity: 0.5,
                  fontWeight: 400,
                  letterSpacing: '0.01em',
                },
              },
            }}
          />
        </Box>

        {/* Bottom toolbar */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            px: 1.5,
            pb: 1,
          }}
        >
          {/* Left: model selector + cache clear */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <FormControl size="small">
              <Select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                displayEmpty
                sx={{
                  color: theme.text.muted,
                  fontSize: 12,
                  height: 28,
                  bgcolor: 'transparent',
                  '& fieldset': { border: 'none' },
                  '&:hover': { color: theme.text.secondary },
                  '& .MuiSvgIcon-root': { color: theme.text.disabled, fontSize: 16 },
                  '& .MuiSelect-select': { py: 0.25, pl: 1, pr: 3 },
                }}
              >
                {MODEL_OPTIONS.map((p) => (
                  <MenuItem key={p.value} value={p.value} sx={{ fontSize: 12 }}>
                    {p.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {hasSymbol && (
              <Box
                onClick={handleClearCache}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.4,
                  px: 1,
                  py: 0.25,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  color: theme.text.disabled,
                  transition: 'all 0.15s',
                  '&:hover': { color: theme.status.warning, bgcolor: `${theme.status.warning}10` },
                }}
              >
                <Trash2 size={11} />
                <span>清缓存</span>
              </Box>
            )}

            {/* Compare mode toggle */}
            {onCompareModeChange && (
              <Box
                onClick={() => onCompareModeChange(!compareMode)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.4,
                  px: 1,
                  py: 0.25,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  color: compareMode ? theme.brand.primary : theme.text.disabled,
                  bgcolor: compareMode ? `${theme.brand.primary}10` : 'transparent',
                  transition: 'all 0.15s',
                  '&:hover': { color: theme.brand.primary, bgcolor: `${theme.brand.primary}10` },
                }}
              >
                <GitCompare size={11} />
                <span>对比</span>
              </Box>
            )}

            {/* Backtest mode toggle (Phase γ) */}
            <Box
              onClick={() => setShowAsOf((v) => !v)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.4,
                px: 1,
                py: 0.25,
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.7rem',
                color: (showAsOf || asOf) ? theme.brand.primary : theme.text.disabled,
                bgcolor: (showAsOf || asOf) ? `${theme.brand.primary}10` : 'transparent',
                transition: 'all 0.15s',
                '&:hover': { color: theme.brand.primary, bgcolor: `${theme.brand.primary}10` },
              }}
              title="历史回测：限制只用截止日期前的数据"
            >
              <Clock size={11} />
              <span>{asOf ? `回测 ${asOf.slice(5)}` : '回测'}</span>
            </Box>

            {showAsOf && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                <input
                  type="date"
                  value={asOf}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setAsOf(e.target.value)}
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    border: `1px solid ${theme.border.default}`,
                    background: 'transparent',
                    color: theme.text.primary,
                    fontFamily: 'inherit',
                    outline: 'none',
                    colorScheme: 'dark',
                  }}
                />
                {asOf && (
                  <Box
                    onClick={() => setAsOf('')}
                    sx={{
                      cursor: 'pointer',
                      fontSize: '0.7rem',
                      color: theme.text.disabled,
                      px: 0.5,
                      '&:hover': { color: theme.text.primary },
                    }}
                  >
                    ✕
                  </Box>
                )}
              </Box>
            )}
          </Box>

          {/* Right: running badge + submit */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {runningCount > 0 && (
              <Typography sx={{
                fontSize: 11,
                color: theme.brand.primary,
                fontWeight: 500,
                px: 1,
                py: 0.25,
                borderRadius: '8px',
                bgcolor: `${theme.brand.primary}10`,
              }}>
                {runningCount} running
              </Typography>
            )}

            <IconButton
              onClick={handleSubmit}
              disabled={!hasSymbol || (compareMode && selectedModels.length < 2)}
              sx={{
                width: 32,
                height: 32,
                borderRadius: '10px',
                bgcolor: hasSymbol ? theme.brand.primary : 'transparent',
                color: hasSymbol ? '#fff' : theme.text.disabled,
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: hasSymbol ? theme.brand.hover : 'transparent',
                },
                '&.Mui-disabled': { color: theme.text.disabled },
              }}
            >
              {compareMode ? <GitCompare size={16} /> : <ArrowRight size={16} />}
            </IconButton>
          </Box>
        </Box>

        {/* Model checkboxes for compare mode */}
        {compareMode && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0, px: 1, pb: 0.75, flexWrap: 'wrap' }}>
            {MODEL_OPTIONS.filter((m) => m.value).map((m) => (
              <Box
                key={m.value}
                onClick={() => toggleModel(m.value)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.25,
                  px: 0.75, py: 0.15, borderRadius: '6px', cursor: 'pointer',
                  bgcolor: selectedModels.includes(m.value) ? `${theme.brand.primary}12` : 'transparent',
                  border: `1px solid ${selectedModels.includes(m.value) ? `${theme.brand.primary}30` : 'transparent'}`,
                  transition: 'all 0.1s',
                  '&:hover': { bgcolor: `${theme.text.primary}06` },
                }}
              >
                <Checkbox
                  checked={selectedModels.includes(m.value)}
                  size="small"
                  sx={{ p: 0.25, '& .MuiSvgIcon-root': { fontSize: 14, color: selectedModels.includes(m.value) ? theme.brand.primary : theme.text.disabled } }}
                />
                <Typography sx={{ fontSize: 10, color: selectedModels.includes(m.value) ? theme.text.primary : theme.text.muted }}>
                  {m.label}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* ── Search autocomplete dropdown (appears above input when typing) ── */}
      {showSuggest && suggestions.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            mb: 0.5,
            bgcolor: theme.background.secondary,
            border: `1px solid ${theme.border.default}`,
            borderRadius: '10px',
            overflow: 'hidden',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.25)',
            maxHeight: 280,
            overflowY: 'auto',
            zIndex: 200,
            '&::-webkit-scrollbar': { width: 3 },
            '&::-webkit-scrollbar-thumb': { bgcolor: `${theme.text.muted}20`, borderRadius: 4 },
          }}
        >
          {suggestions.map((item, idx) => (
            <Box
              key={item.symbol}
              onClick={() => selectSuggestion(item)}
              onMouseEnter={() => setActiveIdx(idx)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                py: 0.85,
                cursor: 'pointer',
                bgcolor: idx === activeIdx ? `${theme.brand.primary}10` : 'transparent',
                borderBottom: idx < suggestions.length - 1 ? `1px solid ${theme.border.subtle}15` : 'none',
                transition: 'background-color 0.08s',
                '&:hover': { bgcolor: `${theme.brand.primary}10` },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                <Typography sx={{
                  fontSize: 12, fontWeight: 700, color: theme.text.primary,
                  fontFamily: 'var(--font-mono)',
                  minWidth: 60,
                }}>
                  {item.symbol}
                </Typography>
                <Typography sx={{
                  fontSize: 11, color: theme.text.muted,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.description}
                </Typography>
              </Box>
              <Typography sx={{
                fontSize: 9, color: theme.text.disabled,
                fontFamily: 'var(--font-mono)',
                flexShrink: 0, ml: 1,
              }}>
                {item.exchange}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
