// News types for NewsTimelinePage

// Label type aliases
export type ImportanceLevel = 'critical' | 'high' | 'medium' | 'low';
// Support both bullish/bearish and positive/negative naming from different backend sources
export type ImpactDirection = 'bullish' | 'bearish' | 'neutral' | 'positive' | 'negative';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface NewsItem {
  id: string;
  source: string;
  time: string;
  headline: string;
  title?: string;
  title_zh?: string;
  summary?: string;
  content?: string;
  content_zh?: string;
  content_full?: string;
  content_full_zh?: string;
  tags: string[];
  important: boolean;
  publish_time?: string;
  date?: string;
  created_at?: string;
  updated_at?: string;
  // AI analysis fields (pre-loaded from backend)
  ai_analysis_status?: 'pending' | 'completed' | 'failed';
  ai_analysis?: string;
  ai_impact?: ImpactDirection;
  // Auto-labeling fields
  importance_level?: ImportanceLevel;
  impact_confidence?: ConfidenceLevel;
}

export interface NewsDataByDate {
  [date: string]: NewsItem[];
}

export interface MonthlyNewsResponse {
  success: boolean;
  data: NewsDataByDate;
  total_count?: number;
  date_range?: {
    start_date: string;
    end_date: string;
  };
  category?: string;
}

export interface ArticleDetailResponse {
  success: boolean;
  data: {
    id: string;
    title: string;
    title_zh?: string;
    content: string;
    content_zh?: string;
    source: string;
    author?: string;
    publish_time: string;
    url?: string;
    importance_level?: ImportanceLevel;
    ai_impact?: ImpactDirection;
    impact_confidence?: ConfidenceLevel;
  };
}

export interface NewsAnalysisStreamData {
  content?: string;
  done?: boolean;
  impact?: ImpactDirection;
  analysis?: string;
  error?: string;
}

export interface AnalysisResult {
  loading: boolean;
  impact?: ImpactDirection;
  analysis?: string;
  streamContent?: string;
  error?: string | null;
}

export interface FeedbackState {
  userFeedback: 'like' | 'dislike' | null;
}

export type NewsFilterType = 'all' | 'important' | 'crypto' | 'stocks' | 'forex' | 'critical' | 'high' | 'medium' | 'low';
