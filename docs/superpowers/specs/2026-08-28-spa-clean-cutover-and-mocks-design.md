# Design — SPA clean cutover and mocked backend

**Date:** 2026-08-28
**Status:** Approved (design)
**Amends:** `docs/superpowers/specs/2026-07-27-frontend-spa-cutover-design.md`

## Context

The 2026-07-27 design remains the architecture for this cutover and is not
superseded. Its §3 (runtime config), §4 (generated client), §5 (routing and
`.htaccess`), §6 (auth and session), §11 (deletion inventory), §12 (tooling
impact) and §13 (rollout) stand as written and are not restated here.

Three things have changed since it was written, and this document records only
those:

1. **A WordPress rebuild was designed, half-built and abandoned** (2026-07-28 to
   2026-08-28). `docs/superpowers/specs/2026-07-28-wordpress-migration-design.md`
   claims to supersede "every design in this directory". That claim is void. The
   branch, its Docker volumes and its remote are deleted; see §8.
2. **A hard cutover is now acceptable.** The 2026-07-27 design keeps `app/`
   running beside the SPA and deletes it last (its §15, step 8). The site owner
   has since confirmed a hard cutover is possible, which removes the reason for
   that ordering and the transition costs it imposes.
3. **A mocked backend is wanted**, so the SPA can be developed without the
   Docker stack. The 2026-07-27 design has no mocking layer.

The backend question was reopened and closed: **Laravel stays.** It is built and
passing 235 tests, owns the schema and migrations, does Sanctum cookie auth and
the `{error, code, fields[]}` contract, generates the OpenAPI document the
TypeScript client is built from, and already runs on this shared FTP host — TEST
serves it today. `api/` is not moved, renamed or rewritten by this work.

## Goals

- Reach a repository that is `api/ + web/ + tools/ + docs/` and nothing else, in
  one phase, before any application code is written.
- Develop the SPA against a mocked backend that cannot drift from the real API
  contract.
- Deliver a running app shell plus one page ported end to end, proving the
  architecture before it is repeated across the remaining routes.

## Non-goals

- **The other 16 routes.** Only `/planning_repet` is ported here.
- **The members' RSVP and both admin summaries.** `/inscriptions_utilisateurs`
  and `/inscriptions_admin` are later work.
- **Any change to `api/`** beyond deleting the `LegacySession` bridge (§2) and
  repointing one test (§6). No controller, route, migration or contract moves.
- **A visual redesign.** Parity with the current site, per the 2026-07-27
  non-goals.
- **Deploying anything.** No server is touched by this work; see §9.

## Decisions

| Decision | Chosen | Rejected alternative |
| --- | --- | --- |
| Backend | Keep Laravel in `api/`, untouched | Vanilla PHP rewrite; a lighter framework (Slim) |
| Repo layout | Top-level `web/` + `api/`, tooling at root | `apps/web` + `apps/api`; `web/` as its own npm workspace |
| Cutover style | Hard — delete `app/` in phase 1 | Build alongside, delete last (2026-07-27 §15) |
| Mocking | orval-generated MSW from `api/openapi.json` | Hand-written MSW handlers; Prism mock server; no mocks |
| Mock realism | Generated faker, overridden per-endpoint for four routes | Faker everywhere; hand-written fixtures everywhere |
| First page | `/planning_repet` | `/` (visual only); `/inscriptions_utilisateurs` (RSVP) |
| Branch | `feat/spa-cutover`, cut from `feat/frontend-spa-cutover` | A clean branch from `main`, re-doing the API work |

## 1. What this amends

| 2026-07-27 section | Status |
| --- | --- |
| §2 Repo layout | Amended — one `vite.config.ts` from the start; no `tailwind.config.ts` (§7) |
| §9 Local development | Amended — two dev modes, the mocked one needing no Docker (§4) |
| §10 Testing | Extended — tests run against MSW (§10) |
| §15 Work breakdown | Replaced by the two phases in §2 |
| §3, §4, §5, §6, §11, §12, §13, §14 | Unchanged, and authoritative |

