# Design — whole-site React SPA cutover (sub-projects 3 + 4, combined)

**Date:** 2026-07-27
**Supersedes:** the sub-project 3 / sub-project 4 split described in
`docs/superpowers/specs/2026-07-23-laravel-api-foundation-design.md` (§Context)
and `docs/superpowers/specs/2026-07-25-api-cutover-laravel-design.md`
(§Non-goals). Sub-project 4 was left "undecided"; this design resolves it by
merging it into 3.

## Context

The backend migration is done: all of `/api/*` and `/sanctum/*` is served by
Laravel 13 in `api/` (deployed as `api-laravel/`), Sanctum owns authentication,
and `app/api/` no longer exists. That cutover is **verified on TEST only** —
QA and PROD still run the pre-cutover artifact.

What remains is the front end. Today it is 19 PHP pages under `app/pages/`
(827 lines), 1,305 lines of vanilla JS under `app/assets/js/`, Bulma, a partial
Twig layout, and a Vite build with one entry per page. Page gating still runs
on `$_SESSION`, kept alive by a deliberately temporary session bridge in
Laravel's `AuthController` whose own comment says it must be deleted in one
commit by this sub-project.

## Goals

Replace the entire front end with one React + TypeScript single-page
application, styled with Tailwind at visual parity, talking to the existing
Laravel API through a generated client. Delete the old PHP application in full,
including `$_SESSION` gating and the session bridge.

## Non-goals

- **No visual redesign.** Every page reproduces today's appearance as closely
  as practical. A refresh is a separate, later decision.
- **No URL changes.** The French route names stay exactly as they are.
- **No prerendering or SSR.** See the rendering decision below.
- **No new features.** Nothing gains behavior it does not have today, with one
  exception: `MENU_INFO` becomes API-supplied rather than PHP-rendered, because
  it has to come from somewhere (§3).
- **No QA/PROD promotion of the backend before this lands** — see §13.

## Guiding principles

1. **Parity is the contract.** Anything a PHP page renders server-side today
   must have a named source in the new architecture. §3 is the inventory, and
   it is exhaustive by construction.
2. **The server stays the authority.** Client-side route guards and feature
   gates are UX. Laravel's capability and feature middleware remain the only
   things that actually enforce anything.
3. **Identical bytes across environments.** TEST/QA/PROD run the same promoted
   artifact, so no environment-specific value may be baked into the bundle.
   This single constraint decides §3.
4. **Don't carry the old app forward** — inherited from the API cutover. Shims
   and back-compat paths are deleted, not ported.

## Decisions

| Decision | Chosen | Rejected alternative |
| --- | --- | --- |
| Scope | Whole site: sub-projects 3 + 4 in one go | Members' area only; public pages first |
| Rendering | Pure client-side SPA | Build-time prerender (SSG); PHP/Twig shell per route |
| Styling | Tailwind at visual parity | Tailwind + redesign; keep Bulma |
| Delivery | Big-bang cutover, one PR | Incremental route allowlist; two cutovers |
| Old PHP app | Deleted entirely | Keep a minimal PHP shell |
| Language | TypeScript | Plain JS + JSX; TS for the API layer only |
| Data layer | TanStack Query | Hand-rolled fetch state; TanStack Router + RHF + zod |
| Frontend config | Runtime `GET /api/config` | Build-time `import.meta.env` |
| API client | Fully generated: OpenAPI → orval (client + Query hooks) | Generated types + hand-written client; fully hand-written |
| `/events` writes | Move to `/events/{id}` path params | Keep the id in the query string |
| Unknown URLs | Accept a soft 404 (200 + SPA 404 view) | Enumerate every route in `.htaccess` |
| Deploy pre-flight | Repoint the shape check at `.env` | Drop the check |
| Local dev | Vite dev server proxying `/api` + `/sanctum` | Apache serves the built files only |
| Testing | Vitest + RTL, plus Playwright E2E smoke | Unit only; types + API tests only |
| Rollout | Ship backend + frontend to QA/PROD together | Promote the backend to PROD first |

