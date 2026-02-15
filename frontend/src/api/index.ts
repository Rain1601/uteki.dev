import { get, post, put, del } from './client';

// ── Types ──

export interface WatchlistItem {
  id: string;
  symbol: string;
  name?: string;
  etf_type?: string;
  is_active: boolean;
  notes?: string;
  created_at?: string;
}

export interface QuoteData {
  symbol: string;
  price?: number;
  change_pct?: number;
  pe_ratio?: number;
  market_cap?: number;
  volume?: number;
  high_52w?: number;
  low_52w?: number;
  ma50?: number;
  ma200?: number;
  rsi?: number;
  timestamp?: string;
  stale: boolean;
  // Today's OHLC
  today_open?: number;
  today_high?: number;
  today_low?: number;
  previous_close?: number;
}

export interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestResult {
  symbol: string;
  total_return_pct: number;
  annualized_return_pct: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  final_value: number;
  total_invested: number;
  monthly_values: Array<{ month: string; value: number; price: number; invested: number }>;
  error?: string;
}

export interface PromptVersion {
  id: string;
  prompt_type: string;
  version: string;
  content: string;
  description: string;
  is_current: boolean;
  created_at?: string;
}

export interface MemoryItem {
  id: string;
  category: string;
  content: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface PipelineStep {
  skill: string;
  latency_ms?: number;
  status: string;
  output_summary?: string;
  error?: string;
}

export interface ModelIOSummary {
  id: string;
  harness_id: string;
  model_provider: string;
  model_name: string;
  input_token_count?: number;
  output_structured?: Record<string, any>;
  output_token_count?: number;
  tool_calls?: any[];
  latency_ms?: number;
  cost_usd?: number;
  parse_status?: string;
  status?: string;
  error_message?: string;
  pipeline_steps?: PipelineStep[];
  created_at?: string;
}

export interface ModelIODetail extends ModelIOSummary {
  input_prompt: string;
  output_raw?: string;
  output_structured?: Record<string, any>;
  error_message?: string;
}

export interface ArenaVote {
  id: string;
  harness_id: string;
  voter_model_io_id: string;
  target_model_io_id: string;
  vote_type: 'approve' | 'reject';
  reasoning?: string;
  created_at?: string;
}

export interface ArenaFinalDecision {
  winner_model_io_id: string;
  winner_model_provider: string;
  winner_model_name: string;
  winner_action: string;
  net_score: number;
  total_approve: number;
  total_reject: number;
  vote_summary: Record<string, { approve: number; reject: number; net: number }>;
}

export interface ArenaResult {
  harness_id: string;
  harness_type: string;
  prompt_version_id: string;
  prompt_version?: string;
  models: ModelIOSummary[];
  votes?: ArenaVote[];
  final_decision?: ArenaFinalDecision;
  pipeline_phases?: Record<string, number>;
}

export interface ArenaHistoryItem {
  harness_id: string;
  harness_type: string;
  created_at: string;
  budget: number | null;
  model_count: number;
  prompt_version?: string;
  vote_winner_model?: string;
  vote_winner_action?: string;
}

export interface ArenaTimelinePoint {
  harness_id: string;
  created_at: string;
  account_total: number | null;
  action: string | null;
  harness_type: string;
  model_count: number;
  prompt_version?: string;
  budget: number | null;
  vote_winner_model?: string;
  vote_winner_action?: string;
}

export interface DecisionLogItem {
  id: string;
  harness_id: string;
  adopted_model_io_id?: string;
  user_action: string;
  original_allocations?: any[];
  executed_allocations?: any[];
  execution_results?: any[];
  user_notes?: string;
  harness_type?: string;
  prompt_version_id?: string;
  model_count?: number;
  adopted_model?: { provider: string; name: string };
  created_at?: string;
}

export interface DecisionDetail extends DecisionLogItem {
  harness: Record<string, any>;
  model_ios: ModelIOSummary[];
  counterfactuals: CounterfactualItem[];
}

export interface CounterfactualItem {
  id: string;
  decision_log_id: string;
  model_io_id: string;
  was_adopted: boolean;
  tracking_days: number;
  hypothetical_return_pct: number;
  actual_prices: Record<string, any>;
  calculated_at?: string;
}

export interface LeaderboardEntry {
  rank: number;
  model_provider: string;
  model_name: string;
  adoption_count: number;
  adoption_rate: number;
  approve_vote_count: number;
  rejection_count: number;
  model_score: number;
  win_count: number;
  win_rate: number;
  avg_return_pct: number;
  counterfactual_win_rate: number;
  total_decisions: number;
  simulated_return_pct?: number;
  decision_accuracy?: number;
  confidence_calibration?: number;
}

export interface AgentBacktestResult {
  agent_key: string;
  start_date: string;
  end_date: string;
  frequency: string;
  total_decisions: number;
  accuracy: number;
  total_return_pct: number;
  benchmark_return_pct: number;
  alpha_pct: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  equity_curve: Array<{ date: string; value: number }>;
  benchmark_curve: Array<{ date: string; value: number }>;
  decisions: Array<{
    date: string;
    action: string;
    confidence: number;
    is_correct?: boolean;
  }>;
}

export interface ScheduleTask {
  id: string;
  name: string;
  cron_expression: string;
  task_type: string;
  config?: Record<string, any>;
  is_enabled: boolean;
  last_run_at?: string;
  last_run_status?: string;
  next_run_at?: string;
  created_at?: string;
}

export interface DecisionCard {
  type: string;
  harness_id: string;
  harness_type: string;
  source_model: { provider: string; name: string };
  action: string;
  allocations: Array<{ etf: string; amount: number; percentage: number; reason?: string }>;
  confidence?: number;
  reasoning?: string;
  risk_assessment?: string;
  budget?: number;
}

export interface IndexResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ── Watchlist ──

export const fetchWatchlist = () =>
  get<IndexResponse<WatchlistItem[]>>('/api/index/watchlist');

export const addToWatchlist = (symbol: string, name?: string, etf_type?: string) =>
  post<IndexResponse<WatchlistItem>>('/api/index/watchlist', { symbol, name, etf_type });

export const removeFromWatchlist = (symbol: string) =>
  del<IndexResponse>(`/api/index/watchlist/${symbol}`);

export const updateWatchlistNotes = (symbol: string, notes: string) =>
  put<IndexResponse<WatchlistItem>>(`/api/index/watchlist/${symbol}/notes`, { notes });

// ── Quotes & History ──

export const fetchQuote = (symbol: string) =>
  get<IndexResponse<QuoteData>>(`/api/index/quotes/${symbol}`);

export const fetchHistory = (symbol: string, start?: string, end?: string) => {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  const qs = params.toString();
  return get<IndexResponse<PricePoint[]>>(`/api/index/history/${symbol}${qs ? `?${qs}` : ''}`);
};

export const refreshData = () =>
  post<IndexResponse>('/api/index/data/refresh');

export const syncData = () =>
  post<IndexResponse<{ synced: any[]; already_fresh: string[]; failed: any[] }>>('/api/index/data/sync');

export interface DataValidationResult {
  symbol: string;
  is_valid: boolean;
  missing_dates: string[];
  first_date?: string;
  last_date?: string;
  total_records: number;
  error?: string;
}

export const validateData = (symbol?: string) => {
  const qs = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
  return post<IndexResponse<DataValidationResult | Record<string, DataValidationResult>>>(
    `/api/index/data/validate${qs}`
  );
};

// ── Backtest ──

export const runBacktest = (params: {
  symbol: string; start: string; end: string;
  initial_capital?: number; monthly_dca?: number;
}) => post<IndexResponse<BacktestResult>>('/api/index/backtest', params);

export const runBacktestCompare = (params: {
  symbols: string[]; start: string; end: string;
  initial_capital?: number; monthly_dca?: number;
}) => post<IndexResponse<BacktestResult[]>>('/api/index/backtest/compare', params);

// ── Prompt (system / user) ──

export const fetchCurrentPrompt = (promptType: string = 'system') =>
  get<IndexResponse<PromptVersion>>(`/api/index/prompt/current?prompt_type=${promptType}`);

export const updatePrompt = (content: string, description: string, promptType: string = 'system') =>
  put<IndexResponse<PromptVersion>>(`/api/index/prompt?prompt_type=${promptType}`, { content, description });

export const fetchPromptHistory = (promptType: string = 'system') =>
  get<IndexResponse<PromptVersion[]>>(`/api/index/prompt/history?prompt_type=${promptType}`);

export const activatePromptVersion = (versionId: string) =>
  put<IndexResponse<PromptVersion>>(`/api/index/prompt/${versionId}/activate`);

export const deletePromptVersion = (versionId: string) =>
  del<IndexResponse<void>>(`/api/index/prompt/${versionId}`);

export const previewUserPrompt = () =>
  post<IndexResponse<{ rendered: string; variables: Record<string, string> }>>('/api/index/prompt/preview');

// ── Memory ──

export const fetchMemory = (category?: string, limit?: number) => {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return get<IndexResponse<MemoryItem[]>>(`/api/index/memory${qs ? `?${qs}` : ''}`);
};

export const writeMemory = (category: string, content: string, metadata?: Record<string, any>) =>
  post<IndexResponse<MemoryItem>>('/api/index/memory', { category, content, metadata });

export const deleteMemory = (memoryId: string) =>
  del<IndexResponse>(`/api/index/memory/${memoryId}`);

// ── Tools ──

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export const fetchToolDefinitions = () =>
  get<IndexResponse<Record<string, ToolDefinition>>>('/api/index/tools');

export const testTool = (toolName: string, args: Record<string, any>) =>
  post<IndexResponse<any>>(`/api/index/tools/${toolName}/test`, { arguments: args });

// ── Account & Agent Config ──

export interface AccountSummary {
  total: number;
  cash: number;
  positions_value: number;
  error?: string;
}

export interface AgentConfig {
  budget?: number;
  [key: string]: any;
}

export const fetchAccountSummary = () =>
  get<IndexResponse<AccountSummary>>('/api/index/account/summary');

export const fetchAgentConfig = () =>
  get<IndexResponse<AgentConfig>>('/api/index/agent-config');

export const saveAgentConfig = (config: AgentConfig) =>
  put<IndexResponse<AgentConfig>>('/api/index/agent-config', { config });

// ── Arena ──

export interface ArenaProgressEvent {
  type: 'phase_start' | 'model_start' | 'skill_start' | 'skill_complete' | 'model_complete' | 'result' | 'error';
  phase?: string;
  model?: string;
  skill?: string;
  step?: number;
  total?: number;
  total_models?: number;
  latency_ms?: number;
  status?: string;
  parse_status?: string;
  error?: string;
  message?: string;
  data?: ArenaResult;
}

export const runArena = (params: {
  harness_type?: string; budget?: number; constraints?: Record<string, any>;
}) => post<IndexResponse<ArenaResult>>('/api/index/arena/run', params, { timeout: 180000 });

export const runArenaStream = (
  params: { harness_type?: string; budget?: number; constraints?: Record<string, any>; models?: { provider: string; model: string }[] },
  onEvent: (event: ArenaProgressEvent) => void,
): { cancel: () => void } => {
  const controller = new AbortController();
  const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8888';
  const token = localStorage.getItem('auth_token');

  (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/index/arena/run/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok) {
        onEvent({ type: 'error', message: `HTTP ${response.status}` });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              onEvent(event);
            } catch { /* ignore parse errors */ }
          }
        }
      }

      // Process remaining buffer
      if (buffer.startsWith('data: ')) {
        try {
          const event = JSON.parse(buffer.slice(6));
          onEvent(event);
        } catch { /* ignore */ }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        onEvent({ type: 'error', message: e.message || 'Stream failed' });
      }
    }
  })();

  return { cancel: () => controller.abort() };
};

