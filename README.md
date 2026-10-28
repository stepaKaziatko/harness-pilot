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

Pre-alpha. The application skeleton comes first; the framework is wired in once
its first packages exist.

## Development

Requirements: Node 20 or newer (developed on 24), pnpm 9 (via `corepack enable`) and Docker
for the database.

```sh
pnpm install            # also installs the pre-push reminder hook
cp .env.example .env    # optional; every value has a working default
pnpm db:up              # Postgres 17 from docker-compose.yml, waits until healthy
pnpm db:migrate         # numbered SQL files from apps/api/migrations
pnpm db:seed            # three dev users, safe to re-run
pnpm dev                # web on :5173, api on :3001 (web proxies /api to the api)
```

| Command                          | What it does                                                           |
| -------------------------------- | ---------------------------------------------------------------------- |
| `pnpm verify`                    | typecheck, build, lint, test; needs no Docker and no database          |
| `pnpm test:db`                   | brings the database up, migrates, seeds, runs the `*.db.test.ts` suite |
| `pnpm db:down` / `pnpm db:reset` | stop the database / wipe the volume and start over                     |
| `node scripts/local-verify.mjs`  | run `pnpm verify` and attach the result to HEAD as `local/verify`      |

### Layout

- `apps/web` - Vite, React and TypeScript. A single skeleton page that shows `GET /api/health`,
  the current user and a dev user switcher.
- `apps/api` - the HTTP API. Its tests live next to the code; tests that need a database are the
  only ones named `*.db.test.ts` and are excluded from `pnpm verify`.

### API server choice

The API is plain `node:http` with a small hand-written route table and the `pg` driver. The
service has three read-only routes, so a framework would add more surface than it removes, and an
explicit route table makes the allowlist obvious: only `GET /api/health`, `GET /api/me` and
`GET /api/users` exist, anything else is `404 NOT_FOUND`, and no CORS headers are ever sent
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
