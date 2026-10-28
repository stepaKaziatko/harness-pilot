import { describe, expect, it } from 'vitest';
import type { ApiResponse } from './app.js';
import { listRoutes, MAX_BODY_BYTES, ROUTE_TABLE } from './routes.js';
import { appFor, fakeDeps, orderRequest, type FakePortfolio } from './testing/fakes.js';
import { OrderRejectedError } from './portfolio.js';

const corsHeaders = (res: ApiResponse) =>
  Object.keys(res.headers ?? {}).filter((n) => n.toLowerCase().startsWith('access-control-'));

describe('route allowlist', () => {
  it('contains exactly the three original routes and the seven dashboard routes', () => {
    expect(Object.keys(ROUTE_TABLE).sort()).toEqual(
      [
        '/api/balance',
        '/api/health',
        '/api/history',
        '/api/me',
        '/api/news',
        '/api/operations',
        '/api/orders',
        '/api/quotes',
        '/api/users',
        '/api/watchlist',
      ].sort(),
    );
  });

  it('allows POST on /api/orders only; every other route is GET only', () => {
    for (const route of listRoutes()) {
      expect(route.methods).toEqual(route.path === '/api/orders' ? ['POST'] : ['GET']);
    }
  });

  it('answers a wrong method on every route with 405 and the right Allow header', async () => {
    const get = appFor();
    for (const route of listRoutes()) {
      const wrong = route.methods.includes('GET') ? 'DELETE' : 'GET';
      for (const method of [wrong, 'PUT', 'PATCH']) {
        const res = await get(route.path, { method });
        expect(res.status).toBe(405);
        expect(res.body).toMatchObject({ code: 'METHOD_NOT_ALLOWED' });
        expect(res.headers?.allow).toBe(route.methods.join(', '));
      }
    }
  });

  it('answers unknown paths, including prototype names, with 404 NOT_FOUND', async () => {
    const get = appFor();
    const paths = ['/api/nope', '/', '/api/health/', '/api/__proto__', '/api/constructor', '/api'];
    for (const path of paths) {
      const res = await get(path);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    }
  });

  it('gives every error body a code in UPPER_SNAKE and a message', async () => {
    const deps = fakeDeps();
    const get = appFor(deps);
    const bad: ApiResponse[] = [
      await get('/api/nope'),
      await get('/api/health', { method: 'POST' }),
      await get('/api/me', { headers: { 'x-pilot-user': 'nobody' } }),
      await get('/api/history'),
      await get('/api/history', { query: new URLSearchParams('symbol=ZZZ') }),
      await get('/api/operations', { query: new URLSearchParams('limit=0') }),
      await get('/api/orders', orderRequest('{', {})),
      await get('/api/orders', { method: 'POST', headers: { 'content-type': 'text/plain' } }),
      await get('/api/orders', orderRequest({ symbol: 'AAA', side: 'x', quantity: 1 })),
    ];
    for (const res of bad) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body).toMatchObject({
        code: expect.stringMatching(/^[A-Z]+(_[A-Z]+)*$/),
        message: expect.any(String),
      });
    }
  });
});

describe('no CORS headers', () => {
  it('on every route of the table, with every allowed method and a foreign Origin', async () => {
    const get = appFor();
    for (const route of listRoutes()) {
      for (const method of route.methods) {
        const res = await get(route.path, {
          method,
          headers: { origin: 'http://evil.example', 'content-type': 'application/json' },
          body: '{}',
        });
        expect(corsHeaders(res), `${method} ${route.path} -> ${res.status}`).toEqual([]);
      }
    }
  });

  it('on 404, 405 and OPTIONS answers, including a preflight', async () => {
    const get = appFor();
    const preflight = {
      origin: 'http://evil.example',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    };
    const answers = [
      await get('/api/nope', { headers: preflight }),
      await get('/api/health', { method: 'POST', headers: preflight }),
      ...(await Promise.all(
        listRoutes().map((r) => get(r.path, { method: 'OPTIONS', headers: preflight })),
      )),
      await get('/api/nope', { method: 'OPTIONS', headers: preflight }),
    ];
    for (const res of answers) {
      expect([404, 405]).toContain(res.status);
      expect(corsHeaders(res)).toEqual([]);
    }
  });

  it('on every 4xx and 5xx answer of the order route', async () => {
    const deps = fakeDeps();
    const get = appFor(deps);
    const json = { 'content-type': 'application/json', origin: 'http://evil.example' };
    const reject = (code: 'INSUFFICIENT_FUNDS' | 'INSUFFICIENT_POSITION') => {
      (deps.portfolio as FakePortfolio).failWith = new OrderRejectedError(code);
      return get('/api/orders', orderRequest({ symbol: 'AAA', side: 'buy', quantity: 1 }));
    };
    const answers = [
      await get('/api/orders', { method: 'POST', headers: { 'content-type': 'text/plain' } }),
      await get('/api/orders', orderRequest('', { bodyTooLarge: true })),
      await get('/api/orders', orderRequest('{nope', { headers: json })),
      await get('/api/orders', orderRequest({ symbol: 'AAA', side: 'hold', quantity: 1 })),
      await get('/api/orders', orderRequest({ symbol: 'AAA', side: 'buy', quantity: 0 })),
      await get('/api/orders', orderRequest({ symbol: 'ZZZ', side: 'buy', quantity: 1 })),
      await get(
        '/api/orders',
        orderRequest(
          { symbol: 'AAA', side: 'buy', quantity: 1 },
          { headers: { ...json, 'x-pilot-user': 'nobody' } },
        ),
      ),
      await reject('INSUFFICIENT_FUNDS'),
      await reject('INSUFFICIENT_POSITION'),
    ];
    expect(answers.map((r) => r.status)).toEqual([415, 413, 400, 400, 400, 404, 400, 409, 409]);
    for (const res of answers) expect(corsHeaders(res)).toEqual([]);
  });

  it('even a 201 carries none', async () => {
    const res = await appFor()(
      '/api/orders',
      orderRequest({ symbol: 'AAA', side: 'buy', quantity: 1 }),
    );
    expect(res.status).toBe(201);
    expect(corsHeaders(res)).toEqual([]);
  });
});

describe('body limit constant', () => {
  it('is 16 KiB', () => {
    expect(MAX_BODY_BYTES).toBe(16 * 1024);
  });
});
