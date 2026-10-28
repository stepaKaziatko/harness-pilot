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

Verification runs on the developer's machine (`pnpm verify`) and is attached to
the commit as the `local/verify` status; pull requests into `main` require it.

## License

MIT.
