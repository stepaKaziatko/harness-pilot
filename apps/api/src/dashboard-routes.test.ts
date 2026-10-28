import { describe, expect, it } from 'vitest';
import { DbUnavailableError, type AppDeps } from './app.js';
import { priceAt } from './quotes/simulator.js';
import { appFor, fakeDeps, INSTRUMENTS, NOW, USERS } from './testing/fakes.js';

const q = (s: string) => new URLSearchParams(s);
const deps = () => fakeDeps();
const get = (d: AppDeps = deps()) => appFor(d);

function collectCents(value: unknown, found: number[] = []): number[] {
  if (Array.isArray(value)) value.forEach((v) => collectCents(v, found));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (key.endsWith('Cents')) found.push(v as number);
      else collectCents(v, found);
    }
  }
  return found;
}

describe('GET /api/quotes', () => {
  it('lists every instrument with the simulated price at the injected time', async () => {
    const res = await get()('/api/quotes');
    expect(res.status).toBe(200);
    const body = res.body as { symbol: string; priceCents: number; prevCloseCents: number }[];
    expect(body.map((x) => x.symbol)).toEqual(INSTRUMENTS.map((i) => i.symbol));
    expect(body[0]).toEqual({
      symbol: 'AAA',
      name: 'Alpha Co',
      priceCents: priceAt(5, 'AAA', 10_000, NOW).priceCents,
      prevCloseCents: 10_000,
      updatedAt: '2026-10-28T12:00:00.000Z',
    });
  });

  it('moves when the clock moves and repeats when it does not', async () => {
    let now = NOW;
    const app = get(fakeDeps({ now: () => now }));
    const a = await app('/api/quotes');
    expect(await app('/api/quotes')).toEqual(a);
    now += 5_000;
    expect((await app('/api/quotes')).body).not.toEqual(a.body);
  });
});

describe('GET /api/history', () => {
  it('returns ordered points ending at the current tick, 120 by default', async () => {
    const res = await get()('/api/history', { query: q('symbol=AAA') });
    const body = res.body as { symbol: string; points: { ts: string; priceCents: number }[] };
    expect(res.status).toBe(200);
    expect(body.symbol).toBe('AAA');
    expect(body.points).toHaveLength(120);
    const times = body.points.map((p) => Date.parse(p.ts));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(body.points.at(-1)?.priceCents).toBe(priceAt(5, 'AAA', 10_000, NOW).priceCents);
  });

  it('respects limit and rejects values outside 1..600', async () => {
    const app = get();
    const ok = await app('/api/history', { query: q('symbol=AAA&limit=5') });
    expect((ok.body as { points: unknown[] }).points).toHaveLength(5);
    const max = await app('/api/history', { query: q('symbol=AAA&limit=600') });
    expect(max.status).toBe(200);
    for (const bad of ['limit=0', 'limit=601', 'limit=abc', 'limit=1.5', 'limit=-1', 'limit=']) {
      const res = await app('/api/history', { query: q(`symbol=AAA&${bad}`) });
      expect(res.status, bad).toBe(400);
      expect(res.body).toMatchObject({ code: 'INVALID_QUERY' });
    }
  });

  it('is 400 INVALID_QUERY without a symbol and 404 UNKNOWN_SYMBOL for a stranger', async () => {
    const app = get();
    expect(await app('/api/history')).toMatchObject({
      status: 400,
      body: { code: 'INVALID_QUERY' },
    });
    expect(await app('/api/history', { query: q('symbol=ZZZ') })).toMatchObject({
      status: 404,
      body: { code: 'UNKNOWN_SYMBOL' },
    });
  });
});

describe('GET /api/news', () => {
  it('returns at most 10 items', async () => {
    const res = await get()('/api/news');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(10);
  });
});

