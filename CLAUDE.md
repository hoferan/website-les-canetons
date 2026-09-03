# Website "Guggenmusik Les Canetons de Fribourg" — Project Instructions

## Project Overview

Public website and members' area for the Guggenmusik **Les Canetons de Fribourg**
(a Fribourg carnival brass band). Public pages present the band (history, sections,
committee, sponsors, media, contact). A members' area, gated by login, lets members
respond to events (participate / not) and lets the admin ("Team Direction") manage
events and view attendance summaries.

## Tech Stack

Two applications, one origin, one repository:

- **`web/` — a React + TypeScript SPA**, built by **Vite 8**, styled with
  **Tailwind 4**. Data comes from the API through a **generated** client
  (OpenAPI → orval → TanStack Query hooks). The build output *is* the deployed
  document root: `index.html` plus hashed bundles under `assets/`.
- **`api/` — Laravel 11**, which owns the whole JSON API and the database
  schema. Its own Composer project (`api/composer.json`, `api/vendor/`, its own
  tests and migrations), sharing the database rather than having one of its own.
  Deployed as `api-laravel/` inside the document root.
- **PHP 8.4** (matches prod) and **MariaDB 10.3** (prod: 10.3.8).
- **Apache** with `.htaccess` (API dispatch + SPA fallback + cache policy) on
  `easy-hebergement.net` shared hosting.

There is no PHP outside `api/`. The old front end — a front-controller app in
`app/` with server-rendered pages, Bulma, Twig and a per-page Vite build — was
deleted in the SPA cutover; it is on the `archive/php-laravel-stack` branch if
you need to read it.

### Tailwind 4 is CSS-first

There is **no `tailwind.config.ts`**. The entry point is
`@import "tailwindcss"` in `web/src/styles.css`, and design tokens live in an
`@theme` block in that same file. Stylelint does not know Tailwind's at-rules,
so `.stylelintrc.json` lists them under `at-rule-no-unknown`'s `ignoreAtRules`
and disables `import-notation` (v4 imports a bare `"tailwindcss"`, not a
`url()`).

### The `.htaccess`, and three things that will take the site down

The tracked template is `config/htaccess/site.htaccess`;
`tools/build-overlays.mjs` merges it with each environment's auth block into
`dist/overlay/<env>/`. The file is **server-owned** and never uploaded by a
deploy. Read its comments before touching any of it. Three properties are
load-bearing:

1. **The `/api/*` dispatch must stay first**, above the legacy redirects and the
   SPA fallback, because the fallback matches every path.
2. **`[L]`, not `[END]`.** `END` is Apache 2.3.9+; this host's version is
   unresolved (it 500s on `<RequireAny>`, which leans 2.2) and an unknown
   `RewriteRule` flag is a syntax error — a 500 on *every* request to the whole
   site. `[L]` is safe on 2.2 and 2.4, and correct here because the substituted
   path `api-laravel/...` cannot re-match `^api(/|$)`: the hyphen defeats
   `(/|$)`. That is also why the directory is called `api-laravel` and must not
   be "tidied" to `api`.
3. **Two negative lookaheads on the legacy 301s**, both learned the hard way:
   - the `.php` rule excludes `api-laravel/`, or the dispatch's own rewrite
     target gets 301'd on the re-entered pass and **the entire API answers 301**
     while every page still looks fine;
   - the `.html` rule excludes `index.html`, or the SPA fallback's own output
     gets 301'd and **every URL of the site redirect-loops**.

   Both are covered by `tools/build-overlays.test.mjs` and by `npm run smoke`.

The fallback is a **catch-all** with a `RewriteCond %{ENV:REDIRECT_STATUS} ^$`
guard, not an `!-f`/`!-d` guard. The guard is what stops the rewrite re-matching
its own output and looping into a 500 on this FastCGI host; the catch-all is
what keeps `api-laravel/.env`, `api-laravel/vendor/` and each server's now-dead
`config.php` unreachable. An unknown URL therefore answers **200 with the SPA's
own 404 view**, deliberately — enumerating routes in `.htaccess` would drift.

