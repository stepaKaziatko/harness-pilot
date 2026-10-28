import type pg from 'pg';
import type { User } from '../users.js';

/** Fixed ids: later tasks key per-user data on them, so they must stay stable. */
export const SEED_USERS: readonly User[] = [
  { id: 'u-anna', name: 'Anna' },
  { id: 'u-boris', name: 'Boris' },
  { id: 'u-clara', name: 'Clara' },
];

/** Idempotent: re-running updates names in place and never duplicates rows. */
export async function seed(pool: pg.Pool): Promise<number> {
  for (const user of SEED_USERS) {
    await pool.query(
      `INSERT INTO users (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [user.id, user.name],
    );
  }
  return SEED_USERS.length;
}
