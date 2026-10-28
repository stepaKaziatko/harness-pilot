import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createHttpServer } from './http.js';
import { MAX_BODY_BYTES } from './routes.js';
import { fakeMarket, fakePortfolio, NOW } from './testing/fakes.js';

const portfolio = fakePortfolio();

const servers: ReturnType<typeof createHttpServer>[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function start() {
  const server = createHttpServer(
    createApp({
      checkDb: async () => undefined,
      users: { list: async () => [{ id: 'u-a', name: 'A' }] },
      market: fakeMarket(),
      portfolio,
      now: () => NOW,
    }),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('http adapter', () => {
  it('serves JSON with a content type and no CORS headers', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/health?probe=1`, {
      headers: { origin: 'http://evil.example' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok' });
  });

  it('answers an unknown path with a JSON error code', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('parses the query string', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/history?symbol=AAA&limit=3`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { points: unknown[] }).points).toHaveLength(3);
  });

  describe('POST /api/orders', () => {
    const order = { symbol: 'AAA', side: 'buy', quantity: 1 };
    const post = async (body: string | URLSearchParams, type?: string) => {
      const base = await start();
      return fetch(`${base}/api/orders`, {
        method: 'POST',
        headers: type ? { 'content-type': type } : {},
        body,
      });
    };

    it('reads a JSON body and answers 201', async () => {
      const before = portfolio.placed.length;
      const res = await post(JSON.stringify(order), 'application/json');
      expect(res.status).toBe(201);
      expect(portfolio.placed).toHaveLength(before + 1);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('answers 415 for a plain-text or form post without calling the handler', async () => {
      const before = portfolio.placed.length;
      const text = await post(JSON.stringify(order), 'text/plain');
      expect(text.status).toBe(415);
      expect(await text.json()).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
      const form = await post(new URLSearchParams({ symbol: 'AAA', side: 'buy', quantity: '1' }));
      expect(form.status).toBe(415);
      expect(portfolio.placed).toHaveLength(before);
    });

    it('answers 400 INVALID_JSON for broken JSON', async () => {
      const res = await post('{"symbol":', 'application/json');
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'INVALID_JSON' });
    });

    it('answers 413 for a body over the limit and still serves the next request', async () => {
      const big = JSON.stringify({ ...order, pad: 'x'.repeat(MAX_BODY_BYTES) });
      const res = await post(big, 'application/json');
      expect(res.status).toBe(413);
      expect(await res.json()).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
      const ok = await post(JSON.stringify(order), 'application/json');
      expect(ok.status).toBe(201);
    });

    it('accepts a body of exactly the limit', async () => {
      const head = JSON.stringify({ ...order, pad: '' });
      const pad = 'x'.repeat(MAX_BODY_BYTES - head.length);
      const body = JSON.stringify({ ...order, pad });
      expect(Buffer.byteLength(body)).toBe(MAX_BODY_BYTES);
      expect((await post(body, 'application/json')).status).toBe(201);
    });
  });

  it('answers OPTIONS with 405 and no CORS headers', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/orders`, {
      method: 'OPTIONS',
      headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect([...res.headers.keys()].some((n) => n.startsWith('access-control-'))).toBe(false);
  });
});
