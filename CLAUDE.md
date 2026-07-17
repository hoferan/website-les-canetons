# Website "Guggenmusik Les Canetons de Fribourg" — Project Instructions

## Project Overview

Public website and members' area for the Guggenmusik **Les Canetons de Fribourg**
(a Fribourg carnival brass band). Public pages present the band (history, sections,
committee, sponsors, media, contact). A members' area, gated by login, lets members
respond to events (participate / not) and lets the admin ("Team Direction") manage
events and view attendance summaries.

## Tech Stack

- **PHP 8.1** (matches prod: PHP 8.1.34). `app/src/` classes are PSR-4
  autoloaded under the `App\` namespace via Composer.
- **MariaDB 10.3** (prod: 10.3.8) via the `mysqli` extension.
- **Vanilla JS + CSS** under `app/assets/` — no bundler (a JS/CSS build
  pipeline is a separate, later roadmap item).
- **Router:** `nikic/fast-route`, dispatched through a single front
  controller (`app/index.php`). Clean URLs; old `.php` URLs 301-redirect.
- **Apache** with `.htaccess` (front-controller rewrite + cache policy) on
  `easy-hebergement.net` shared hosting.
- **Build step:** `npm run build` assembles `app/` + a production-only
  Composer `vendor/` into a generated `public/` directory — the actual FTP
  payload. `public/` is git-ignored and never hand-edited.
- **Deployment:** manual FTP/SFTP upload of `public/`'s contents (built
  fresh via `npm run build` before each deploy).
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

- **`app/` is the tracked source; `public/` is the generated FTP payload.**
  `public/` is produced by `npm run build` and is never hand-edited or committed.
  Never put dev-only files in `app/`. All tooling lives at the repo root
  (`composer.json`, `package.json`, `phpcs.xml`, `docker/`, `config/`, `tools/`,
  `.github/`).
- **Entry point:** `app/index.php` is the single front controller. It requires
  `app/src/bootstrap.php` (autoload + DB connect + session start), then
  dispatches via `nikic/fast-route` using the route table in
  `app/src/routes.php`. Route handlers `require` the matching file under
  `app/pages/` or `app/api/` — both blocked from direct web access by
  `.htaccess`, reachable only through the router.
- **PSR-4 autoloading:** `app/src/` classes are namespaced under `App\` and
  autoloaded via Composer (`composer.json`'s `autoload.psr-4`). No manual
  `require` needed once `vendor/autoload.php` has run (done once, in
  `bootstrap.php`).
- **Auth:** `App\Auth` holds a capability matrix — `user`/`moderator` may
  `respond`; `admin` may `manage_events` / `view_summary`. Not a hierarchy.
  `assets/js/session.js` mirrors it on the client; the server session
  (`window.__sessionRole`) is source of truth.
- **API:** `app/api/*.php` return JSON, reached via `/api/*` clean routes, and
  guard with `Auth::require*`.
- **Config:** the real `app/config.php` is git-ignored. Create it locally with
  `cp config/config.example.php app/config.php`. For Docker, the stack mounts
  `config/config.docker.php` into the container instead. `npm run build`
  copies `app/config.php` into `public/config.php` if present — **do not**
  let this overwrite a production server's `config.php` when FTP-syncing;
  exclude it from the upload selection.

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

## Dos

- Edit `app/` source in place; run `npm run build` before every FTP deploy.
- Match production versions (PHP 8.1, MariaDB 10.3).
- Run `npm run check` before pushing.
- Put new tooling/config at the repo root, never in `app/`.
- Add new routes in one place: `app/src/routes.php`.

## Don'ts

- Never commit `app/config.php`, `public/`, or any production data / DB dump.
- Never hand-edit `public/` — it's fully regenerated by `npm run build`.
- Never store real member data or passwords in seed files.
