export type Method = 'GET' | 'POST';

/**
 * The allowlist: every route the API serves, with the only methods each accepts. A `json` route
 * requires `Content-Type: application/json` and a parsed body before its handler runs. Anything
 * not listed here is a 404; a listed path with another method is a 405.
 */
export const ROUTE_TABLE = {
  '/api/health': { methods: ['GET'] },
  '/api/me': { methods: ['GET'] },
  '/api/users': { methods: ['GET'] },
  '/api/quotes': { methods: ['GET'] },
  '/api/history': { methods: ['GET'] },
  '/api/news': { methods: ['GET'] },
  '/api/balance': { methods: ['GET'] },
  '/api/watchlist': { methods: ['GET'] },
  '/api/operations': { methods: ['GET'] },
  '/api/orders': { methods: ['POST'], json: true },
} as const satisfies Record<string, { methods: readonly Method[]; json?: true }>;

export type RoutePath = keyof typeof ROUTE_TABLE;

export interface RouteInfo {
  path: RoutePath;
  methods: readonly Method[];
}

/** The route table as a list, for tests that must cover every route. */
export function listRoutes(): RouteInfo[] {
  return (Object.keys(ROUTE_TABLE) as RoutePath[]).map((path) => ({
    path,
    methods: ROUTE_TABLE[path].methods,
  }));
}

/** Largest accepted request body, in bytes. */
export const MAX_BODY_BYTES = 16 * 1024;