export const fetchArenaTimeline = (limit = 50) =>
  get<IndexResponse<ArenaTimelinePoint[]>>(`/api/index/arena/timeline?limit=${limit}`);

export const fetchArenaHistory = (limit = 20, offset = 0) =>
  get<IndexResponse<ArenaHistoryItem[]>>(`/api/index/arena/history?limit=${limit}&offset=${offset}`);

export const fetchArenaResults = (harnessId: string) =>
  get<IndexResponse<ModelIOSummary[]>>(`/api/index/arena/${harnessId}`);

export const fetchModelIODetail = (harnessId: string, modelIoId: string) =>
  get<IndexResponse<ModelIODetail>>(`/api/index/arena/${harnessId}/model/${modelIoId}`);

export const fetchArenaVotes = (harnessId: string) =>
  get<IndexResponse<ArenaVote[]>>(`/api/index/arena/${harnessId}/votes`);

export const runAgentBacktest = (params: {
  agent_key: string;
  start_date: string;
  end_date: string;
  frequency?: string;
}) => {
  const p = new URLSearchParams();
  p.set('agent_key', params.agent_key);
  p.set('start_date', params.start_date);
  p.set('end_date', params.end_date);
  if (params.frequency) p.set('frequency', params.frequency);
  return get<IndexResponse<AgentBacktestResult>>(`/api/index/arena/backtest?${p.toString()}`);
};

