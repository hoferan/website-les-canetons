---
status: accepted
date: 2026-07-27
decision-makers: André Hofer
---

# Build once for every environment and read configuration at runtime

## Context and Problem Statement

TEST, QA and PROD deploy the same commit
([ADR-0006](0006-deploy-test-on-merge-promote-by-tag.md)). The SPA still needs to know
which environment it runs in, to paint the non-production ribbon, and which features
are switched on. Vite's `import.meta.env` would bake those values in at build time and
need one build per environment.

How does one build learn which environment it runs in and which features are on?

## Considered Options

- Build once and read configuration from `GET /api/v1/config` at runtime
- Bake the values in at build time with Vite's `import.meta.env`

## Decision Outcome

Chosen option: "Build once and read configuration from `GET /api/v1/config` at
runtime", because TEST, QA and PROD deploy the same commit, and values baked in at
build time would need one build per environment.

`dist/build/` carries nothing specific to an environment. The SPA reads what it needs
from `GET /api/v1/config` before it renders, together with the session.

The endpoint is public and sent with `Cache-Control: no-store`. Its body is an
allowlist, never `config()` passed through: `env`, one of `dev`, `test`, `qa` or
`prod`, and `features`, a map of flag names to booleans. It fails safe. An
unrecognised `APP_ENV` reads as `prod` and an unknown flag reads as `false`, so a
failed or odd answer never paints a staging ribbon on the live site.

The only `import.meta.env` left in the SPA is the development switch for the mocked
backend, which never reaches a build.

### Consequences

- Good, because `App\Support\Environment` is shared with the API reference page's
  server label, so the two cannot disagree.
- Bad, because each page load makes one more request before anything renders.
- Bad, because a new flag is a code change in `App\Support\Features` plus a server
  `.env` key, and the key refuses every server's next deploy until it is set there
  ([ADR-0005](0005-server-owned-files-never-travel-with-a-deploy.md)).

## Pros and Cons of the Options

### Bake the values in at build time with Vite's `import.meta.env`

- Bad, because it needs one build per environment, and TEST, QA and PROD deploy the
  same commit.
