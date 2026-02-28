import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Chip,
  Collapse,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  SendHorizonal,
  ChevronDown,
  ChevronUp,
  Wrench,
  CheckCircle,
  Pencil,
  SkipForward,
} from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { toast } from 'sonner';
import LoadingDots from '../LoadingDots';
import { sendAgentMessage, approveDecision, skipDecision } from '../../api/index';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ tool: string; arguments: Record<string, any>; result: any }>;
  decisionCard?: any;
}

export default function ChatPanel() {
  const { theme, isDark } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await sendAgentMessage(text);
      if (res.success && res.data) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: res.data!.response,
            toolCalls: res.data!.tool_calls,
            decisionCard: res.data!.decision_card,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: res.error || 'Agent returned an error.' },
        ]);
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${e.message || 'Network error'}` },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const cardBorder = `1px solid ${theme.border.subtle}`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2 }}>
        {messages.length === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 600, color: theme.text.muted }}>
              Index Investment Agent
            </Typography>
            <Typography sx={{ fontSize: 13, color: theme.text.muted, textAlign: 'center', maxWidth: 400 }}>
              Ask about ETF quotes, backtest strategies, review your portfolio, or get investment recommendations.
            </Typography>
          </Box>
        )}

        {messages.map((msg, i) => (
          <Box
            key={i}
            sx={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              mb: 2,
            }}
          >
            <Box
              sx={{
                maxWidth: '80%',
                p: 2,
                borderRadius: 2,
                bgcolor: msg.role === 'user'
                  ? isDark ? 'rgba(100,149,237,0.15)' : 'rgba(100,149,237,0.08)'
                  : cardBg,
                border: msg.role === 'user'
                  ? `1px solid ${isDark ? 'rgba(100,149,237,0.3)' : 'rgba(100,149,237,0.15)'}`
                  : cardBorder,
              }}
            >
              <Typography
                sx={{
                  fontSize: 14,
                  color: theme.text.primary,
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.content}
              </Typography>

              {/* Tool calls */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <Box sx={{ mt: 1.5 }}>
                  {msg.toolCalls.map((tc, j) => (
                    <ToolCallChip key={j} toolCall={tc} theme={theme} isDark={isDark} />
                  ))}
                </Box>
              )}

              {/* Decision Card */}
              {msg.decisionCard && (
                <DecisionCardInline card={msg.decisionCard} theme={theme} isDark={isDark} />
              )}
            </Box>
          </Box>
        ))}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2 }}>
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: cardBg, border: cardBorder }}>
              <LoadingDots text="Thinking" fontSize={13} />
            </Box>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <Box
        sx={{
          px: 3,
          py: 2,
          borderTop: `1px solid ${theme.border.subtle}`,
          display: 'flex',
          gap: 1,
          alignItems: 'flex-end',
        }}
      >
        <TextField
          inputRef={inputRef}
          fullWidth
          multiline
          maxRows={4}
          size="small"
          placeholder="Ask about your portfolio, ETFs, or market conditions..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          InputProps={{
            sx: {
              color: theme.text.primary,
              fontSize: 14,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.border.default },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.border.hover },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: theme.brand.primary },
            },
          }}
        />
        <IconButton
          onClick={handleSend}
          disabled={loading || !input.trim()}
          sx={{
            bgcolor: theme.brand.primary,
            color: '#fff',
            width: 40,
            height: 40,
            borderRadius: 2,
            '&:hover': { bgcolor: theme.brand.hover },
            '&.Mui-disabled': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: theme.text.disabled },
          }}
        >
          <SendHorizonal size={18} />
        </IconButton>
      </Box>
    </Box>
  );
}

function ToolCallChip({
  toolCall,
  theme,
  isDark,
}: {
  toolCall: { tool: string; arguments: Record<string, any>; result: any };
  theme: any;
  isDark: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box sx={{ mb: 1 }}>
      <Chip
        icon={<Wrench size={14} />}
        label={toolCall.tool}
        size="small"
        onClick={() => setExpanded(!expanded)}
        onDelete={() => setExpanded(!expanded)}
        deleteIcon={expanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
        sx={{
          bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
          color: theme.text.secondary,
          fontSize: 12,
          height: 26,
          cursor: 'pointer',
          '& .MuiChip-icon': { color: theme.text.muted },
          '& .MuiChip-deleteIcon': { color: theme.text.muted, fontSize: 16 },
        }}
      />
      <Collapse in={expanded}>
        <Box
          sx={{
            mt: 0.5,
            p: 1.5,
            borderRadius: 1,
            bgcolor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)',
            fontSize: 12,
            fontFamily: 'monospace',
            color: theme.text.secondary,
            maxHeight: 200,
            overflow: 'auto',
          }}
        >
          <Typography sx={{ fontSize: 11, color: theme.text.muted, mb: 0.5 }}>Arguments:</Typography>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify(toolCall.arguments, null, 2)}
          </pre>
          <Typography sx={{ fontSize: 11, color: theme.text.muted, mt: 1, mb: 0.5 }}>Result:</Typography>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify(toolCall.result, null, 2)}
          </pre>
        </Box>
      </Collapse>
    </Box>
  );
}

function DecisionCardInline({
  card,
  theme,
  isDark,
}: {
  card: any;
  theme: any;
  isDark: boolean;
}) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editAllocations, setEditAllocations] = useState<any[]>(
    card.allocations?.map((a: any) => ({ ...a })) || []
  );
  const [decided, setDecided] = useState(false);

  const handleApprove = async () => {
    if (totpCode.length !== 6) return;
    setSubmitting(true);
    try {
      const res = await approveDecision(card.harness_id, totpCode, modifyOpen ? editAllocations : card.allocations);
      if (res.success) {
        toast.success('Decision approved');
        setApproveOpen(false);
        setModifyOpen(false);
        setDecided(true);
      } else {
        toast.error(res.error || 'Approval failed');
      }
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Approval failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    try {
      await skipDecision(card.harness_id);
      toast.success('Decision skipped');
      setDecided(true);
    } catch {
      toast.error('Skip failed');
    }
  };

  return (
    <Box
      sx={{
        mt: 1.5,
        p: 2,
        borderRadius: 2,
        bgcolor: isDark ? 'rgba(100,149,237,0.08)' : 'rgba(100,149,237,0.04)',
        border: `1px solid ${isDark ? 'rgba(100,149,237,0.2)' : 'rgba(100,149,237,0.12)'}`,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.brand.primary }}>
          Decision Card
        </Typography>
        <Chip
          label={card.action || 'UNKNOWN'}
          size="small"
          sx={{
            bgcolor: card.action === 'BUY' ? 'rgba(76,175,80,0.15)' : card.action === 'SELL' ? 'rgba(244,67,54,0.15)' : 'rgba(255,152,0,0.15)',
            color: card.action === 'BUY' ? '#4caf50' : card.action === 'SELL' ? '#f44336' : '#ff9800',
            fontWeight: 600,
            fontSize: 11,
          }}
        />
      </Box>

      {card.allocations?.map((alloc: any, i: number) => (
        <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
          <Typography sx={{ fontSize: 13, color: theme.text.primary, fontWeight: 500 }}>
            {alloc.etf}
          </Typography>
          <Typography sx={{ fontSize: 13, color: theme.text.secondary }}>
            ${alloc.amount?.toLocaleString()} ({alloc.percentage}%)
          </Typography>
        </Box>
      ))}

      {card.confidence != null && (
        <Typography sx={{ fontSize: 12, color: theme.text.muted, mt: 1 }}>
          Confidence: {(card.confidence * 100).toFixed(0)}%
        </Typography>
      )}

      {card.reasoning && (
        <Typography sx={{ fontSize: 12, color: theme.text.secondary, mt: 0.5, lineHeight: 1.5 }}>
          {card.reasoning}
        </Typography>
      )}

      {/* Action Buttons */}
      {!decided && card.harness_id && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
          <Button
            size="small"
            startIcon={<CheckCircle size={18} />}
            onClick={() => { setModifyOpen(false); setApproveOpen(true); }}
            sx={{ color: '#4caf50', textTransform: 'none', fontSize: 12, fontWeight: 600 }}
          >
            Approve
          </Button>
          <Button
            size="small"
            startIcon={<Pencil size={18} />}
            onClick={() => { setModifyOpen(true); setApproveOpen(true); }}
            sx={{ color: '#ff9800', textTransform: 'none', fontSize: 12, fontWeight: 600 }}
          >
            Modify
          </Button>
          <Button
            size="small"
            startIcon={<SkipForward size={18} />}
            onClick={handleSkip}
            sx={{ color: theme.text.muted, textTransform: 'none', fontSize: 12 }}
          >
            Skip
          </Button>
        </Box>
      )}

      {decided && (
        <Chip label="Decided" size="small" sx={{ mt: 1, fontSize: 11, bgcolor: 'rgba(76,175,80,0.15)', color: '#4caf50' }} />
      )}

      {/* TOTP Approval Dialog */}
      <Dialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { bgcolor: theme.background.secondary, color: theme.text.primary } }}
      >
        <DialogTitle sx={{ fontSize: 16, fontWeight: 600 }}>
          {modifyOpen ? 'Modify & Approve' : 'Approve Decision'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {/* Allocation edit form */}
          {modifyOpen && (
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.text.muted, mb: 1 }}>
                Edit Allocations:
              </Typography>
              {editAllocations.map((alloc, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                  <TextField
                    size="small"
                    label="ETF"
                    value={alloc.etf || ''}
                    onChange={(e) => {
                      const updated = [...editAllocations];
                      updated[i] = { ...updated[i], etf: e.target.value.toUpperCase() };
                      setEditAllocations(updated);
                    }}
                    InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
                    InputLabelProps={{ sx: { color: theme.text.muted } }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Amount"
                    type="number"
                    value={alloc.amount || ''}
                    onChange={(e) => {
                      const updated = [...editAllocations];
                      updated[i] = { ...updated[i], amount: Number(e.target.value) };
                      setEditAllocations(updated);
                    }}
                    InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
                    InputLabelProps={{ sx: { color: theme.text.muted } }}
                    sx={{ width: 100 }}
                  />
                  <TextField
                    size="small"
                    label="%"
                    type="number"
                    value={alloc.percentage || ''}
                    onChange={(e) => {
                      const updated = [...editAllocations];
                      updated[i] = { ...updated[i], percentage: Number(e.target.value) };
                      setEditAllocations(updated);
                    }}
                    InputProps={{ sx: { color: theme.text.primary, fontSize: 13 } }}
                    InputLabelProps={{ sx: { color: theme.text.muted } }}
                    sx={{ width: 70 }}
                  />
                </Box>
              ))}
            </Box>
          )}

          {/* TOTP Input */}
          <Box>
            <TextField
              label="TOTP Code (Google Authenticator)"
              size="small"
              fullWidth
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputProps={{
                maxLength: 6,
                inputMode: 'numeric' as const,
                style: { letterSpacing: 6, fontFamily: 'monospace', fontSize: 18, textAlign: 'center' as const },
              }}
              InputLabelProps={{ sx: { color: theme.text.muted } }}
            />
            <Typography sx={{ fontSize: 11, color: theme.text.muted, mt: 0.5 }}>
              Enter the 6-digit code from Google Authenticator
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setApproveOpen(false)} sx={{ color: theme.text.muted, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={submitting || totpCode.length !== 6}
            sx={{ bgcolor: '#4caf50', color: '#fff', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#43a047' } }}
          >
            {submitting ? <LoadingDots text="Approving" fontSize={12} color="#fff" /> : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