### Build

`npm run build` (`tools/build.mjs`) assembles `dist/build/`, the
environment-agnostic code artifact:

```
index.html        the SPA shell
assets/           hashed JS/CSS, plus img/ and icons/ copied verbatim
api-laravel/      the Laravel API with a production-only vendor/
```

**The order of the two builds is load-bearing.** Vite empties its `outDir`, so
building the SPA *after* the Laravel copy would delete the API from the
artifact — an outage nothing downstream catches, because the upload still
succeeds and only `/api/*` 500s. CI's `build` job asserts both halves exist for
exactly that reason.

`dist/build/` is git-ignored and never hand-edited. The build reuses a
persistent Composer cache at `.composer-cache/`.

### Deployment

**Auto TEST, tag-promoted TEST/QA/PROD.** A merge to `main` auto-deploys
`dist/build/` to **TEST** via the `deploy-test` job in `.github/workflows/ci.yml`.
TEST, QA and PROD are each independently deployable on demand via
`workflow_dispatch` (`deploy-test.yml`, `deploy-qa.yml`, `deploy-prod.yml`), all
calling one reusable workflow, `_deploy.yml`. There is no Required-reviewers
gate; dispatching one with a chosen ref *is* the gate. Promotions are identified
by tags named `YYYY-MM-DD-<short-sha>` (or a custom name — see
`tag-release.yml`), created from whatever commit you verified on TEST.
`deploy-prod.yml` additionally checks, via the GitHub Deployments API, that its
target commit already deployed successfully to `qa`, and refuses otherwise even
with `dry_run`. Rolling back is redeploying an older tag.

Every upload **excludes the server-owned files** — `.htaccess`, `robots.txt`,
`api-laravel/.env` (and `config.php`, which still exists on each server and
should be deleted by hand once). Those are placed per server:
`npm run build:overlay` generates `.htaccess`/`robots.txt` into
`dist/overlay/<env>/`; `api-laravel/.env` is always set by hand. Nothing
recreates it, and a server without it 500s every `/api/*` request — so it must
exist *before* the first deploy. See `staging/README.md`.

**Automated deploy (`npm run deploy:<env>`):** `tools/deploy/cli.mjs` builds and
then **mirrors** `dist/build/` to the target over plain FTP (creds from a
git-ignored `.env.<env>`, falling back to `.env`): uploads new/changed files
(changed = different **sha256 content hash**), deletes stale remote files, and
removes emptied directories deepest-first. A **mass-delete safety brake**
refuses (exit 2) when a deploy would delete both >50 files and >20% of the
remote tree; override with `-- --force-delete` after checking the plan.
Server-owned files and the tool-owned `.sync-state.json` are never uploaded and
never deleted — matched by **basename at any depth**, which is what protects the
nested `api-laravel/.env`. Every bulk phase fans out over `FTP_CONCURRENCY`
connections (default 6, clamped 1-8) with exponential-backoff reconnect; the
host is flaky under concurrency.

> **The `.env.*` files use `FTP_PASSWORD`; the CLI reads `FTP_PASS`.** That is a
> known, deliberate mismatch — do not "fix" the env files. Inject it for a
> one-off command instead.

**Sync state (`.sync-state.json`):** each deploy writes a manifest at the site
root (deployed path → `{size, sha256}` plus commit/status). Routine deploys diff
against that one file — no recursive remote LIST — and an aborted deploy is
resumable. The full parallel LIST runs only on bootstrap (no state file) or
`-- --relist`. Deletion can see files the tool did not itself deploy only on
those authoritative runs. **Always `-- --dry-run` the first deploy to a new
environment.**

**Commands** (never call `node tools/deploy/cli.mjs` directly): `deploy:<env>`
and the build-free `status:<env>`, `<env>` = `test`|`qa`|`prod`. Flags after
`--`: `--dry-run`, `--force`, `--force-delete`, `--relist`, `--no-delete`,
`--verbose`. Exit codes: 0 ok, 1 failure, 2 refused by a guard/brake. Each
target hard-refuses unless its `FTP_DIR` matches the env name.

