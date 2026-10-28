import pg from 'pg';
import { DbUnavailableError, type UserStore } from '../app.js';
import type { User } from '../users.js';

export function createPool(databaseUrl: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 1500,
  });
  // An idle client dying (for example the database stopping) must not crash the process.
  pool.on('error', (err) => console.error('idle database client error:', err.message));
  return pool;
}

export function checkDb(pool: pg.Pool): () => Promise<void> {
  return async () => {
    await pool.query('SELECT 1');
  };
}

export function pgUserStore(pool: pg.Pool): UserStore {
  return {
    async list(): Promise<User[]> {
      try {
        const { rows } = await pool.query<User>('SELECT id, name FROM users ORDER BY id');
        return rows;
      } catch (err) {
        throw new DbUnavailableError({ cause: err });
      }
    },
  };
}