## 2. Sequencing

The 2026-07-27 breakdown orders the local stack (step 7) before the deletion
(step 8) so `app/` survives as a running parity reference while pages are
ported. A hard cutover removes that constraint, so the cutover-enabling work
moves to the front and lands as one phase.

### Phase 1 — clean slate

Everything in the 2026-07-27 §11 deletion inventory and §12 tooling impact,
applied at once, plus the frontend toolchain:

- Delete `app/`, the root Composer project (`composer.json`, `composer.lock`,
  `vendor/`, `phpcs.xml`), the `app/`-only tooling wrappers and the
  `php:install` script, `config/config.example.php`, `config/config.docker.php`,
  the root `tests/` tree with its `phpunit.xml`, and `app/assets/js/api.test.mjs`
  (called out separately because `test:js` globs it by name).
- Delete Laravel's `LegacySession` bridge and its two call sites in
  `AuthController` — the only change to `api/` in this phase, and one its own
  class comment asks for.
- Move the `.htaccess` template to `config/htaccess/site.htaccess`, repoint
  `tools/build-overlays.mjs`, and apply the three changes in 2026-07-27 §5.
- Rework `tools/build.mjs`: Vite builds `web/` into `dist/build/` with
  `emptyOutDir: true`, **then** Laravel is copied to `dist/build/api-laravel/`,
  **then** the deployment marker is written. The reverse order wipes
  `api-laravel/` after populating it — a total outage — so the order carries a
  comment saying why.
- Rework `docker-compose.yml` per 2026-07-27 §9: the `web` document root becomes
  the SPA build output plus `api-laravel/`; the `assets` service becomes the
  Vite dev server proxying `/api` and `/sanctum`; the dead `/srv/app/src`
  symlink goes. `deps`, the `db` healthcheck and the entrypoint's
  `artisan migrate` stay. The Vite dev origin is added to
  `SANCTUM_STATEFUL_DOMAINS` in `docker/api/env.docker` only, never in a shipped
  default.
- Repoint the deploy pre-flight from a `config.php` AST walk to a dotenv key-set
  diff of the server's `api-laravel/.env` against `api/.env.example`
  (2026-07-27 §12).
- Repoint `tools/ensure-dev-stack.mjs` to write `api/.env` rather than
  `app/config.php`, and `tools/phpunit-summary.mjs` at `api/`'s suite.
- Rewire `npm run check` and the CI jobs per the 2026-07-27 §12 table; rewrite
  `npm run smoke`.
- Add React, Tailwind, Playwright and `vite.config.ts` with `root: 'web'`, and a
  minimal shell that boots and builds.

**Deliverable:** the tree is `api/ + web/ + tools/ + docs/`; `npm run build`
emits the 2026-07-27 §1 artifact; the Docker stack runs; `npm run check`, the
Laravel suite and the rewritten smoke checks are green.

**Ordering constraint.** Each deletion lands in the same commit as the rewiring
it forces — `app/` together with the repointed `build.mjs`, `docker-compose.yml`
and `check` scripts, never as a bare deletion commit. The 2026-07-27 §15 rule
that no commit may leave the tree unbuildable still holds, and deletion-first
makes it easy to violate by accident.

### Phase 2 — shell and first page

- `main.tsx` boot sequence: fetch `GET /api/config`, then `GET /api/user` (a 401
  is a normal answer meaning anonymous), then render the router. Nothing renders
  before config resolves, so the env ribbon and feature flags are never wrong on
  first paint.
- `routes.tsx`: all 17 URLs from 2026-07-27 §5, plus the three that exist only
  when `features.souper_signup` is on. Every route not yet ported renders a
  placeholder naming the page, so navigation is complete and the gaps are
  visible.
- Components: `Layout` (header, nav, footer), `EnvRibbon` from `config.env`,
  `RequireAuth`, `RequireCapability`, `NotFound`.