## 1. End state

The deployed document root contains exactly:

```
index.html              the SPA shell (Vite output)
assets/                 hashed JS/CSS, plus img/ and icons/ verbatim
api-laravel/            the Laravel API (unchanged by this sub-project)
.htaccess               server-owned, from dist/overlay/<env>/
robots.txt              server-owned; PROD serves none
deployment.json         written by the deploy CLI
.sync-state.json        written by the deploy CLI
```

No PHP outside `api-laravel/`. `app/` is deleted in full: `index.php`,
`src/routes.php`, `pages/`, `partials/`, `templates/`, `assets/`, and the
`App\` classes (`Auth`, `Env`, `Features`, `Assets`, `View`, `Db`,
`AutoMigrator`, the remaining repositories and DTOs) — see §11.

## 2. Repo layout, build, deploy

A new top-level `web/` holds the SPA source. All tooling stays at the repo
root, as the project requires: one `package.json`, one `vite.config.ts`
(`root: 'web'`, `base: '/'`), `tailwind.config.ts`, `tsconfig.json`,
`orval.config.ts`.

```
web/
  index.html            the single shell document
  public/assets/img/    images, emitted verbatim -> /assets/img/*
  public/assets/icons/  favicons + PWA manifest.json -> /assets/icons/*
  src/
    main.tsx            boot: config + session gate, then the router
    routes.tsx          the route table (§5)
    api/               generated client + hooks, and the mutator (§4)
    components/        shared UI (layout, nav, footer, env ribbon, guards)
    pages/             one component per route
    i18n/              i18next setup + the API error vocabulary (§8)
```

**Images and icons keep their current URLs.** Vite copies `public/` verbatim,
so `/assets/img/*` and `/assets/icons/*` resolve exactly as today. That also
keeps the existing `.htaccess` `!^/assets/` bypass and its cache headers
working untouched, and keeps the PWA manifest link — which must retain
`crossorigin="use-credentials"`, without which the manifest fetch fails behind
TEST/QA Basic Auth (a previously fixed bug).

**Build order matters.** `tools/build.mjs` currently runs Vite, copies `app/`,
then builds Laravel into `dist/build/api-laravel/`. It becomes: Vite builds
`web/` **into `dist/build/` with `emptyOutDir: true`**, *then* Laravel is
copied in, *then* the deployment marker is written. Reversing those two steps
would have Vite wipe `api-laravel/` after it was populated — a silent,
total-outage bug, so the order carries a comment saying why.

`config/config.example.php` stops being shipped, because it stops existing
(§11).

## 3. Runtime configuration — `GET /api/config`

**Build-time configuration is ruled out by the promotion model.** Values baked
in by `import.meta.env` would require one build per environment, which breaks
"TEST/QA/PROD run identical promoted bytes". Configuration therefore arrives at
runtime, from a new public endpoint.

```
GET /api/config           (public, unauthenticated, Cache-Control: no-store)

{ "env": "test",
  "features": { "souper_signup": true },
  "occasion": { "title": "...", "subtitle": "...", "date": "2027-11-13",
                "date_display": "13 novembre 2027", "teaser": "...",
                "invitation": "...", "max_guests": 30,
                "menus": [ { "value": "meat", "label": "Viande",
                             "description": "...", "price": 45 } ] } }
```

### Parity inventory

Every server-rendered value in the old app, and its new source:

| Rendered server-side today | New source |
| --- | --- |
| Env ribbon (`App\Env` ← `config.php['env']`) | `/api/config` → `env` (from `APP_ENV`) |
| `souper_signup` route + popup gating (`App\Features`) | `/api/config` → `features.souper_signup` |
| Occasion copy on 9 pages (`SignupRepository::OCCASIONS`) | `/api/config` → `occasion` (from `App\Support\Occasion`) |
| Menu labels / values / max guests | same `occasion` payload |
| Per-menu description + price (`SignupRepository::MENU_INFO`) | added to `Occasion`, same payload |
| Session role (`Auth::role()` → `window.__sessionRole`) | `GET /api/user` |
| Asset URLs (`App\Assets` + Vite `manifest.json`) | Vite's emitted `index.html` |
| Per-page `<title>` | a per-route title effect in the SPA |

`api/.env.example` is already a superset of `config.php`: `APP_ENV`, `DB_*`,
`MAIL_*`, `MIGRATE_TOKEN`, `ALTCHA_HMAC_SECRET`, `SOUPER_SIGNUP_ENABLED` are
all there. Deleting `config.php` loses no configuration.

### This retires a documented duplication

`App\Support\Occasion`'s docblock states it is "a deliberate parallel copy" of
`SignupRepository`'s constants that "MUST be kept in step" until "a later
sub-project retires them". This is that sub-project: `SignupRepository` is
deleted and `Occasion` becomes the single source of truth, gaining `MENU_INFO`
(description + price per menu) on the way, since the form needs it and PHP will
no longer be there to render it.

### Semantics carried over deliberately

- **`occasion` is `null` when the flag is off.** A server with the feature
  disabled leaks no copy about an unannounced event — matching today, where
  those routes simply do not exist.
- **Fail-safe defaults mirror `App\Env` / `App\Features`.** Unknown or missing
  env → `prod` (no ribbon); missing flag → `false`. A failed config fetch
  therefore degrades to "prod, features off", so it can never paint a staging
  ribbon on the live site or reveal a disabled feature.
- **`Cache-Control: no-store`**, so flipping a server-side flag takes effect on
  the next page load, exactly as re-reading `config.php` does today.
- **Boot is one gate, two parallel requests:** `/api/config` and `/api/user`.
  The router renders after both settle; a minimal skeleton shows meanwhile.
- **An explicit allowlist, never a `config()` spread.** Secrets (`DB_*`,
  `MAIL_*`, `ALTCHA_HMAC_SECRET`, `MIGRATE_TOKEN`) must never appear.

Two tests earn their keep: the response body contains *only* allowlisted keys
(a leak guard against future additions), and an unknown `APP_ENV` collapses to
`prod`.

## 4. API client — generated

`api/` gains an OpenAPI export; `web/` generates its client from it.

1. **Laravel → OpenAPI.** An annotation-free generator (`dedoc/scramble` is the
   candidate; **its Laravel 13 compatibility is verified during planning, not
   assumed** — if it does not support 13 yet, the fallback is a hand-maintained
   `api/openapi.yaml` kept honest by the same drift check) exports
   `api/openapi.json`, committed.
2. **OpenAPI → TypeScript.** `orval` generates the client *and* the TanStack
   Query hooks into `web/src/api/generated/`, committed.
3. **Drift check in CI.** Regenerate both artifacts and `git diff --exit-code`.
   A controller change that alters a response shape fails the build until the
   client is regenerated.

**The three repo-specific quirks live in one custom mutator**
(`web/src/api/http.ts`), which is orval's designed extension point, so no
generated file is hand-edited:

- `credentials: 'include'` on every request.
- `GET /sanctum/csrf-cookie` primed before the first mutating request, so no
  call site has to remember it (its absence is a 419).
- **Error normalization.** The `{error, code, fields[{field, reason, params}]}`
  contract is produced by an exception renderer in `bootstrap/app.php` and is
  invisible to any OpenAPI generator. The mutator throws a typed `ApiError`
  carrying `code` and `fields`, and orval is configured to use it as the error
  type, so every hook surfaces it uniformly.

**`/events` writes move to path parameters.** `PUT`/`DELETE /events` take the
id in the query string today for exactly one reason: `planning_repet.js` sent
it that way. That file is being deleted, so the endpoints become
`PUT /events/{id}` and `DELETE /events/{id}`, and the comments in
`api/routes/api.php` explaining the query-string shape are updated. The
`manage_events` middleware and the deliberate absence of any user-naming
parameter on `/responses` (which is what keeps a previously fixed IDOR closed)
are unchanged.

## 5. Routing and `.htaccess`

React Router registers today's URL set unchanged: `/`, `/historique`,
`/canetons`, `/cd`, `/commencement`, `/moniteurs`, `/sponsors`, `/multimedia`,
`/contact`, `/comite_teamdirection`, `/authentification_inscription`,
`/sinscrire`, `/confirmation`, `/inscriptions_utilisateurs`, `/planning_repet`,
`/admin`, `/inscriptions_admin`, plus `/signup`, `/signup_thanks` and
`/signups_admin` when `features.souper_signup` is on.

Three changes to the site `.htaccess`, each guarding a documented failure mode:

1. **The fallback becomes `RewriteRule ^ index.html [L]` and keeps
   `RewriteCond %{ENV:REDIRECT_STATUS} ^$`.** Without that guard the internal
   redirect to `/index.html` re-matches the catch-all and loops until Apache
   aborts with 500 — on every URL of the site. This is the same FastCGI failure
   the current `index.php` rule documents. `!^/assets/` stays, so hashed
   bundles and images are served directly. The rule stays a **catch-all rather
   than an `!-f`/`!-d` guard**, because that is what keeps `api-laravel/.env`
   and `api-laravel/vendor/` unreachable — an unchanged, load-bearing property.
   `[L]`, not `[END]`, for the reason already recorded in the file: the host's
   Apache version is unresolved and an unknown flag 500s the whole site.
2. **`RedirectMatch 301 ^(.*)\.html$ $1.php` is deleted.** Left in place it
   would 301 our own `/index.html` to a `/index.php` that no longer exists. It
   is replaced by legacy-URL 301s to *clean* URLs for both `.php` and `.html`,
   with `index.html` excluded by negative lookahead, plus the
   `/index.php` + `/accueil.php` + `/accueil.html` → `/` special case. These
   301s exist today, generated in `src/routes.php`; this is a move, not new
   behavior. They must sit above the fallback.
3. **The cache block is unchanged.** `<FilesMatch "\.html$">` already sets
   `max-age=0, must-revalidate` (correct for `index.html`) and `.css|.js` are
   already `immutable` (correct for content-hashed output).

**The template moves.** `tools/build-overlays.mjs` reads `app/.htaccess`, which
is disappearing, so the tracked template becomes
`config/htaccess/site.htaccess` and the tool is repointed. There is no
`app/robots.txt` today, so PROD continues to serve none. The
`staging/{test,qa}/.htaccess` Basic Auth blocks are untouched, as is the docker
overlay path — which matters, because a stale or missing
`dist/overlay/docker/.htaccess` takes the local stack down outright rather than
degrading.

**Unknown URLs become soft 404s.** Today the front controller answers with a
real `404` and a styled Twig page. Under a catch-all they return `200` and the
SPA renders its own 404 view — same visible page, different status. Accepted
deliberately: the alternative duplicates the route list into `.htaccess`, where
it would drift.

**CSR mitigations.** Since there is no prerender, the SPA sets a per-route
`<title>` and description/OG tags on navigation, ships a `<noscript>` block in
`index.html` naming the band and linking `/contact`, and a static
`sitemap.xml` lists the public routes.

## 6. Auth and session

Sanctum's cookie session is already the source of truth, so this section is
mostly deletion.

- Boot's `GET /api/user` returns the user or 401 → anonymous.
- `/authentification_inscription` becomes a React route: `GET
  /sanctum/csrf-cookie` then `POST /api/login`, both via the mutator.
- **Guards mirror the capability matrix as a non-hierarchy.**
  `<RequireCapability cap="view_summary">` refuses `user` and `moderator`;
  `respond` refuses `admin`. Identical to the middleware, and equally
  deliberate.
- Any mid-session 401 clears the TanStack Query cache and redirects to the
  login route.
- **The `returnTo` invariant is preserved.** The server-side open-redirect fix
  becomes a client-side rule: accept only a path beginning with a single `/`,
  rejecting `//evil.com` and absolute URLs. It gets a unit test, not a comment.
- **The session bridge is deleted in one commit**, as its own comment
  instructs, together with `App\Auth`. `SESSION_DRIVER=database` stays — that
  is Sanctum's own store, not the bridge.

`admin.php`'s native `<form method="post">` posting to page routes is what
forced `$pageMethods = ['GET', 'POST']` in the old route table. Those become
API calls, so the quirk disappears rather than being ported.

## 7. Styling — Tailwind at parity

Tailwind replaces Bulma and the per-page CSS entries. Each page is rebuilt to
match its current appearance: same layout, colors, duck accent, and Lucide
icons via `lucide-react`.

The two conventions in `main.css` that carry design decisions are translated,
not dropped:

- **The icon size scale** (`icon-xs` … `icon-xl`) and the orientation classes
  (`icon-block`, `icon-inline`) become Tailwind component classes with the same
  names and the same values. The project rule stands: pick one size and one
  orientation class, never a per-spot descendant selector or an arbitrary
  value, and never override `fill` or `stroke` (icons inherit `currentColor`).
- **The env ribbon** becomes a component reading `env` from config context.

Bulma, the per-page CSS entry files, and `App\Assets`' manifest reading all go
away with `app/assets/`.

## 8. i18n

French UI text lives inline in the components. The site is monolingual, so a
translation catalog would be machinery with no second consumer — and the
project rule (English API bodies, French only at the display layer) is
satisfied either way.

i18next keeps its one existing job: `translateApiError()`'s vocabulary of
`code`, `reason` and `field` tokens. **The token-parity test survives the
rewrite** — every `reason`/`field` the API can emit must exist as a key,
because a mismatch degrades silently to "Une erreur est survenue" and nobody
notices.

## 9. Local development

`npm run dev` keeps bringing up the Docker stack (Apache + PHP-FPM + Laravel +
MariaDB + Mailpit + Adminer), and additionally runs the **Vite dev server**,
which proxies `/api` and `/sanctum` to the `web` container. The browser sees a
single origin, so Sanctum's SPA cookie flow works unchanged; the dev origin is
added to `SANCTUM_STATEFUL_DOMAINS` in `docker/api/env.docker` **only**, never
in a shipped default.

The Apache-served build stays available (`npm run build` + the stack) for
parity checks and for the `npm run smoke` HTTP checks, which are updated: the
old checks assert PHP-rendered page markup, and must now assert the shell plus
the API endpoints.

**`docker-compose.yml` needs real rework, not a path swap.** Today the `web`
container's document root is assembled from bind mounts of `app/index.php`,
`app/src/`, `app/pages/`, `app/partials/`, `app/templates/`, `app/assets/` and
`api/`. Every mount but the last one disappears. The document root becomes the
SPA build output plus `api-laravel/`, and the `assets` service changes job from
build-watcher to **Vite dev server** with the proxy above. The image's
`/srv/app/src -> /var/www/html/src` symlink, which existed so the entrypoint
could reach the old app's migrator, becomes dead and is removed — the old
`sql/migrations` system and its ledger table are already retired.

The one-shot `deps` service, the `db` healthcheck, and the entrypoint's
`artisan migrate` step stay as they are.

## 10. Testing

- **Vitest + React Testing Library** for the guards, the `returnTo` rule, the
  forms and their field-level API errors, the data pages' loading/empty/error
  states, and the config fail-safe defaults.
- **Playwright E2E smoke tests** for the flows whose wiring unit tests cannot
  reach: login → RSVP on `/inscriptions_utilisateurs`, admin creates an event
  on `/planning_repet`, and the public signup with its Altcha proof-of-work.
  They run against the **local Docker stack**, not TEST — TEST is behind Basic
  Auth, and pointing E2E at a shared environment makes it flaky and
  destructive.
- **Laravel's PHPUnit suite** keeps covering the API and gains: the
  `/api/config` shape, its allowlist leak guard, the `APP_ENV` collapse, and
  the `/events/{id}` route change.
- **Visual parity is checked manually, page by page, on TEST**, against the
  live site as each page is built.
- CI gains the Vitest and Playwright jobs and the OpenAPI/client drift check;
  it loses the old app's PHPUnit and phpcs scope (§12).

## 11. Deletion inventory

Deleted outright:

- `app/` in its entirety. `app/src/` is down to nine files, and every one of
  them goes: `Assets.php`, `Auth.php`, `Database.php`, `Env.php`,
  `Features.php`, `View.php`, `Repositories/SignupRepository.php`,
  `bootstrap.php`, `routes.php` — plus `index.php`, `pages/`, `partials/`,
  `templates/`, `assets/`, and `.htaccess` (moved, see §5).
- **The root Composer project**, which exists solely for `app/`: `composer.json`
  and `composer.lock` (only `phpunit/phpunit ^10.5` and
  `squizlabs/php_codesniffer ^3.10`), `vendor/`, and `phpcs.xml` (whose
  `<file>` scope is literally `app`). No PHP remains in the root tree, and
  `api/` has its own Composer project, PHPUnit 12 and Pint.
- The `app/`-only PHP tooling wrappers: `tools/php-lint.mjs`,
  `tools/php-lint-file.mjs`, `tools/php-fix.mjs`, and the `php:install` script.
  `tools/composer.mjs`, `tools/php-in-docker.mjs`, `tools/pint.mjs` and
  `tools/pint-file.mjs` stay — `api/` still needs them.
- `config/config.example.php` and `config/config.docker.php`.
- Laravel's session bridge in `AuthController` (§6).
- `app/assets/js/api.test.mjs`, which `test:js` currently globs, and the old
  Vite per-page entry convention in `vite.config.js`.

Left in place on servers: a now-dead `config.php`, which the deploy CLI never
deletes because protected basenames are never touched. It is unreachable (the
catch-all rewrites it to `index.html`), but it holds DB credentials and should
be deleted by hand once per server.

## 12. Tooling impact

- **The deploy pre-flight is repointed.** The config-shape check currently
  parses the server's `config.php` against `config.example.php`. It becomes a
  dotenv key-set diff of the server's `api-laravel/.env` against
  `api/.env.example` — simpler than the AST walk it replaces, and it closes the
  gap that has been deferred twice. Values are still never read or logged;
  `api-laravel/.env` is already a protected, never-uploaded basename.
- **`npm run check` is rewired script by script**, since every JS/CSS/PHP script
  currently points at `app/`:

  | Script | Today | After |
  | --- | --- | --- |
  | `lint:php` | `php -l` sweep + phpcs over `app/` | **deleted** — `lint:api` (Pint) already covers the only PHP left |
  | `test:php` | root PHPUnit over `app/src` tests | `api/`'s own PHPUnit suite |
  | `test:js` | includes `app/assets/js/*.test.mjs` | `tools/` tests only, plus Vitest |
  | `lint:js` | `eslint app/assets/js` | `eslint web` with `typescript-eslint` |
  | `lint:css` | `stylelint app/assets/css/**` | `stylelint web/src/**/*.css` |
  | `format:check` | `prettier app/assets/**` | `prettier web/**` |
  | `build:assets` | per-page Vite entries | the single SPA build |
  | `php:install` | root Composer install | **deleted** (§11) |
  | `lint:api`, `guard` | — | unchanged |

  It also gains `tsc --noEmit`, Vitest and Playwright.
- **`tools/ensure-dev-stack.mjs` must be repointed.** It writes `app/config.php`
  pointing at `127.0.0.1` for Docker-free web sessions; with `config.php` gone it
  must write `api/.env` instead. Overlooking this silently breaks web-session
  development, which is the environment least likely to be exercised first.
- `tools/phpunit-summary.mjs` is repointed at `api/`'s suite for CI reporting.
- Husky and lint-staged: the `app/` PHP hunks (`php-lint-file`, `php-fix`) drop
  out; `.ts`/`.tsx` are added to Prettier and ESLint.
- The deploy CLI, sync-state, mass-delete brake and migration trigger are
  **unchanged** — the artifact's shape changes, not the mechanism. The brake
  deserves attention on the first deploy, though: this cutover deletes a large
  fraction of the remote tree, so the first real deploy needs a `--dry-run`
  review and will likely need `--force-delete`.

## 13. Rollout and verification

The backend is on TEST only, and by decision the backend and frontend are
promoted **together**:

1. Build and verify the whole SPA on TEST, page by page, against the current
   PROD site.
2. Verify the API contract end to end on TEST: login, RSVP, event CRUD, both
   admin summaries, the xlsx export, contact, and signup with Altcha.
3. Tag a candidate, promote to QA, and re-run the same checks there.
4. Promote the same tag to PROD (`deploy-prod.yml` refuses anything QA has not
   already run).
5. On each server, once: confirm `.env` is complete (the pre-flight now
   enforces this), place the new `.htaccess` from `dist/overlay/<env>/`, and
   delete the dead `config.php`.

**The `.htaccess` swap is the single highest-risk step**, because a mistake
there is a site-wide 500 rather than a broken page. It is placed by hand, per
server, and verified immediately by loading `/` and `/api/config`.

Rollback is unchanged in mechanism — redeploy an older tag — but it acquires a
manual step: an older tag expects the old `.htaccess`, so rolling back means
restoring that file by hand as well. **This is rehearsed on TEST before PROD is
promoted**, as a required step, not a documented intention: roll TEST back to a
pre-cutover tag, restore its `.htaccess`, confirm the old site serves, then roll
forward again. The exact sequence that worked is written into
`staging/README.md`. A procedure first attempted during an outage is not a
procedure.

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| `.htaccess` fallback loops → site-wide 500 | Keep the `REDIRECT_STATUS` guard; verify on TEST and QA before PROD; the rule ships via the overlay, reviewed as a diff |
| Big-bang PR is too large to review honestly | Ordered, self-contained commits (§15); parity checked per page, not per PR |
| A page's behavior is silently dropped in the rewrite | The §3 parity inventory is the checklist; each page's port is reviewed against the live page |
| Scramble lacks Laravel 13 support | Verified during planning, before any code; documented fallback is a hand-maintained spec under the same drift check |
| Generated client fights the CSRF/error quirks | All three are confined to the mutator, which is orval's supported extension point |
| Soft 404s harm SEO | Accepted; public routes are listed in `sitemap.xml`, and the 404 view is `noindex` |
| Mass-delete brake blocks the first deploy | Expected: `--dry-run` first, then `--force-delete` after reviewing the plan |

## 15. Work breakdown

**One PR, reviewed commit by commit.** The commits below are ordered so each one
is self-contained and independently reviewable, which is what makes a diff this
large honestly reviewable: the reviewer walks the commits, not the combined
diff. So no commit may leave the tree in a state that does not build, and none
may mix a mechanical move with a behavioral change.

1. Toolchain: TypeScript, React, Tailwind, Vitest, Playwright, `orval` config;
   `vite.config.ts` with `root: 'web'`.
2. Laravel: `GET /api/config` with its allowlist and tests; `Occasion` gains
   `MENU_INFO`; `/events/{id}` path params.
3. OpenAPI export + generated client + the mutator + the CI drift check.
4. App shell: boot gate, router, layout, nav, footer, env ribbon, guards, i18n.
5. Public pages (13), Tailwind at parity.
6. Members' area: planning, RSVP, both admin summaries, signup + Altcha.
7. Local stack: `docker-compose.yml` document root, the Vite dev server service,
   the dead symlink, `ensure-dev-stack` writing `api/.env`, `npm run smoke`.
8. Deletion: `app/`, the root Composer project and `phpcs.xml`, the session
   bridge, `config.example.php`/`config.docker.php`, the `app/` tooling
   wrappers, old tests.
9. Infrastructure: `.htaccess` template move + new rules, `build.mjs`,
   `build-overlays.mjs`, deploy pre-flight repoint, the rewired `npm run check`,
   CI jobs.
10. Docs: `CLAUDE.md`, `staging/README.md`, `README.md`.

Order matters in one place: the local stack (7) comes before the deletion (8),
so there is a working environment to verify each page in while `app/` still
exists as a reference to compare against.
