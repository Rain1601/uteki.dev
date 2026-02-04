import { get, post, del } from './client';

// ── Types ──

export interface WatchlistItem {
  id: string;
  symbol: string;
  name?: string;
  etf_type?: string;
  is_active: boolean;
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
  created_at?: string;
}

export interface ModelIODetail extends ModelIOSummary {
  input_prompt: string;
  output_raw?: string;
  error_message?: string;
}

export interface ArenaResult {
  harness_id: string;
  harness_type: string;
  prompt_version_id: string;
  models: ModelIOSummary[];
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
  win_count: number;
  win_rate: number;
  avg_return_pct: number;
  counterfactual_win_rate: number;
  total_decisions: number;
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

// ── Backtest ──

export const runBacktest = (params: {
  symbol: string; start: string; end: string;
  initial_capital?: number; monthly_dca?: number;
}) => post<IndexResponse<BacktestResult>>('/api/index/backtest', params);

export const runBacktestCompare = (params: {
  symbols: string[]; start: string; end: string;
  initial_capital?: number; monthly_dca?: number;
}) => post<IndexResponse<BacktestResult[]>>('/api/index/backtest/compare', params);

// ── System Prompt ──

export const fetchCurrentPrompt = () =>
  get<IndexResponse<PromptVersion>>('/api/index/prompt/current');

export const updatePrompt = (content: string, description: string) =>
  post<IndexResponse<PromptVersion>>('/api/index/prompt', { content, description });

export const fetchPromptHistory = () =>
  get<IndexResponse<PromptVersion[]>>('/api/index/prompt/history');

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

// ── Arena ──

export const runArena = (params: {
  harness_type?: string; budget?: number; constraints?: Record<string, any>;
}) => post<IndexResponse<ArenaResult>>('/api/index/arena/run', params, { timeout: 180000 });

export const fetchArenaResults = (harnessId: string) =>
  get<IndexResponse<ModelIOSummary[]>>(`/api/index/arena/${harnessId}`);

export const fetchModelIODetail = (harnessId: string, modelIoId: string) =>
  get<IndexResponse<ModelIODetail>>(`/api/index/arena/${harnessId}/model/${modelIoId}`);

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
