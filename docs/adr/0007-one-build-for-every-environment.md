# 0007. Build once for every environment and read configuration at runtime

Status: Accepted, 2026-07-27

## Context

TEST, QA and PROD deploy the same commit (ADR 0006). The SPA still needs to know which
environment it runs in, to paint the non-production ribbon, and which features are
switched on. Vite's `import.meta.env` would bake those values in at build time and
need one build per environment.

## Decision

`dist/build/` carries nothing specific to an environment. The SPA reads what it needs
from `GET /api/v1/config` before it renders, together with the session.

The endpoint is public and sent with `Cache-Control: no-store`. Its body is an
allowlist, never `config()` passed through: `env`, one of `dev`, `test`, `qa` or
`prod`, and `features`, a map of flag names to booleans. It fails safe. An
unrecognised `APP_ENV` reads as `prod` and an unknown flag reads as `false`, so a
failed or odd answer never paints a staging ribbon on the live site.

The only `import.meta.env` left in the SPA is the development switch for the mocked
backend, which never reaches a build.

## Consequences

Each page load makes one more request before anything renders.

A new flag is a code change in `App\Support\Features` plus a server `.env` key, and
the key refuses every server's next deploy until it is set there (ADR 0005).

`App\Support\Environment` is shared with the API reference page's server label, so the
two cannot disagree.
