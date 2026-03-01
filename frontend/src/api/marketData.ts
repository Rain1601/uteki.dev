import { get } from './client';

/* ── Types ── */

export interface SymbolRecord {
  id: string;
  symbol: string;
  name: string | null;
  asset_type: string;
  exchange: string | null;
  currency: string;
  data_source: string | null;
  is_active: boolean;
}

export interface KlineRecord {
  time: string;
  symbol: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  adj_close: number | null;
}

export interface FreshnessItem {
  symbol: string;
  asset_type: string;
  expected_latest: string;
  actual_latest: string | null;
  days_behind: number;
  status: 'ok' | 'stale' | 'warning' | 'error' | 'no_data';
}

export interface QualityIssue {
  id: string;
  symbol: string;
  check_date: string;
  issue_type: string;
  severity: string;
  details: Record<string, any>;
  resolved: boolean;
}

export interface IngestionRun {
  id: string;
  source: string;
  asset_type: string;
  started_at: string;
  finished_at: string | null;
  records_inserted: number;
  records_updated: number;
  records_failed: number;
  status: string;
}

/* ── API calls ── */

export async function getSymbols(assetType?: string): Promise<{ symbols: SymbolRecord[]; total: number }> {
  try {
    return await get('/api/data/symbols', { params: { asset_type: assetType } });
  } catch (error) {
    console.error('Failed to fetch symbols:', error);
    return { symbols: [], total: 0 };
  }
}

export async function getKlines(
  symbol: string,
  interval: 'daily' | 'weekly' | 'monthly' = 'daily',
  start?: string,
  end?: string,
  limit = 2000,
): Promise<{ symbol: string; interval: string; data: KlineRecord[]; total: number }> {
  try {
    return await get(`/api/data/klines/${encodeURIComponent(symbol)}`, {
      params: { interval, start, end, limit },
    });
  } catch (error) {
    console.error(`Failed to fetch klines for ${symbol}:`, error);
    return { symbol, interval, data: [], total: 0 };
  }
}

export async function getFreshness(): Promise<{
  summary: { total: number; ok: number; stale: number; error: number };
  symbols: FreshnessItem[];
}> {
  try {
    return await get('/api/data/quality/freshness');
  } catch (error) {
    console.error('Failed to fetch freshness:', error);
    return { summary: { total: 0, ok: 0, stale: 0, error: 0 }, symbols: [] };
  }
}

export async function getQualityIssues(
  symbol?: string,
  severity?: string,
  limit = 50,
): Promise<{ issues: QualityIssue[]; total: number }> {
  try {
    return await get('/api/data/quality/issues', {
      params: { symbol, severity, unresolved_only: true, limit },
    });
  } catch (error) {
    console.error('Failed to fetch quality issues:', error);
    return { issues: [], total: 0 };
  }
}

export async function getIngestionStatus(limit = 10): Promise<{ runs: IngestionRun[]; total: number }> {
  try {
    return await get('/api/data/ingestion/status', { params: { limit } });
  } catch (error) {
    console.error('Failed to fetch ingestion status:', error);
    return { runs: [], total: 0 };
  }
}