**Config-shape pre-flight:** before uploading, the deploy CLI fetches the
target's `api-laravel/.env` and compares its **key set** (never values — those
are never read or logged) against `api/.env.example`. Any drift refuses the
deploy with the exact keys to fix, so shipping code that expects a new key fails
that server's deploy instead of 500ing every request afterwards. `--dry-run`
reports the same drift without refusing; a server with no `.env` yet only warns.

**Deployment marker:** each deploy writes `deployment.json` to the site root
(commit, ref, time, run URL). Note it is **not** web-readable: the fallback
catch-all serves the shell for it, like every other root file.

### Automated DB migrations

**Laravel owns the schema outright** — it is the only migration system. Migrations
live in `api/database/migrations/`.

After each deploy, `npm run dbmigrate:<env>` POSTs to the token-gated
`POST <SITE_URL>/api/migrate`, which runs `artisan migrate --force` server-side
(remote DB login is blocked) and answers with `applied[]` / `pending[]`. The
secret travels in the **`X-Migrate-Token` header** — never a query parameter,
since Apache logs query strings in plain text. `?mode=dry-run` (the default for
anything that is not exactly `apply`) reports pending without touching the
schema.

**CI never runs it, and cannot: the host firewalls the GitHub runner's IP.** A
runner can push a deploy out over FTP, but no inbound HTTP request from a runner
ever reaches the site.

**What actually migrates a deployed server is
`App\Http\Middleware\RunPendingMigrations`.** It is prepended to Laravel's `api`
*and* `web` middleware groups, so the first `/api/*` request — or the first
`GET /sanctum/csrf-cookie`, which the SPA primes before every mutating call —
applies whatever is pending, under a MySQL advisory lock
(`GET_LOCK('lescanetons_migrate')`) so concurrent PHP-FPM workers cannot
double-apply. A raw `GET_LOCK`, deliberately, not `Cache::lock()` or
`migrate --isolated`: both go through the `database` cache store, whose `cache`
table is itself created by a migration. Gated by **`AUTO_MIGRATE`** in each
server's `.env`, defaulting to `true`.

**Still use `npm run dbmigrate:<env>` for any non-trivial migration.** The
request-path runner has no timeout of its own — a long `ALTER` holds a PHP-FPM
worker and will hit `max_execution_time` on this shared host, leaving a
half-applied schema. Run it by hand *before* the deploy that needs it.

**Failure mode: a migration that fails takes the whole API down.** The
middleware refuses to serve against a schema it cannot vouch for, so every
`/api/*` request answers **503 `service_unavailable`**, and the failing
migration retries on every request. The emergency switch is
`AUTO_MIGRATE=false`. This is why migrations must stay idempotent *and*
backward-compatible.

## Superpowers Skills

