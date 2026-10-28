import { vi } from 'vitest';

export interface Reply {
  status: number;
  body: unknown;
}
type Responder = Reply | ((url: URL, init?: RequestInit) => Reply);

const QUOTE_BASE = [
  { symbol: 'AAA', name: 'Alpha Co', base: 10_000 },
  { symbol: 'BBB', name: 'Beta Co', base: 2_500 },
  { symbol: 'CCC', name: 'Gamma Co', base: 50_000 },
];

export const USERS = [
  { id: 'u-a', name: 'Anna' },
  { id: 'u-b', name: 'Boris' },
];

const NEWS = Array.from({ length: 3 }, (_, i) => ({
  id: `n-${i}`,
  title: `Headline number ${i}`,
  source: 'Wire',
  publishedAt: `2026-10-2${i}T08:30:00.000Z`,
  symbol: i === 0 ? 'AAA' : null,
}));

/**
 * A fake of the whole API, installed as global `fetch`. Quotes move by 10 cents per request,
 * data differs per user (read from the pilot_user cookie), and an accepted order changes the
 * user's cash and operations so a re-read shows it. `overrides` replaces any route.
 */
export function mockApi(overrides: Record<string, Responder> = {}) {
  let tick = 0;
  const calls: { path: string; method: string; search: string; body?: unknown }[] = [];
  const cash: Record<string, number> = { 'u-a': 100_000, 'u-b': 5_000 };
  const operations: Record<string, unknown[]> = { 'u-a': [], 'u-b': [] };
  const currentUser = () => (document.cookie.includes('pilot_user=u-b') ? 'u-b' : 'u-a');
  const priceOf = (base: number) => base + tick * 10;

  const routes: Record<string, Responder> = {
    '/api/health': { status: 200, body: { status: 'ok', db: 'ok' } },
    '/api/users': { status: 200, body: USERS },
    '/api/me': () => ({ status: 200, body: USERS.find((u) => u.id === currentUser()) }),
    '/api/quotes': () => {
      tick += 1;
      return {
        status: 200,
        body: QUOTE_BASE.map((q) => ({
          symbol: q.symbol,
          name: q.name,
          priceCents: priceOf(q.base),
          prevCloseCents: q.base,
          updatedAt: '2026-10-28T12:00:00.000Z',
        })),
      };
    },
    '/api/history': (url) => {
      const symbol = url.searchParams.get('symbol');
      const base = QUOTE_BASE.find((q) => q.symbol === symbol)?.base ?? 1;
      return {
        status: 200,
        body: {
          symbol,
          points: Array.from({ length: 5 }, (_, i) => ({
            ts: `2026-10-28T12:00:0${i}.000Z`,
            priceCents: base + i * 7 + tick,
          })),
        },
      };
    },
    '/api/news': { status: 200, body: NEWS },
    '/api/balance': () => {
      const id = currentUser();
      const quantity = id === 'u-a' ? 10 : 4;
      return {
        status: 200,
        body: {
          currency: 'USD',
          cashCents: cash[id],
          positions: [{ symbol: 'AAA', quantity, valueCents: quantity * 10_000 }],
          totalCents: (cash[id] ?? 0) + quantity * 10_000,
        },
      };
    },
    '/api/watchlist': () => ({
      status: 200,
      body:
        currentUser() === 'u-a'
          ? [
              { symbol: 'BBB', name: 'Beta Co' },
              { symbol: 'CCC', name: 'Gamma Co' },
            ]
          : [{ symbol: 'AAA', name: 'Alpha Co' }],
    }),
    '/api/operations': () => ({ status: 200, body: operations[currentUser()] }),
    '/api/orders': (_url, init) => {
      const order = JSON.parse(String(init?.body)) as {
        symbol: string;
        side: string;
        quantity: number;
      };
      const id = currentUser();
      const base = QUOTE_BASE.find((q) => q.symbol === order.symbol)?.base ?? 1;
      const op = {
        id: (operations[id]?.length ?? 0) + 1,
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        priceCents: priceOf(base),
        totalCents: priceOf(base) * order.quantity,
        createdAt: '2026-10-28T12:00:05.000Z',
      };
      cash[id] = (cash[id] ?? 0) - (order.side === 'buy' ? 1 : -1) * op.totalCents;
      operations[id]?.unshift(op);
      return { status: 201, body: op };
    },
  };

  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    calls.push({
      path: url.pathname,
      method: init?.method ?? 'GET',
      search: url.search,
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
    });
    const route = overrides[url.pathname] ?? routes[url.pathname];
    const reply: Reply = route
      ? typeof route === 'function'
        ? route(url, init)
        : route
      : { status: 404, body: { code: 'NOT_FOUND', message: 'No such route' } };
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    fetchMock,
    calls,
    count: (path: string, method = 'GET') =>
      calls.filter((c) => c.path === path && c.method === method).length,
  };
}
