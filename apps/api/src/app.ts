import { getHealth } from './health.js';
import type { Instrument, MarketStore } from './market.js';
import { OrderRejectedError, type PortfolioStore, type Side } from './portfolio.js';
import { historyAt, priceAt } from './quotes/simulator.js';
import { ROUTE_TABLE, type Method, type RoutePath } from './routes.js';
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
  market: MarketStore;
  portfolio: PortfolioStore;
  dbTimeoutMs?: number;
  /** Wall clock in epoch milliseconds; injected so tests never wait for real time. */
  now?: () => number;
  /** Seed of the simulated price series. */
  quoteSeed?: number;
}

export interface ApiRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | string[] | undefined>;
  /** The raw request body, when the adapter read one. */
  body?: string;
  /** True when the body exceeded the size limit and was not read. */
  bodyTooLarge?: boolean;
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

export const DEFAULT_QUOTE_SEED = 1807;
export const NEWS_LIMIT = 10;
export const HISTORY_DEFAULT_LIMIT = 120;
export const HISTORY_MAX_LIMIT = 600;
export const OPERATIONS_DEFAULT_LIMIT = 10;
export const OPERATIONS_MAX_LIMIT = 50;
export const MAX_ORDER_QUANTITY = 10_000;
export const CURRENCY = 'USD';

const error = (status: number, code: string, message: string, headers?: Record<string, string>) =>
  ({
    status,
    ...(headers ? { headers } : {}),
    body: { code, message } satisfies ApiError,
  }) as const;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

function isJsonContentType(value: string | undefined): boolean {
  return value?.split(';')[0]?.trim().toLowerCase() === 'application/json';
}