- The capability matrix is mirrored client-side exactly as `session.js` does
  today. Per the 2026-07-27 guiding principles it is UX only: Laravel's
  `capability:` middleware remains the sole enforcement.
- `/planning_repet` ported at parity: the public event list from
  `GET /api/events`; and behind `RequireCapability("manage_events")`, the
  create/edit form and delete action against `POST /api/events`,
  `PUT /api/events/{id}` and `DELETE /api/events/{id}`. Field errors from
  `fields[]` render against the matching inputs.

`/planning_repet` is the richest single page: a public query, three
authenticated mutations, a capability guard and the error contract. It does not
exercise the `respond` capability — that lives on
`/inscriptions_utilisateurs` — which is accepted rather than widening scope.

## 3. The mocked backend

`orval.config.ts` gains `mock: { type: "msw" }`. Handlers are generated from
`api/openapi.json` alongside the client on every `npm run generate:api`, so they
cannot drift from the real contract, and CI's existing generated-client drift
check covers them without change.

Generated faker data describes shape, not content, which is useless for judging
a page. Four endpoints get hand-written data through orval's per-endpoint
`override.mock.data`:

| Endpoint | Why |
| --- | --- |
| `GET /api/config` | The boot gate reads it; wrong values mean a wrong env ribbon and wrong feature flags |
| `GET /api/events` | Mirrors `docker/db/init` — real French titles, so layout can be judged |
| `POST /api/login` | Accepts the three seeded demo logins (`demo.admin`, `demo.moderator`, `demo.user`, password `demo`) and returns the matching user |
| `GET /api/user` | Returns whoever logged in, from module state in the mock |

The last two matter: authentication is exercised through the real login flow and
the real guards rather than a dev-only role switcher, so the mocked app and the
live app take the same code path.

The service worker is registered only when `VITE_MOCK_API=1`, and
`tools/build.mjs` strips `mockServiceWorker.js` from `dist/build/` — the same
way it already strips superseded asset sources — so it can never reach a server.

## 4. Local development

| Command | What runs | Data |
| --- | --- | --- |
| `npm run dev:web` | Vite dev server on `web/`, MSW on. No Docker. | Mocked |
| `npm run dev` | Docker stack + Vite dev server proxying `/api` and `/sanctum` to the `web` container | Real, seeded |

The mocked mode is what makes phase 2 possible without a running backend; the
real mode is what verifies the contract. Both serve a single origin to the
browser, so Sanctum's SPA cookie flow works unchanged in each.

## 5. Repo layout after phase 1

```
api/                    Laravel — own composer.json, vendor/, tests/, migrations/
web/
  index.html            the shell document
  public/assets/img/    copied verbatim -> /assets/img/*
  public/assets/icons/  favicons + PWA manifest -> /assets/icons/*
  src/
    main.tsx            boot: config + session gate, then the router
    routes.tsx          route table, French URLs unchanged
    api/                generated client + hooks, and the http.ts mutator
    mocks/              MSW: generated handlers + the four overrides
    components/         layout, nav, footer, env ribbon, guards
    pages/              one component per route
    i18n/               i18next setup + the API error vocabulary
    styles.css          Tailwind entry and @theme tokens
config/htaccess/        the site .htaccess template
tools/                  build, deploy, overlays
docs/
package.json            one, at the root
vite.config.ts  orval.config.ts  tsconfig.json  vitest.config.ts
```

Images and icons keep their current URLs, so the `.htaccess` `!^/assets/` bypass
and its cache headers keep working, and the PWA manifest link keeps
`crossorigin="use-credentials"` — without which the manifest fetch fails behind
TEST/QA Basic Auth.

## 6. One i18n vocabulary

`web/src/i18n/fr.ts` holds the vocabulary currently in
`app/assets/js/i18n.js`, typed, owned by `web/`. It is not imported from `app/`,
which no longer exists.

