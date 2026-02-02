/**
 * Economic Calendar API module - FOMC meetings and economic events
 */

import { get } from './client';
import {
  MonthlyEventsResponse,
  StatisticsResponse,
  EventsByDate,
  EventStatistics,
  EventFilterType,
} from '../types/economicCalendar';

/**
 * Get monthly economic events with optional FMP data enrichment
 */
export async function getMonthlyEventsEnriched(
  year: number,
  month: number,
  eventType: EventFilterType = 'all'
): Promise<MonthlyEventsResponse> {
  try {
    const params: Record<string, string> = {};
    if (eventType && eventType !== 'all') {
      params.event_type = eventType;
    }

    const data = await get<MonthlyEventsResponse>(
      `/api/economic-calendar/events/monthly/${year}/${month}/enriched`,
      { params }
    );
    return data;
  } catch (error) {
    console.error('Failed to fetch monthly events:', error);
    return {
      success: false,
      data: {},
    };
  }
}

/**
 * Get event statistics
 */
export async function getEventStatistics(): Promise<StatisticsResponse> {
  try {
    const data = await get<StatisticsResponse>(
      `/api/economic-calendar/statistics`
    );
    return data;
  } catch (error) {
    console.error('Failed to fetch event statistics:', error);
    return {
      success: false,
      data: { total: 0 },
    };
  }
}

/**
 * Get events for a specific date from pre-fetched data
 */
export function getEventsForDate(
  eventsByDate: EventsByDate,
  date: string
): ReturnType<typeof import('../types/economicCalendar').EventsByDate[keyof EventsByDate]> {
  return eventsByDate[date] || [];
}

/**
 * Get all dates that have events
 */
export function getDatesWithEvents(eventsByDate: EventsByDate): string[] {
  return Object.keys(eventsByDate).filter(
    (date) => eventsByDate[date] && eventsByDate[date].length > 0
  );
}

/**
 * Format date for API calls (YYYY-MM-DD)
 */
export function formatDateForApi(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse date from API response
 */
export function parseDateFromApi(dateStr: string): Date {
  return new Date(dateStr);
}
