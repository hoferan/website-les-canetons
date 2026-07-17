# Website "Guggenmusik Les Canetons de Fribourg" — Project Instructions

## Project Overview

Public website and members' area for the Guggenmusik **Les Canetons de Fribourg**
(a Fribourg carnival brass band). Public pages present the band (history, sections,
committee, sponsors, media, contact). A members' area, gated by login, lets members
respond to events (participate / not) and lets the admin ("Team Direction") manage
events and view attendance summaries.

## Tech Stack

- **PHP 8.1** (matches prod: PHP 8.1.34), **buildless** — no bundler, no build step, no
  runtime dependencies. Third-party code may be **vendored** as static files under
  `code/assets/vendor/` (CSS) or `code/vendor/` (dependency-free, single-purpose PHP
  libraries, e.g. PHPMailer, SimpleXLSXGen) — no CDN, no Composer install and no build
  step on production. Files are edited/committed and deployed as-is.
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
```

A Husky pre-commit hook runs `lint-staged` on staged files automatically
(PHP hunks are linted through the same Docker wrappers).

## Language

- **Everything is written in English** — specs and plans (`docs/`), code, comments,
  DB table/column names, enum/stored values, identifiers, slugs, and file names.
- **French is used for ONE thing only: user-visible UI text** (HTML labels, page copy,
  buttons, on-screen event titles/descriptions, error messages shown to the user).
- The existing codebase already follows this: `contact_messages` uses
  `first_name`/`last_name` columns and `responses.answer` uses English enum values
  (`participate`/`notparticipate`), while page labels are French. Match that pattern.

## Dos

- Keep the site buildless; edit JS/CSS in place.
- Match production versions (PHP 8.1, MariaDB 10.3).
- Run `npm run check` before pushing.
- Put new tooling/config at the repo root, never in `code/`.

## Don'ts

- Never commit `code/config.php` or any production data / DB dump.
- Never introduce a build step or bundler for the deployed site, and never require a Composer install on production. (Third-party libraries may be used only as **vendored static files** — CSS under `code/assets/vendor/`, dependency-free PHP under `code/vendor/` — no CDN, no build.)
- Never store real member data or passwords in seed files.
