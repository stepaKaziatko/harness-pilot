import { createApp, type ApiRequest, type ApiResponse, type AppDeps } from '../app.js';
import type { Instrument, MarketStore, NewsItem } from '../market.js';
import type { Holding, Operation, OrderInput, PortfolioStore } from '../portfolio.js';

export const USERS = [
  { id: 'u-a', name: 'A' },
  { id: 'u-b', name: 'B' },
  { id: 'u-c', name: 'C' },
];

export const INSTRUMENTS: Instrument[] = [
  { symbol: 'AAA', name: 'Alpha Co', baseCents: 10_000 },
  { symbol: 'BBB', name: 'Beta Co', baseCents: 2_500 },
];

export const NEWS: NewsItem[] = Array.from({ length: 12 }, (_, i) => ({
  id: `n-${i}`,
  title: `Headline ${i}`,
  source: 'Wire',
  publishedAt: new Date(Date.UTC(2026, 0, 12 - i)).toISOString(),
  symbol: i % 2 === 0 ? 'AAA' : null,
}));

/** A fixed instant, so simulated prices are the same in every run. */
export const NOW = Date.UTC(2026, 9, 28, 12, 0, 0, 250);

export interface FakePortfolio extends PortfolioStore {
  placed: OrderInput[];
  /** Makes the next placeOrder throw this value. */
  failWith?: unknown;
}

export function fakePortfolio(): FakePortfolio {
  const holdings: Record<string, { cashCents: number; positions: Holding[] }> = {
    'u-a': { cashCents: 100_000, positions: [{ symbol: 'AAA', quantity: 10 }] },
    'u-b': { cashCents: 5_000, positions: [] },
    'u-c': { cashCents: 0, positions: [{ symbol: 'BBB', quantity: 3 }] },
  };
  const operation = (o: OrderInput): Operation => ({
    id: 100 + self.placed.length,
    symbol: o.symbol,
    side: o.side,
    quantity: o.quantity,
    priceCents: o.priceCents,
    totalCents: o.priceCents * o.quantity,
    createdAt: new Date(NOW).toISOString(),
  });
  const self: FakePortfolio = {
    placed: [],
    holdings: async (id) => holdings[id] ?? { cashCents: 0, positions: [] },
    watchlist: async (id) => (id === 'u-a' ? [{ symbol: 'AAA', name: 'Alpha Co' }] : []),
    operations: async (id, limit) =>
      Array.from({ length: Math.min(limit, 60) }, (_, i) => ({
        ...operation({ userId: id, symbol: 'AAA', side: 'buy', quantity: 1, priceCents: 100 }),
        id: i + 1,
      })),
    placeOrder: async (order) => {
      if (self.failWith !== undefined) {
        const failure = self.failWith;
        self.failWith = undefined;
        throw failure;
      }
      self.placed.push(order);
      return operation(order);
    },
  };
  return self;
}

export function fakeMarket(): MarketStore {
  return { instruments: async () => INSTRUMENTS, news: async (limit) => NEWS.slice(0, limit) };
}

export function fakeDeps(overrides: Partial<AppDeps> = {}): AppDeps & { portfolio: FakePortfolio } {
  return {
    checkDb: async () => undefined,
    users: { list: async () => USERS },
    market: fakeMarket(),
    portfolio: fakePortfolio(),
    now: () => NOW,
    quoteSeed: 5,
    ...overrides,
  } as AppDeps & { portfolio: FakePortfolio };
}

export function request(extra: Partial<ApiRequest> & { path: string }): ApiRequest {
  return {
    method: 'GET',
    query: new URLSearchParams(),
    headers: {},
    ...extra,
  };
}

export function appFor(deps: AppDeps = fakeDeps()) {
  const handle = createApp(deps);
  return (path: string, extra: Partial<ApiRequest> = {}): Promise<ApiResponse> =>
    handle(request({ path, ...extra }));
}

/** A POST /api/orders request with a JSON body. */
export function orderRequest(body: unknown, extra: Partial<ApiRequest> = {}): Partial<ApiRequest> {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...extra,
  };
}