This project ships with [Superpowers](https://github.com/obra/superpowers) skills in `.claude/skills/`. These are loaded automatically at session start. Always use the `Skill` tool to invoke them — never read skill files manually.

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

- **`web/` and `api/` are the two applications; `dist/build/` is the generated
  FTP payload.** `dist/build/` is produced by `npm run build` and is never
  hand-edited or committed. All tooling lives at the repo root
  (`package.json`, `vite.config.ts`, `orval.config.ts`, `tsconfig.json`,
  `docker/`, `config/`, `tools/`, `.github/`).
- **Apache splits the traffic before either application runs.** `/api/*` and
  `/sanctum/*` go to `api-laravel/public/index.php`; everything else gets
  `index.html`.
- **`web/` layout:**

  ```
  web/
    index.html            the shell document
    public/assets/img/    copied verbatim -> /assets/img/*
    public/assets/icons/  favicons + PWA manifest -> /assets/icons/*
    src/
      main.tsx            boot: config + session gate, then the router
      routes.tsx          the route table — French URLs, unchanged
      api/                GENERATED client + hooks, and the http.ts mutator
      mocks/              MSW handlers for the mocked backend
      components/         layout, nav, footer, env ribbon, guards
      pages/              one component per route
      i18n/               i18next setup + the API error vocabulary
      styles.css          Tailwind entry and @theme tokens
    e2e/                  Playwright specs
  ```

  The PWA manifest link must keep `crossorigin="use-credentials"`, or the
  manifest fetch fails behind TEST/QA Basic Auth. Previously fixed bug.

  **Photographs have a budget: longest edge 1920px, JPEG quality 82,
  progressive, no EXIF — roughly 300-600 KB each.** That directory was 44.5 MB
  before this was enforced, including one 19 MB camera original at 6048x4024,
  which on a phone at a rehearsal is a page that never finishes loading.
  **`npm run check` enforces this** — `tools/image-budget.mjs` walks
  `web/public/assets/img/`, reads each image's dimensions out of its header and
  fails, naming the file, on anything over 1920px or 600 KB. The exemptions are
  by name in that file, each with its reason; an exempt name is still held to a
  4000px / 2 MB ceiling, so a camera original arriving under an exempt name does
  not sail through. The logo, `comite.jpg`, `CD_img.png` and `Flyer.jpeg` are
  deliberately exempt — they are already small, and re-encoding a small image
  only softens it. Re-encoding is also generational: never run an optimisation
  pass over already-optimised files.
- **`web/src/api/generated/` is generated — never hand-edit it.** Change the
  Laravel controller, run `npm run openapi && npm run generate:api`, commit the
  result. CI's `openapi-drift` job fails if either is stale. ESLint ignores the
  directory.
- **Every request goes through the mutator in `web/src/api/http.ts`**, which
  owns cookie credentials, Sanctum's CSRF priming (`GET /sanctum/csrf-cookie`
  once per page load) and the `{error, code, fields[]}` error contract. It
  throws a typed `ApiError` for every non-2xx. Never call `fetch("/api/…")`
  directly: Sanctum's stateful SPA mode puts `/api/*` behind the `web`
  middleware group, so a mutating request without the replayed `X-XSRF-TOKEN`
  header comes back `419 {"error":"Invalid session","code":"invalid_session"}`.
- **Runtime configuration comes from `GET /api/config`**, not from
  `import.meta.env`. TEST, QA and PROD run the *same promoted bundle*, so no
  environment-specific value may be baked in. That endpoint drives the non-prod
  corner ribbon and the feature flags.
- **Auth:** Laravel owns it — `POST /api/login` / `POST /api/logout` via
  Sanctum's stateful SPA cookie flow. The capability matrix is **not a
  hierarchy**: `user`/`moderator` may `respond`; `admin` may `manage_events` /
  `view_summary`, and therefore may *not* respond. `App\Support\Capability`
  (behind the `capability:` route middleware) is the only thing that enforces
  anything; the SPA's guards mirror it for UX only.
- **API:** routes in `api/routes/api.php` (each with a comment saying why it is
  public or which capability gates it), controllers in
  `api/app/Http/Controllers/Api/`, shared logic in `api/app/Support/`. Pair
  `auth:sanctum` with `capability:` wherever both apply, so an anonymous caller
  gets 401 rather than 403.
- **The API error contract is `{error, code, fields[]}`**, rendered by
  `App\Exceptions\ApiError`, deliberately replacing Laravel's native
  `{message, errors:{}}`. This is not cosmetic: `web/src/i18n/`'s
  `translateApiError()` is the **only** place in the whole system where French
  is computed, and it maps the machine tokens `code` and `fields[].reason` onto
  French. Laravel's native shape carries English prose that layer cannot
  translate — so any new error must emit a token that exists as a key in
  `web/src/i18n/fr.ts`. `api/tests/Feature/ApiErrorVocabularyTest.php` enforces
  this, reading that file directly (which is why the dev container mounts `web/`
  read-only at `/srv/web` — the container's document root holds only built
  bundles).
