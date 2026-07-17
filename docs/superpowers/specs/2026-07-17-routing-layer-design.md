# Routing Layer: Single Front Controller + Clean URLs — Design

**Date:** 2026-07-17
**Status:** Approved (pending spec review)
**Scope:** GitHub issue #2. Phase 0 (Foundations), roadmap item 1 of
`docs/superpowers/specs/2026-07-16-2026-modernization-roadmap-design.md`. Introduces
a router, a single front controller, clean URLs with 301 redirects from old paths,
PSR-4 autoloading for application classes, and — expanding the issue's original
scope — a real build step that assembles the FTP deploy payload. No visual,
content, or Twig/templating changes.

## 1. Context

Today the site is one PHP file per URL under `code/` (`code/accueil.php` is served
as `/index.php`, `code/historique.php` as `/historique.php`, etc.), each manually
`require`-ing `partials/head.php` → `code/src/bootstrap.php`. There is no router:
URLs are literal filenames. `code/` is deployed byte-for-byte via manual FTP — the
prior project-setup design (`2026-07-16-project-setup-and-tooling-design.md` §4)
established `code/` as "the exact FTP payload, nothing else," explicitly ruling out
a build step ("buildless site — no dist").

This design **revises that invariant**. Discussed and settled during brainstorming:
"buildless" was a reasonable starting point but is no longer the constraint we
want — a real build step that assembles a clean deploy artifact is the more
maintainable path, especially since Phase 0 item 3 (JS/CSS build pipeline) was
always going to need one. Rather than introduce a build step twice, this issue
introduces it once, now, as part of adding the router's runtime Composer
dependency.

## 2. Goals / Non-Goals

**Goals**

1. A router (`nikic/fast-route`) and single front controller dispatching all page
   and API requests.
2. Clean URLs (`/historique` instead of `/historique.php`); old `.php` URLs
   (pages **and** API endpoints) 301-redirect to their new clean path.
