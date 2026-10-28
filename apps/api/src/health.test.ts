import { describe, expect, it } from 'vitest';
import { getHealth } from './health.js';

describe('getHealth', () => {
  it('is 200 ok when the database check succeeds', async () => {
    expect(await getHealth(async () => undefined)).toEqual({
      status: 200,
      body: { status: 'ok', db: 'ok' },
    });
  });

  it('is 503 DB_UNAVAILABLE when the database check fails', async () => {
    const result = await getHealth(async () => {
      throw new Error('connection refused');
    });
    expect(result).toEqual({
      status: 503,
      body: { status: 'degraded', db: 'unavailable', code: 'DB_UNAVAILABLE' },
    });
  });

  it('is 503 when the database check hangs past the deadline', async () => {
    const result = await getHealth(() => new Promise<void>(() => undefined), 20);
    expect(result.status).toBe(503);
  });
});