- **Environments:** the `env` value from `GET /api/config` drives the non-prod
  corner ribbon. TEST and QA are private behind HTTP Basic Auth; see
  `staging/README.md`.

## Local Development

```bash
npm run dev         # generate the docker .htaccess overlay, then bring the stack up
npm run dev:web     # Vite dev server on :5173 — where you actually work
npm run build       # refresh the artifact the :8090 stack serves
npm run smoke       # HTTP smoke checks against the built artifact (13 checks)
npm run dev:down    # stop
```

**Two dev modes, on purpose:**

| URL | What | When |
| --- | --- | --- |
| http://localhost:5173 | Vite dev server, HMR, proxying `/api` and `/sanctum` to :8090 | day-to-day frontend work |
| http://localhost:8090 | Apache serving the **built** `dist/build/` | parity checks, `npm run smoke` |

Both are a single origin to the browser, so Sanctum's cookie flow is exercised
for real in each. The dev origin is listed in `SANCTUM_STATEFUL_DOMAINS` in
`docker/api/env.docker` **only**, never in a shipped default.

The :8090 stack serves whatever `npm run build` last produced — it does not pick
up source edits. That is the point: it is the parity check.

| Other URLs | |
| --- | --- |
| http://localhost:8091 | Adminer |
| http://localhost:8025 | Mailpit |
| `localhost:3307` | MariaDB |

