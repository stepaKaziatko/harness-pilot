import { describe, expect, it } from 'vitest';
import { DbUnavailableError, type AppDeps } from './app.js';
import { appFor, fakeDeps, USERS } from './testing/fakes.js';

const app = (overrides: Partial<AppDeps> = {}) => appFor(fakeDeps(overrides));

describe('routes', () => {
  it('GET /api/health is 200 ok with a healthy database', async () => {
    const res = await app()('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });

  it('GET /api/health is 503 DB_UNAVAILABLE when the check throws', async () => {
    const res = await app({
      checkDb: async () => {
        throw new Error('down');
      },
    })('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'DB_UNAVAILABLE', db: 'unavailable' });
  });

  it('GET /api/users lists every user', async () => {
    const res = await app()('/api/users');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(USERS);
  });

  it('GET /api/me resolves header, cookie and default', async () => {
    const get = app();
    expect((await get('/api/me', { headers: { 'x-pilot-user': 'u-c' } })).body).toEqual(USERS[2]);
    expect((await get('/api/me', { headers: { cookie: 'pilot_user=u-b' } })).body).toEqual(
      USERS[1],
    );
    expect((await get('/api/me')).body).toEqual(USERS[0]);
  });

  it('GET /api/me with an unknown id is 400 UNKNOWN_USER', async () => {
    const res = await app()('/api/me', { headers: { 'x-pilot-user': 'nobody' } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'UNKNOWN_USER' });
  });

  it('GET /api/me is 404 NO_USERS when nobody is seeded', async () => {
    const res = await app({ users: { list: async () => [] } })('/api/me');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NO_USERS' });
  });

  it('GET /api/me and /api/users are 503 DB_UNAVAILABLE when the store fails', async () => {
    const get = app({
      users: {
        list: async () => {
          throw new DbUnavailableError();
        },
      },
    });
    for (const path of ['/api/me', '/api/users']) {
      const res = await get(path);
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ code: 'DB_UNAVAILABLE' });
    }
  });
});

describe('unexpected failures', () => {
  it('turns them into 500 INTERNAL_ERROR with a code', async () => {
    const res = await app({
      users: {
        list: async () => {
          throw new Error('bug');
        },
      },
    })('/api/users');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