describe('per-user routes', () => {
  const asUser = (id: string) => ({ headers: { 'x-pilot-user': id } });

  it('GET /api/balance values positions at the server price and adds cash', async () => {
    const res = await get()('/api/balance', asUser('u-a'));
    const price = priceAt(5, 'AAA', 10_000, NOW).priceCents;
    expect(res.body).toEqual({
      currency: 'USD',
      cashCents: 100_000,
      positions: [{ symbol: 'AAA', quantity: 10, valueCents: 10 * price }],
      totalCents: 100_000 + 10 * price,
    });
  });

  it('keeps users apart', async () => {
    const app = get();
    const balances = await Promise.all(
      ['u-a', 'u-b', 'u-c'].map(async (id) => (await app('/api/balance', asUser(id))).body),
    );
    expect(new Set(balances.map((b) => JSON.stringify(b))).size).toBe(3);
    expect((await app('/api/watchlist', asUser('u-a'))).body).toHaveLength(1);
    expect((await app('/api/watchlist', asUser('u-b'))).body).toEqual([]);
  });

  it('GET /api/operations defaults to 10, honours limit up to 50 and rejects others', async () => {
    const app = get();
    expect(((await app('/api/operations')).body as unknown[]).length).toBe(10);
    const five = await app('/api/operations', { query: q('limit=5') });
    expect((five.body as unknown[]).length).toBe(5);
    const fifty = await app('/api/operations', { query: q('limit=50') });
    expect((fifty.body as unknown[]).length).toBe(50);
    for (const bad of ['limit=51', 'limit=0', 'limit=x']) {
      const res = await app('/api/operations', { query: q(bad) });
      expect(res).toMatchObject({ status: 400, body: { code: 'INVALID_QUERY' } });
    }
  });

  it('answers UNKNOWN_USER on every per-user route and NO_USERS without users', async () => {
    const app = get();
    for (const path of ['/api/balance', '/api/watchlist', '/api/operations', '/api/me']) {
      const res = await app(path, asUser('nobody'));
      expect(res).toMatchObject({ status: 400, body: { code: 'UNKNOWN_USER' } });
    }
    const empty = get(fakeDeps({ users: { list: async () => [] } }));
    for (const path of ['/api/balance', '/api/watchlist', '/api/operations']) {
      expect(await empty(path)).toMatchObject({ status: 404, body: { code: 'NO_USERS' } });
    }
  });

  it('resolves the user from the cookie and defaults to the first user', async () => {
    const app = get();
    const viaCookie = await app('/api/watchlist', { headers: { cookie: 'pilot_user=u-b' } });
    expect(viaCookie.body).toEqual([]);
    expect((await app('/api/watchlist')).body).toEqual([{ symbol: 'AAA', name: 'Alpha Co' }]);
    expect(USERS[0]?.id).toBe('u-a');
  });
});

describe('store failures', () => {
  it('map to 503 DB_UNAVAILABLE on every dashboard route', async () => {
    const down = async () => {
      throw new DbUnavailableError();
    };
    const app = get(
      fakeDeps({
        market: { instruments: down, news: down },
        portfolio: { holdings: down, watchlist: down, operations: down, placeOrder: down },
      }),
    );
    const reads = [
      ['/api/quotes', ''],
      ['/api/history', 'symbol=AAA'],
      ['/api/news', ''],
      ['/api/balance', ''],
      ['/api/watchlist', ''],
      ['/api/operations', ''],
    ] as const;
    for (const [path, query] of reads) {
      const res = await app(path, { query: q(query) });
      expect(res, path).toMatchObject({ status: 503, body: { code: 'DB_UNAVAILABLE' } });
    }
  });
});

describe('money', () => {
  it('is an integer number of cents in every *Cents field', async () => {
    const app = get();
    const bodies = [
      (await app('/api/quotes')).body,
      (await app('/api/history', { query: q('symbol=BBB') })).body,
      (await app('/api/balance')).body,
      (await app('/api/operations')).body,
    ];
    const cents = bodies.flatMap((b) => collectCents(b));
    expect(cents.length).toBeGreaterThan(100);
    for (const value of cents) expect(Number.isInteger(value)).toBe(true);
  });
});
