// Economic Calendar types for FOMCCalendar page

export type EventType = 'fomc' | 'earnings' | 'economic_data' | 'employment' | 'inflation' | 'consumption' | 'gdp';
export type EventStatus = 'upcoming' | 'ongoing' | 'past';
export type EventImportance = 'critical' | 'high' | 'medium' | 'low';

export interface EconomicEvent {
  id?: string;
  title: string;
  start_date: string;
  end_date?: string;
  event_type: EventType;
  description?: string;
  importance?: EventImportance;
  status?: EventStatus;

  // FOMC specific fields
  has_press_conference?: boolean;
  has_economic_projections?: boolean;
  quarter?: string;

  // Earnings specific fields
  company_symbol?: string;
  fiscal_quarter?: string;

  // Economic data fields (for past events)
  actual?: number | string | null;
  actual_value?: number | string | null;
  forecast?: number | string | null;
  forecast_value?: number | string | null;
  previous?: number | string | null;
  previous_value?: number | string | null;
}

export interface EventsByDate {
  [date: string]: EconomicEvent[];
}

export interface MonthlyEventsResponse {
  success: boolean;
  data: EventsByDate;
  fmp_status?: 'success' | 'failed';
  fmp_error?: string;
  enriched_count?: number;
}

export interface EventStatistics {
  total: number;
  by_type?: {
    fomc?: number;
    earnings?: number;
    economic_data?: number;
    [key: string]: number | undefined;
  };
}

export interface StatisticsResponse {
  success: boolean;
  data: EventStatistics;
}

export interface EventAnalysisStreamData {
  content?: string;
  done?: boolean;
  impact?: 'positive' | 'negative' | 'neutral';
  analysis?: string;
  error?: string;
}

export interface EventAnalysisResult {
  loading: boolean;
  impact?: 'positive' | 'negative' | 'neutral';
  analysis?: string;
  streamContent?: string;
  error?: string | null;
}

export type EventFilterType = 'all' | 'fomc' | 'employment' | 'inflation' | 'consumption,gdp';
