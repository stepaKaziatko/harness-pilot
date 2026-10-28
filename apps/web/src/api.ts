export interface User {
  id: string;
  name: string;
}

export interface Health {
  status: string;
  db: string;
  code?: string;
}

export const USER_COOKIE = 'pilot_user';

async function getJson<T>(path: string): Promise<T> {
  // Error responses (400, 503) carry a JSON body with a machine code, so parse regardless of status.
  const res = await fetch(path);
  return (await res.json()) as T;
}

export const fetchHealth = () => getJson<Health>('/api/health');
export const fetchUsers = () => getJson<User[]>('/api/users');
export const fetchMe = () => getJson<User | { code: string; message: string }>('/api/me');

/** Dev-only user selection: the API reads this cookie. It is not authentication. */
export function selectUser(id: string): void {
  document.cookie = `${USER_COOKIE}=${encodeURIComponent(id)}; Path=/; SameSite=Lax`;
}

/** A failed request: the machine code from the API body, or NETWORK when nothing answered. */
export class ApiError extends Error {
  readonly code: string;
  constructor(code: string, message = code) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export interface Quote {
  symbol: string;
  name: string;
  priceCents: number;
  prevCloseCents: number;
  updatedAt: string;
}

export interface HistoryPoint {
  ts: string;
  priceCents: number;
}

export interface History {
  symbol: string;
  points: HistoryPoint[];
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  symbol: string | null;
}

export interface Balance {
  currency: string;
  cashCents: number;
  positions: { symbol: string; quantity: number; valueCents: number }[];
  totalCents: number;
}

export interface WatchlistEntry {
  symbol: string;
  name: string;
}

export type Side = 'buy' | 'sell';

export interface Operation {
  id: number;
  symbol: string;
  side: Side;
  quantity: number;
  priceCents: number;
  totalCents: number;
  createdAt: string;
}

export interface OrderRequest {
  symbol: string;
  side: Side;
  quantity: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = init ? await fetch(path, init) : await fetch(path);
  } catch (err) {
    throw new ApiError('NETWORK', (err as Error).message);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    const failure = body as { code?: unknown; message?: unknown } | undefined;
    throw new ApiError(
      typeof failure?.code === 'string' ? failure.code : `HTTP_${res.status}`,
      typeof failure?.message === 'string' ? failure.message : undefined,
    );
  }
  return body as T;
}

export const fetchQuotes = () => request<Quote[]>('/api/quotes');
export const fetchHistory = (symbol: string, limit = 120) =>
  request<History>(`/api/history?symbol=${encodeURIComponent(symbol)}&limit=${limit}`);
export const fetchNews = () => request<NewsItem[]>('/api/news');
export const fetchBalance = () => request<Balance>('/api/balance');
export const fetchWatchlist = () => request<WatchlistEntry[]>('/api/watchlist');
export const fetchOperations = (limit = 10) =>
  request<Operation[]>(`/api/operations?limit=${limit}`);
export const placeOrder = (order: OrderRequest) =>
  request<Operation>('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(order),
  });
