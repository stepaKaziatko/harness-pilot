import type pg from 'pg';
import type { User } from '../users.js';

/** Fixed ids: per-user data is keyed on them, so they must stay stable. */
export const SEED_USERS: readonly User[] = [
  { id: 'u-anna', name: 'Anna' },
  { id: 'u-boris', name: 'Boris' },
  { id: 'u-clara', name: 'Clara' },
];

/** Fictional companies and tickers; the base price (cents) is the previous close. */
export const SEED_INSTRUMENTS = [
  { symbol: 'KRNL', name: 'Kernel Systems', baseCents: 18_450 },
  { symbol: 'MRDN', name: 'Meridian Foods', baseCents: 9_275 },
  { symbol: 'VLTA', name: 'Volta Grid', baseCents: 4_210 },
  { symbol: 'ORBT', name: 'Orbit Freight', baseCents: 31_200 },
  { symbol: 'PLMA', name: 'Plasma Health', baseCents: 12_650 },
  { symbol: 'QNTM', name: 'Quanta Mills', baseCents: 2_780 },
] as const;

/** Fixed dates, so nothing on the screen is relative to "now". */
export const SEED_NEWS = [
  [
    'n-01',
    'Kernel Systems unveils a faster storage engine',
    'Market Wire',
    '2026-10-27T08:30:00Z',
    'KRNL',
  ],
  [
    'n-02',
    'Meridian Foods expands into frozen meals',
    'Daily Ledger',
    '2026-10-26T14:05:00Z',
    'MRDN',
  ],
  [
    'n-03',
    'Volta Grid wins a regional storage contract',
    'Market Wire',
    '2026-10-26T09:45:00Z',
    'VLTA',
  ],
  ['n-04', 'Freight volumes rise for a third month', 'Harbor Post', '2026-10-25T16:20:00Z', 'ORBT'],
  [
    'n-05',
    'Plasma Health reports trial results ahead of schedule',
    'Daily Ledger',
    '2026-10-24T11:10:00Z',
    'PLMA',
  ],
  [
    'n-06',
    'Quanta Mills trims its outlook for the quarter',
    'Market Wire',
    '2026-10-23T13:00:00Z',
    'QNTM',
  ],
  [
    'n-07',
    'Central bank holds rates, signals a patient stance',
    'Harbor Post',
    '2026-10-22T10:30:00Z',
    null,
  ],
  ['n-08', 'Energy prices ease as inventories build', 'Daily Ledger', '2026-10-21T07:50:00Z', null],
] as const;

interface UserSeed {
  cashCents: number;
  positions: readonly (readonly [symbol: string, quantity: number])[];
  watchlist: readonly string[];
  operations: readonly (readonly [
    symbol: string,
    side: 'buy' | 'sell',
    quantity: number,
    priceCents: number,
    at: string,
  ])[];
}

/** Different cash, holdings, watchlists and history per user, so switching users shows a change. */
export const SEED_PORTFOLIOS: Readonly<Record<string, UserSeed>> = {
  'u-anna': {
    cashCents: 1_250_000,
    positions: [
      ['KRNL', 40],
      ['VLTA', 100],
    ],
    watchlist: ['KRNL', 'MRDN', 'ORBT'],
    operations: [
      ['KRNL', 'buy', 40, 17_900, '2026-10-20T10:00:00Z'],
      ['VLTA', 'buy', 150, 4_050, '2026-10-22T15:30:00Z'],
      ['VLTA', 'sell', 50, 4_180, '2026-10-26T09:15:00Z'],
    ],
  },
  'u-boris': {
    cashCents: 480_000,
    positions: [
      ['MRDN', 150],
      ['QNTM', 300],
      ['PLMA', 25],
    ],
    watchlist: ['VLTA', 'PLMA', 'QNTM', 'KRNL'],
    operations: [
      ['MRDN', 'buy', 150, 9_100, '2026-10-19T12:00:00Z'],
      ['QNTM', 'buy', 300, 2_700, '2026-10-21T09:30:00Z'],
      ['PLMA', 'buy', 40, 12_300, '2026-10-23T14:45:00Z'],
      ['PLMA', 'sell', 15, 12_580, '2026-10-27T11:20:00Z'],
    ],
  },
  'u-clara': {
    cashCents: 3_100_000,
    positions: [['ORBT', 60]],
    watchlist: ['MRDN', 'QNTM'],
    operations: [
      ['ORBT', 'buy', 100, 30_800, '2026-10-18T13:10:00Z'],
      ['ORBT', 'sell', 40, 31_050, '2026-10-25T10:05:00Z'],
    ],
  },
};

export interface SeedCounts {
  users: number;
  instruments: number;
  news: number;
  balances: number;
  positions: number;
  watchlist: number;
  operations: number;
}

/**
 * Idempotent, and it restores the baseline: re-running resets every seeded user's cash,
 * positions, watchlist and operations to the values above, so rows never pile up and orders
 * placed in a session are undone. It runs in one transaction.
 */
export async function seed(pool: pg.Pool): Promise<SeedCounts> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const user of SEED_USERS) {
      await client.query(
        `INSERT INTO users (id, name) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [user.id, user.name],
      );
    }
    for (const i of SEED_INSTRUMENTS) {
      await client.query(
        `INSERT INTO instruments (symbol, name, base_cents) VALUES ($1, $2, $3)
         ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, base_cents = EXCLUDED.base_cents`,
        [i.symbol, i.name, i.baseCents],
      );
    }
    for (const [id, title, source, publishedAt, symbol] of SEED_NEWS) {
      await client.query(
        `INSERT INTO news (id, title, source, published_at, symbol) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, source = EXCLUDED.source,
           published_at = EXCLUDED.published_at, symbol = EXCLUDED.symbol`,
        [id, title, source, publishedAt, symbol],
      );
    }
    const ids = SEED_USERS.map((u) => u.id);
    for (const table of ['operations', 'watchlist', 'positions']) {
      await client.query(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [ids]);
    }
    for (const userId of ids) {
      const plan = SEED_PORTFOLIOS[userId] as UserSeed;
      await client.query(
        `INSERT INTO balances (user_id, cash_cents) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET cash_cents = EXCLUDED.cash_cents`,
        [userId, plan.cashCents],
      );
      for (const [symbol, quantity] of plan.positions) {
        await client.query(
          'INSERT INTO positions (user_id, symbol, quantity) VALUES ($1, $2, $3)',
          [userId, symbol, quantity],
        );
      }
      for (const [index, symbol] of plan.watchlist.entries()) {
        await client.query(
          'INSERT INTO watchlist (user_id, symbol, sort_order) VALUES ($1, $2, $3)',
          [userId, symbol, index],
        );
      }
      for (const [symbol, side, quantity, priceCents, at] of plan.operations) {
        await client.query(
          `INSERT INTO operations (user_id, symbol, side, quantity, price_cents, total_cents, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, symbol, side, quantity, priceCents, quantity * priceCents, at],
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  const plans = Object.values(SEED_PORTFOLIOS);
  const sum = (pick: (p: UserSeed) => number) => plans.reduce((n, p) => n + pick(p), 0);
  return {
    users: SEED_USERS.length,
    instruments: SEED_INSTRUMENTS.length,
    news: SEED_NEWS.length,
    balances: plans.length,
    positions: sum((p) => p.positions.length),
    watchlist: sum((p) => p.watchlist.length),
    operations: sum((p) => p.operations.length),
  };
}