3. Real PSR-4 autoloading for application classes (`Auth`, `Database`,
   repositories) under an `App\` namespace — replaces the manual `require` list in
   `bootstrap.php`.
4. A build step (`npm run build`) that assembles a complete, ready-to-FTP-upload
   `public/` directory from source, including a production-only Composer
   `vendor/`.
5. Local dev (Docker) and CI updated to match the new layout, without losing
   today's instant-edit dev loop (no rebuild needed per source change).
6. Existing `Auth`, `Database`, and repository *logic* unchanged — this is a
   plumbing/routing change, not a rewrite of working behavior.

**Non-Goals**

- No Twig / templating changes — pages keep their current `require`-based
  rendering. Twig conversion is the next roadmap issue and depends on this one.
- No visual, CSS, or content changes.
- No automated test suite (PHPUnit/Playwright is roadmap Phase 0 item 4, depends
  on this issue).
- No change to the deployment *mechanism* — deploy stays manual FTP; only what
  gets uploaded changes (`public/` instead of `code/`).
- No API behavior changes beyond their reachable path — endpoint logic in
  `app/api/*.php` is untouched.

## 3. Architecture & repo layout

`code/` is renamed to **`app/`** — the tracked application source, edited in
place exactly as today:

```
app/
  index.php            # NEW front controller (was: homepage content)
  pages/                # NEW home for the 17 former top-level page files
    accueil.php          # former code/index.php content
    historique.php
    ... (canetons, cd, commencement, moniteurs, sponsors, multimedia, contact,
         comite_teamdirection, authentification_inscription, sinscrire,
         confirmation, inscriptions_utilisateurs, planning_repet, admin,
         inscriptions_admin)
  api/                  # unchanged internals: contact.php, login.php, logout.php,
                         # events.php, responses.php
  src/                  # Auth, Database, repositories/ — now namespaced App\*
    bootstrap.php
    routes.php           # NEW: the route table (see §4)
  partials/             # unchanged: banner, footer, head, navigation
  assets/               # unchanged: css/js/img
  .htaccess             # updated: front-controller rewrite (see §4)
  config.php            # git-ignored, local-only (unchanged mechanism)
```

**`public/`** is new at the repo root — **git-ignored, fully generated**, never
hand-edited. It is the literal FTP payload: a copy of `app/` plus a
production-only `vendor/` (see §5). Nothing is uploaded that doesn't live inside
`public/`.

**Composer** stays a single root `composer.json` — one `require` block (php,
`nikic/fast-route`) and one `require-dev` block (phpcs), one lockfile.

**PSR-4 namespacing:** `app/src/` classes move under `App\` (`App\Auth`,
`App\Database`, `App\Repositories\UserRepository`, etc.), declared as
`"autoload": {"psr-4": {"App\\": "app/src/"}}`. Every call site that references
these classes today (`bootstrap.php`, all 5 `app/api/*.php` files, all 17 pages,
`partials/head.php`) gets a `use App\...;` import — a mechanical, one-line-per-file
change with no logic change. `bootstrap.php` drops its explicit `require` list in
favor of `require vendor/autoload.php` and just does DB-connect + session-start
wiring.

## 4. Routing & redirects

`app/index.php` is the single front controller: load the autoloader, run
`bootstrap.php` (DB connect, session start), dispatch via `nikic/fast-route`.
Route definitions live in one place, `app/src/routes.php`, as a table of
`[method, path, handler]`.

**Clean routes** — one pair per existing page/endpoint (17 pages + 5 API files):

- `GET /historique` → handler sets `$pageTitle`/`$pageCss`, then
  `require`s `app/pages/historique.php` unchanged.
- `GET|POST /api/events` → handler `require`s `app/api/events.php` unchanged
  (only the reachable path changes, not the endpoint's internals).

**Redirects for old URLs** — for every old path (`/historique.php`,
`/api/events.php`, ...), register a matching route whose handler issues
`header('Location: /historique', true, 301); exit;`. Defined in the same
`routes.php` table (the old path is just another row pointing at a "redirect to
X" handler) so the old→new mapping can't drift out of sync.

**`.htaccess`** (generated into `public/`) switches from today's direct
file-hosting to the standard front-controller rewrite: requests that aren't an
existing real file/directory (so `assets/css/*`, `assets/img/*`, etc. keep
serving directly) fall through to `index.php`. Adds a rule denying direct web
access to `/vendor/` and `config.php`, since they now physically sit inside the
web root.

**Frontend JS call sites**: `assets/js/*.js` `fetch()` calls move to the new
clean API paths (e.g. `fetch('api/events.php')` → `fetch('/api/events')`), since
the API is routed through the same dispatcher (in scope for this issue).

## 5. Build pipeline

New `npm run build` (Node, consistent with the existing `tools/*.mjs` wrapper
pattern):

1. `rm -rf public && mkdir -p public`
2. Copy `app/` → `public/` in full (pages, api, src, partials, assets,
   `.htaccess`; `app/config.php` included if present locally, for convenience).
3. `COMPOSER_VENDOR_DIR=public/vendor composer install --no-dev
   --optimize-autoloader --no-interaction` — installs *only* runtime deps
   (`nikic/fast-route`) straight into `public/vendor`, using the same
   `composer.json`/`composer.lock` as everything else, without touching the root
   dev `vendor/`. Composer's `COMPOSER_VENDOR_DIR` env var makes this a single
   command with no second `composer.json`.

`public/` is now a complete, ready-to-FTP-upload tree every time the build runs.
Deploy stays manual FTP — the script only assembles what to upload.

## 6. Local dev & CI

**Docker Compose**: keep mounting `./app` → `/var/www/html` for instant-edit dev
(no rebuild per change). Add a second mount of the root dev `vendor/` (populated
by the existing `npm run php:install`, which now also pulls in fast-route since
it's a real `require`) → `/var/www/html/vendor`. Local dev exercises the router
for real, without ever touching `public/`. `npm run build` only runs when
preparing an actual FTP deploy.

**CI** (`.github/workflows/ci.yml`): the `php -l`/phpcs sweep path updates from
`code` → `app`. Add a step that runs `npm run build` and fails the job if it
errors — a build-succeeds gate. (This is deliberately minimal; the real
PHPUnit/Playwright harness is roadmap Phase 0 item 4, a separate issue.)

## 7. Config handling & deploy runbook

`app/config.php` stays git-ignored, created locally via
`cp config/config.example.php app/config.php` (path updated from `code/` →
`app/`). Docker still bind-mounts `config/config.docker.php` over it for local
dev, unchanged mechanism.

For production: the build step copies `app/config.php` into `public/config.php`
*if present*, but the deploy runbook (updated in README/CLAUDE.md as part of this
issue) states explicitly: **when FTP-syncing `public/` to the server, do not
overwrite the server's existing `config.php`** — exclude it from the sync
selection, or maintain a separate local prod-values copy of `app/config.php` used
only when intentionally building for a from-scratch deploy. This is a
manual-process caveat, same category as "deploy is manual FTP" already is.

## 8. CLAUDE.md updates

This issue directly contradicts two existing CLAUDE.md statements, which must be
updated as part of this issue (not deferred to the Phase 6 docs issue, which
covers the *end-state* docs after all phases land):

- Tech Stack: "**buildless** — no framework, no bundler, no runtime dependencies"
  → no longer true; update to describe the `app/` → `public/` build step and the
  new runtime dependency (`nikic/fast-route`).
- Don'ts: "Never introduce a runtime build step or framework for the deployed
  site" → this line is superseded by this issue; remove or replace it.
- Architecture: "`code/` is the exact FTP payload" → becomes "`public/` is the
  generated FTP payload; `app/` is the tracked source."
- Architecture: "No autoloader: `src/` classes are wired via explicit `require`"
  → becomes "PSR-4 autoloaded under `App\`."

## 9. Testing / verification

No automated test framework is introduced here (see Non-Goals). Verification for
this issue is manual: run `npm run build`, serve `public/` (via Docker or a local
PHP server), and click through all 17 pages — including confirming old `.php`
URLs 301-redirect to their clean equivalents — plus the login, RSVP, and admin
API flows, confirming `assets/js/*.js` calls hit the new `/api/...` paths
successfully.

## 10. Follow-ups (out of scope here)

1. Twig templating (next roadmap issue) converts `partials/*.php` and page
   bodies into real templates — this issue's `app/pages/*.php` thin-wrapper
   structure is designed to be a clean handoff point for that work.
2. JS/CSS bundler (roadmap Phase 0 item 3) can extend the same `npm run build` /
   `public/` pipeline established here, rather than introducing a second build
   mechanism.
3. API hardening (roadmap Phase 3 item 11) — input validation, CSRF review — is
   unaffected by this issue beyond the path change.
