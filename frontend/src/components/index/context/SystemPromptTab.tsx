import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, TextField, Chip, IconButton, Tooltip,
} from '@mui/material';
import {
  Save,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import LoadingDots from '../../LoadingDots';
import {
  PromptVersion,
  fetchCurrentPrompt,
  updatePrompt,
  fetchPromptHistory,
  activatePromptVersion,
  deletePromptVersion,
} from '../../../api/index';

interface Props {
  theme: any;
  isDark: boolean;
  promptType?: string;
}

export default function SystemPromptTab({ theme, isDark, promptType = 'system' }: Props) {
  const [current, setCurrent] = useState<PromptVersion | null>(null);
  const [history, setHistory] = useState<PromptVersion[]>([]);
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const [curRes, histRes] = await Promise.all([
      fetchCurrentPrompt(promptType),
      fetchPromptHistory(promptType),
    ]);
    if (curRes.success && curRes.data) {
      setCurrent(curRes.data);
      setContent(curRes.data.content);
    }
    if (histRes.success && histRes.data) setHistory(histRes.data);
  }, [promptType]);

  useEffect(() => {
    setLoading(true);
    reload().catch(() => {}).finally(() => setLoading(false));
  }, [reload]);

  const handleSave = async () => {
    if (!content.trim() || !description.trim()) return;
    setSaving(true);
    try {
      const res = await updatePrompt(content, description, promptType);
      if (res.success && res.data) {
        toast.success('Prompt updated');
        setDescription('');
        await reload();
      } else {
        toast.error(res.error || 'Update failed');
      }
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (versionId: string) => {
    try {
      const res = await activatePromptVersion(versionId);
      if (res.success) {
        toast.success('Version activated');
        await reload();
      } else {
        toast.error('Activate failed');
      }
    } catch (e: any) {
      toast.error(e.message || 'Activate failed');
    }
  };

  const handleDelete = async (versionId: string) => {
    try {
      const res = await deletePromptVersion(versionId);
      if (res.success) {
        toast.success('Version deleted');
        await reload();
      } else {
        toast.error('Delete failed');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e.message || 'Delete failed');
    }
  };

  if (loading) return <LoadingDots text="Loading prompt" fontSize={13} />;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.text.secondary }}>
          {promptType === 'system' ? 'System Prompt' : 'User Prompt Template'}
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
          startIcon={saving ? undefined : <Save size={18} />}
          onClick={handleSave}
          disabled={saving || !content.trim() || !description.trim()}
          sx={{ bgcolor: theme.brand.primary, color: '#fff', textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: 2, px: 3, '&:hover': { bgcolor: theme.brand.hover } }}
        >
          {saving ? <LoadingDots text="Saving" fontSize={12} color="#fff" /> : 'Save'}
        </Button>
      </Box>

      {history.length > 0 && (
        <>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.text.muted, mb: 1 }}>
            Version History
          </Typography>
          {history.map((v) => (
            <Box
              key={v.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, py: 1,
                borderBottom: `1px solid ${theme.border.subtle}`,
                cursor: 'pointer',
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' },
              }}
              onClick={() => setContent(v.content)}
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
              {v.is_current && (
                <Chip label="current" size="small" sx={{ fontSize: 10, height: 18, bgcolor: 'rgba(76,175,80,0.1)', color: '#4caf50' }} />
              )}
              <Typography sx={{ fontSize: 12, color: theme.text.secondary, flex: 1 }}>
                {v.description}
              </Typography>
              <Typography sx={{ fontSize: 11, color: theme.text.muted, mr: 1 }}>
                {v.created_at ? new Date(v.created_at).toLocaleDateString() : ''}
              </Typography>
              {!v.is_current && (
                <>
                  <Tooltip title="Set as current version">
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); handleActivate(v.id); }}
                      sx={{ color: theme.brand.primary, p: 0.5 }}
                    >
                      <RefreshCw size={16} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete version">
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); handleDelete(v.id); }}
                      sx={{ color: '#f44336', p: 0.5 }}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}
