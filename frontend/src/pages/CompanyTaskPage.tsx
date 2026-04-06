/**
 * CompanyTaskPage — Company Agent with persistent task management.
 *
 * Features:
 * - Tasks survive page navigation / refresh (via Zustand store + backend persistence)
 * - Reconnectable SSE streams (history replay + live continuation)
 * - Real-time task status in the list (running animation, completed, failed)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '../theme/ThemeProvider';
import { useCompanyTaskStore, type TaskState } from '../stores/companyTaskStore';
import { analyzeCompanyStream, GATE_NAMES, TOTAL_GATES } from '../api/company';

// ─── Constants ───────────────────────────────────────────────────────

const FONT_SERIF = "'Times New Roman', 'SimSun', '宋体', serif";
const FONT_UI = "Inter, -apple-system, BlinkMacSystemFont, sans-serif";
const FONT_MONO = "'SF Mono', Monaco, monospace";

const ACTION_COLORS: Record<string, string> = {
  BUY: '#22c55e', WATCH: '#f59e0b', AVOID: '#ef4444',
};

const RUNNING_LABELS = ['Analyzing...', 'Evaluating...', 'Scoring...', 'Thinking...', 'Researching...', 'Reasoning...'];

// ─── Running Status Animation ────────────────────────────────────────

function RunningStatus({ color, gate }: { color: string; gate: number }) {
  const [labelIdx, setLabelIdx] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setLabelIdx(p => (p + 1) % RUNNING_LABELS.length), 2400);
    return () => clearInterval(iv);
  }, []);

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Box
        component="span"
        sx={{
          display: 'inline-block', fontSize: 12, lineHeight: 1,
          color, fontWeight: 700,
          animation: 'status-spin 1.2s linear infinite',
          '@keyframes status-spin': {
            '0%': { transform: 'rotate(0deg)' },
            '100%': { transform: 'rotate(360deg)' },
          },
        }}
      >
        ✳
      </Box>
      <Typography
        component="span"
        sx={{
          fontSize: 10, fontWeight: 600, color,
          fontFamily: FONT_MONO,
          animation: 'status-fade 2.4s ease-in-out infinite',
          '@keyframes status-fade': {
            '0%, 100%': { opacity: 0.5 },
            '50%': { opacity: 1 },
          },
        }}
      >
        Gate {gate}/{TOTAL_GATES} · {RUNNING_LABELS[labelIdx]}
      </Typography>
    </Box>
  );
}

// ─── Gate Progress Bar ───────────────────────────────────────────────

function GateProgress({ task, brandColor }: { task: TaskState; brandColor: string }) {
  const completedCount = Object.keys(task.gateResults).length;
  const pct = (completedCount / TOTAL_GATES) * 100;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
      <Box sx={{
        flex: 1, height: 3, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.06)', overflow: 'hidden',
      }}>
        <Box sx={{
          width: `${pct}%`, height: '100%', borderRadius: 2,
          bgcolor: brandColor,
          transition: 'width 0.5s ease',
        }} />
      </Box>
      <Typography sx={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: FONT_MONO, flexShrink: 0 }}>
        {completedCount}/{TOTAL_GATES}
      </Typography>
    </Box>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function CompanyTaskPage() {
  const { theme } = useTheme();
  const {
    tasks,
    registerTask,
    handleEvent,
    finishTask,
    restoreRunningTasks,
    reconnectTask,
    removeTask,
  } = useCompanyTaskStore();

  const [inputSymbol, setInputSymbol] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restore running tasks on mount
  useEffect(() => {
    restoreRunningTasks();
  }, [restoreRunningTasks]);

  // Auto-scroll streaming text
  const selectedTask = selectedTaskId ? tasks[selectedTaskId] : null;
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedTask?.streamText]);

  // Start a new analysis
  const handleAnalyze = useCallback(() => {
    const symbol = inputSymbol.trim().toUpperCase();
    if (!symbol) return;

    // Closure variable to track the task ID once data_loaded arrives.
    // This avoids the fragile Object.keys(tasks).pop() approach and
    // correctly routes all subsequent events to the right task.
    let currentTaskId: string | null = null;

    analyzeCompanyStream(
      { symbol },
      (event) => {
        if (event.type === 'data_loaded' && event.analysis_id) {
          currentTaskId = event.analysis_id;
          registerTask(currentTaskId, {
            symbol: event.symbol || symbol,
            companyName: event.company_name || symbol,
            model: 'default',
            provider: 'default',
          });
          setSelectedTaskId(currentTaskId);
          handleEvent(currentTaskId, event);
        } else if (currentTaskId) {
          handleEvent(currentTaskId, event);
          if (event.type === 'result') {
            finishTask(currentTaskId, 'completed');
          } else if (event.type === 'error') {
            finishTask(currentTaskId, 'error');
          }
        }
      },
    );

    setInputSymbol('');
  }, [inputSymbol, registerTask, handleEvent, finishTask]);

  const taskList = Object.values(tasks).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <Box sx={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      bgcolor: theme.background.primary, color: theme.text.primary,
      fontFamily: FONT_UI,
    }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 3, py: 1.5, borderBottom: `1px solid ${theme.border.subtle}`,
        flexShrink: 0,
      }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700, fontFamily: FONT_UI, letterSpacing: '-0.02em' }}>
          Company Agent — Task Manager
        </Typography>
        <Typography sx={{ fontSize: 11, color: theme.text.disabled, fontFamily: FONT_MONO }}>
          {taskList.length} tasks · {taskList.filter(t => t.status === 'running').length} running
        </Typography>
      </Box>

      {/* Body: Task List | Detail */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: Task List */}
        <Box sx={{
          width: 320, flexShrink: 0, borderRight: `1px solid ${theme.border.subtle}`,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Search bar */}
          <Box sx={{
            display: 'flex', gap: 1, p: 1.5, borderBottom: `1px solid ${theme.border.subtle}`,
          }}>
            <Box
              component="input"
              value={inputSymbol}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputSymbol(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleAnalyze()}
              placeholder="Symbol (e.g. AAPL)"
              sx={{
                flex: 1, px: 1.5, py: 0.75, borderRadius: '6px', fontSize: 13,
                bgcolor: theme.background.secondary,
                border: `1px solid ${theme.border.subtle}`,
                color: theme.text.primary, fontFamily: FONT_MONO,
                outline: 'none',
                '&:focus': { borderColor: theme.brand.primary },
                '&::placeholder': { color: theme.text.disabled },
              }}
            />
            <Box
              component="button"
              onClick={handleAnalyze}
              sx={{
                px: 2, py: 0.75, borderRadius: '6px', fontSize: 12, fontWeight: 600,
                bgcolor: theme.brand.primary, color: '#fff', border: 'none',
                cursor: 'pointer', fontFamily: FONT_UI, whiteSpace: 'nowrap',
                '&:hover': { opacity: 0.9 },
              }}
            >
              Analyze
            </Box>
          </Box>

          {/* Task items */}
          <Box sx={{
            flex: 1, overflow: 'auto',
            '&::-webkit-scrollbar': { width: 4 },
            '&::-webkit-scrollbar-thumb': { bgcolor: `${theme.text.muted}18`, borderRadius: 4 },
          }}>
            {taskList.length === 0 && (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 12, color: theme.text.disabled }}>
                  No tasks yet. Enter a symbol above to start.
                </Typography>
              </Box>
            )}

            {taskList.map((task) => {
              const isSelected = selectedTaskId === task.id;
              const completedGates = Object.keys(task.gateResults).length;

              return (
                <Box
                  key={task.id}
                  onClick={() => {
                    setSelectedTaskId(task.id);
                    // If running and not connected, reconnect
                    if (task.status === 'running' && !task._cleanup) {
                      reconnectTask(task.id);
                    }
                  }}
                  sx={{
                    px: 2, py: 1.5, cursor: 'pointer',
                    borderBottom: `1px solid ${theme.border.subtle}15`,
                    bgcolor: isSelected ? `${theme.brand.primary}08` : 'transparent',
                    borderLeft: isSelected ? `3px solid ${theme.brand.primary}` : '3px solid transparent',
                    transition: 'background-color 0.15s',
                    '&:hover': { bgcolor: `${theme.text.primary}05` },
                  }}
                >
                  {/* Row 1: Symbol + Status */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, fontFamily: FONT_MONO, color: theme.text.primary }}>
                        {task.symbol}
                      </Typography>
                      <Typography sx={{ fontSize: 10, color: theme.text.disabled, fontFamily: FONT_UI }}>
                        {task.companyName}
                      </Typography>
                    </Box>

                    {/* Status indicator */}
                    {task.status === 'completed' && (
                      <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#10b981', fontFamily: FONT_UI }}>
                        已完成
                      </Typography>
                    )}
                    {task.status === 'error' && (
                      <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#ef4444', fontFamily: FONT_UI }}>
                        失败
                      </Typography>
                    )}
                  </Box>

                  {/* Row 2: Running animation or verdict */}
                  {task.status === 'running' && (
                    <RunningStatus color={theme.brand.primary} gate={task.currentGate} />
                  )}
                  {task.status === 'completed' && completedGates > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
                      {/* Show verdict if available from gate 7 */}
                      {task.gateResults[7]?.parsed?.position_holding?.action && (
                        <Box sx={{
                          px: 0.75, py: 0.1, borderRadius: '4px',
                          bgcolor: `${ACTION_COLORS[task.gateResults[7].parsed.position_holding.action] || '#666'}12`,
                        }}>
                          <Typography sx={{
                            fontSize: 10, fontWeight: 800,
                            color: ACTION_COLORS[task.gateResults[7].parsed.position_holding.action] || theme.text.muted,
                          }}>
                            {task.gateResults[7].parsed.position_holding.action}
                          </Typography>
                        </Box>
                      )}
                      <Typography sx={{ fontSize: 9, color: theme.text.disabled, fontFamily: FONT_MONO }}>
                        {completedGates}/{TOTAL_GATES} gates
                      </Typography>
                    </Box>
                  )}

                  {/* Row 3: Progress bar for running */}
                  {task.status === 'running' && (
                    <GateProgress task={task} brandColor={theme.brand.primary} />
                  )}

                  {/* Row 4: Meta */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Typography sx={{ fontSize: 9, color: theme.text.disabled, fontFamily: FONT_MONO }}>
                      {task.model}
                    </Typography>
                    <Typography sx={{ fontSize: 9, color: theme.text.disabled }}>
                      {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Right: Detail View */}
        <Box sx={{
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {!selectedTask ? (
            /* Empty state */
            <Box sx={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 1,
            }}>
              <Typography sx={{ fontSize: 14, color: theme.text.disabled, fontFamily: FONT_UI }}>
                Select a task or start a new analysis
              </Typography>
              <Typography sx={{ fontSize: 11, color: theme.text.disabled, fontFamily: FONT_MONO }}>
                Tasks persist across page navigation and refresh
              </Typography>
            </Box>
          ) : (
            /* Task detail */
            <>
              {/* Detail header */}
              <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                px: 3, py: 1.5, borderBottom: `1px solid ${theme.border.subtle}`,
                flexShrink: 0,
              }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
                  <Typography sx={{ fontSize: 18, fontWeight: 700, fontFamily: FONT_MONO, letterSpacing: '-0.02em' }}>
                    {selectedTask.symbol}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: theme.text.muted }}>
                    {selectedTask.companyName}
                  </Typography>
                  {selectedTask.status === 'running' && (
                    <RunningStatus color={theme.brand.primary} gate={selectedTask.currentGate} />
                  )}
                  {selectedTask.status === 'completed' && (
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#10b981' }}>
                      已完成
                    </Typography>
                  )}
                  {selectedTask.status === 'error' && (
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#ef4444' }}>
                      失败
                    </Typography>
                  )}
                </Box>

                {/* Reconnect button for running tasks */}
                {selectedTask.status === 'running' && !selectedTask._cleanup && (
                  <Box
                    component="button"
                    onClick={() => reconnectTask(selectedTask.id)}
                    sx={{
                      px: 1.5, py: 0.5, borderRadius: '6px', fontSize: 11, fontWeight: 600,
                      bgcolor: 'transparent', color: theme.brand.primary,
                      border: `1px solid ${theme.brand.primary}40`,
                      cursor: 'pointer', fontFamily: FONT_UI,
                      '&:hover': { bgcolor: `${theme.brand.primary}08` },
                    }}
                  >
                    Reconnect
                  </Box>
                )}
              </Box>

              {/* Gate progress strip */}
              <Box sx={{
                display: 'flex', gap: 0, px: 3, py: 1,
                borderBottom: `1px solid ${theme.border.subtle}`,
                flexShrink: 0,
              }}>
                {Array.from({ length: TOTAL_GATES }, (_, i) => i + 1).map((g) => {
                  const isDone = !!selectedTask.gateResults[g];
                  const isCurrent = selectedTask.currentGate === g && selectedTask.status === 'running';
                  const isReplay = selectedTask.gateResults[g]?.replay;

                  return (
                    <Box key={g} sx={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.3,
                    }}>
                      <Box sx={{
                        width: '100%', height: 3, borderRadius: 2, mx: 0.25,
                        bgcolor: isDone
                          ? isReplay ? '#10b98180' : '#10b981'
                          : isCurrent ? theme.brand.primary
                          : `${theme.text.disabled}20`,
                        transition: 'background-color 0.3s',
                      }} />
                      <Typography sx={{
                        fontSize: 8, fontWeight: isDone || isCurrent ? 600 : 400,
                        color: isDone ? '#10b981' : isCurrent ? theme.brand.primary : theme.text.disabled,
                        fontFamily: FONT_UI, whiteSpace: 'nowrap',
                      }}>
                        {GATE_NAMES[g] || `G${g}`}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>

              {/* Gate results + streaming */}
              <Box
                ref={scrollRef}
                sx={{
                  flex: 1, overflow: 'auto', px: 3, py: 2,
                  '&::-webkit-scrollbar': { width: 4 },
                  '&::-webkit-scrollbar-thumb': { bgcolor: `${theme.text.muted}18`, borderRadius: 4 },
                }}
              >
                <Box sx={{ maxWidth: 720 }}>
                  {/* Completed gates */}
                  {Object.values(selectedTask.gateResults)
                    .sort((a, b) => a.gate - b.gate)
                    .map((gate) => (
                      <Box key={gate.gate} sx={{
                        mb: 2, pb: 2,
                        borderBottom: `1px solid ${theme.border.subtle}15`,
                      }}>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 1 }}>
                          <Typography sx={{
                            fontSize: 11, color: '#10b981', fontFamily: FONT_MONO, fontWeight: 600,
                          }}>
                            {gate.replay ? '↺' : '✓'}
                          </Typography>
                          <Typography sx={{
                            fontSize: 13, fontWeight: 600, color: theme.text.primary, fontFamily: FONT_UI,
                          }}>
                            {gate.display_name || GATE_NAMES[gate.gate] || `Gate ${gate.gate}`}
                          </Typography>
                          {gate.latency_ms && (
                            <Typography sx={{ fontSize: 10, color: theme.text.disabled, fontFamily: FONT_MONO }}>
                              {(gate.latency_ms / 1000).toFixed(1)}s
                            </Typography>
                          )}
                          {gate.replay && (
                            <Typography sx={{
                              fontSize: 9, color: theme.text.disabled, fontFamily: FONT_UI,
                              fontStyle: 'italic',
                            }}>
                              replayed
                            </Typography>
                          )}
                        </Box>

                        {/* Gate raw text (collapsed) */}
                        {gate.raw && (
                          <Typography sx={{
                            fontSize: 13, lineHeight: 1.8, color: theme.text.secondary,
                            fontFamily: FONT_SERIF, whiteSpace: 'pre-wrap',
                            maxHeight: 120, overflow: 'hidden',
                            maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                          }}>
                            {gate.raw.slice(0, 500)}
                          </Typography>
                        )}
                      </Box>
                    ))}

                  {/* Active streaming */}
                  {selectedTask.status === 'running' && selectedTask.streamText && (
                    <Box sx={{ mt: 1 }}>
                      <Typography sx={{
                        fontSize: 13, fontWeight: 600, color: theme.brand.primary,
                        fontFamily: FONT_UI, mb: 1,
                      }}>
                        {GATE_NAMES[selectedTask.streamGate] || `Gate ${selectedTask.streamGate}`}
                      </Typography>
                      <Box sx={{
                        p: 2, borderRadius: '4px',
                        bgcolor: theme.background.secondary,
                        borderLeft: `3px solid ${theme.brand.primary}40`,
                        fontFamily: FONT_SERIF, fontSize: 13, lineHeight: 1.8,
                        color: theme.text.secondary, whiteSpace: 'pre-wrap',
                      }}>
                        {selectedTask.streamText}
                        <Box component="span" sx={{
                          display: 'inline-block', width: 2, height: 16,
                          bgcolor: theme.brand.primary, ml: 0.5, verticalAlign: 'text-bottom',
                          animation: 'caret-blink 1s step-end infinite',
                          '@keyframes caret-blink': {
                            '0%, 100%': { opacity: 1 },
                            '50%': { opacity: 0 },
                          },
                        }} />
                      </Box>
                    </Box>
                  )}

                  {/* Empty detail state */}
                  {Object.keys(selectedTask.gateResults).length === 0 && !selectedTask.streamText && (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                      <Typography sx={{ fontSize: 12, color: theme.text.disabled }}>
                        {selectedTask.status === 'running'
                          ? 'Waiting for gate results...'
                          : 'No gate results available.'}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
