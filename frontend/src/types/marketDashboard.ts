export type Signal = 'green' | 'yellow' | 'red' | 'neutral';

export interface HistoryPoint {
  date: string;
  value: number;
}

export interface Indicator {
  id: string;
  name: string;
  value: number | null;
  unit?: string;
  signal: Signal;
  description?: string;
  source?: string;
  change_pct?: number | null;
  history?: HistoryPoint[] | null;
}

export interface CategoryData {
  category: 'valuation' | 'liquidity' | 'flow';
  question: string;
  signal: Signal;
  signal_label: string;
  indicators: Indicator[];
}

export interface OverviewResponse {
  success: boolean;
  data: {
    categories: CategoryData[];
  };
}

export interface DetailResponse {
  success: boolean;
  data: CategoryData;
}

export interface SectorETF {
  symbol: string;
  name: string;
  price: number | null;
  change_pct: number | null;
}

export interface StyleSide {
  symbol: string;
  name: string;
  price: number | null;
  change_pct: number | null;
}

export interface StyleComparison {
  label: string;
  a: StyleSide;
  b: StyleSide;
}

export interface FlowData extends CategoryData {
  sectors: SectorETF[];
  style_comparisons: StyleComparison[];
}

export interface FlowResponse {
  success: boolean;
  data: FlowData;
}

/* ─── Market Cap (Treemap) ─── */

export interface MarketCapAsset {
  rank: number;
  name: string;
  symbol: string | null;
  asset_type: 'company' | 'precious_metal' | 'cryptocurrency' | 'etf';
  market_cap: number;
  price: number | null;
  change_today: number | null;
  change_30d: number | null;
  country: string | null;
  data_date: string;
}

export interface MarketCapListResponse {
  success: boolean;
  data: MarketCapAsset[];
  total: number;
}

export interface MarketCapSummary {
  by_type: Record<string, { count: number; total_market_cap: number }>;
  total_assets: number;
  data_date: string | null;
}

export interface MarketCapSummaryResponse {
  success: boolean;
  data: MarketCapSummary;
}
