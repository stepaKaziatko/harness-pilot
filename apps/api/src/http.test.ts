import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createHttpServer } from './http.js';

const servers: ReturnType<typeof createHttpServer>[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function start() {
  const server = createHttpServer(
    createApp({
      checkDb: async () => undefined,
      users: { list: async () => [{ id: 'u-a', name: 'A' }] },
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
});