**Never `docker compose up` directly.** `npm run dev` first runs
`node tools/build-overlays.mjs docker`, which generates
`dist/overlay/docker/.htaccess` and removes any stale copy first.
`docker-compose.yml` bind-mounts that one file; if it doesn't exist, Docker
creates a **directory** in its place and `web` refuses to start at all ("not a
directory: are you trying to mount a directory onto a file?"). The site is
simply down until `npm run dev` regenerates it.

Relatedly, the `dist/build` mount **must not be `:ro`**. The `.htaccess` mount
nests inside it, and Docker cannot create that mountpoint against a read-only
parent — the container never starts.

**Six services**; five stay running and one is a one-shot. `deps` installs
Laravel's Composer dependencies into the `api_vendor` volume and exits; `web`
waits on it via `service_completed_successfully`, and on `db` being healthy —
that healthcheck pings `-h 127.0.0.1`, not `localhost`, because the unix-socket
path falsely reports healthy against MariaDB's temporary `--skip-networking`
init server.

**Migrations run from the `web` entrypoint** (`php api-laravel/artisan migrate
--force`, wrapped in a retry because `artisan` has no connection retry of its
own), before Apache accepts its first request. On a real server there is no
entrypoint: the schema is applied by `RunPendingMigrations` on the first request
after a deploy, or by `npm run dbmigrate:<env>` by hand.

Laravel's migrations are written **guarded** — they adopt the tables
`docker/db/init/01-schema.sql` seeds rather than assuming an empty database — so
re-running them on a live server never drops or reseeds data. Keep new ones that
way; the same files run against TEST and PROD. (The Laravel *test* suite uses
its own throwaway `laravel_api_test` database — see `api/phpunit.xml` — because
`RefreshDatabase` drops every table.)

Seeded test logins (all passwords `demo`, synthetic data only):
- `demo.admin` — admin (manage events, view summaries)
- `demo.moderator` — moderator (respond)
- `demo.user` — user (respond)

## Development Commands

```bash
npm install           # first-time setup; there is no separate PHP install step
npm run check         # typecheck, Pint, both test suites, eslint, stylelint, prettier, secret guard
npm run fix           # auto-fix: Pint + eslint + stylelint + prettier
npm run test:web      # Vitest (web/src)
npm run test:e2e      # Playwright (web/e2e)
npm run test:js       # node:test over tools/
npm run lint:api      # Laravel Pint (--test)
```

**`npm run check` does not run the Laravel suite.** It needs a live database, so
it runs inside the stack:

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```

In Git Bash, prefix that with `MSYS_NO_PATHCONV=1` or the `-w` argument is
rewritten to a Windows path and Docker rejects it. PowerShell is unaffected.

**Run the web suite from PowerShell, not Git Bash.** Git Bash reports the cwd
with a **lowercase** drive letter (`c:\Workspace\...`); PowerShell reports
`C:\`. Vitest 4 keys module resolution off that path, so from Git Bash it can
load two instances of `vitest` and every test file fails to collect with
**"Vitest failed to find the runner"**, pointing at `web/src/setupTests.ts`. It
looks like 29 red files and a catastrophic regression; it is neither, and the
identical command from PowerShell is green. It is intermittent, which makes it
worse — it has already sent two separate sessions hunting a phantom.

`npm run check` deliberately does **not** build: `build:web` empties
`dist/build/`, which would delete `api-laravel/` out from under a running stack.
CI's `build` job covers the artifact.

A Husky pre-commit hook runs `lint-staged` on staged files.

### Claude Code web sessions (no Docker)

Web sessions have no Docker daemon. `tools/ensure-dev-stack.sh` (via the
cross-platform `tools/ensure-dev-stack.mjs` entry) detects a web session
(`$CLAUDE_CODE_REMOTE=true`, `docker info` failing) and stands up an equivalent
stack natively: MariaDB via `apt`, `lescanetons` + `lescanetons_test` seeded from
`docker/db/init/*.sql`, and `api/.env` generated from `api/.env.example` pointed
at `127.0.0.1`. It is idempotent and a no-op when Docker is reachable. It is
**not** run from the SessionStart hook — apt/DB provisioning would blow the hook
timeout.

`npm run websession:init` chains `npm install` and `ensure-dev-stack` in one
command. **The Laravel suite does not run in a web session** — it needs the
stack's `php artisan test`. Run it locally in Docker before claiming API work is
done.

## Pull Requests

- **Title format:** Conventional Commits — `type(scope): description` (scope optional).
  Enforced by CI (`.github/workflows/pr-title.yml`).
  Types: `feat`, `fix`, `chore`, `docs`, `build`, `ci`, `test`, `refactor`, `style`, `perf`.
- **Body:** use `.github/PULL_REQUEST_TEMPLATE.md` — fill in every section.

## Language

- **Everything is written in English** — specs and plans (`docs/`), code,
  comments, DB table/column names, enum/stored values, identifiers, slugs, and
  file names.
- **API JSON response bodies are English** — every error response's `error`
  message, `code`, and `fields[].field`/`fields[].reason` are English
  identifiers. Nothing there is user-facing: translation happens exclusively at
  the display layer, in `web/src/i18n/`. `POST /api/migrate` is the one
  exception — token-gated deploy tooling, never seen by an end user.
- **French is used for ONE thing only: user-visible UI text** — labels, page
  copy, buttons, on-screen event titles. Rendered text, not API bodies.
- The existing code follows this: `contact_messages` uses `first_name`/
  `last_name` and `responses.answer` uses `participate`/`notparticipate`, while
  the UI reads French. Match that pattern.

## Dos

- Run `npm run check` before pushing, and the Laravel suite in Docker for API work.
- Match production versions (PHP 8.4, MariaDB 10.3).
- Put new tooling/config at the repo root.
- Add a new **page** route in `web/src/routes.tsx`, and a new **API** route in
  `api/routes/api.php`.
- Regenerate the client (`npm run openapi && npm run generate:api`) whenever an
  API response shape changes, and commit the result.
- Give every new API error token French copy in `web/src/i18n/fr.ts`.

## Don'ts

- Never commit `dist/build/`, `api/.env`, or any production data / DB dump.
- Never hand-edit `dist/build/` or `web/src/api/generated/`.
- Never store real member data or passwords in seed files.
- Never rename `api-laravel/` without first adding a `REDIRECT_STATUS` guard to
  both dispatch rules — see the `.htaccess` section above.
