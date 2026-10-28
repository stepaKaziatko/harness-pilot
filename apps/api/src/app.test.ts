import { describe, expect, it } from 'vitest';
import { createApp, DbUnavailableError, type ApiRequest, type AppDeps } from './app.js';

const users = [
  { id: 'u-a', name: 'A' },
  { id: 'u-b', name: 'B' },
  { id: 'u-c', name: 'C' },
];

function app(overrides: Partial<AppDeps> = {}) {
  const handle = createApp({
    checkDb: async () => undefined,
    users: { list: async () => users },
    ...overrides,
  });
  return (path: string, extra: Partial<ApiRequest> = {}) =>
    handle({ method: 'GET', path, headers: {}, ...extra });
}

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
    expect(res.body).toEqual(users);
  });

  it('GET /api/me resolves header, cookie and default', async () => {
    const get = app();
    expect((await get('/api/me', { headers: { 'x-pilot-user': 'u-c' } })).body).toEqual(users[2]);
    expect((await get('/api/me', { headers: { cookie: 'pilot_user=u-b' } })).body).toEqual(
      users[1],
    );
    expect((await get('/api/me')).body).toEqual(users[0]);
  });

  it('GET /api/me with an unknown id is 400 UNKNOWN_USER', async () => {
    const res = await app()('/api/me', { headers: { 'x-pilot-user': 'nobody' } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'UNKNOWN_USER' });
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

describe('allowlist and errors', () => {
  it('answers unknown paths with 404 NOT_FOUND', async () => {
    for (const path of ['/api/nope', '/', '/api/health/', '/api/__proto__', '/api/constructor']) {
      const res = await app()(path);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    }
  });

  it('answers non-GET methods on declared routes with 405 METHOD_NOT_ALLOWED', async () => {
    const res = await app()('/api/health', { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.body).toMatchObject({ code: 'METHOD_NOT_ALLOWED' });
  });

  it('never emits CORS headers, even for a foreign Origin', async () => {
    const res = await app()('/api/health', { headers: { origin: 'http://evil.example' } });
    const names = Object.keys(res.headers ?? {}).map((n) => n.toLowerCase());
    expect(names.some((n) => n.startsWith('access-control-'))).toBe(false);
  });

  it('turns unexpected failures into 500 INTERNAL_ERROR with a code', async () => {
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
