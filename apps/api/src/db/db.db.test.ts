import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { loadEnv, readConfig } from '../env.js';
import { checkDb, createPool, pgUserStore } from './pool.js';
import { pgMarketStore, pgPortfolioStore } from './stores.js';
import { migrate } from './migrate.js';
import { seed, SEED_INSTRUMENTS, SEED_NEWS, SEED_PORTFOLIOS, SEED_USERS } from './seed.js';
import { priceAt } from '../quotes/simulator.js';

loadEnv();
const adminUrl = readConfig().databaseUrl;
const dbName = `pilot_test_${randomBytes(4).toString('hex')}`;
const testUrl = (() => {
  const u = new URL(adminUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
})();

let admin: pg.Pool;
let pool: pg.Pool;

const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
const QUOTE_SEED = 11;

function appOn(p: pg.Pool) {
  const handle = createApp({
    checkDb: checkDb(p),
    users: pgUserStore(p),
    market: pgMarketStore(p),
    portfolio: pgPortfolioStore(p),
    now: () => NOW,
    quoteSeed: QUOTE_SEED,
  });
  return (path: string, extra: Partial<Parameters<typeof handle>[0]> = {}, user?: string) =>
    handle({
      method: 'GET',
      path,
      query: new URLSearchParams(),
      ...extra,
      headers: { ...(user ? { 'x-pilot-user': user } : {}), ...extra.headers },
    });
}

const orderOf = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const price = (symbol: string) => {
  const base = SEED_INSTRUMENTS.find((i) => i.symbol === symbol)?.baseCents as number;
  return priceAt(QUOTE_SEED, symbol, base, NOW).priceCents;
};

async function snapshot(userId: string) {
  const cash = await pool.query('SELECT cash_cents FROM balances WHERE user_id = $1', [userId]);
  const positions = await pool.query(
    'SELECT symbol, quantity FROM positions WHERE user_id = $1 ORDER BY symbol',
    [userId],
  );
  const ops = await pool.query('SELECT count(*)::int AS n FROM operations WHERE user_id = $1', [
    userId,
  ]);
  return { cash: cash.rows, positions: positions.rows, operations: ops.rows[0].n };
}

async function counts() {
  const out: Record<string, number> = {};
  for (const table of [
    'users',
    'instruments',
    'news',
    'balances',
    'positions',
    'watchlist',
    'operations',
  ]) {
    out[table] = (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
  }
  return out;
}

beforeAll(async () => {
  admin = createPool(adminUrl);
  await admin.query(`CREATE DATABASE ${dbName}`);
  pool = createPool(testUrl);
});

afterAll(async () => {
  await pool?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin?.end();
});

describe('migrations and seed against a real database', () => {
  it('applies migrations on an empty database and is idempotent', async () => {
    expect(await migrate(pool)).toEqual([
      '0001_users.sql',
      '0002_market.sql',
      '0003_portfolio.sql',
    ]);
    expect(await migrate(pool)).toEqual([]);
    const { rows } = await pool.query('SELECT name FROM schema_migrations');
    expect(rows).toHaveLength(3);
  });

  it('seeds three users and is idempotent in every table', async () => {
    const first = await seed(pool);
    const afterFirst = await counts();
    await seed(pool);
    expect(await counts()).toEqual(afterFirst);
    expect(afterFirst).toEqual({
      users: 3,
      instruments: SEED_INSTRUMENTS.length,
      news: SEED_NEWS.length,
      balances: 3,
      positions: first.positions,
      watchlist: first.watchlist,
      operations: first.operations,
    });
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM users ORDER BY id');
    expect(rows.map((r) => r.id)).toEqual(SEED_USERS.map((u) => u.id).sort());
    expect(SEED_INSTRUMENTS).toHaveLength(6);
  });

  it('GET /api/health is 200 ok against the live database', async () => {
    const res = await appOn(pool)('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });

  it('GET /api/me and /api/users read the seeded rows', async () => {
    const app = appOn(pool);
    expect((await app('/api/users')).body).toHaveLength(3);
    expect((await app('/api/me', {}, 'u-boris')).body).toEqual({ id: 'u-boris', name: 'Boris' });
  });

  it('GET /api/health is 503 DB_UNAVAILABLE when nothing listens on the database port', async () => {
    const dead = createPool('postgres://pilot:pilot@127.0.0.1:1/pilot');
    try {
      const res = await appOn(dead)('/api/health');
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ code: 'DB_UNAVAILABLE' });
      const quotes = await appOn(dead)('/api/quotes');
      expect(quotes.status).toBe(503);
      expect(quotes.body).toMatchObject({ code: 'DB_UNAVAILABLE' });
    } finally {
      await dead.end();
    }
  });
});

describe('dashboard data against a real database', () => {
  it('serves quotes, history and the ten newest news items', async () => {
    const app = appOn(pool);
    const quotes = (await app('/api/quotes')).body as { symbol: string; priceCents: number }[];
    expect(quotes.map((q) => q.symbol)).toEqual(SEED_INSTRUMENTS.map((i) => i.symbol).sort());
    expect(quotes.find((q) => q.symbol === 'KRNL')?.priceCents).toBe(price('KRNL'));
    const history = await app('/api/history', {
      query: new URLSearchParams('symbol=KRNL&limit=7'),
    });
    expect((history.body as { points: unknown[] }).points).toHaveLength(7);
    const news = (await app('/api/news')).body as { publishedAt: string }[];
    expect(news).toHaveLength(SEED_NEWS.length);
    const dates = news.map((n) => n.publishedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('keeps Anna, Boris and Clara apart on balance, watchlist and operations', async () => {
    const app = appOn(pool);
    const ids = SEED_USERS.map((u) => u.id);
    for (const path of ['/api/balance', '/api/watchlist', '/api/operations']) {
      const bodies = await Promise.all(ids.map(async (id) => (await app(path, {}, id)).body));
      expect(new Set(bodies.map((b) => JSON.stringify(b))).size, path).toBe(3);
    }
    for (const id of ids) {
      const plan = SEED_PORTFOLIOS[id];
      const balance = (await app('/api/balance', {}, id)).body as {
        cashCents: number;
        positions: { symbol: string }[];
        totalCents: number;
      };
      expect(balance.cashCents).toBe(plan?.cashCents);
      expect(balance.positions.map((p) => p.symbol)).toEqual(
        (plan?.positions.map((p) => p[0]) ?? []).sort(),
      );
      const watch = (await app('/api/watchlist', {}, id)).body as { symbol: string }[];
      expect(watch.map((w) => w.symbol)).toEqual(plan?.watchlist);
    }
  });

  it('answers UNKNOWN_USER on every per-user route', async () => {
    const app = appOn(pool);
    for (const path of ['/api/balance', '/api/watchlist', '/api/operations']) {
      const res = await app(path, {}, 'u-nobody');
      expect(res.status, path).toBe(400);
      expect(res.body).toMatchObject({ code: 'UNKNOWN_USER' });
    }
  });
});

describe('orders against a real database', () => {
  it('a buy changes cash, position and adds exactly one operation', async () => {
    const app = appOn(pool);
    const before = await snapshot('u-anna');
    const res = await app(
      '/api/orders',
      orderOf({ symbol: 'MRDN', side: 'buy', quantity: 10 }),
      'u-anna',
    );
    expect(res.status).toBe(201);
    const total = 10 * price('MRDN');
    expect(res.body).toMatchObject({
      symbol: 'MRDN',
      side: 'buy',
      quantity: 10,
      totalCents: total,
    });
    const after = await snapshot('u-anna');
    expect(after.cash[0].cash_cents).toBe(before.cash[0].cash_cents - total);
    expect(after.positions).toEqual(
      [...before.positions, { symbol: 'MRDN', quantity: 10 }].sort((a, b) =>
        a.symbol.localeCompare(b.symbol),
      ),
    );
    expect(after.operations).toBe(before.operations + 1);
    const latest = (await app('/api/operations', {}, 'u-anna')).body as { symbol: string }[];
    expect(latest[0]?.symbol).toBe('MRDN');
  });

  it('a sell adds to cash, shrinks the position and removes it at zero', async () => {
    const app = appOn(pool);
    const before = await snapshot('u-boris');
    await app('/api/orders', orderOf({ symbol: 'PLMA', side: 'sell', quantity: 5 }), 'u-boris');
    const mid = await snapshot('u-boris');
    expect(mid.cash[0].cash_cents).toBe(before.cash[0].cash_cents + 5 * price('PLMA'));
    expect(mid.positions.find((p: { symbol: string }) => p.symbol === 'PLMA').quantity).toBe(20);
    const rest = await app(
      '/api/orders',
      orderOf({ symbol: 'PLMA', side: 'sell', quantity: 20 }),
      'u-boris',
    );
    expect(rest.status).toBe(201);
    const after = await snapshot('u-boris');
    expect(after.positions.some((p: { symbol: string }) => p.symbol === 'PLMA')).toBe(false);
    expect(after.operations).toBe(before.operations + 2);
  });

  it('INSUFFICIENT_FUNDS leaves cash, positions and operations unchanged', async () => {
    const app = appOn(pool);
    const before = await snapshot('u-boris');
    const res = await app(
      '/api/orders',
      orderOf({ symbol: 'ORBT', side: 'buy', quantity: 10_000 }),
      'u-boris',
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(await snapshot('u-boris')).toEqual(before);
  });

  it('INSUFFICIENT_POSITION leaves everything unchanged, including selling what is not held', async () => {
    const app = appOn(pool);
    const before = await snapshot('u-clara');
    for (const order of [
      { symbol: 'ORBT', side: 'sell', quantity: 10_000 },
      { symbol: 'KRNL', side: 'sell', quantity: 1 },
    ]) {
      const res = await app('/api/orders', orderOf(order), 'u-clara');
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'INSUFFICIENT_POSITION' });
    }
    expect(await snapshot('u-clara')).toEqual(before);
  });

  it('orders of one user never touch another user', async () => {
    const before = await snapshot('u-clara');
    await appOn(pool)(
      '/api/orders',
      orderOf({ symbol: 'QNTM', side: 'buy', quantity: 1 }),
      'u-anna',
    );
    expect(await snapshot('u-clara')).toEqual(before);
  });

  it('concurrent buys never overdraw the balance', async () => {
    const app = appOn(pool);
    await pool.query('UPDATE balances SET cash_cents = $1 WHERE user_id = $2', [
      3 * price('ORBT'),
      'u-clara',
    ]);
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        app('/api/orders', orderOf({ symbol: 'ORBT', side: 'buy', quantity: 1 }), 'u-clara'),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    const { rows } = await pool.query('SELECT cash_cents FROM balances WHERE user_id = $1', [
      'u-clara',
    ]);
    expect(rows[0].cash_cents).toBe(0);
  });

  it('re-seeding restores the baseline cash, positions and operations', async () => {
    const first = await seed(pool);
    expect(await counts()).toMatchObject({
      operations: first.operations,
      positions: first.positions,
    });
    for (const user of SEED_USERS) {
      const plan = SEED_PORTFOLIOS[user.id];
      const snap = await snapshot(user.id);
      expect(snap.cash[0].cash_cents).toBe(plan?.cashCents);
      expect(snap.operations).toBe(plan?.operations.length);
      expect(snap.positions).toHaveLength(plan?.positions.length ?? -1);
    }
  });
});
