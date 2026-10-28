import type pg from 'pg';
import { DbUnavailableError } from '../app.js';
import type { Instrument, MarketStore, NewsItem } from '../market.js';
import {
  OrderRejectedError,
  type Holding,
  type Operation,
  type OrderInput,
  type PortfolioStore,
  type Side,
} from '../portfolio.js';

/** Store failures other than a domain rejection are reported as the database being unavailable. */
async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof OrderRejectedError) throw err;
    throw new DbUnavailableError({ cause: err });
  }
}

interface OperationRow {
  id: number;
  symbol: string;
  side: Side;
  quantity: number;
  price_cents: number;
  total_cents: number;
  created_at: Date;
}

const toOperation = (row: OperationRow): Operation => ({
  id: row.id,
  symbol: row.symbol,
  side: row.side,
  quantity: row.quantity,
  priceCents: row.price_cents,
  totalCents: row.total_cents,
  createdAt: row.created_at.toISOString(),
});

const OPERATION_COLUMNS = 'id, symbol, side, quantity, price_cents, total_cents, created_at';

export function pgMarketStore(pool: pg.Pool): MarketStore {
  return {
    instruments: () =>
      guard(async () => {
        const { rows } = await pool.query<{ symbol: string; name: string; base_cents: number }>(
          'SELECT symbol, name, base_cents FROM instruments ORDER BY symbol',
        );
        return rows.map((r): Instrument => ({
          symbol: r.symbol,
          name: r.name,
          baseCents: r.base_cents,
        }));
      }),
    news: (limit) =>
      guard(async () => {
        const { rows } = await pool.query<{
          id: string;
          title: string;
          source: string;
          published_at: Date;
          symbol: string | null;
        }>(
          `SELECT id, title, source, published_at, symbol FROM news
           ORDER BY published_at DESC, id DESC LIMIT $1`,
          [limit],
        );
        return rows.map((r): NewsItem => ({
          id: r.id,
          title: r.title,
          source: r.source,
          publishedAt: r.published_at.toISOString(),
          symbol: r.symbol,
        }));
      }),
  };
}

export function pgPortfolioStore(pool: pg.Pool): PortfolioStore {
  return {
    holdings: (userId) =>
      guard(async () => {
        const cash = await pool.query<{ cash_cents: number }>(
          'SELECT cash_cents FROM balances WHERE user_id = $1',
          [userId],
        );
        const positions = await pool.query<Holding>(
          'SELECT symbol, quantity FROM positions WHERE user_id = $1 ORDER BY symbol',
          [userId],
        );
        return { cashCents: cash.rows[0]?.cash_cents ?? 0, positions: positions.rows };
      }),

    watchlist: (userId) =>
      guard(async () => {
        const { rows } = await pool.query<{ symbol: string; name: string }>(
          `SELECT w.symbol, i.name FROM watchlist w JOIN instruments i USING (symbol)
           WHERE w.user_id = $1 ORDER BY w.sort_order, w.symbol`,
          [userId],
        );
        return rows;
      }),

    operations: (userId, limit) =>
      guard(async () => {
        const { rows } = await pool.query<OperationRow>(
          `SELECT ${OPERATION_COLUMNS} FROM operations WHERE user_id = $1
           ORDER BY created_at DESC, id DESC LIMIT $2`,
          [userId, limit],
        );
        return rows.map(toOperation);
      }),

    placeOrder: (order: OrderInput) =>
      guard(async () => {
        const total = order.quantity * order.priceCents;
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          // Locking the balance row serialises concurrent orders of one user.
          const cash = await client.query<{ cash_cents: number }>(
            'SELECT cash_cents FROM balances WHERE user_id = $1 FOR UPDATE',
            [order.userId],
          );
          const cashCents = cash.rows[0]?.cash_cents ?? 0;
          if (order.side === 'buy') {
            if (cashCents < total) throw new OrderRejectedError('INSUFFICIENT_FUNDS');
            await client.query(
              'UPDATE balances SET cash_cents = cash_cents - $2 WHERE user_id = $1',
              [order.userId, total],
            );
            await client.query(
              `INSERT INTO positions (user_id, symbol, quantity) VALUES ($1, $2, $3)
               ON CONFLICT (user_id, symbol) DO UPDATE SET quantity = positions.quantity + EXCLUDED.quantity`,
              [order.userId, order.symbol, order.quantity],
            );
          } else {
            const held = await client.query<{ quantity: number }>(
              'SELECT quantity FROM positions WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
              [order.userId, order.symbol],
            );
            const quantity = held.rows[0]?.quantity ?? 0;
            if (quantity < order.quantity) throw new OrderRejectedError('INSUFFICIENT_POSITION');
            if (quantity === order.quantity) {
              await client.query('DELETE FROM positions WHERE user_id = $1 AND symbol = $2', [
                order.userId,
                order.symbol,
              ]);
            } else {
              await client.query(
                'UPDATE positions SET quantity = quantity - $3 WHERE user_id = $1 AND symbol = $2',
                [order.userId, order.symbol, order.quantity],
              );
            }
            await client.query(
              'UPDATE balances SET cash_cents = cash_cents + $2 WHERE user_id = $1',
              [order.userId, total],
            );
          }
          const inserted = await client.query<OperationRow>(
            `INSERT INTO operations (user_id, symbol, side, quantity, price_cents, total_cents)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${OPERATION_COLUMNS}`,
            [order.userId, order.symbol, order.side, order.quantity, order.priceCents, total],
          );
          await client.query('COMMIT');
          return toOperation(inserted.rows[0] as OperationRow);
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw err;
        } finally {
          client.release();
        }
      }),
  };
}
