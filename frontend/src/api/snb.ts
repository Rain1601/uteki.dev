import { get, post } from './client';
import apiClient from './client';

// Types
export interface SnbBalance {
  total_value: number;
  cash: number;
  market_value: number;
  available_funds?: number;
  [key: string]: any;
}

export interface SnbPosition {
  symbol: string;
  quantity: number;
  average_price: number;
  market_price: number;
  cost: number;
  market_value: number;
  unrealized_pnl: number;
  [key: string]: any;
}

export interface SnbOrder {
  order_id: string;
  symbol: string;
  side: string;
  order_type: string;
  quantity: number;
  price?: number;
  status: string;
  time_in_force?: string;
  [key: string]: any;
}

export interface SnbTransaction {
  id: string;
  account_id: string;
  symbol: string;
  trade_time: number;
  side: string;
  quantity: number;
  price: number;
  commission?: number;
  order_id?: string;
  note?: SnbTransactionNote | null;
  created_at?: string;
  updated_at?: string;
}

export interface SnbTransactionNote {
  id: string;
  account_id: string;
  symbol: string;
  trade_time: number;
  side: string;
  is_reasonable: boolean | null;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface SnbResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PlaceOrderParams {
  symbol: string;
  side: string;
  quantity: number;
  order_type?: string;
  price?: number;
  time_in_force?: string;
  totp_code: string;
}

export interface UpsertNoteParams {
  account_id: string;
  symbol: string;
  trade_time: number;
  side: string;
  is_reasonable: boolean | null;
  notes: string;
}

export interface TotpSetupResult {
  secret: string;
  provisioning_uri: string;
  qr_code_base64: string;
  instruction?: string; // only present in fallback (no-auth) mode
}

// TOTP
export async function fetchTotpStatus(): Promise<{ configured: boolean }> {
  return get<{ configured: boolean }>('/api/snb/totp/status');
}

export async function setupTotp(): Promise<TotpSetupResult> {
  return post<TotpSetupResult>('/api/snb/totp/setup');
}

// SNB API functions
export async function fetchStatus(): Promise<SnbResponse> {
  return get<SnbResponse>('/api/snb/status');
}

export async function fetchBalance(): Promise<SnbResponse<SnbBalance>> {
  return get<SnbResponse<SnbBalance>>('/api/snb/balance');
}

export async function fetchPositions(): Promise<SnbResponse<SnbPosition[]>> {
  return get<SnbResponse<SnbPosition[]>>('/api/snb/positions');
}

export async function fetchOrders(status?: string, limit?: number): Promise<SnbResponse<SnbOrder[]>> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return get<SnbResponse<SnbOrder[]>>(`/api/snb/orders${qs ? `?${qs}` : ''}`);
}

export async function placeOrder(params: PlaceOrderParams): Promise<SnbResponse> {
  return post<SnbResponse>('/api/snb/orders', params);
}

export async function cancelOrder(orderId: string, totpCode: string): Promise<SnbResponse> {
  return post<SnbResponse>(`/api/snb/orders/${orderId}/cancel`, { totp_code: totpCode });
}

export async function fetchTransactions(symbol?: string, limit?: number): Promise<SnbResponse<SnbTransaction[]>> {
  const params = new URLSearchParams();
  if (symbol) params.set('symbol', symbol);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return get<SnbResponse<SnbTransaction[]>>(`/api/snb/transactions${qs ? `?${qs}` : ''}`);
}

export async function upsertTransactionNote(params: UpsertNoteParams): Promise<SnbResponse<SnbTransactionNote>> {
  return apiClient.put<SnbResponse<SnbTransactionNote>>('/api/snb/transactions/notes', params).then(res => res.data);
}
