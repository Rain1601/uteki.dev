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