`api/tests/Feature/ApiErrorVocabularyTest.php` today searches a list of
candidate paths for `app/assets/js/i18n.js` and asserts every error `code` and
`fields[].reason` the API can emit exists as a key in it. It is repointed at
`web/src/i18n/fr.ts`. The test's purpose — no API error token without French
text — is unchanged, and with a single vocabulary there is no possibility of one
copy silently falling behind.

## 7. Toolchain versions

Current as of 2026-08-28, correcting the 2026-07-27 design where it assumed
older majors:

- **Tailwind 4.3.3.** v4 is CSS-first: there is no `tailwind.config.ts`. The
  entry is `@import "tailwindcss"` in `web/src/styles.css` with an adjacent
  `@theme` block. 2026-07-27 §2 lists a root `tailwind.config.ts`; that file
  does not exist under v4.
- **React 19.2**, **MSW 2.15**, **Playwright 1.62**.
- TypeScript, Vitest, orval and TanStack Query are already installed.

## 8. WordPress removal

Nothing WordPress is tracked on this branch — it was cut on 2026-07-27, a day
before that work began, and a repository-wide search for `wordpress`,
`wp-content` and `wp-cli` returns nothing. Already done: the
`feat/wordpress-migration` branch and its remote, and the `wp_core` and
`wp_db_data` Docker volumes. Remaining, in phase 1:

- Delete `.tmp/wp-test/` (129 MB, untracked).
- Delete `origin/archive/php-laravel-stack`. It is `feat/frontend-spa-cutover`
  plus exactly three WordPress documentation commits, so once those go it holds
  nothing unique.

## 9. Branch and merge policy

Work happens on `feat/spa-cutover`, cut from `feat/frontend-spa-cutover` so its
26 commits of API and generated-client work carry over.

**The branch is not mergeable until every route is ported.** A merge to `main`
auto-deploys TEST via `ci.yml`'s `deploy-test` job, and a partial SPA would take
TEST down. So `main` stays at `ffedf84`, TEST keeps serving today's site, and
this branch merges exactly once — as the cutover itself, followed by the
2026-07-27 §13 rollout.

The consequence to accept: the parity reference during porting is
`git show main:app/pages/<page>.php` and the live site, not a running local
copy.

## 10. Testing

- **Vitest + React Testing Library** against the MSW handlers: the boot gate;
  each guard across every role and capability, including the negative cases the
  matrix requires (an `admin` may not `respond`); `/planning_repet`'s list,
  create, edit and delete; and error rendering from `fields[]`.
- **Playwright** installed and wired, with one smoke spec against the mocked dev
  server — the harness in place, not a suite.
- `npm run check` gains `tsc --noEmit`, Vitest and the rewritten script set.
- The Laravel suite is unaffected and must stay green; it runs in the stack, not
  in `npm run check`.
- `npm run smoke` is rewritten in phase 1 to assert the shell plus the API
  endpoints, replacing checks that assert PHP-rendered markup.

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| Phase 1 leaves the tree unbuildable partway | Deletions land with their rewiring in the same commit (§2) |
| Smoke coverage is thin while the checks are rewritten | Phase 1 is not done until the rewritten checks pass against the built artifact |
| A partial SPA reaches TEST | The branch does not merge until every route is ported (§9) |
| `.htaccess` fallback loops into a site-wide 500 | 2026-07-27 §5: keep `RewriteCond %{ENV:REDIRECT_STATUS} ^$`, keep `[L]`, keep the catch-all |
| Vite wipes `api-laravel/` on build | Build order fixed and commented in `tools/build.mjs` (§2) |
| Mock data drifts from the real contract | Handlers are generated from `api/openapi.json`; CI's drift check covers them (§3) |
| Web-session development breaks silently | `ensure-dev-stack.mjs` repointed to write `api/.env` (§2), the environment least likely to be exercised first |
| The first deploy trips the mass-delete brake | Expected — the cutover deletes most of the remote tree; 2026-07-27 §12 requires a `--dry-run` review and likely `--force-delete` |
