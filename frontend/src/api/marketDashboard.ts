import { get } from './client';
import {
  OverviewResponse,
  DetailResponse,
  FlowResponse,
} from '../types/marketDashboard';

export async function getDashboardOverview(): Promise<OverviewResponse> {
  try {
    return await get<OverviewResponse>('/api/macro/dashboard/overview');
  } catch (error) {
    console.error('Failed to fetch dashboard overview:', error);
    return { success: false, data: { categories: [] } };
  }
}

export async function getValuationDetail(limit = 52): Promise<DetailResponse> {
  try {
    return await get<DetailResponse>('/api/macro/dashboard/valuation', {
      params: { limit },
    });
  } catch (error) {
    console.error('Failed to fetch valuation detail:', error);
    return { success: false, data: { category: 'valuation', question: '', signal: 'neutral', signal_label: '', indicators: [] } };
  }
}

export async function getLiquidityDetail(limit = 52): Promise<DetailResponse> {
  try {
    return await get<DetailResponse>('/api/macro/dashboard/liquidity', {
      params: { limit },
    });
  } catch (error) {
    console.error('Failed to fetch liquidity detail:', error);
    return { success: false, data: { category: 'liquidity', question: '', signal: 'neutral', signal_label: '', indicators: [] } };
  }
}

export async function getFlowDetail(): Promise<FlowResponse> {
  try {
    return await get<FlowResponse>('/api/macro/dashboard/flow');
  } catch (error) {
    console.error('Failed to fetch flow detail:', error);
    return { success: false, data: { category: 'flow', question: '', signal: 'neutral', signal_label: '', indicators: [], sectors: [], style_comparisons: [] } };
  }
}
