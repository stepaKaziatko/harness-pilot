# Harness pilot

The first real application the
[harness framework](https://github.com/stepaKaziatko/harness-framework) is
integrated into. It plays the role of an existing product: a small
dashboard-style app with its own web client and API, built without the
framework first, then connected to it the way a customer would — a `harness/`
folder with the contract, generated code in `.harness/generated/`, one
`HarnessProvider` on the client and one middleware on the server.

The pilot exists to validate the hypothesis before anything heavier is built:
one screen, five to seven widgets, declarative (tier 1) customization only. The
metric is the share of users who change the layout.

## Status

Pre-alpha. The application is a complete dashboard screen on its own data; the framework is
wired in once its first packages exist.

## Development

Requirements: Node 20 or newer (developed on 24), pnpm 9 (via `corepack enable`) and Docker
for the database.

```sh
pnpm install            # also installs the pre-push reminder hook
cp .env.example .env    # optional; every value has a working default
pnpm db:up              # Postgres 17 from docker-compose.yml, waits until healthy
pnpm db:migrate         # numbered SQL files from apps/api/migrations
pnpm db:seed            # users, instruments, news, portfolios; re-running restores the baseline
pnpm dev                # web on :5173, api on :3001 (web proxies /api to the api)
```

| Command                          | What it does                                                            |
| -------------------------------- | ----------------------------------------------------------------------- |
| `pnpm verify`                    | typecheck, build, lint, test; needs no Docker and no database           |
| `pnpm test:db`                   | brings the database up, migrates, seeds, runs the `*.db.test.ts` suite  |
| `pnpm db:down` / `pnpm db:reset` | stop the database / wipe the volume, migrate and seed for a clean slate |
| `node scripts/local-verify.mjs`  | run `pnpm verify` and attach the result to HEAD as `local/verify`       |

### Layout

- `apps/web` - Vite, React and TypeScript. One dashboard screen of seven blocks (below) under a
  small header with the API health, the current user and the dev user switcher.
- `apps/api` - the HTTP API. Its tests live next to the code; tests that need a database are the
  only ones named `*.db.test.ts` and are excluded from `pnpm verify`.

## The dashboard

One screen in the style of a trading or banking app. Every block is its own component in
`apps/web/src/blocks/`, renders as `<section data-block="<id>" aria-label="...">`, and shows
loading, error (an alert carrying the API's machine code, or `NETWORK`), empty and data states. One
failing endpoint breaks one block, never the others. All names, prices, news and balances come from
the API; the components contain only interface labels.

The blocks and their order are fixed in `apps/web/src/layout.ts` (`DASHBOARD_LAYOUT`) and drawn as
a CSS grid in `styles.css` (a single column in the same order on narrow screens).
`apps/web/src/layout.test.tsx` pins the set and the order of the blocks and does not look at any
value.

| #   | Block (`data-block`) | Reads                                          | Writes                               |
| --- | -------------------- | ---------------------------------------------- | ------------------------------------ |
| 1   | `quotes`             | quote feed, `selectedSymbol`                   | `selectedSymbol` (click a symbol)    |
| 2   | `balance`            | `/api/balance`                                 | -                                    |
| 3   | `chart`              | `selectedSymbol`, `/api/history` (polled)      | -                                    |
| 4   | `news`               | `/api/news`                                    | -                                    |
| 5   | `quick-actions`      | `selectedSymbol`, quote feed (cost estimate)   | `POST /api/orders`, re-reads 2 and 7 |
| 6   | `watchlist`          | `/api/watchlist`, quote feed, `selectedSymbol` | `selectedSymbol` (click a symbol)    |
| 7   | `operations`         | `/api/operations`                              | -                                    |

The blocks are connected through shared client state (`apps/web/src/state/`), the way a real
product's screen is:

- `selectedSymbol` lives in `DashboardProvider`. Clicking a symbol in the quotes or the watchlist
  selects it everywhere: both lists highlight it (`aria-pressed`), the chart shows it and the
  quick-action form orders it. It starts as the first instrument of the feed.
- There is one quote feed for the whole screen, polled once per second; the quotes, watchlist,
  quick-action estimate and the chart header all read it. The chart's series is polled by its own
  request so its right edge follows the feed.
- A filled order re-reads the balance and the operations. Switching the dev user re-reads every
  block.
- `api.ts` is the only place that talks to the network: it turns every failure into an `ApiError`
  with a `code`, and `useResource` adds loading, polling and stale-on-failed-poll behaviour. There
  is no data-fetching or state library; a hand-written hook and one React context are enough.
- Charts are inline SVG.

### API

All routes are `GET` except `POST /api/orders`; any other method on a known path is
`405 METHOD_NOT_ALLOWED` with an `Allow` header, any other path is `404 NOT_FOUND`. Money is
always whole cents (`*Cents`), quantities are whole units. The user is resolved as described under
"Dev users" below, by one shared function.

| Route                             | User     | Answer                                                                                                   |
| --------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                 | -        | `{status, db}`                                                                                           |
| `GET /api/users`, `GET /api/me`   | -/yes    | users / the current user                                                                                 |
| `GET /api/quotes`                 | shared   | `[{symbol, name, priceCents, prevCloseCents, updatedAt}]`                                                |
| `GET /api/history?symbol=&limit=` | shared   | `{symbol, points: [{ts, priceCents}]}`, oldest first; `limit` 1-600, def. 120                            |
| `GET /api/news`                   | shared   | newest ten `{id, title, source, publishedAt, symbol}`                                                    |
| `GET /api/balance`                | per user | `{currency, cashCents, positions: [{symbol, quantity, valueCents}], totalCents}`                         |
| `GET /api/watchlist`              | per user | `[{symbol, name}]`; prices come from the quote feed                                                      |
| `GET /api/operations?limit=`      | per user | `[{id, symbol, side, quantity, priceCents, totalCents, createdAt}]`, newest first; `limit` 1-50, def. 10 |
| `POST /api/orders`                | per user | `201` and the operation                                                                                  |

`POST /api/orders` takes `{symbol, side: "buy" | "sell", quantity: 1..10000}` as
`application/json`. There is no price in the request: the order fills at the server's current
price, and any price field sent is ignored. Cash, position and the operation row change in one
transaction, or not at all.

Errors are `{code, message}`. Codes: `NOT_FOUND` (404), `METHOD_NOT_ALLOWED` (405), `UNKNOWN_USER`
(400), `NO_USERS` (404), `INVALID_QUERY` (400), `UNKNOWN_SYMBOL` (404), `DB_UNAVAILABLE` (503),
`INTERNAL_ERROR` (500) and, for orders, `UNSUPPORTED_MEDIA_TYPE` (415, not `application/json`; this
also means a cross-site HTML form cannot post an order), `PAYLOAD_TOO_LARGE` (413, over 16 KiB),
`INVALID_JSON` (400), `INVALID_SIDE` (400), `INVALID_QUANTITY` (400), `INSUFFICIENT_FUNDS` (409)
and `INSUFFICIENT_POSITION` (409). The route table is `apps/api/src/routes.ts`; tests walk every
entry of it to prove that no response carries an `Access-Control-*` header.

### Simulated market

The instruments are six fictional tickers in the database (`instruments`, with a base price that
doubles as the previous close). Prices are simulated by the server and are a pure function of
`(seed, symbol, base price, second)` - two slow sine waves plus hashed noise, always within about
13% of the base - so nothing is stored: the history for the chart is computed on demand, a restarted
API continues the same series, and tests inject the clock and never wait. See
`apps/api/src/quotes/simulator.ts`. There are no external market APIs.

The client polls once per second instead of using SSE or WebSockets: one plain `GET`, nothing to
reconnect and a simulated feed cannot tell the difference.

### Seed data

`pnpm db:seed` is idempotent and restores the baseline: it upserts instruments and news and
resets every seeded user's cash, positions, watchlist and operations to fixed values (three users
with different numbers, so switching users changes the screen). Running it twice gives the same row
counts; orders placed in a session are undone by re-seeding. `pnpm db:reset` wipes the volume and
starts from nothing. News have fixed dates, so no text on the screen depends on "now".

### API server choice

The API is plain `node:http` with a small hand-written route table and the `pg` driver. The
service has a handful of routes, so a framework would add more surface than it removes, and an
explicit route table makes the allowlist obvious: only the routes in `routes.ts` exist, each with
fixed methods, anything else is `404 NOT_FOUND`/`405`, and no CORS headers are ever sent
(development goes through the Vite proxy). Every error body is `{"code": "UPPER_SNAKE", "message": "..."}`.
Migrations are numbered SQL files applied by a ~50 line runner (`schema_migrations`, one
transaction per file); there is no ORM.

### Dev users are not authentication

`GET /api/me` returns the "current user" chosen by the `X-Pilot-User` header, else the `pilot_user`
cookie, else the first seeded user; an unknown id is `400 UNKNOWN_USER`. The web page's user
switcher just sets that cookie. This is a development stand-in for per-user behaviour and provides
no security whatsoever.

### Verification

Verification runs on the developer's machine, not in GitHub Actions. `pnpm verify` must pass, then
`node scripts/local-verify.mjs` (on a clean tree whose HEAD is pushed) sets the `local/verify`
commit status that pull requests into `main` require. The pre-push hook (lefthook) only prints a
reminder; it never blocks a push and never sets a status.

## License

MIT.
