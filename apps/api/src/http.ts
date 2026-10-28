import { createServer, type Server } from 'node:http';
import type { ApiRequest, ApiResponse } from './app.js';

/** Thin node:http adapter around the framework-free request handler. */
export function createHttpServer(handle: (req: ApiRequest) => Promise<ApiResponse>): Server {
  return createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    handle({ method: req.method ?? 'GET', path, headers: req.headers })
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