// ── Decisions ──

export const fetchDecisions = (params?: {
  limit?: number; offset?: number; user_action?: string;
  harness_type?: string; start_date?: string; end_date?: string;
}) => {
  const p = new URLSearchParams();
  if (params?.limit) p.set('limit', String(params.limit));
  if (params?.offset) p.set('offset', String(params.offset));
  if (params?.user_action) p.set('user_action', params.user_action);
  if (params?.harness_type) p.set('harness_type', params.harness_type);
  const qs = p.toString();
  return get<IndexResponse<DecisionLogItem[]>>(`/api/index/decisions${qs ? `?${qs}` : ''}`);
};

export const fetchDecisionDetail = (decisionId: string) =>
  get<IndexResponse<DecisionDetail>>(`/api/index/decisions/${decisionId}`);

export const adoptModel = (harnessId: string, modelIoId: string) =>
  post<IndexResponse<DecisionCard>>(`/api/index/decisions/${harnessId}/adopt`, { model_io_id: modelIoId });

export const approveDecision = (harnessId: string, totpCode: string, allocations?: any[], notes?: string) =>
  post<IndexResponse>(`/api/index/decisions/${harnessId}/approve`, {
    totp_code: totpCode, allocations, notes,
  });

export const skipDecision = (harnessId: string, notes?: string) =>
  post<IndexResponse>(`/api/index/decisions/${harnessId}/skip`, { notes });

