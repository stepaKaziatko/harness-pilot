import { readdirSync, readFileSync } from 'node:fs';
import type pg from 'pg';

export const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);

const FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

/**
 * Applies numbered SQL files (0001_name.sql, 0002_name.sql, ...) in order, each in its own
 * transaction, recording them in schema_migrations. Already-applied files are skipped, so a
 * second run is a no-op. Returns the names applied by this run.
 */
export async function migrate(pool: pg.Pool, dir: URL = MIGRATIONS_DIR): Promise<string[]> {
  const files = readdirSync(dir)
    .filter((f) => FILE_PATTERN.test(f))
    .sort();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    // Serialise concurrent runners; the lock is released when the session ends.
    await client.query('SELECT pg_advisory_lock(7101701)');
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(new URL(file, dir), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }
      applied.push(file);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(7101701)').catch(() => undefined);
    client.release();
  }
  return applied;
}
