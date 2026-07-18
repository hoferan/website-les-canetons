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

The stack's one-shot `vendor` service installs PHP deps into a shared `vendor` volume before
`web` starts (gated by `depends_on: service_completed_successfully`). It gives that vendor an
autoload map for the container's flattened layout (`App\ -> src/`, classes at `/var/www/html/src`),
which the repo-root `vendor/` (`App\ -> app/src/`) does not — see `docker/web/install-vendor.sh`.
No host-side `vendor/` or manual composer step is needed; changing a dependency is picked up on the
next `up`.

Seeded test logins (all passwords `demo`, synthetic data only):
- `demo.admin` — admin (manage events, view summaries)
- `demo.moderator` — moderator (respond)
- `demo.user` — user (respond)

## Development Commands

PHP and Composer normally run in Docker (`php:8.1-cli` / `composer:2`) via
wrappers in `tools/`. First-time setup: `npm install` then `npm run php:install`.

```bash
npm run php:install   # install PHP dev deps into vendor/ (Dockerized Composer; run once)
npm run check         # all checks: php -l + phpcs (Docker), eslint, stylelint, prettier, secret guard
npm run fix           # auto-fix: phpcbf (Docker) + eslint + stylelint + prettier
npm run lint:php      # PHP only (php -l sweep + phpcs, Dockerized)
npm run test:php      # PHPUnit (app/src/**): unit tests + DB-integration tests
```

A Husky pre-commit hook runs `lint-staged` on staged files automatically
(PHP hunks are linted through the same Docker wrappers).

### Claude Code web sessions (no Docker)

Web sessions have no Docker daemon. The Docker-free stack is provisioned
**on-demand**, not at session start: `tools/ensure-dev-stack.sh` (via the
cross-platform `tools/ensure-dev-stack.mjs` entry) detects a web session
(`$CLAUDE_CODE_REMOTE=true`, `docker info` failing) and stands up an equivalent
stack natively — MariaDB installed via `apt` and started directly (no systemd),
`lescanetons` + `lescanetons_test` databases seeded from `docker/db/init/*.sql`,
and `app/config.php` pointed at `127.0.0.1`. It is idempotent and a no-op when
Docker is reachable or outside a web session. It is **not** run from
`.claude/hooks/session-start.sh` — apt/DB provisioning is slow enough to blow
the SessionStart hook timeout and stall session init, so the hook only injects
the superpowers skill and stays fast.

`npm run test:php` runs `ensure-dev-stack` first, then PHPUnit; `npm run serve`
does the same, then starts `php -S 127.0.0.1:8090 -t app` (the Apache-container
stand-in). The `tools/composer.mjs` and `tools/php-in-docker.mjs` wrappers fall
back to the locally-installed `composer`/`php`, so `npm run lint:php`,
`npm run fix`, and `npm run test:php` all work unchanged. `IntegrationTestCase`
(in `tests/Integration/`) runs each test in a transaction rolled back in
`tearDown()`, against `lescanetons_test`, so tests never touch dev data.
Local Docker Compose dev is unaffected.

For first-time setup in a web session, run `npm run websession:init` once — it
chains `npm install`, `npm run php:install`, and `ensure-dev-stack` (installing
MariaDB, seeding both databases, writing `app/config.php`) in a single
command, so `npm run check` / `test:php` / `serve` work right after. It's
idempotent and a no-op outside web sessions beyond the plain installs, so it's
also safe to run in local Docker dev.

## Pull Requests

- **Title format:** Conventional Commits — `type(scope): description` (scope optional), matching
  this repo's existing commit-message convention. Enforced by CI
  (`.github/workflows/pr-title.yml`); a non-conforming title fails the check.
  Types: `feat`, `fix`, `chore`, `docs`, `build`, `ci`, `test`, `refactor`, `style`, `perf`.
  Example: `feat(routing): add clean URLs and old-URL redirects`.
- **Body:** use `.github/PULL_REQUEST_TEMPLATE.md` (GitHub pre-fills it automatically for new
  PRs) — fill in every section rather than leaving the placeholder comments unedited.

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