export const rejectDecision = (harnessId: string, notes?: string) =>
  post<IndexResponse>(`/api/index/decisions/${harnessId}/reject`, { notes });

export const fetchCounterfactuals = (decisionId: string) =>
  get<IndexResponse<CounterfactualItem[]>>(`/api/index/decisions/${decisionId}/counterfactuals`);

// ── Leaderboard ──

export const fetchLeaderboard = (promptVersionId?: string) => {
  const qs = promptVersionId ? `?prompt_version_id=${promptVersionId}` : '';
  return get<IndexResponse<LeaderboardEntry[]>>(`/api/index/leaderboard${qs}`);
};

// ── Schedules ──

export const fetchSchedules = () =>
  get<IndexResponse<ScheduleTask[]>>('/api/index/schedules');

export const createSchedule = (params: {
  name: string; cron_expression: string; task_type: string; config?: Record<string, any>;
}) => post<IndexResponse<ScheduleTask>>('/api/index/schedules', params);

export const updateSchedule = (taskId: string, params: {
  cron_expression?: string; is_enabled?: boolean; config?: Record<string, any>;
}) => post<IndexResponse<ScheduleTask>>(`/api/index/schedules/${taskId}`, params);

export const deleteSchedule = (taskId: string) =>
  del<IndexResponse>(`/api/index/schedules/${taskId}`);

export const triggerSchedule = (taskId: string) =>
  post<IndexResponse>(`/api/index/schedules/${taskId}/trigger`);

// ── Agent Chat ──

export const sendAgentMessage = (message: string) =>
  post<IndexResponse<{ response: string; tool_calls?: any[]; decision_card?: any }>>('/api/index/agent/chat', { message });

// ── Debug ──

export const createIndexTables = () =>
  post<IndexResponse>('/api/index/debug/create-tables');

export const seedIndexDefaults = () =>
  post<IndexResponse>('/api/index/debug/seed');
