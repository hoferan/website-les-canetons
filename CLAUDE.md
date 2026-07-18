# Website "Guggenmusik Les Canetons de Fribourg" — Project Instructions

## Project Overview

Public website and members' area for the Guggenmusik **Les Canetons de Fribourg**
(a Fribourg carnival brass band). Public pages present the band (history, sections,
committee, sponsors, media, contact). A members' area, gated by login, lets members
respond to events (participate / not) and lets the admin ("Team Direction") manage
events and view attendance summaries.

## Tech Stack

- **PHP 8.1** (matches prod: PHP 8.1.34), **buildless** — no framework, no bundler,
  no runtime dependencies. Files are edited in place and deployed as-is.
- **MariaDB 10.3** (prod: 10.3.8) via the `mysqli` extension.
- **Vanilla JS + CSS** under `code/assets/` — no build step.
- **Apache** with `.htaccess` (cache policy) on `easy-hebergement.net` shared hosting.
- **Deployment:** manual FTP/SFTP upload of `code/`.
- **Dev tooling (never deployed):** Composer + PHP_CodeSniffer (PSR-12); Node with
  Prettier, ESLint, Stylelint; Husky + lint-staged; Docker Compose for local dev.

## Superpowers Skills

This project ships with [Superpowers](https://github.com/obra/superpowers) skills in `.claude/skills/`. These are loaded automatically at session start. Always use the `Skill` tool to invoke them — never read skill files manually.

Available skills:

| Skill | When to use |
|-------|-------------|
| `brainstorming` | Before implementing any feature or change |
| `writing-plans` | When given a spec or multi-step task |
| `executing-plans` | When running an existing plan |
| `subagent-driven-development` | For parallel implementation tasks |
| `test-driven-development` | Before writing any implementation code |
| `systematic-debugging` | On any bug or test failure |
| `verification-before-completion` | Before claiming work is done |
| `requesting-code-review` | After completing a feature |
| `receiving-code-review` | When acting on review feedback |
| `finishing-a-development-branch` | When ready to integrate work |
| `dispatching-parallel-agents` | For 2+ independent tasks |
| `using-git-worktrees` | For isolated feature work |
| `writing-skills` | When creating or editing skills |
| `using-superpowers` | Use when starting any conversation |

## Architecture

- **`code/` is the exact FTP payload.** Never put dev-only files in it. All tooling
  lives at the repo root (`composer.json`, `package.json`, `phpcs.xml`, `docker/`,
  `config/`, `tools/`, `.github/`).
- **Entry point:** every page includes `partials/head.php`, which requires
  `code/src/bootstrap.php`. `bootstrap.php` loads `config.php`, connects the DB
  (`Database`), and starts the session (`Auth`).
- **No autoloader:** `src/` classes are wired via explicit `require` in `bootstrap.php`.
- **Auth:** `Auth` holds a capability matrix — `user`/`moderator` may `respond`;
  `admin` may `manage_events` / `view_summary`. Not a hierarchy. `assets/js/session.js`
  mirrors it on the client; the server session (`window.__sessionRole`) is source of truth.
- **API:** `code/api/*.php` return JSON and guard with `Auth::require*`.
- **Config:** the real `code/config.php` is git-ignored and uploaded via FTP. Create it
  locally with `cp config/config.example.php code/config.php`. For Docker, the stack
  mounts `config/config.docker.php` into the container instead.

## Local Development

```bash
docker compose up -d --build   # site: http://localhost:8090, Adminer: http://localhost:8091
docker compose down            # stop
```

Seeded test logins (all passwords `demo`, synthetic data only):
- `demo.admin` — admin (manage events, view summaries)
- `demo.moderator` — moderator (respond)
- `demo.user` — user (respond)

## Development Commands

PHP and Composer are **not** installed locally — the PHP tools run in Docker
(`php:8.1-cli` / `composer:2`) via wrappers in `tools/`. Docker must be running
for any PHP check. First-time setup: `npm install` then `npm run php:install`.

```bash
npm run php:install   # install PHP dev deps into vendor/ (Dockerized Composer; run once)
npm run check         # all checks: php -l + phpcs (Docker), eslint, stylelint, prettier, secret guard
npm run fix           # auto-fix: phpcbf (Docker) + eslint + stylelint + prettier
npm run lint:php      # PHP only (php -l sweep + phpcs, Dockerized)
npm run test:php      # PHPUnit (code/src/**): unit tests + DB-integration tests
```

A Husky pre-commit hook runs `lint-staged` on staged files automatically
(PHP hunks are linted through the same Docker wrappers).

### Claude Code web sessions (no Docker)

Web sessions have no Docker daemon. `.claude/hooks/session-start.sh` detects
this (`$CLAUDE_CODE_REMOTE` set, `docker info` failing) and provisions an
equivalent stack natively instead: MariaDB installed via `apt` and started
directly (no systemd), `lescanetons` + `lescanetons_test` databases seeded
from `docker/db/init/*.sql`, `code/config.php` pointed at `127.0.0.1`, and
`php -S 127.0.0.1:8090 -t code` standing in for the Apache container. The
`tools/composer.mjs` and `tools/php-in-docker.mjs` wrappers fall back to the
locally-installed `composer`/`php` the same way, so `npm run lint:php`,
`npm run fix`, and `npm run test:php` all work unchanged. `IntegrationTestCase`
(in `tests/Integration/`) runs each test in a transaction rolled back in
`tearDown()`, against `lescanetons_test`, so tests never touch dev data.
Local Docker Compose dev is unaffected — the hook is a no-op when Docker is
reachable.

## Dos

- Keep the site buildless; edit JS/CSS in place.
- Match production versions (PHP 8.1, MariaDB 10.3).
- Run `npm run check` before pushing.
- Put new tooling/config at the repo root, never in `code/`.

## Don'ts

- Never commit `code/config.php` or any production data / DB dump.
- Never introduce a runtime build step or framework for the deployed site.
- Never store real member data or passwords in seed files.
