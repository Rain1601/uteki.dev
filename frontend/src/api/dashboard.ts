import { get } from './client';

export interface EvalOverview {
  total_arena_runs: number;
  harness_breakdown: Record<string, number>;
  total_decisions: number;
  decision_breakdown: Record<string, number>;
  best_model: string;
  avg_win_rate: number;
  avg_latency_ms: number;
  avg_cost_usd: number;
  total_cost_usd: number;
}

export interface LeaderboardEntry {
  id: string;
  model_provider: string;
  model_name: string;
  adoption_count: number;
  adoption_rate: number;
  approve_vote_count: number;
  rejection_count: number;
  model_score: number;
  win_count: number;
  loss_count: number;
  win_rate: number;
  total_decisions: number;
  avg_return_pct: number;
  rank: number;
}

export interface DecisionItem {
  id: string;
  harness_id: string;
  adopted_model_io_id: string | null;
  user_action: string;
  original_allocations: Array<{
    symbol?: string;
    etf?: string;
    amount: number;
    percentage: number;
  }>;
  created_at: string;
  harness_type?: string;
  adopted_model?: { provider: string; name: string } | null;
}

export interface CompanyAnalysis {
  id: string;
  symbol: string;
  company_name: string;
  provider: string;
  model: string;
  status: string;
  verdict_action: string | null;
  verdict_conviction: number | null;
  verdict_quality: string | null;
  total_latency_ms: number | null;
  created_at: string;
}

export async function getEvalOverview(): Promise<EvalOverview | null> {
  try {
    const resp = await get<{ success: boolean; data: EvalOverview }>('/api/index/evaluation/overview');
    return resp.success ? resp.data : null;
  } catch {
    return null;
  }
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const resp = await get<{ success: boolean; data: LeaderboardEntry[] }>('/api/index/leaderboard');
    return resp.success ? resp.data : [];
  } catch {
    return [];
  }
}

export async function getDecisions(limit = 10): Promise<DecisionItem[]> {
  try {
    const resp = await get<{ success: boolean; data: DecisionItem[] }>('/api/index/decisions', {
      params: { limit },
    });
    return resp.success ? resp.data : [];
  } catch {
    return [];
  }
}

export async function getCompanyAnalyses(limit = 10): Promise<CompanyAnalysis[]> {
  try {
    const resp = await get<CompanyAnalysis[]>('/api/company/analyses', {
      params: { limit },
    });
    return Array.isArray(resp) ? resp : [];
  } catch {
    return [];
  }
}
