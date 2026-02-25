import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Chip, IconButton, Tooltip, TextField, Button, Collapse,
  MenuItem,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import LoadingDots from '../../LoadingDots';
import {
  MemoryItem,
  fetchMemory,
  writeMemory,
  deleteMemory,
} from '../../../api/index';

interface Props {
  theme: any;
  isDark: boolean;
  showToast: any;
}

const CATEGORIES = [
  { key: '', label: 'All' },
  { key: 'decision', label: 'Decision' },
  { key: 'reflection', label: 'Reflection' },
  { key: 'experience', label: 'Experience' },
  { key: 'observation', label: 'Observation' },
  { key: 'arena_learning', label: 'Arena Learning' },
  { key: 'arena_vote_reasoning', label: 'Vote Reasoning' },
];

const PAGE_SIZE = 20;

export default function MemoryTab({ theme, isDark, showToast }: Props) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [category, setCategory] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newCategory, setNewCategory] = useState('experience');
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setHasMore(true);
    try {
      const res = await fetchMemory(category || undefined, PAGE_SIZE, 0);
      if (res.success && res.data) {
        setMemories(res.data);
        setHasMore(res.data.length >= PAGE_SIZE);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [category]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await fetchMemory(category || undefined, PAGE_SIZE, memories.length);
      if (res.success && res.data) {
        setMemories((prev) => [...prev, ...res.data]);
        setHasMore(res.data.length >= PAGE_SIZE);
      }
    } catch { /* ignore */ }
    finally { setLoadingMore(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await deleteMemory(id);
      if (res.success) {
        showToast('Memory deleted', 'success');
        setMemories((prev) => prev.filter((m) => m.id !== id));
      } else {
        showToast('Delete failed', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Delete failed', 'error');
    }
  };

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    setSaving(true);
    try {
      const res = await writeMemory(newCategory, newContent);
      if (res.success) {
        showToast('Memory created', 'success');
        setNewContent('');
        setShowForm(false);
        await load();
      } else {
        showToast(res.error || 'Failed', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const categoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      decision: '#2196f3',
      reflection: '#9c27b0',
      experience: '#4caf50',
      observation: '#ff9800',
      arena_learning: '#00bcd4',
      arena_vote_reasoning: '#795548',
    };
    return colors[cat] || theme.text.muted;
  };

  return (
    <Box>
      {/* Category filter */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        {CATEGORIES.map(({ key, label }) => (
          <Chip
            key={key}
            label={label}
            size="small"
            onClick={() => setCategory(key)}
            sx={{
              fontSize: 11, cursor: 'pointer', fontWeight: 600,
              bgcolor: category === key ? 'rgba(100,149,237,0.15)' : 'transparent',
              color: category === key ? theme.brand.primary : theme.text.muted,
              border: `1px solid ${category === key ? 'rgba(100,149,237,0.3)' : 'transparent'}`,
            }}
          />
        ))}
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setShowForm(!showForm)}
          sx={{
            textTransform: 'none', fontSize: 12, fontWeight: 600,
            color: theme.brand.primary,
          }}
        >
          Add
        </Button>
      </Box>

      {/* Create form */}
      <Collapse in={showForm}>
        <Box sx={{
          p: 2, mb: 2, borderRadius: 2,
          bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          border: `1px solid ${theme.border.default}`,
        }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
            <TextField
              select
              size="small"
              label="Category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
              InputLabelProps={{ sx: { color: theme.text.muted } }}
              sx={{ minWidth: 160 }}
            >
              {CATEGORIES.filter((c) => c.key).map(({ key, label }) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </TextField>
          </Box>
          <TextField
            fullWidth
            multiline
            rows={3}
            placeholder="Memory content..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
            sx={{ mb: 1.5, '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.border.default } }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button size="small" onClick={() => setShowForm(false)} sx={{ textTransform: 'none', color: theme.text.muted }}>
              Cancel
            </Button>
            <Button
              size="small"
              onClick={handleCreate}
              disabled={saving || !newContent.trim()}
              sx={{
                bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none',
                fontWeight: 600, fontSize: 12, borderRadius: 2, px: 2,
                '&:hover': { bgcolor: theme.brand.hover },
              }}
            >
              {saving ? <LoadingDots text="Saving" fontSize={11} color="#fff" /> : 'Save'}
            </Button>
          </Box>
        </Box>
      </Collapse>

      {/* Memory list */}
      {loading ? (
        <LoadingDots text="Loading memories" fontSize={13} />
      ) : memories.length === 0 ? (
        <Typography sx={{ py: 4, textAlign: 'center', color: theme.text.muted, fontSize: 13 }}>
          No memories
        </Typography>
      ) : (
        <>
          {memories.map((m) => {
            const isExpanded = expandedId === m.id;
            const preview = m.content.length > 120 ? m.content.slice(0, 120) + '...' : m.content;

            return (
              <Box
                key={m.id}
                sx={{
                  py: 1, px: 0.5,
                  borderBottom: `1px solid ${theme.border.subtle}`,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' },
                }}
                onClick={() => setExpandedId(isExpanded ? null : m.id)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    label={m.category}
                    size="small"
                    sx={{
                      fontSize: 10, height: 20, fontWeight: 600,
                      bgcolor: `${categoryColor(m.category)}15`,
                      color: categoryColor(m.category),
                    }}
                  />
                  {(m as any).agent_key && (m as any).agent_key !== 'shared' && (
                    <Typography sx={{ fontSize: 10, color: theme.text.muted, fontFamily: 'monospace' }}>
                      {(m as any).agent_key}
                    </Typography>
                  )}
                  <Typography sx={{ fontSize: 12, color: theme.text.secondary, flex: 1 }} noWrap={!isExpanded}>
                    {isExpanded ? m.content : preview}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: theme.text.muted, flexShrink: 0 }}>
                    {m.created_at ? new Date(m.created_at).toLocaleDateString() : ''}
                  </Typography>
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}
                      sx={{ color: theme.text.muted, p: 0.5, '&:hover': { color: '#f44336' } }}
                    >
                      <DeleteIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            );
          })}
          {hasMore && (
            <Box sx={{ textAlign: 'center', py: 1.5 }}>
              <Button
                size="small"
                onClick={loadMore}
                disabled={loadingMore}
                sx={{ textTransform: 'none', fontSize: 12, color: theme.text.muted }}
              >
                {loadingMore ? <LoadingDots text="Loading" fontSize={11} /> : 'Load more'}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
