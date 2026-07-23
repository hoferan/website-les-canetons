# Backend Migration Sub-Project 2a: Laravel API Foundation + Auth — Design

**Date:** 2026-07-23
**Status:** Approved (design)

**Context:** This is sub-project #2a of the larger frontend/backend separation
migration (React/Tailwind SPA + standardized PHP API), decomposed during an
earlier brainstorm this session. Sub-project #1 (decoupled, tag-based CI/CD
promotion) is done and merged. This sub-project covers the backend framework
foundation and everything under `/api/*` **except** `/api/events` and
`/api/responses` (the RSVP feature), which become sub-project #2b — a
separate spec/plan, since it's the largest, most business-logic-heavy piece
and the one thing the eventual React SPA (sub-project #3, not started)
actually needs, so it deserves its own focused review cycle. Public
marketing pages and the auth/registration *page* (as opposed to the
`/api/login` endpoint) remain on the old app, deferred (sub-project #4,
undecided).

## Problem

The current backend is a single, hand-rolled PHP application: `nikic/fast-route`
for routing, PSR-4 `App\` classes with no framework conventions, HTML-rendering
page handlers and JSON API endpoints living side by side. The project has
deliberately chosen to adopt Laravel for the API going forward — not because
the current code doesn't work, but because a solo maintainer wants a
standardized, conventional framework specifically to prevent future
architectural drift, which a from-scratch hand-rolled approach doesn't
provide by construction.

This sub-project stands up that Laravel foundation: install it, wire
authentication, adopt its migration system, and port every currently-mixed-in
`/api/*` endpoint that isn't the RSVP feature — so sub-project #2b has a real,
working, standardized foundation to build the RSVP endpoints on top of.

## Goals

1. Install Laravel (latest stable at implementation time) as a new, independent
   Composer project, API-only — no Blade views, no web session middleware
   beyond what Sanctum needs.
2. Deploy it alongside the existing app on the same shared-hosting document
   root, dispatched via `.htaccess`, without disrupting the old app's public
   pages or not-yet-migrated routes.
3. Same-origin cookie auth via Laravel Sanctum's SPA mode (no tokens, no CORS)
   — matching the frontend/backend split's overall auth plan from the earlier
   migration-decomposition brainstorm.
4. Reimplement `Auth`'s capability matrix (`user`/`moderator` → `respond`,
   `admin` → `manage_events`/`view_summary`) against the existing `users`
   table via Eloquent.
5. Adopt Laravel's own migration system, triggered the same way the current
   `Migrator` is (a token-gated POST route, since remote DB login is blocked
   and there's no SSH) — with a baseline-adoption strategy that works
   correctly against both a freshly-wiped database (TEST) and an
   already-populated one (QA/PROD, once this is ready to promote there).
6. Real (not proxied, not faked) Laravel reimplementations of `contact` and
   the feature-flagged `signups`/`altcha` flow — not because they're this
   sub-project's main focus, but because Laravel is taking over the entire
   `/api/*` namespace immediately (see Non-goals/scope decision below), so
   they must actually work from day one.
7. Remove the old app's now-unreachable code for every endpoint this
   sub-project migrates (`login.php`, `logout.php`, `migrate.php`,
   `contact.php`, `signups.php`, `altcha.php` and their `routes.php` entries)
   rather than leave dead code behind.
8. Rename the local build-staging directory from `public/` to `dist/build/`
   (a small, mostly-mechanical prerequisite change bundled into this
   sub-project — see §1).

## Non-goals

- **`/api/events` and `/api/responses` are out of scope** — sub-project #2b.
- **No unified session between the old app and the new Laravel API.** The old
  app's `Auth::check()` reads PHP's native `$_SESSION['user']`; Sanctum
  manages its own separate session. A user logged in via the new
  `/api/login` would not be recognized as logged in on old-app pages (e.g.
  `planning_repet.php`), and vice versa. This is a deliberately deferred,
  known limitation, not solved here — it only matters once real users hit
  both simultaneously on QA/PROD, and promotion beyond TEST isn't happening
  until sub-project #3 (the React SPA) also retires the old session-gated
  member pages, which resolves the incompatibility by removing the
  conflicting code path rather than reconciling two session systems.
- **No QA/PROD promotion in this sub-project.** Validated on TEST only (which
  can be freely wiped and reset). The baseline-migration strategy (§4) is
  designed to make a later QA/PROD promotion safe, but actually performing
  that promotion is future work.
- **No changes to public marketing pages, the auth/registration page's HTML,
  or any other page-rendering behavior** — the old app's pages are untouched
  except for removing the dead handler files listed in Goal 7.
- **No changes to `tools/deploy.mjs`'s FTP upload/verify mechanics** beyond
  the `LOCAL_ROOT` rename and the new `.env` drift-check (§6) — the
  new/changed/unchanged/stale/verify logic itself is reused as-is.

## Design

### 1. Rename the build-staging directory: `public/` → `dist/build/`

Prerequisite, bundled as an early task in this sub-project's plan (not its
own separate sub-project, since it's small and only serves this work):

- `tools/deploy.mjs`'s `LOCAL_ROOT` constant: `'public'` → `'dist/build'`.
- `.gitignore`: update the ignored-directory entry accordingly.
- `CLAUDE.md`: update every reference to the generated `public/` directory.
- Any CI workflow step that references `public/` as the build output
  (`.github/workflows/ci.yml`'s `build` job verification step, etc.).

This sits alongside the existing `dist/overlay/<env>/` (per-environment
`.htaccess`/`robots.txt`/`.htpasswd` overlay files, generated by
`npm run build:overlay`), so all generated build output now lives under one
`dist/` umbrella — matching this project's existing Vite `dist/` convention
(`app/assets/dist/`) rather than introducing a second, differently-named
concept.

### 2. Directory layout and deploy dispatch

- **Source:** new top-level `api/` directory — the Laravel project root
  (its own `composer.json`, `app/`, `routes/`, `database/migrations/`,
  `.env.example`), independent from the existing repo-root Composer project.
- **Build:** `tools/build.mjs` gains a step that `composer install --no-dev`s
  inside `api/` and copies the result into `dist/build/api/`.
- **Deploy:** since `dist/build/` is `deploy.mjs`'s `LOCAL_ROOT`, its
  *contents* become the server's document-root contents directly (there is
  no wrapping `public/` folder on the actual server — confirmed against
  `deploy.mjs`'s existing upload-path logic). So on the live server:
  - `<ftp-root>/index.php` — old app's front controller, unchanged.
  - `<ftp-root>/api/` — the deployed Laravel project bundle.
  - `<ftp-root>/api/public/index.php` — Laravel's own front controller (the
    *only* `public/` folder that exists anywhere in this layout — Laravel's
    own standard convention, nested once, exactly where Laravel expects it).
- **Hardening (required because the FTP account is chrooted to the web-root
  — there is no "outside the web root" place to put Laravel's non-public
  files, unlike Laravel's normal deployment convention):**
  - `<ftp-root>/api/.htaccess` — deny all direct access
    (`<RequireAll>Require all denied</RequireAll>`, or `Deny from all` on
    older Apache).
  - `<ftp-root>/api/public/.htaccess` — Laravel's own default `.htaccess`
    (its standard rewrite-to-`index.php` rules), which re-allows access
    *within* that subfolder despite the broader deny rule above it — assumes
    `AllowOverride All` is in effect for this host, which it already must be
    for the existing `.htpasswd`/Basic Auth staging setup to work.
  - This means `.env`, `vendor/`, and `app/` are blocked from direct web
    requests even though they're physically inside the web-accessible tree
    — an honest downgrade from Laravel's normal "physically outside the web
    root" security posture, imposed by this host's FTP constraints, not a
    choice. Document this trade-off in `staging/README.md`.
- **Root `.htaccess` dispatch:** one new rule, ahead of the existing
  catch-all front-controller rule: requests under `/api/*` **and**
  `/sanctum/*` (Sanctum's SPA flow needs its default `/sanctum/csrf-cookie`
  route, which isn't under `/api/`) rewrite to `api/public/index.php`.
  Everything else keeps going to the old app's `index.php`, unchanged.

### 3. Authentication: Sanctum SPA mode

- Sanctum configured for SPA authentication: same-origin cookie session, no
  API tokens, no CORS configuration needed (frontend and API are the same
  origin, different path, per the overall migration's established auth plan).
- Eloquent `User` model pointing at the existing `users` table (see §5 for
  its migration/schema treatment) — no behavior change to the table itself
  beyond what §5 already covers.
- The capability matrix (`Auth::CAPABILITIES` today: `user`/`moderator` →
  `respond`, `admin` → `manage_events`/`view_summary` — not a hierarchy)
  gets reimplemented as a small helper (a trait or a static class mirroring
  today's shape) consumed by route middleware/policies — same semantics,
  Laravel-idiomatic wiring.
- Routes: `POST /api/login`, `POST /api/logout`, `GET /api/user` (current-user
  info, standard Sanctum SPA convention), plus Sanctum's built-in
  `GET /sanctum/csrf-cookie`.
- Login uses Laravel's standard `Auth::attempt(['username' => …, 'password' =>
  …])` — the auth core is field-agnostic, so username identification needs no
  custom flow. Passwords are always stored hashed (the `User` model's `hashed`
  cast). **Superseded decision:** the design originally ported the old app's
  in-app legacy-plaintext→bcrypt upgrade branch into the login flow; that was
  dropped during implementation (see Revisions). Pre-hashing rows are converted
  once, out of band, by a manual DB-level migration the maintainer runs — not
  by the app — which keeps the login path on the plain framework `Auth::attempt`.

### 4. Migrations: Laravel's own system, adopted safely onto existing schema

- **External contract unchanged:** `npm run dbmigrate:<env>` (via
  `tools/dbmigrate.mjs`) still `POST`s to `/api/migrate` with the same
  token. Only the *implementation* behind that route changes: a Laravel
  route, token-gated the same way, that calls
  `Artisan::call('migrate', ['--force' => true])` and returns Artisan's
  output as JSON.
- **Baseline-adoption strategy:** every baseline migration this sub-project
  introduces is guarded with `Schema::hasTable()` (and, for column-level
  fixes, `Schema::hasColumn()`), so the *same* migration file is correct
  whether it runs against a freshly-wiped database (TEST — creates the
  table) or an already-populated one (QA/PROD, once ready to promote —
  detects the table/column already exists and skips that part). Either way,
  Laravel's own migration-tracking table records the migration as applied,
  so no separate manual SQL backfill step is ever needed, on any
  environment, now or later.
- **Tables in scope** (everything this sub-project's Eloquent models touch,
  plus one FK dependency):
  - `instruments` — only needed because `users.instrument_id` has a FK
    constraint to it; this sub-project doesn't otherwise touch it.
  - `users`.
  - `contact_messages` — confirmed real, not just an email send:
    `app/api/contact.php` does `INSERT INTO contact_messages`.
  - `signups`, `used_challenges` — for the signups/altcha reimplementation.
- **Schema fixes applied uniformly across all five tables in scope**
  (matching this project's now-adopted "standardize on the framework's
  convention, not a per-model exception" preference):
  - **`updated_at` added to all five** (`users`, `instruments`,
    `contact_messages`, `signups`, `used_challenges`) — none of them have it
    today. `users` already gets mutated in place today (the legacy-password
    upgrade path), so this has real value now, not just hypothetically; the
    others are plausible candidates for a future admin backoffice to edit.
    No `const UPDATED_AT = null;` anywhere — full Eloquent convention, no
    per-model exceptions.
  - **`used_challenges` gets a proper auto-increment `id` primary key**,
    added via migration; `signature` (previously the primary key) becomes a
    unique-indexed column instead, preserving the "each signature consumed
    once" guarantee the old PK enforced. This is the one table that
    genuinely deviated from every other table's shape (no `id` at all), so
    it's fixed at the schema level rather than worked around in Eloquent
    (`$incrementing = false` etc.) — matching the "fix the table, don't
    work around it" principle established for this sub-project.
- QA/PROD adoption of this migration baseline is deferred (see Non-goals) —
  the `hasTable`/`hasColumn` guards make that adoption safe whenever it
  happens, but performing it is not this sub-project's work.

### 5. Contact, signups, and altcha: real reimplementations

Small, real Laravel routes + Eloquent models + validation — not proxies to
the old app, not fakes. Scope is deliberately minimal (functional parity with
today's behavior, no redesign):

- `POST /api/contact` — validates and inserts into `contact_messages`,
  reusing the same validation rules `Dto\ContactInput`/`Validation\*` express
  today (translated to Laravel's validation conventions, not copied
  verbatim — this project doesn't share code between the old app and the
  new Laravel app, by design, to avoid the `App\` PSR-4 namespace collision
  between the two independent Composer projects).
- `POST /api/signups`, `POST /api/altcha` (both behind the same
  `souper_signup` feature-flag concept the old app uses via `App\Features` —
  reimplemented as a Laravel config/env-driven flag, not shared code) —
  same anti-replay/proof-of-work signature-consumption behavior
  `ChallengeRepository`/`Altcha` provide today, reimplemented against the
  now-`id`-bearing `used_challenges` table.

### 6. Config: `.env` + a lightweight drift-check

- Laravel's own `.env`/`.env.example` replace `config.php`/`config.example.php`
  *for the new Laravel app only* — the old app's `config.php` is untouched.
- `.env` is git-ignored, server-owned, set once per server by hand (same
  operational pattern as `config.php` today).
- A small parallel drift-check (not the existing PHP-AST-based one, which is
  specific to the old app's array-return `config.php` format) compares
  `.env.example`'s key set against a server's real `.env` — much simpler
  than the existing check, since `.env` is flat `KEY=value` lines, not a PHP
  literal needing AST parsing. Same refuse-on-drift behavior as today's
  check: a key the code now expects that's missing (or one no longer
  expected) refuses the deploy with the exact key names to fix; `--dry-run`
  reports the same drift without refusing.

### 7. Removing old dead code

Once Laravel owns an endpoint, its old-app handler and `routes.php` entry
are removed in the same change, not left behind:
`app/api/login.php`, `app/api/logout.php`, `app/api/migrate.php`,
`app/api/contact.php`, `app/api/signups.php`, `app/api/altcha.php`, and
their corresponding entries in `app/src/routes.php`'s `$apis` list. Classes
that become fully unused as a result (if any, after confirming no other
old-app code path still calls them) are removed too; classes still used by
the old app's remaining pages (`Auth`, for its `requireLoginPage`/`check`
page-gating, still needed until sub-project #3/#4 retire those pages) are
kept.

## Testing / verification

Leverages the "TEST can be freely wiped and reset" permission established
for this migration:

1. **Fresh-creation path:** wipe TEST's database, deploy this sub-project,
   trigger `/api/migrate`, confirm all five tables are created correctly
   (including the `used_challenges` PK change and `updated_at` on all five),
   confirm login/logout/user/contact/signups/altcha all work end-to-end
   against a clean database.
2. **Adoption path (simulated, since real QA/PROD access isn't available
   here):** in a scratch/local database, create the tables in their
   *current* (old-app, pre-fix) shape — e.g. by running the existing
   `docker/db/init/01-schema.sql` and `sql/migrations/*.sql` — then run this
   sub-project's Laravel migrations against that database and confirm: the
   `hasTable`-guarded creation steps correctly skip (tables already exist),
   the `used_challenges` PK-change and the five `updated_at`-addition steps
   correctly apply as deltas, and existing data survives intact.
3. Confirm the `.htaccess` dispatch: a request to `/api/user` (or any
   Laravel route) reaches Laravel; a request to any existing old-app page
   (e.g. `/historique`) still reaches the old app, unaffected.
4. Confirm the hardening: a direct request to `/api/.env` or
   `/api/vendor/autoload.php` is denied (403/404), while
   `/api/public/index.php`-routed requests work normally.
5. Confirm the `.env` drift-check: deploying with a `.env.example` key
   missing from a server's real `.env` refuses the deploy with the correct
   key name; `--dry-run` reports without refusing.
6. Confirm dead-code removal didn't break anything: `npm run check` (PHP
   lint/PHPUnit/JS lint/etc.) still passes against the old app's remaining
   code after the listed files are removed.

## Revisions & implementation notes (post-approval)

Recorded during/after implementation so this design matches what actually
shipped on the branch. The commits are the source of truth; this captures the
*why* of the deltas.

### Decision changes

- **No in-app legacy-password upgrade (supersedes §3).** The approved design
  ported the old app's plaintext→bcrypt upgrade branch into the login flow.
  That was dropped: pre-hashing rows are converted once, out of band, by a
  manual DB-level migration the maintainer runs. Login is now the plain,
  framework-standard `Auth::attempt` with no custom password handling.
- **Username-only user, documented as intentional.** The `users` table keeps
  no `email`/`name` (members are children ~6-16 who often have no email;
  passwords are admin-managed and stored hashed). The rationale is recorded in
  `api/app/Models/User.php` and the users migration so it isn't "fixed" back
  to Laravel's email default later.
- **Shared database, not a separate one.** The Laravel app uses the *same*
  database connection as the old app (no `lescanetons_api`). This is exactly
  what the §4 baseline-adoption strategy was built for: the guarded migrations
  run against the existing DB and **adopt** its tables in place — they never
  drop-and-recreate. So the cutover is *not* dump → drop → migrate-fresh →
  reseed (which would destroy every table Laravel doesn't yet manage, e.g.
  events/responses from sub-project 2b); it is: **back up, then run the guarded
  migrations** (add `updated_at`, convert the `used_challenges` PK, create
  Laravel's own `sessions`/`cache`/`migrations` tables). Existing data and the
  old app keep working (the deltas are backward-compatible). The automated test
  suite still uses an isolated `laravel_api_test` database, because
  `RefreshDatabase` drops all tables and must never run against a shared DB.

### Laravel-version realities (design assumed ~11.x; shipped on 13.x)

- API scaffolding + Sanctum installed via `php artisan install:api` (the
  idiomatic Laravel 13 path: it publishes `routes/api.php`, wires API routing
  into `bootstrap/app.php`, and requires `laravel/sanctum`). SPA mode enabled
  with `$middleware->statefulApi()`.
- Laravel 13 bundles `users`/`password_reset_tokens`/`sessions` into one
  default migration whose `users` schema conflicts with this project's. That
  file was reduced to a **sessions-only** migration (needed for
  `SESSION_DRIVER=database`); the real `users` table is owned by this
  sub-project's guarded migration.
- Tests run against a dedicated **MariaDB** `laravel_api_test` database (the
  migrations use MariaDB-specific SQL — `enum`, `char`, the raw
  `used_challenges` PK swap — that SQLite can't reproduce). Auth feature tests
  send an `Origin` header to simulate the same-origin SPA so `statefulApi()`
  starts a session.

### Follow-ups added beyond the original 10-task plan

- **Scaffold cleanup:** removed Laravel-default files this API-only project
  doesn't use (`api/.github/workflows/*` — inert; `api/package.json`,
  `api/vite.config.js` — frontend toolchain; `api/.styleci.yml`, `api/.npmrc`),
  and hardened root `.gitignore` so they can't be re-tracked.
- **Local dev in docker compose:** added `api-vendor`/`api-migrate`/`api`
  services (`php artisan serve` on :8092) using a separate `lescanetons_api`
  database, plus `docker/api/Dockerfile`; API mail goes to the existing
  Mailpit. Generated artifacts live in volumes/gitignored paths, never the
  tracked tree.

### Not yet implemented from this design

- **The `.env` drift-check (§6)** for the Laravel app's `.env` is not built
  yet — `tools/deploy.mjs` does not manage `api/.env`. Deferred alongside the
  actual `/api/*` dispatch cutover (sub-project 2a-ii), since that is when the
  deployed Laravel app first needs a server-side `.env` to function.
