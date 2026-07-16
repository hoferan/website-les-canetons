# Project Setup & Tooling — Design

**Date:** 2026-07-16
**Status:** Approved (pending spec review)
**Scope:** Repository scaffolding and developer tooling for the "Guggenmusik Les Canetons de Fribourg" website. No changes to application behavior.

## 1. Context

The repository holds a **buildless PHP website** for a Fribourg carnival brass band, deployed by **manual FTP** to `easy-hebergement.net` shared hosting.

Discovered facts:

- **App code lives in `code/`** (76 tracked files) — the deployable web root. `.htaccess` sets cache policy; there is no build step.
- **PHP layer:** vanilla PHP with a small `code/src/` (manual `require`, no Composer autoloader). Entry point `code/src/bootstrap.php` reads `config.php`, connects `Database` (mysqli), starts the session via `Auth`. Pages include `partials/head.php` → `bootstrap.php`. API endpoints under `code/api/` return JSON.
- **Auth model:** capability matrix in `Auth` (`user`/`moderator` → respond; `admin` → manage_events/view_summary). Passwords compared in **plaintext** (known debt, see §8).
- **Assets:** vanilla JS + CSS under `code/assets/` (no framework, no bundler). Per-page CSS `@import`s `main.css`.
- **Secrets:** `code/config.php` holds real DB credentials; git-ignored; `code/config.example.php` is the committed template.
- **Prod environment (from a phpMyAdmin dump):** **MariaDB 10.3.8**, **PHP 8.1.34**.
- Existing `.github/` has complete issue templates + `labels.md`, but stub `PULL_REQUEST_TEMPLATE.md` and stub `ci.yml`. `CLAUDE.md` and root `.gitignore` are near-empty.

## 2. Goals / Non-Goals

**Goals**

1. Keep code where it is; document the intended structure.
2. A real, expanded root `.gitignore`.
3. CI (GitHub Actions) running PHP + JS/CSS checks and a secret guard.
4. JS/CSS linting/formatting via a dev-only Node toolchain.
5. Docker Compose local dev environment matching prod versions, with synthetic seed data.
6. Git pre-commit hooks + manual check/fix runners.
7. A complete `CLAUDE.md`.

**Non-Goals**

- No change to runtime behavior, no framework, no bundler for the deployed site.
- No password hashing migration (tracked as follow-up, §8).
- No automated deployment (deploy stays manual FTP).

## 3. Version targets

Match production exactly:

- **PHP 8.1** — CI (`shivammathur/setup-php`), Docker `web` image, phpcs `testVersion`, CLAUDE.md.
- **MariaDB 10.3** — Docker `db` image (`mariadb:10.3`).

## 4. Code location — `code/` is the FTP payload, nothing else

**Invariant:** `code/` contains **only files that get deployed via FTP**. No dev-only files live inside it. All tooling and dev aids (Composer, Node, linter configs, Docker, config templates) live at the repo root.

Keep the app in `code/`. Rationale: already committed and working; cleanly separates the deploy payload from repo tooling (`.github/`, `docs/`, `.claude/`, `config/`).

Deployed contents of `code/`: pages (`*.php`), `api/`, `assets/`, `partials/`, `src/`, `.htaccess`, and the real (git-ignored, but uploaded) `config.php`.

Changes to honor the invariant:

- Remove the empty, misleading `code/dist/` directory (buildless site — no dist).
- **Move** `code/config.example.php` → `config/config.example.php` (dev template, never deployed; no code references it).
- The Docker dev config lives at `config/config.docker.php` — **never** inside `code/` (see §8).

### New top-level `config/` directory

Holds config aids that must not ship to the server:

- `config/config.example.php` — the committed template (moved from `code/`).
- `config/config.docker.php` — dev credentials pointing at the Docker `db` service.

The **real** `config.php` still lives at `code/config.php` because `bootstrap.php` reads `__DIR__ . '/../config.php'` and it IS part of the deploy payload; it stays git-ignored. Developers create it with `cp config/config.example.php code/config.php`.

## 5. `.gitignore` (repo root)

```gitignore
# secrets & local-only
config.php
.env

# real prod data — never commit (see docs; use synthetic seed instead)
*.dump.sql
prod-*.sql

# dependencies (dev-only tooling; never deployed)
/node_modules/
/vendor/

# linter / tool caches
.php-cs-fixer.cache
.phpcs.cache

# OS / editor junk
.DS_Store
Thumbs.db
desktop.ini
.idea/
```

Notes: `config.php` (no leading slash) matches `code/config.php` at any depth. `.claude/` and `.vscode/` stay **tracked**. `composer.lock` and `package-lock.json` are **committed** for reproducible tooling.

## 6. PHP tooling

Dev-only `composer.json` (never uploaded — `vendor/` git-ignored and FTP-excluded):

- Dependency: `squizlabs/php_codesniffer`.
- `phpcs.xml`: standard **PSR-12**, `testVersion 8.1`, scans `code/` excluding `code/vendor` and `code/dist`.
- Composer scripts: `lint` (`php -l` over `code/**.php`), `phpcs`, `phpcbf`.

## 7. JS/CSS tooling

