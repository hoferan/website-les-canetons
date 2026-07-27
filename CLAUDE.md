# Website "Guggenmusik Les Canetons de Fribourg" — Project Instructions

## Project Overview

Public website and members' area for the Guggenmusik **Les Canetons de Fribourg**
(a Fribourg carnival brass band). Public pages present the band (history, sections,
committee, sponsors, media, contact). A members' area, gated by login, lets members
respond to events (participate / not) and lets the admin ("Team Direction") manage
events and view attendance summaries.

## Tech Stack

- **PHP 8.4** (matches prod). `app/src/` classes are PSR-4
  autoloaded under the `App\` namespace via Composer.
- **MariaDB 10.3** (prod: 10.3.8) via the `mysqli` extension.
- **Vanilla JS + CSS** under `app/assets/`, built by **Vite** (`vite.config.js`)
  into `app/assets/dist/` — one entry per currently-independent `<script>`/
  page-CSS file, ES modules (native `import`/`export`, no framework), with
  content-hashed output and a `manifest.json` that `App\Assets`
  (`app/src/Assets.php`) reads to emit the right `<script type="module">`/
  `<link rel="modulepreload">`/`<link rel="stylesheet">` tags — the one
  mechanism both `head.php`/`footer.php` and `layout.html.twig` use, instead
  of hardcoding asset paths. `bulma`, `i18next`, and `lucide` are npm
  devDependencies bundled in at build time (not vendored static files).
- **Laravel 11 (`api/`)** owns the whole JSON API and the database schema. It is
  a second, independent Composer project with its own `api/composer.json`,
  `api/vendor/`, tests and migrations; it shares the old app's database rather
  than getting one of its own. Deployed as `api-laravel/` inside the document
  root (see the Build step).
- **Third-party PHP libraries are Composer dependencies**, in two separate
  projects. The root `composer.json` — the old app — now needs only
  `nikic/fast-route` and `twig/twig`, installed into `app/vendor/` (the
  Composer/Docker install target — never hand-edited or committed): mail
  (`phpmailer`) and the xlsx export (`simplexlsxgen`) moved to Laravel with the
  endpoints that used them, so those requirements were dropped. Laravel's own
  dependencies live in `api/composer.json` / `api/vendor/`. Third-party JS/CSS
  is npm-managed and bundled by Vite (see above) rather than vendored as static
  files.
- **Router:** `nikic/fast-route`, dispatched through a single front
  controller (`app/index.php`) — **pages only**. Clean URLs; old `.php` URLs
  301-redirect. `/api/*` never reaches it (see Apache, below).
- **Apache** with `.htaccess` (API dispatch + front-controller rewrite + cache
  policy) on `easy-hebergement.net` shared hosting. PHP runs as **FastCGI**
  there, so the front-controller rule in `app/.htaccess` carries a `RewriteCond
  %{ENV:REDIRECT_STATUS} ^$` guard — without it the rewrite to `index.php`
  re-matches itself and loops into a 500. Don't remove it. Above that rule sits
  the dispatch block that sends `/api/*` and `/sanctum/*` into
  `api-laravel/public/index.php`; it must stay first, because the
  front-controller catch-all matches every path. That block uses `[L]`, not
  `[END]` — the `END` flag is Apache 2.3.9+, this host's version is unresolved,
  and an unknown `RewriteRule` flag 500s the whole site. `[L]` is safe on 2.2
  and 2.4 and is correct here because the substituted path `api-laravel/...`
  cannot re-match `^api(/|$)` (the hyphen defeats `(/|$)`). See that file's own
  comments before touching any of it.
- **Build step:** `npm run build` assembles two trees into `dist/build/` — the
  environment-agnostic code artifact. `app/` + a production-only Composer
  `vendor/` at the root, and `api/` + its own production-only `vendor/` at
  `dist/build/api-laravel/`. It deliberately excludes both server-owned config
  files — `config.php` and `api-laravel/.env` — but ships `config.example.php`
  next to the former on every deploy, the live template for diffing against a
  server's real `config.php` by hand. (There is no such template mechanism for
  `.env`; `api/.env.example` is documentation only and is not compared against
  anything.) It also strips the raw `assets/js`/`assets/css` sources superseded
  by the Vite bundles, and any local `php-error.log` that the wholesale `app/`
  copy would otherwise ship to every server. `dist/build/` is git-ignored and
  never hand-edited. `npm run build` reuses a persistent Composer cache at
  `.composer-cache/` (git-ignored) across builds.
- **Deployment (auto TEST, tag-promoted TEST/QA/PROD):** a merge to `main`
  auto-deploys the built `dist/build/` to **TEST** via the `deploy-test` job in
  `.github/workflows/ci.yml`. **TEST**, **QA**, and **PROD** are also each
  independently deployable on demand via `workflow_dispatch` workflows
  (`deploy-test.yml`, `deploy-qa.yml`, `deploy-prod.yml`) — no
  Required-reviewers approval gate; the deliberate act of dispatching one with a
  chosen ref *is* the gate. All three call one reusable workflow, `_deploy.yml`,
  so their deploy/summary logic stays in sync instead of drifting
  independently. Promotions are identified by git tags named
  `YYYY-MM-DD-<short-sha>` by default, or a custom name (see `tag-release.yml`),
  created from whichever commit you've verified on TEST; dispatching any of the
  three deploy workflows always uses GitHub's native branch/tag selector, never
  a free-text ref. `deploy-prod.yml` additionally checks, via the GitHub
  Deployments API, that its target commit was already successfully deployed to
  `qa` — refusing to proceed otherwise, even with `dry_run`. Rolling back is
  simply redeploying an older tag; there is no separate rollback mechanism.
  Every upload still **excludes the four server-owned files**
  (`.htaccess`, `robots.txt`, `config.php`, `api-laravel/.env`). Those per-env
  files are placed once per server: `npm run build:overlay` generates the first
  two into `dist/overlay/<env>/`; `config.php` and `api-laravel/.env` are always
  set by hand per server. Nothing recreates `api-laravel/.env`, and a server
  without it 500s every `/api/*` request — so it must exist *before* the first
  deploy that dispatches into Laravel. See `staging/README.md`.
- **Automated deploy (`npm run deploy:<env>`):** `tools/deploy/cli.mjs` builds
  and then **mirrors** `dist/build/` to the target server over plain FTP (creds
  from a git-ignored `.env.<env>`, falling back to `.env`; see `.env.example`):
  uploads new/changed files (changed = different **sha256 content hash**),
  deletes stale remote files, and removes directories left empty —
  **deepest-first, children before parents** (FTP can only delete empty dirs).
  A **mass-delete safety brake** refuses the deploy (exit 2) when it would
  delete both >50 files and >20% of the remote tree — after checking the plan,
  override with `-- --force-delete`. Server-owned files (`.htaccess`,
  `robots.txt`, `config.php`, `.htpasswd`, `.env`) and the tool-owned
  `.sync-state.json` are never uploaded and never deleted — matched by
  **basename at any depth**, which is what protects the nested
  `api-laravel/.env` from being classified stale and deleted on a `--relist` or
  bootstrap run. (The same rule means `api/.htaccess` and
  `api/public/.htaccess` never reach a server either; see `staging/README.md`
  for why that is currently harmless.) Every bulk phase
  (LIST/upload/delete/verify) fans out over `FTP_CONCURRENCY` connections
  (default 6, clamped 1-8) and every FTP op retries with exponential-backoff
  reconnect — the host is flaky under concurrency. Output is a live step list
  with progress bars on a TTY and plain sequential lines when piped/in CI.
- **Sync state (`.sync-state.json`):** each deploy writes a manifest at the
  site root (deployed path → `{size, sha256}` plus commit/status). Routine
  deploys diff against that one small file — **no recursive remote LIST** — and
  an aborted deploy is resumable (checkpointed during upload, finalized at the
  end). The full parallel LIST runs only on bootstrap (no state file) or
  `-- --relist` (reconcile against the server's real tree). Deletion can see
  files the tool didn't itself deploy only on those authoritative runs —
  `--relist`, or the **bootstrap** first deploy of an environment with no state
  file yet; routine deletion is state-file-based, so it can never remove more
  than what the tool put there. **Always `-- --dry-run` the first deploy to a
  new environment** and check its deletion list before the real run.
- **Deploy commands (never call `node tools/deploy/cli.mjs` directly):**
  `deploy:<env>` (build + mirror + verify) and the build-free `status:<env>`
  (state header: commit, file count, status, updated-at), `<env>` =
  `test`|`qa`|`prod`. Flags appended after `--`: `--dry-run` (full plan incl.
  file lists, changes nothing), `--force` (re-upload everything),
  `--force-delete` (override the brake), `--relist` (authoritative LIST),
  `--no-delete` (skip deletion this once), `--verbose` (per-file detail). After
  upload it verifies every file landed at the right byte size (LISTing only
  the touched directories) and exits non-zero on any shortfall. Exit codes:
  0 ok, 1 failure, 2 refused by a guard/brake. Each target hard-refuses unless
  its `FTP_DIR` matches the env name, so a mistyped dir can never deploy to
  (or delete from!) the wrong environment.
- **Config-shape pre-flight check:** before uploading anything, the deploy CLI
  (tools/deploy/) fetches the target's `config.php` and compares its key *shape* (never
  values — those are never logged) against `config.example.php`. Any drift
  (a key the code now expects that's missing, or one no longer expected)
  refuses the deploy with the exact key paths to fix — e.g. shipping a new
  `App\Features` flag without first adding it to a server's `config.php`
  fails that server's deploy instead of silently misbehaving. `--dry-run`
  reports the same drift without refusing. If `config.php` can't be fetched
  at all (a brand-new environment before initial setup), this only warns.
  The shape is read by *parsing* each `config.php` to an AST (`php-parser`, a
  pure-JS devDependency) and walking its top-level `return [ ... ]` — the file
  is never evaluated, so this needs no `php` binary and never executes the
  fetched server config. It assumes `config.php` stays a literal array (as it
  always is); a dynamic construct throws a clear error instead of under-reporting
  keys.
- **Automated DB migrations:** **Laravel owns the schema outright** — it is the
  only migration system left. The old app's numbered `sql/migrations/*.sql`
  runner (`App\Migrator`, and `App\AutoMigrator` on the first request) is gone,
  along with the `sql/` tree and the `auto_migrate` / `migrate.token` keys in
  `config.php`. Migrations are Laravel's own, under `api/database/migrations/`.

  After each deploy, `npm run dbmigrate:<env>` (`tools/dbmigrate.mjs`) POSTs to
  the token-gated endpoint `POST <SITE_URL>/api/migrate`, which Apache
  dispatches to Laravel's `MigrateController`; it runs `artisan migrate --force`
  server-side (remote DB login is blocked) and answers with the `applied[]` /
  `pending[]` migration names. The secret travels in the **`X-Migrate-Token`
  header** — never a body field or query parameter, since Apache writes query
  strings to its access log in plain text. `?mode=dry-run` (the default for
  anything that is not exactly `apply`) reports pending without touching the
  schema or the migrations table.

  It is a **separate step run after** `deploy:<env>` — deliberately not chained
  into it, so `deploy:<env> -- --dry-run` still reaches the deploy CLI
  (tools/deploy/). In CI it's a step after the deploy step (skipped if the
  deploy fails); locally run `npm run dbmigrate:<env>` after
  `npm run deploy:<env>`. A non-2xx response, or a `status` other than `ok`,
  exits non-zero and fails the CI job.

  **There is no longer a self-healing fallback, and this is a real operational
  change.** `App\AutoMigrator` used to apply anything pending on the first
  request after a deploy, so a forgotten or failed `dbmigrate` corrected itself
  (and, failing that, made the site 503 loudly). Nothing does that now: a
  deploy whose migration step failed or never ran leaves that server serving
  the new code against an **unmigrated schema**, silently, until someone
  re-runs `npm run dbmigrate:<env>`. That is also why migrations must stay
  idempotent *and* backward-compatible — the previously deployed code has to
  survive a half-applied schema, and the newly deployed code has to survive an
  unmigrated one.

  Config: `MIGRATE_TOKEN` lives in each server's `api-laravel/.env` (**not**
  `config.php` any more), and must match the `MIGRATE_TOKEN` / `SITE_URL` in
  the caller's `.env.<env>` or the env's CI secrets. On TEST/QA the whole site
  is behind HTTP Basic Auth (this host 500s on a per-path `.htaccess`
  exemption), so also set `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` — the trigger
  sends them so it can reach `/api/migrate`; PROD has no Basic Auth. See
  `staging/README.md`.
- **CI auto-deploy to TEST:** the `deploy-test` job in `.github/workflows/ci.yml`
  runs `npm run deploy:test` on every merge to `main`, after all other jobs pass.
  Requires four secrets — `FTP_HOST`, `FTP_USER`, `FTP_PASS`, `FTP_DIR` —
  set on the `test` GitHub Environment (Settings → Environments → `test`), where
  you can also add protection rules. Since that FTP account reaches every
  environment, the per-target path guard applies in CI and the mass-delete
  safety brake bounds the mirror's deletions.
- **Tagging a promotion candidate:** `tag-release.yml` is a `workflow_dispatch`
  workflow with one optional input, `tag_name` — dispatch it from whatever
  commit you've verified on TEST (defaults to `main`); a blank `tag_name`
  creates (or, if already present, leaves alone) a tag named
  `YYYY-MM-DD-<short-sha>`; a non-blank `tag_name` is used instead — if that
  name already exists pointing at a different commit, the run refuses rather
  than moving it. Usable from the GitHub mobile app.
- **TEST / QA / PROD deploy (independent, tag-based):** `deploy-test.yml`,
  `deploy-qa.yml`, and `deploy-prod.yml` are separate `workflow_dispatch`
  workflows, each with `dry_run`/`force` boolean inputs (deletion is on by
  default, bounded by the deploy CLI's mass-delete safety brake). All three
  call one reusable workflow, `_deploy.yml`, which does
  the actual checkout/build/deploy/summary. Dispatch any of them by picking a
  tag (or branch) from GitHub's native ref selector — never a typed-in ref.
  `deploy-prod.yml` additionally runs its own `validate-qa` job first, which
  checks the GitHub Deployments API for the `qa` environment's most recent
  successful deployment and refuses to proceed (even with `dry_run`) unless
  its commit matches the ref being deployed to PROD. None of the three has a
  Required-reviewers approval step. Each environment needs its own `FTP_DIR`
  secret (scoped to that Environment) plus the shared `FTP_HOST`/`USER`/`PASS`.
  Locally, `npm run deploy:test` / `deploy:qa` / `deploy:prod` do the same over
  FTP. Rolling back is redeploying an older tag with any of the three — no
  dedicated rollback mechanism exists. Each run's summary shows which flags
  were used, the deploy CLI's final summary line (`... deploy done in ... — N
  uploaded, D deleted, ...`), and the full deploy log in a collapsible section.
- **Deployment marker:** each deploy writes `deployment.json` to the site root
  (deployed commit, ref, time, run URL). It is re-uploaded every deploy (its
  content hash changes every run, so it re-uploads naturally) and
  is web-readable at `/deployment.json`.
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

- **`app/` is the tracked source; `dist/build/` is the generated FTP payload.**
  `dist/build/` is produced by `npm run build` and is never hand-edited or committed.
  Never put dev-only files in `app/`. All tooling lives at the repo root
  (`composer.json`, `package.json`, `phpcs.xml`, `docker/`, `config/`, `tools/`,
  `.github/`).
- **Two apps, one origin.** `app/` serves the server-rendered pages; `api/`
  (Laravel) serves every `/api/*` and `/sanctum/*` request. Apache splits the
  traffic before either app runs (see the dispatch block in `app/.htaccess`),
  so neither ever sees the other's requests. Sub-project 3 will retire the
  `$_SESSION`-gated pages in `app/pages/` in favour of an SPA on this API.
- **Entry point (pages):** `app/index.php` is the single front controller. It
  requires `app/src/bootstrap.php` (autoload + DB connect + session start),
  then dispatches via `nikic/fast-route` using the route table in
  `app/src/routes.php`. Route handlers `require` the matching file under
  `app/pages/` — blocked from direct web access by `.htaccess`, reachable only
  through the router. There are **no `/api/*` routes in that table**: Apache
  has already rewritten those into `api-laravel/` by the time the front
  controller runs, so adding one there would be dead code.
- **PSR-4 autoloading:** `app/src/` classes are namespaced under `App\` and
  autoloaded via Composer (`composer.json`'s `autoload.psr-4`). No manual
  `require` needed once `vendor/autoload.php` has run (done once, in
  `bootstrap.php`).
- **Auth:** the capability matrix is unchanged and is **not a hierarchy** —
  `user`/`moderator` may `respond`; `admin` may `manage_events` /
  `view_summary`, and therefore may *not* respond. It now exists twice, on
  purpose: `App\Support\Capability` in Laravel (behind the `capability:` route
  middleware) and `App\Auth` in the old app. **Laravel owns authentication** —
  `POST /api/login` / `POST /api/logout` via Sanctum's stateful SPA cookie
  flow. `App\Auth` no longer logs anyone in; it retains only the
  session-*reading* page gate (`check()`, `role()`, `canX()`,
  `requireLoginPage()`) that `app/pages/` and `app/partials/` still use.
  `assets/js/session.js` mirrors the matrix on the client; the server session
  (`window.__sessionRole`) is source of truth.
- **`App\Support\LegacySession` is the bridge between them, and is written to
  be deleted.** The old pages gate on PHP's native `$_SESSION['user']`, which
  Laravel does not write, so on a successful login `AuthController` also writes
  that array and on logout clears it. Two call sites, one class; it only works
  because both apps share one PHP-FPM pool and therefore one `PHPSESSID`
  cookie. Don't grow it into a shared session handler or a custom session
  driver — sub-project 3 deletes the file and its two calls in a single commit.
- **API:** Laravel, at `api/`. Routes in `api/routes/api.php` (each with a
  comment saying why it is public or which capability gates it), controllers in
  `api/app/Http/Controllers/Api/`, shared logic in `api/app/Support/`, guarded
  by the `auth:sanctum` and `capability:` middleware. `auth:sanctum` is paired
  with `capability:` wherever both apply so an anonymous caller gets 401 rather
  than 403.
- **The API error contract is `{error, code, fields[]}`**, rendered by
  `App\Exceptions\ApiError`, which deliberately replaces Laravel's native
  `{message, errors:{}}`. This is not cosmetic: `app/assets/js/i18n.js`'s
  `translateApiError()` is the **only** place in the whole system where French
  is computed, and it maps the machine tokens `code` and `fields[].reason` onto
  French text. Laravel's native shape carries English prose instead, which that
  layer cannot translate — so any new error must emit a token that exists as a
  key in `i18n.js` (`api/tests/Feature/ApiErrorVocabularyTest.php` enforces
  this). It is also what keeps API bodies English, per the Language section
  below.
- **Front-end:** every `/api/*` call goes through `apiFetch` in
  `app/assets/js/api.js` — **never a raw `fetch("/api/…")`**. Sanctum's
  stateful SPA mode puts `/api/*` behind the `web` middleware group, so any
  same-origin browser request is CSRF-validated; `apiFetch` primes the
  `XSRF-TOKEN` cookie once per page load (via `GET /sanctum/csrf-cookie`) and
  replays it in the `X-XSRF-TOKEN` header. A raw `fetch` to a mutating endpoint
  comes back `419 {"error":"Invalid session","code":"invalid_session"}` — the
  public contact and signup forms included, not just the members' area.
- **Config:** the real `app/config.php` is git-ignored. Create it locally with
  `cp config/config.example.php app/config.php`. For Docker, the stack mounts
  `config/config.docker.php` into the container instead. `npm run build` does
  **not** ship `config.php` into `dist/build/` — it's server-owned (real DB creds +
  `env` key), set once per server by hand, and excluded from every
  upload/promotion. So the code artifact is safe to promote test → qa → prod
  unchanged.
- **Environments:** `config.php` carries an `'env'` key (`dev` | `test` | `qa` |
  `prod`). `bootstrap.php` feeds it to `App\Env`, which drives the non-prod
  corner ribbon (`app/partials/env_banner.php`, included from `head.php`;
  styles in `assets/css/main.css`). A missing/unknown value is treated as
  `prod` (no ribbon), so the live site stays clean by default. The two staging
  sites (TEST/QA) are private behind HTTP Basic Auth — their access-control
  overlay and the full deploy layout are documented in `staging/README.md`.
- **Icons:** [Lucide](https://lucide.dev), an npm devDependency bundled by
  Vite — the small fixed icon set actually used is centralized in
  `app/assets/js/icons.js` (`export const icons = { ExternalLink, Menu,
  Pencil, Trash2 }`; add a new icon there, not per call site). Markup:
  `<i data-lucide="icon-name"></i>`, converted to inline `<svg>` by calling
  `createIcons({ icons })` (imported from `'lucide'`) — in `main.js`'s
  `DOMContentLoaded` handler, and again anywhere JS creates icon markup
  dynamically after that (e.g. `planning_repet.js`'s `loadEvents()` calls
  it again after every list rebuild, since the global `DOMContentLoaded`
  call only ever sees the page's initial markup).
  Style is outline/stroke-only (`fill="none"`, `stroke="currentColor"`) —
  there is no solid/filled variant, so never override `fill` on a Lucide
  icon.

  Sizing and orientation are two separate, composable utility classes
  (`app/assets/css/main.css`) applied directly on the `<i data-lucide>`
  placeholder — `createIcons()` copies an element's existing attributes,
  including `class`, onto the `<svg>` it generates, so e.g.
  `<i data-lucide="menu" class="icon-md icon-block"></i>` becomes
  `<svg class="lucide lucide-menu icon-md icon-block">`. Never target an
  icon's size with a per-spot descendant selector (`.foo svg { width:
  ... }`), an arbitrary/one-off value, or `em`/text-relative sizing — a
  discrete, reusable scale keeps every icon's size predictable instead of
  drifting to whatever value happens to look right in one spot, and
  keeping size and orientation as separate classes means either can vary
  independently instead of being bundled per size (e.g. a future icon
  could pair `icon-lg` with `icon-inline`).

  **Size** (pick one): `icon-xs` (0.875rem / 14px), `icon-sm` (1rem /
  16px — icons inline within a run of text or a link label, e.g. the
  Galerie link's external-link icon, sized down so it doesn't inflate
  that element's line-height above its text-only siblings), `icon-md`
  (1.5rem / 24px — standalone icon controls, where the icon *is* the
  whole control, e.g. the nav hamburger, the admin delete/edit icons),
  `icon-lg` (2rem / 32px), `icon-xl` (2.5rem / 40px). `icon-lg`/`icon-xl`
  are prepared but not yet used by any icon in the codebase. The only
  exception to this scale is large-format decorative usage (a hero
  section, a page title, a logo lockup) that isn't really "an icon" —
  those may use a different, purpose-fit size outside this scale.

  **Orientation** (pick one, alongside a size class): `icon-block`
  (`display: block` — for an icon that is the sole content of a control,
  e.g. a button or an absolutely-positioned list-item action, removing
  the small inline-baseline gap under an inline SVG) or `icon-inline`
  (`vertical-align: middle` — for an icon inline within a run of text or
  a link label, aligning it to the surrounding text instead of the SVG's
  own baseline).

  Don't set `stroke` directly — icons inherit `currentColor` from the
  surrounding element's CSS `color`, so hover/state colors are styled on
  the parent as usual.

## Local Development

```bash
npm run dev        # generate the docker .htaccess overlay, then bring the stack up
npm run smoke       # HTTP smoke checks against the running stack (11 checks)
npm run dev:down    # stop
```

**Never `docker compose up` directly.** `npm run dev` first runs
`node tools/build-overlays.mjs docker`, which generates
`dist/overlay/docker/.htaccess` (the Laravel dispatch block merged onto
`app/.htaccess`) — and removes any stale `dist/overlay/docker/` left over from
a previous bad run before regenerating it. `docker-compose.yml` bind-mounts
that one file into the `web` container; if it doesn't exist yet, Docker
creates a **directory** in its place, and `web` then refuses to start at all
("error mounting ... not a directory: are you trying to mount a directory
onto a file?"). The site is simply down — not silently missing rules — until
`npm run dev` is run again to regenerate the file and remove the bogus
directory.

| URL | What |
| --- | --- |
| http://localhost:8090 | the site — **both** the old app and the Laravel API |
| http://localhost:8091 | Adminer |
| http://localhost:8025 | Mailpit |
| `localhost:3307` | MariaDB |

`:8092` is gone — there is no separate port for the Laravel API any more.

**One origin, one web server, matching production.** The `web` container runs
Apache with PHP as **FastCGI** (`php:8.4-fpm` + `mod_proxy_fcgi`), serving a
document root shaped exactly like the deployed `dist/build/` artifact
(`index.php`, `src/`, `pages/`, `partials/`, `templates/`, `assets/` all
bind-mounted from `app/` at the document root), with sources bind-mounted in so
PHP edits are live with no rebuild. `/api/*` and `/sanctum/*` are dispatched by
`.htaccess` into the Laravel app, bind-mounted from `api/` at `api-laravel/`.
The hyphen in that name is load-bearing rather than decorative — see the
`app/.htaccess` note in the Tech Stack above and the rationale in
`tools/build.mjs`.

The stack has six services; five stay running and one is a one-shot.
`docker compose ps --services` lists `adminer`, `assets`, `db`, `mailpit`,
`web`; `deps` installs both projects' Composer deps into the `vendor` and
`api_vendor` volumes and then exits (`docker compose ps -a` shows it
`Exited (0)`) — `web` waits on it via `service_completed_successfully`. No
host-side `vendor/` and no manual composer step are needed; changing a
dependency is picked up on the next `up`. `web` also waits on `db` being
healthy — that healthcheck pings `-h 127.0.0.1`, not `localhost`, because the
unix-socket path falsely reports healthy against MariaDB's temporary
`--skip-networking` init server before TCP and the schema are actually ready
— and on `assets`/`mailpit` having started.

**Migrations run from the `web` entrypoint.** Laravel's are the only ones
left, so the entrypoint runs `php api-laravel/artisan migrate --force` —
wrapped in a retry, because `artisan` has no connection retry of its own and
the database may still be cold — before Apache accepts its first request. It
then `chown`s Laravel's `storage/`/`bootstrap/cache` back to `www-data` (the
`artisan` call ran as root), starts `php-fpm`, and finally `exec`s Apache in
the foreground. On a real server there is no entrypoint: the deploy's
`npm run dbmigrate:<env>` step triggers the same migrations over HTTP, and
nothing runs them automatically (see Automated DB migrations above).

**Laravel API (`api/`) in Docker:** Laravel runs inside the same `web`
container as the old app, under the same Apache and the same PHP-FPM pool,
reached at `http://localhost:8090/api/*` and `/sanctum/*` — there is no
separate service or port any more. Its configuration is a real mounted `.env`
(`docker/api/env.docker` -> `api-laravel/.env`, read-only) rather than a
compose `environment:` block — `web` has no `environment:` block at all,
deliberately: Laravel's `Dotenv` never overwrites a variable already present
in the process environment, so a compose key would silently shadow the
corresponding `.env` line and turn it into dead config. It shares the **same
`lescanetons` database as the old app** (no separate DB), and now owns its
schema outright. Its migrations are still written *guarded* — they adopt the
tables `docker/db/init/01-schema.sql` seeds rather than assuming an empty
database, and create Laravel's own (`sessions`, `cache`, `migrations`, …)
alongside them — so re-running them on a live server never drops or reseeds
data. Keep new ones that way; the same files run against TEST, QA and PROD.
All of `api/`'s generated artifacts (`vendor/`, `storage/` caches,
`bootstrap/cache`, `.env`) stay in the `api_vendor` volume or gitignored
paths — never the tracked tree. (The Laravel *test* suite still uses its own
throwaway `laravel_api_test` database — see `api/phpunit.xml` — because
`RefreshDatabase` drops every table, which must never touch a shared DB.)

Seeded test logins (all passwords `demo`, synthetic data only):
- `demo.admin` — admin (manage events, view summaries)
- `demo.moderator` — moderator (respond)
- `demo.user` — user (respond)

## Development Commands

PHP and Composer normally run in Docker (`php:8.4-cli` / `composer:2`) via
wrappers in `tools/`. First-time setup: `npm install` then `npm run php:install`.

```bash
npm run php:install   # install PHP dev deps into vendor/ (Dockerized Composer; run once)
npm run check         # all checks: php -l + phpcs (Docker), eslint, stylelint, prettier, secret guard
npm run fix           # auto-fix: phpcbf (Docker) + eslint + stylelint + prettier
npm run lint:php      # old app only (php -l sweep + phpcs, Dockerized)
npm run lint:api      # Laravel only (Pint, --test)
npm run test:php      # old app's PHPUnit — tests/Unit against app/src/**
```

**`npm run check` does not run the Laravel suite.** It needs a live database,
so it runs inside the stack instead:

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```

That suite uses `RefreshDatabase` against its own throwaway `laravel_api_test`
database (`api/phpunit.xml`) — never the shared `lescanetons`, which it would
otherwise drop every table of.

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
`npm run fix`, and `npm run test:php` all work unchanged. The old app's suite
is now `tests/Unit` only — its DB-integration tests moved to Laravel with the
endpoints they covered, so nothing there needs a database. (`ensure-dev-stack`
still creates a `lescanetons_test` database; it currently has no user.) Local
Docker Compose dev is unaffected.

**The Laravel suite does not run in a web session** — it needs the stack's
`php artisan test`. Run it locally in Docker before claiming API work is done.

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

## Language

- **Everything is written in English** — specs and plans (`docs/`), code, comments,
  DB table/column names, enum/stored values, identifiers, slugs, and file names.
- **API JSON response bodies are English** — every Laravel error response's
  `error` message, `code`, and `fields[].field`/`fields[].reason` are English
  identifiers/text (e.g. `{"error":"Invalid form submission","code":"validation_failed",
  "fields":[{"field":"date","reason":"required"}]}`). Nothing here is user-facing
  directly — translation to French happens exclusively at the JS display layer, via
  `app/assets/js/i18n.js`'s `translateApiError()` (i18next). `POST /api/migrate` is
  the one exception: a token-gated deploy-tooling endpoint, never seen by an end user.
- **French is used for ONE thing only: user-visible UI text** (HTML labels, page copy,
  buttons, on-screen event titles/descriptions) — rendered page-level text, not API
  response bodies.
- The existing codebase already follows this: `contact_messages` uses
  `first_name`/`last_name` columns and `responses.answer` uses English enum values
  (`participate`/`notparticipate`), while page labels are French. Match that pattern.

## Dos

- Edit `app/` source in place; run `npm run build` before every FTP deploy.
- Match production versions (PHP 8.4, MariaDB 10.3).
- Run `npm run check` before pushing.
- Put new tooling/config at the repo root, never in `app/`.
- Add a new **page** route in `app/src/routes.php`, and a new **API** route in
  `api/routes/api.php`. Never the other way round: an `/api/*` entry in the old
  table is unreachable, since Apache dispatches those before the front
  controller runs.
- Call `/api/*` from the browser through `apiFetch` (`app/assets/js/api.js`),
  never a bare `fetch`.

## Don'ts

- Never commit `app/config.php`, `dist/build/`, or any production data / DB dump.
- Never hand-edit `dist/build/` — it's fully regenerated by `npm run build`.
- Never store real member data or passwords in seed files.