/** A whole number in 1..max from a query value; the default when absent; null when invalid. */
function parseLimit(raw: string | null, fallback: number, max: number): number | null {
  if (raw === null) return fallback;
  if (!/^\d{1,6}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= max ? n : null;
}

interface Ctx {
  req: ApiRequest;
  json: unknown;
}
type Handler = (ctx: Ctx) => Promise<ApiResponse>;

/**
 * The whole API surface. Only the routes declared in ROUTE_TABLE exist (allowlist); everything
 * else is a 404 with a machine code. No CORS headers are ever produced: development goes through
 * the Vite proxy, so the browser only talks to its own origin.
 */
export function createApp(deps: AppDeps): (req: ApiRequest) => Promise<ApiResponse> {
  const now = deps.now ?? Date.now;
  const seed = deps.quoteSeed ?? DEFAULT_QUOTE_SEED;

  const quoteOf = (i: Instrument, at: number) => {
    const point = priceAt(seed, i.symbol, i.baseCents, at);
    return {
      symbol: i.symbol,
      name: i.name,
      priceCents: point.priceCents,
      prevCloseCents: i.baseCents,
      updatedAt: new Date(point.ts).toISOString(),
    };
  };

  /** The one place that turns a request into a user; /api/me and every per-user route use it. */
  async function currentUser(req: ApiRequest): Promise<{ user: User } | { response: ApiResponse }> {
    const resolved = resolveCurrentUser(
      { header: first(req.headers[USER_HEADER]), cookie: first(req.headers.cookie) },
      await deps.users.list(),
    );
    if (resolved.ok) return { user: resolved.user };
    return {
      response:
        resolved.code === 'UNKNOWN_USER'
          ? error(400, 'UNKNOWN_USER', 'No pilot user has the requested id')
          : error(404, 'NO_USERS', 'No users exist yet; run pnpm db:seed'),
    };
  }

  const forUser =
    (run: (user: User, ctx: Ctx) => Promise<ApiResponse>): Handler =>
    async (ctx) => {
      const found = await currentUser(ctx.req);
      return 'response' in found ? found.response : run(found.user, ctx);
    };

  const handlers: Record<RoutePath, Handler> = {
    '/api/health': async () => getHealth(deps.checkDb, deps.dbTimeoutMs),
    '/api/users': async () => ({ status: 200, body: await deps.users.list() }),
    '/api/me': forUser(async (user) => ({ status: 200, body: user })),

    '/api/quotes': async () => {
      const at = now();
      const instruments = await deps.market.instruments();
      return { status: 200, body: instruments.map((i) => quoteOf(i, at)) };
    },

    '/api/history': async ({ req }) => {
      const limit = parseLimit(req.query.get('limit'), HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT);
      const symbol = req.query.get('symbol');
      if (limit === null || !symbol) {
        return error(
          400,
          'INVALID_QUERY',
          `symbol is required and limit must be a whole number from 1 to ${HISTORY_MAX_LIMIT}`,
        );
      }
      const instrument = (await deps.market.instruments()).find((i) => i.symbol === symbol);
      if (!instrument)
        return error(404, 'UNKNOWN_SYMBOL', 'No instrument has the requested symbol');
      const points = historyAt(seed, symbol, instrument.baseCents, now(), limit).map((p) => ({
        ts: new Date(p.ts).toISOString(),
        priceCents: p.priceCents,
      }));
      return { status: 200, body: { symbol, points } };
    },

    '/api/news': async () => ({ status: 200, body: await deps.market.news(NEWS_LIMIT) }),

    '/api/balance': forUser(async (user) => {
      const [holdings, instruments] = await Promise.all([
        deps.portfolio.holdings(user.id),
        deps.market.instruments(),
      ]);
      const at = now();
      const bySymbol = new Map(instruments.map((i) => [i.symbol, i]));
      const positions = holdings.positions.map((p) => {
        const instrument = bySymbol.get(p.symbol);
        const price = instrument ? quoteOf(instrument, at).priceCents : 0;
        return { symbol: p.symbol, quantity: p.quantity, valueCents: p.quantity * price };
      });
      const totalCents = positions.reduce((sum, p) => sum + p.valueCents, holdings.cashCents);
      return {
        status: 200,
        body: { currency: CURRENCY, cashCents: holdings.cashCents, positions, totalCents },
      };
    }),

    '/api/watchlist': forUser(async (user) => ({
      status: 200,
      body: await deps.portfolio.watchlist(user.id),
    })),

    '/api/operations': forUser(async (user, { req }) => {
      const limit = parseLimit(
        req.query.get('limit'),
        OPERATIONS_DEFAULT_LIMIT,
        OPERATIONS_MAX_LIMIT,
      );
      if (limit === null) {
        return error(
          400,
          'INVALID_QUERY',
          `limit must be a whole number from 1 to ${OPERATIONS_MAX_LIMIT}`,
        );
      }
      return { status: 200, body: await deps.portfolio.operations(user.id, limit) };
    }),

    '/api/orders': forUser(async (user, { json }) => {
      const body = json as Record<string, unknown>;
      const side = body.side;
      if (side !== 'buy' && side !== 'sell') {
        return error(400, 'INVALID_SIDE', 'side must be "buy" or "sell"');
      }
      const quantity = body.quantity;
      if (
        typeof quantity !== 'number' ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_ORDER_QUANTITY
      ) {
        return error(
          400,
          'INVALID_QUANTITY',
          `quantity must be a whole number from 1 to ${MAX_ORDER_QUANTITY}`,
        );
      }
      const instrument = (await deps.market.instruments()).find((i) => i.symbol === body.symbol);
      if (!instrument)
        return error(404, 'UNKNOWN_SYMBOL', 'No instrument has the requested symbol');
      // Execution is always at the server's current price; a price in the body is ignored.
      const priceCents = quoteOf(instrument, now()).priceCents;
      try {
        const operation = await deps.portfolio.placeOrder({
          userId: user.id,
          symbol: instrument.symbol,
          side: side satisfies Side,
          quantity,
          priceCents,
        });
        return { status: 201, body: operation };
      } catch (err) {
        if (err instanceof OrderRejectedError) {
          return err.code === 'INSUFFICIENT_FUNDS'
            ? error(409, 'INSUFFICIENT_FUNDS', 'Not enough cash to fill this order')
            : error(409, 'INSUFFICIENT_POSITION', 'Not enough units held to fill this order');
        }
        throw err;
      }
    }),
  };

  /** Checks Content-Type, size and syntax of a JSON route body; the handler never sees a bad one. */
  function readJson(req: ApiRequest): { json: unknown } | { response: ApiResponse } {
    if (!isJsonContentType(first(req.headers['content-type']))) {
      return {
        response: error(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'),
      };
    }
    if (req.bodyTooLarge) {
      return { response: error(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large') };
    }
    try {
      const parsed: unknown = JSON.parse(req.body ?? '');
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return { json: parsed };
      }
    } catch {
      // falls through to the same answer as a non-object
    }
    return { response: error(400, 'INVALID_JSON', 'The body must be a JSON object') };
  }

  return async (req) => {
    if (!Object.hasOwn(ROUTE_TABLE, req.path)) return error(404, 'NOT_FOUND', 'No such route');
    const path = req.path as RoutePath;
    const spec: { methods: readonly Method[]; json?: true } = ROUTE_TABLE[path];
    if (!(spec.methods as readonly string[]).includes(req.method)) {
      const allow = spec.methods.join(', ');
      return error(405, 'METHOD_NOT_ALLOWED', `Allowed: ${allow}`, { allow });
    }
    try {
      let json: unknown;
      if (spec.json) {
        const read = readJson(req);
        if ('response' in read) return read.response;
        json = read.json;
      }
      return await handlers[path]({ req, json });
    } catch (err) {
      if (err instanceof DbUnavailableError) {
        return error(503, 'DB_UNAVAILABLE', 'The database is unavailable');
      }
      console.error(err);
      return error(500, 'INTERNAL_ERROR', 'Unexpected server error');
    }
  };
}
