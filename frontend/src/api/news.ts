/**
 * News API module - Jeff Cox news and AI analysis
 */

import { get, post } from './client';
import {
  MonthlyNewsResponse,
  ArticleDetailResponse,
  NewsItem,
  NewsDataByDate,
} from '../types/news';

const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8888';

/**
 * Get monthly news by year and month
 */
export async function getMonthlyNews(
  year: number,
  month: number,
  category: string = 'all'
): Promise<MonthlyNewsResponse> {
  try {
    const data = await get<MonthlyNewsResponse>(
      `/api/news/jeff-cox/monthly/${year}/${month}`,
      { params: { category } }
    );
    return data;
  } catch (error) {
    console.error('Failed to fetch monthly news:', error);
    return {
      success: false,
      data: {},
    };
  }
}

/**
 * Get article detail by ID
 */
export async function getArticleDetail(articleId: string): Promise<ArticleDetailResponse> {
  try {
    const data = await get<ArticleDetailResponse>(
      `/api/news/jeff-cox/article/${articleId}`
    );
    return data;
  } catch (error) {
    console.error('Failed to fetch article detail:', error);
    return {
      success: false,
      data: {
        id: articleId,
        title: '',
        content: '',
        source: '',
        publish_time: '',
      },
    };
  }
}

/**
 * Get latest news
 */
export async function getLatestNews(limit: number = 20): Promise<NewsItem[]> {
  try {
    const data = await get<{ success: boolean; data: NewsItem[] }>(
      `/api/news/jeff-cox/latest`,
      { params: { limit } }
    );
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch latest news:', error);
    return [];
  }
}

/**
 * Trigger news scraping (admin function)
 */
export async function triggerScrape(): Promise<{ success: boolean; message?: string }> {
  try {
    const data = await post<{ success: boolean; message?: string }>(
      `/api/news/jeff-cox/scrape`
    );
    return data;
  } catch (error) {
    console.error('Failed to trigger scrape:', error);
    return { success: false, message: 'Failed to trigger scrape' };
  }
}

/**
 * Stream news analysis using Server-Sent Events
 */
export function analyzeNewsStream(
  title: string,
  content: string,
  source?: string,
  articleId?: string,
  onChunk?: (chunk: string) => void,
  onComplete?: (impact: string, analysis: string) => void,
  onError?: (error: string) => void
): () => void {
  const abortController = new AbortController();

  const fetchStream = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/news-analysis/analyze-news-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          content,
          source,
          article_id: articleId,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                onError?.(data.error);
                return;
              }
              if (data.content && !data.done) {
                onChunk?.(data.content);
              }
              if (data.done) {
                onComplete?.(data.impact || 'neutral', data.analysis || '');
                return;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Stream error:', error);
        onError?.((error as Error).message);
      }
    }
  };

  fetchStream();

  return () => {
    abortController.abort();
  };
}

/**
 * Stream economic event analysis using Server-Sent Events
 */
export function analyzeEventStream(
  eventTitle: string,
  eventDate: string,
  eventType?: string,
  description?: string,
  actualValue?: string,
  forecastValue?: string,
  previousValue?: string,
  onChunk?: (chunk: string) => void,
  onComplete?: (impact: string, analysis: string) => void,
  onError?: (error: string) => void
): () => void {
  const abortController = new AbortController();

  const fetchStream = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/news-analysis/analyze-event-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_title: eventTitle,
          event_date: eventDate,
          event_type: eventType,
          description,
          actual_value: actualValue,
          forecast_value: forecastValue,
          previous_value: previousValue,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                onError?.(data.error);
                return;
              }
              if (data.content && !data.done) {
                onChunk?.(data.content);
              }
              if (data.done) {
                onComplete?.(data.impact || 'neutral', data.analysis || '');
                return;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Stream error:', error);
        onError?.((error as Error).message);
      }
    }
  };

  fetchStream();

  return () => {
    abortController.abort();
  };
}