Dev-only `package.json` (Node) at repo root, scoped to `code/assets/`:

- **Prettier** — format JS/CSS/JSON/MD.
- **ESLint** (flat config, browser globals) — vanilla DOM JS.
- **Stylelint** (`stylelint-config-standard`) — CSS.
- npm scripts:
  - `check` — run all checks repo-wide (mirrors CI): php lint, phpcs, eslint, stylelint, prettier `--check`, secret guard.
  - `fix` — `phpcbf` + `eslint --fix` + `stylelint --fix` + `prettier --write`.
  - Sub-scripts (`lint:js`, `lint:css`, `format`, etc.) compose into the two above.

## 8. Docker Compose local dev

`docker-compose.yml` at repo root; support files in `docker/`.

Services:

- **`web`** — `php:8.1-apache`. Mounts `code/` as web root. `AllowOverride All` + `mod_headers`/`mod_expires` enabled so `.htaccess` works. Published at `http://localhost:8080`.
- **`db`** — `mariadb:10.3`, `utf8mb4`, dev credentials via env, named volume for persistence. Published on `3306` for external clients.
- **`adminer`** — DB UI at `http://localhost:8081`.

Config wiring (keeps `code/` clean — see §4 invariant):

- `docker-compose.yml` mounts `./code` at `/var/www/html`, **and** overlays `./config/config.docker.php` read-only at `/var/www/html/config.php`. The more-specific mount wins, so the container sees a working `config.php` while no such file ever exists inside `code/` on the host.
- The committed `config/config.docker.php` holds only dev credentials for the `db` service — no real secrets. The real `code/config.php` is never touched.

Seed data (**synthetic**, safe to commit):

- `docker/db/init/01-schema.sql` — the **exact prod schema** (tables `contact_messages`, `events`, `instruments`, `responses`, `users`; enums, unique keys, FKs incl. `ON DELETE CASCADE`/`SET NULL`), transcribed from the prod dump. No real rows.
- `docker/db/init/02-seed.sql` — synthetic rows: the real (non-personal) instrument list is fine to keep; ~8 fake members across roles `user`/`moderator`/`admin`; a handful of events (clean UTF-8); a few responses; one known admin + one known user login for testing, documented in CLAUDE.md. **No real names, no real passwords.**
- Files auto-load via MariaDB's `/docker-entrypoint-initdb.d/` on first boot.

> The prod dump stores passwords in plaintext and contains real member data; it must never enter the repo. `*.dump.sql`/`prod-*.sql` are git-ignored (§5) so a local copy can't be committed by accident.

## 9. Git hooks + manual runners

- **Husky + lint-staged** (installed via the Node toolchain; cross-platform for Windows).
  - `pre-commit` runs `lint-staged`: staged `*.php` → `php -l` + `phpcs`; staged `*.js` → `eslint`; staged `*.css` → `stylelint`; all staged → `prettier --check`; plus a guard that blocks committing `config.php` or a prod dump.
  - Hooks installed via a `prepare` script (`husky`) on `npm install`.
- **Manual runners** (nothing is hook-only): `npm run check` (everything) and `npm run fix` (auto-fix). Composer equivalents (`composer lint`, `composer phpcs`) available for PHP-only work.

## 10. `.github`

- **`workflows/ci.yml`** — on push to `main` and all PRs. Two jobs:
  - `php`: `setup-php@8.1`, `composer install`, `php -l` sweep, `phpcs`.
  - `assets`: `actions/setup-node`, `npm ci`, `eslint`, `stylelint`, `prettier --check`.
  - Secret guard step: fail if `code/config.php` is tracked or a prod dump is committed.
- **`PULL_REQUEST_TEMPLATE.md`** — Summary / Changes / Testing / Config-safety checklist (confirm no secrets, `npm run check` passed).
- Existing issue templates and `labels.md` left as-is.

## 11. `CLAUDE.md`

Replace TODOs with: Project Overview (the band site), Tech Stack (buildless PHP 8.1, mysqli/MariaDB 10.3, vanilla JS/CSS, manual FTP, no runtime deps), Architecture (`bootstrap.php` entry, manual-require `src/`, capability-based `Auth`, config via `config/config.example.php` → `code/config.php`, per-page CSS), Local Development (Docker commands, test logins), Dos/Don'ts (**`code/` = FTP payload only, no dev-only files inside it**; never commit `config.php` or prod data; run `npm run check`; keep it buildless; match prod versions), and Development Commands. Keep the existing Superpowers Skills table.

## 12. Testing / verification

- `docker compose up` → site reachable at `:8080`, login works with a seeded test account, Adminer at `:8081` shows seeded tables.
- `npm run check` passes on the clean tree (after any needed `npm run fix`).
- CI green on a test PR.
- `git status` shows no unintended tracked files; secret guard blocks a deliberately staged `config.php`.

## 13. Follow-ups (out of scope)

1. **Password hashing** — migrate plaintext to `password_hash()`/`password_verify()` (already flagged in `Auth.php`); pairs with the referenced `sql/v2_schema.sql` and a user-management UI.
2. Consider rotating the live DB password (credentials were exposed during setup).
3. Optional later: automated FTP deploy via GitHub Actions once credentials are available as secrets.
