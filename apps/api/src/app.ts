import { getHealth } from './health.js';
import { resolveCurrentUser, USER_HEADER, type User } from './users.js';

/** Thrown by a store when the database cannot be reached; mapped to 503 DB_UNAVAILABLE. */
export class DbUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('The database is unavailable', options);
    this.name = 'DbUnavailableError';
  }
}

export interface UserStore {
  list(): Promise<User[]>;
}

export interface AppDeps {
  checkDb: () => Promise<void>;
  users: UserStore;
  dbTimeoutMs?: number;
}

export interface ApiRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface ApiResponse {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}

export interface ApiError {
  code: string;
  message: string;
}

const error = (status: number, code: string, message: string, headers?: Record<string, string>) =>
  ({
    status,
    ...(headers ? { headers } : {}),
    body: { code, message } satisfies ApiError,
  }) as const;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * The whole API surface. Only the routes declared here exist (allowlist); everything else is a
 * 404 with a machine code. No CORS headers are ever produced: development goes through the Vite
 * proxy, so the browser only talks to its own origin.
 */
export function createApp(deps: AppDeps): (req: ApiRequest) => Promise<ApiResponse> {
  const routes: Record<string, (req: ApiRequest) => Promise<ApiResponse>> = {
    '/api/health': async () => getHealth(deps.checkDb, deps.dbTimeoutMs),
    '/api/users': async () => ({ status: 200, body: await deps.users.list() }),
    '/api/me': async (req) => {
      const resolved = resolveCurrentUser(
        { header: first(req.headers[USER_HEADER]), cookie: first(req.headers.cookie) },
        await deps.users.list(),
      );
      if (resolved.ok) return { status: 200, body: resolved.user };
      return resolved.code === 'UNKNOWN_USER'
        ? error(400, 'UNKNOWN_USER', 'No pilot user has the requested id')
        : error(404, 'NO_USERS', 'No users exist yet; run pnpm db:seed');
    },
  };

  return async (req) => {
    const route = Object.hasOwn(routes, req.path) ? routes[req.path] : undefined;
    if (!route) return error(404, 'NOT_FOUND', 'No such route');
    if (req.method !== 'GET') {
      return error(405, 'METHOD_NOT_ALLOWED', 'Only GET is allowed', { allow: 'GET' });
    }
    try {
      return await route(req);
    } catch (err) {
      if (err instanceof DbUnavailableError) {
        return error(503, 'DB_UNAVAILABLE', 'The database is unavailable');
      }
      console.error(err);
      return error(500, 'INTERNAL_ERROR', 'Unexpected server error');
    }
  };
}
