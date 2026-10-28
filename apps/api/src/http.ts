import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { ApiRequest, ApiResponse } from './app.js';
import { MAX_BODY_BYTES } from './routes.js';

/**
 * Reads the request body up to MAX_BODY_BYTES. A larger body (by Content-Length or by bytes
 * actually received) is dropped and reported as too large instead of being buffered.
 */
async function readBody(req: IncomingMessage): Promise<{ body: string; tooLarge: boolean }> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    req.resume();
    return { body: '', tooLarge: true };
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      return { body: '', tooLarge: true };
    }
    chunks.push(buf);
  }
  return { body: Buffer.concat(chunks).toString('utf8'), tooLarge: false };
}

/** Thin node:http adapter around the framework-free request handler. */
export function createHttpServer(handle: (req: ApiRequest) => Promise<ApiResponse>): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    const hasBody = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
    (hasBody ? readBody(req) : Promise.resolve({ body: undefined, tooLarge: false }))
      .then(({ body, tooLarge }) =>
        handle({
          method,
          path: url.pathname,
          query: url.searchParams,
          headers: req.headers,
          ...(body !== undefined ? { body } : {}),
          ...(tooLarge ? { bodyTooLarge: true } : {}),
        }),
      )
      .catch((): ApiResponse => ({
        status: 500,
        body: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' },
      }))
      .then((out) => {
        res.writeHead(out.status, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          ...out.headers,
        });
        res.end(JSON.stringify(out.body));
      });
  });
}
