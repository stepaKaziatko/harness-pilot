import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { loadEnv, readConfig } from '../env.js';
import { checkDb, createPool, pgUserStore } from './pool.js';
import { migrate } from './migrate.js';
import { seed, SEED_USERS } from './seed.js';

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
    expect(await migrate(pool)).toEqual(['0001_users.sql']);
    expect(await migrate(pool)).toEqual([]);
    const { rows } = await pool.query('SELECT name FROM schema_migrations');
    expect(rows).toHaveLength(1);
  });

  it('seeds three users and is idempotent', async () => {
    await seed(pool);
    await seed(pool);
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM users ORDER BY id');
    expect(rows.map((r) => r.id)).toEqual(SEED_USERS.map((u) => u.id).sort());
    expect(rows).toHaveLength(3);
  });

  it('GET /api/health is 200 ok against the live database', async () => {
    const app = createApp({ checkDb: checkDb(pool), users: pgUserStore(pool) });
    const res = await app({ method: 'GET', path: '/api/health', headers: {} });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });

  it('GET /api/me and /api/users read the seeded rows', async () => {
    const app = createApp({ checkDb: checkDb(pool), users: pgUserStore(pool) });
    const users = await app({ method: 'GET', path: '/api/users', headers: {} });
    expect(users.body).toHaveLength(3);
    const me = await app({
      method: 'GET',
      path: '/api/me',
      headers: { 'x-pilot-user': 'u-boris' },
    });
    expect(me.body).toEqual({ id: 'u-boris', name: 'Boris' });
  });

  it('GET /api/health is 503 DB_UNAVAILABLE when nothing listens on the database port', async () => {
    const dead = createPool('postgres://pilot:pilot@127.0.0.1:1/pilot');
    try {
      const app = createApp({ checkDb: checkDb(dead), users: pgUserStore(dead) });
      const res = await app({ method: 'GET', path: '/api/health', headers: {} });
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ code: 'DB_UNAVAILABLE' });
    } finally {
      await dead.end();
    }
  });
});
