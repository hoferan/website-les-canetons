# Web-session unit-TDD setup — design

**Date:** 2026-07-28
**Branch:** `feat/wordpress-migration`
**Status:** approved for implementation

## Problem

Claude Code web sessions have no usable Docker (dockerd can start but without
bridge networking, so `docker compose up` cannot work — see
`anthropics/claude-code#29515`). The plugin's **unit** suite is deliberately
WordPress-free (`tests/unit/bootstrap.php` loads only Composer's autoloader), so
it can run natively on PHP 8.4 with no daemon. Two gaps keep that from being a
clean, reliable workflow:

1. **No one-step setup.** Getting a fresh web session TDD-ready today means
   knowing to run `npm run wp:install` then `npm run wp:test:unit` by hand.

2. **A fallback trap.** `tools/composer.mjs` chooses the Docker path whenever
   `docker info` succeeds. `tools/check-web-session.sh` — the documented first
   step in a web session — *starts* a bridgeless dockerd as a side effect.
   After it runs, `docker info` succeeds, so `npm run wp:install` routes into
   the `composer:2` container, whose default bridge networking cannot reach
   Packagist. The README already promises `wp:install` "falls back to native
   automatically"; this makes that promise false on the documented happy path
   (run the diagnostic, then install).

## Scope

Unit TDD only, formalized. **Out of scope (YAGNI):** MariaDB, WordPress core,
the integration suite, and `config.php`. Those stay Docker-local by design.
`npm run wp:test:integration` keeps its deliberate no-fallback loud failure —
capability enforcement is a security boundary and a skipped run must never look
like a passing one.

## Design

### 1. Fix the fallback trap — `tools/composer.mjs`

Add a web-session guard: when `process.env.CLAUDE_CODE_REMOTE === 'true'`, skip
the Docker path and run native Composer, regardless of whether `docker info`
succeeds. Rationale (in a code comment): a web session's dockerd has no usable
bridge networking, so the `composer:2` container cannot reach Packagist even
though the daemon is up.

- The existing native branch already requires `composer` to be present; the
  guard reuses it. If a web session somehow lacks native `composer`, the
  existing "could not run" failure applies — acceptable, since the check script
  reports Composer availability.
- `tools/phpunit.mjs` is unchanged: it keys off `docker compose ps --status
  running` for the `wp` service, which is empty in a web session (no stack), so
  it already falls back to native correctly.

### 2. One-command init — `tools/websession-init.mjs`

A new cross-platform Node entry (matching the repo's `tools/*.mjs` convention),
run via a new npm script. Idempotent. Steps, in order, stopping on first
failure:

1. **Preflight.** Verify native PHP major.minor ≥ 8.4 and that `composer`
   exists. On failure, print a short message pointing at
   `bash tools/check-web-session.sh` for the full diagnostic, and exit non-zero.
2. **Install deps.** Delegate to `node tools/composer.mjs install`, which — with
   change (1) — runs native in a web session.
3. **Verify.** Run `node tools/phpunit.mjs unit`; a red suite fails the init
   (non-zero exit).
4. **Summary.** Print a short "ready for unit TDD" line and a reminder that the
   integration suite still requires local Docker.

Behaviour outside a web session: it still works (native PHP/Composer), and is a
safe no-op to re-run. It does not start, require, or stop Docker.

### 3. npm target

```json
"wp:websession:init": "node tools/websession-init.mjs"
```

### 4. Docs

Update the README "Without Docker (Claude Code web sessions)" section to lead
with `npm run wp:websession:init` as the one-step setup, keeping the existing
`tools/check-web-session.sh` note and the integration-has-no-fallback warning.

## Components and boundaries

| Unit | Does | Depends on |
| --- | --- | --- |
| `tools/composer.mjs` (edited) | Install plugin deps; pick Docker vs native | `docker`, native `composer`, `CLAUDE_CODE_REMOTE` |
| `tools/websession-init.mjs` (new) | Orchestrate preflight → install → verify | `tools/composer.mjs`, `tools/phpunit.mjs`, native `php` |
| README (edited) | Document the one-step setup | — |

## Testing / verification

- Run `npm run wp:websession:init` in this session (dockerd currently up from
  the diagnostic, so this exercises the change-(1) trap fix directly): expect
  native Composer, then `OK (5 tests, ...)`.
- Re-run it to confirm idempotence.
- Confirm `npm run wp:install` alone now selects native in this session
  (dockerd up) rather than the `composer:2` container.

## Non-goals

- No change to `tools/phpunit.mjs`, the integration suite, or any Docker/compose
  configuration.
- No new runtime dependencies (the repo intentionally has none).
