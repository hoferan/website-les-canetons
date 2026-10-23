# Website "Guggenmusik Les Canetons de Fribourg" — Project Instructions

## Project overview

Public website and members' area for the Guggenmusik **Les Canetons de
Fribourg**, a Fribourg carnival band. The public pages present the band and
take bookings for events such as the souper. Behind a login, members answer
events, and the people whose roles allow it manage events, members, photos and
history, and read the guest lists and the contact inbox. The UI is French at
`/` and German under `/de/`.

## Tech stack

Two applications, one origin, one repository:

- **`web/`**: a React + TypeScript SPA built by **Vite 8** and styled with
  **Tailwind 4**. Data comes from the API through a **generated** client
  (OpenAPI → orval → TanStack Query hooks). The build output is the document
  root: `index.html` plus hashed bundles under `assets/`.
- **`api/`**: **Laravel 13**, which owns the whole JSON API and the database
  schema. Its own Composer project, tests and migrations. Deployed as `_api/`
  inside the document root.
- **PHP 8.4** and **MariaDB 10.3**, matching production (10.3.8).
- **Apache** with `.htaccess` on `easy-hebergement.net` shared hosting.

There is no PHP outside `api/`. The old server-rendered front end (`app/`,
Bulma, Twig) was deleted in the SPA cutover, and its history is not reachable,
so there is no old page left to read.

**Tailwind 4 is CSS-first.** There is no `tailwind.config.ts`: the entry is
`@import "tailwindcss"` in `web/src/styles.css`, with the design tokens in an
`@theme` block in the same file. `.stylelintrc.json` lists Tailwind's at-rules
under `ignoreAtRules` and disables `import-notation`.

### The `.htaccess`, and what takes the site down

The template is `config/htaccess/site.htaccess`, merged per environment into
`dist/overlay/<env>/` by `tools/build-overlays.mjs`. It is server-owned and
never uploaded by a deploy. **Read its comments before touching it.** What is
load-bearing:

1. **The `/api/*` dispatch stays first**, above the SPA fallback, which matches
   every path. Only the `www.` → apex redirect sits above it (Sanctum names the
   apex only); `tools/build-overlays.test.mjs` pins both and their order.
2. **`[L]`, not `[END]`.** This host's Apache version is unknown (it 500s on
   `<RequireAny>`) and an unknown flag 500s every request.
3. **The fallback is a catch-all** guarded by `RewriteCond
   %{ENV:REDIRECT_STATUS} ^$`, never `!-f`/`!-d`: the guard stops a FastCGI
   loop, the catch-all keeps files like the dead `config.php` from being
   served. An unknown URL answers **200 with the SPA's 404 view**, on purpose.
4. **Any new redirect is dangerous.** mod_alias sees the internal paths of the
   re-entered pass, FastCGI prefix included; two earlier ones 301'd the whole
   API and looped every URL. Read the template's note first.

`api/.htaccess` and `api/public/.htaccess` deny the Laravel tree and re-grant
its public directory. **Assume that boundary is absent on a server until
`/_api/.env` there answers 403** (`staging/README.md`).

### Build

`npm run build` (`tools/build.mjs`) assembles `dist/build/`: `index.html`,
`assets/` and `_api/` with a production-only `vendor/`. **The order of the two
builds is load-bearing**: Vite empties its `outDir`, so building the SPA after
copying Laravel deletes the API from the artifact, which still uploads fine.
CI's `build` job asserts both halves exist. Never hand-edit `dist/build/`.

### Deployment

The runbook is **`staging/README.md`**: server layout, both deploy paths, the
deploy CLI, `_api/.env` provisioning, migrations and recovery. ADRs 0004 to
0008 hold the reasoning. The rules that apply on every task:

- **A merge to `main` deploys to TEST.** QA and PROD are deployed by
  dispatching `Deploy QA` / `Deploy PROD` with a tag; PROD refuses a commit
  that has not deployed to QA. Rollback is redeploying an older tag.
- **Deploy through `npm run deploy:<env>` and `status:<env>`**, never
  `node tools/deploy/cli.mjs`. `--dry-run` the first deploy to a new
  environment. Exit 2 means a guard or the mass-delete brake refused.
- **Server-owned files never travel**: `.htaccess`, `robots.txt`, `.htpasswd`,
  `config.php` and `_api/.env`, named as exact paths in `PROTECTED_PATHS`
  (`tools/deploy/preflight.mjs`). `_api/.env` is set by hand, nothing recreates
  it, and a server without it 500s every `/api/*` request.
- **The deploy refuses on any drift between a server's `_api/.env` key set and
  `api/.env.example`**, in either direction. So a new key goes into
  `api/.env.example` in the same commit as the code that reads it, and an
  optional setting goes into `api/config/*.php`, **never** into
  `api/.env.example`, where it would refuse every server's next deploy.
- **QA and PROD still run the old server-rendered site** until their cutover.
  Do not run `npm run put-overlay:qa` or `:prod` on their own: the template
  falls back to an `index.html` those servers do not have. The overlay and the
  artifact move together.

### Migrations

Laravel owns the schema; migrations live in `api/database/migrations/` and
start from an empty database. ADRs 0008 and 0030.

- **They run on the first request after a deploy**, through
  `App\Http\Middleware\RunPendingMigrations` (in the `api` and `web` groups,
  under a MySQL `GET_LOCK`), gated by `AUTO_MIGRATE`, default `true`. CI never
  migrates and cannot: the host firewalls the runners.
- **`npm run dbmigrate:<env>` applies**; preview with `-- --dry-run`. It runs under
  the same PHP time limit as any request, so a long `ALTER` dies halfway either
  way: ship a heavy migration in its own deploy, ahead of the code that needs
  it, and run `dbmigrate` right after.
- **A failing migration takes the whole site down** (every `/api/*` answers
  503, so the SPA cannot boot) and retries on every request. So every
  migration is **idempotent and backward compatible**.
- **`AUTO_MIGRATE=false` keeps serving** against whatever schema there is: the
  outage switch on a host with no shell. Set it back afterwards.

## Traps

**`docs/traps.md` collects the things that cost real debugging time and are not
obvious from the code.** Read the entries for whatever you are about to touch
*before* you start.

| Home | For |
| --- | --- |
| A comment at the line | Anyone editing that code will see it |
| `docs/traps.md` | You need it *before* opening a file, so no comment could reach you |
| This file | It changes what you do by default on **every** task |

Keep a trap in one of them, not several. This file is loaded into every
session.

## Decisions

**`docs/adr/` records the decisions the code makes no sense without.** Read the
index in `docs/adr/README.md` before changing anything one of them covers, and
write a new record for a decision of that weight. Records are MADR 4 (ADR
0000), started from `docs/adr/adr-template.md`.

Specs and plans written by the skills below are working documents. They go in
`docs/superpowers/`, which is git-ignored, and are never committed or cited. A
code comment gives its reason in place, or points at an ADR or an issue. ADR
0001 has the reasoning.

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

- **Apache splits the traffic before either application runs**: `/api/*` and
  `/sanctum/*` go to `_api/public/index.php`, everything else gets
  `index.html`. All tooling lives at the repo root.
- **`web/` layout:**

  ```
  web/
    index.html            the shell document
    public/assets/img/    copied verbatim -> /assets/img/*
    public/assets/icons/  favicons + PWA manifest -> /assets/icons/*
    src/
      main.tsx            boot: config + session gate, then the router
      routes.tsx          the route table; English URLs, /de/* is the German mount
      api/                GENERATED client + hooks, and the http.ts mutator
      mocks/              MSW handlers for the mocked backend
      components/         layout, nav, footer, env ribbon, guards
      pages/              one component per route
      i18n/               both catalogues, the locale rules and the switcher
      styles.css          Tailwind entry and @theme tokens
    e2e/                  Playwright specs
    screenshots/          the screenshot sweep and its page list
  ```

  The PWA manifest link keeps `crossorigin="use-credentials"`, or the fetch
  fails behind TEST/QA Basic Auth.
- **Images in `web/public/assets/img/` have a budget**: longest edge 1920px,
  JPEG quality 82, progressive, no EXIF, at most 600 KB.
  `tools/image-budget.mjs` enforces only the edge and the size; the rest is on
  you. Band photographs belong in the image library.
  Never re-optimise already-optimised files.
- **`web/src/api/generated/` is generated; never hand-edit it.** Change the
  controller, run `npm run openapi && npm run generate:api`, commit the result.
  CI's `openapi-drift` job fails if either is stale.
- **Every request goes through the mutator in `web/src/api/http.ts`**: cookie
  credentials, CSRF priming (`GET /sanctum/csrf-cookie` once per page load) and
  a typed `ApiError` for every non-2xx, whose `fields` is the wire's `errors[]`.
  Never call `fetch("/api/…")` directly; a write without the replayed
  `X-XSRF-TOKEN` answers `419 invalid_session`.
- **Both public POSTs need an `Idempotency-Key`** and an `X-Form-Token`
  (`POST /api/v1/contact`, `POST /api/v1/events/{event}/registrations`); see
  `App\Http\Middleware\IdempotentWrite`.
- **Runtime configuration comes from `GET /api/v1/config`**, never from
  `import.meta.env`: every environment runs the same build (ADR 0007).
- **The API reference is `GET /api/docs`**, behind `API_DOCS_ENABLED` (default
  on; off answers 404), reading the committed `openapi.json`.
- **Everything lives under `/api/v1/*`**, from `withRouting(apiPrefix:
  ApiVersion::PREFIX)` in `api/bootstrap/app.php`. `api/routes/meta.php`
  (docs, migrate, health) is deliberately outside it.
- **API layout:** routes in `api/routes/api.php`, each commented with why it is
  public or which permission gates it; controllers in
  `api/app/Http/Controllers/Api/`; shared logic in `api/app/Support/`. Pair
  `auth:sanctum` with `permission:` so an anonymous caller gets 401, not 403.
- **Auth is Sanctum's stateful SPA cookie flow** (ADR 0010). **Authorization
  checks a permission, never a role** (ADR 0014): permissions are the cases of
  `App\Support\Permission`, roles are data grouping them, and the
  `permission:<name>` middleware is the only enforcement. Answering an event is
  `attendance.respond`, through the `musician` role; a register grants nothing.
  Every account holds the fixed baseline role `member` (`events.view`,
  `account.manage`). The SPA's `can()` mirrors permissions for UX only.
  `AccessDecidedByPermissionTest`, `PermissionMiddlewareTest` (with its
  `SESSION_ONLY` list) and an ESLint `no-restricted-syntax` rule fail the build
  if access is decided any other way.
- **Errors are problem documents** (`App\Exceptions\ApiError`) with exactly
  seven keys, pinned by `ApiErrorContractTest`. `translateApiError()` in
  `web/src/i18n/` is the only place user-facing language is computed, from
  `code` and `errors[].reason`, so every token needs copy in **both** `fr.ts`
  and `de.ts` (`ApiErrorVocabularyTest`); a missing German one falls back to
  French silently.

## Local development

```bash
npm run dev         # generate the docker .htaccess overlay, then bring the stack up
npm run dev:web     # Vite dev server on :5173, where you actually work
npm run dev:mock    # the SPA against the MSW-mocked backend, no Docker
npm run build       # refresh the artifact the :8090 stack serves
npm run smoke       # HTTP smoke checks against the built artifact (12 checks)
npm run dev:down    # stop
```

| URL | What |
| --- | --- |
| http://localhost:5173 | Vite with HMR, proxying `/api` and `/sanctum` to :8090. Day-to-day work |
| http://localhost:8090 | Apache serving the **built** `dist/build/`, for parity checks; no source edits |
| http://localhost:8091 | DbGate, opens straight into `lescanetons` |
| http://localhost:8025 | Mailpit |
| `localhost:3307` | MariaDB |

Both are one origin, so Sanctum's cookie flow is real in each. The dev origin is
in `SANCTUM_STATEFUL_DOMAINS` in `docker/api/env.docker` only.

**Never `docker compose up` directly.** `npm run dev` first generates the
`dist/overlay/docker/.htaccess` that compose bind-mounts; without it Docker
makes a directory there and `web` will not start. The `dist/build` mount must
not be `:ro`.

**Every PHP command goes through `tools/php-runner.mjs`**: into the compose
`php` service when it is healthy, native `php` otherwise (web session, CI).
That service's volume is the only `api/vendor` the tools see. The Laravel suite
uses its own `laravel_api_test` database, because `RefreshDatabase` drops every
table.

**Seeded accounts**, password `demo` (`DevSeeder`; registers and roles come
from migration `2026_09_07_000001`, and `comite.local` from
`2026_09_07_000002`). Every account holds `member`, and everyone in a register
holds `musician`. Describe them by what they can do:

| Login | Can |
| --- | --- |
| `demo.direction` | `direction`: every permission but the three account-level ones. No register, never in an attendance list |
| `demo.player` | Cloches: answers events, nothing more |
| `demo.both` | Trompettes and `direction`: answers and manages. The case an either/or role model breaks |
| `demo.committee` | Trombones and `committee`: guest lists and inbox, read only |
| `demo.young` | Batteurs. A parent uses the child's login |

The mocked backend (`web/src/mocks/`) has its own fixtures; its `demo.both`
must change their password first.

## Development commands

```bash
npm install           # first-time setup; there is no separate PHP install step
npm run check         # typecheck, Pint, Larastan, node tests, Vitest, eslint, stylelint, prettier, guards
npm run fix           # auto-fix: Pint + eslint + stylelint + prettier
npm run test:api      # the Laravel suite (needs a database, so not in check)
npm run test:web      # Vitest (web/src)
npm run test:e2e      # Playwright (web/e2e), against the mocked backend
npm run test:js       # node:test over tools/
npm run screenshots   # every route at 1280 and 390px into dist/screenshots/, plus index.html
npm run lighthouse    # public pages vs. the performance budget (informational)
npm run artisan -- route:list   # artisan, composer and php go through php-runner
```

- **Run Vitest from PowerShell, not Git Bash.** Git Bash's lowercase drive
  letter can make Vitest 4 load twice, and every file then fails with "Vitest
  failed to find the runner". Intermittent, and not a regression.
- In Git Bash, `docker compose exec -w /repo/api php php artisan test` needs
  `MSYS_NO_PATHCONV=1`. Never run the suite in the `web` container.
- `npm run check` does not build, because Vite would empty `dist/build/` and
  delete `_api/` from under a running stack.

### Claude Code web sessions

No Docker daemon runs there. **`npm run websession:init`** stands up a native
stack instead (idempotent; too slow for the SessionStart hook). The Laravel
suite runs; Larastan is skipped by choice, so `npm run check` can be green with
no PHP type-checked and CI's `lint-api` is the gate. MariaDB is 10.11, and there
is no `:8090` stack. "Could not authenticate against github.com" from Composer
is the session's GitHub proxy: **do not change network access to fix it.**
Read **`docs/web-session.md`** before concluding anything is unrunnable there.

## How work is tracked

**The backlog is GitHub issues. There is no `state.md` and there must not be
one**: a prose tracker goes stale silently; a merged PR closes its issue.

- **A milestone is a slice.** `gh issue list --milestone "<title>"` finds what
  is next; do not invent an ordering.
- **One issue, one branch, one PR**, closed with `Closes #N`.
- **Read the issue before starting.** Its body carries the measurement and the
  decision.
- **Close with evidence, not assertion.** A green suite is routinely green over
  a broken page here, so the PR carries the screenshot, the measured number or
  the failing-then-passing guard.

## Pull Requests

- **Title format:** Conventional Commits — `type(scope): description` (scope optional).
  Enforced by the `pr-title` job in `.github/workflows/ci.yml`.
  Types: `feat`, `fix`, `chore`, `docs`, `build`, `ci`, `test`, `refactor`, `style`, `perf`.
- **Body:** use `.github/PULL_REQUEST_TEMPLATE.md` — fill in every section.

## Who may change what

ADR 0014 has the reasoning.

| Thing | Changed by |
| --- | --- |
| The permission set (`App\Support\Permission`) | developer, code + deploy — a permission is real only if middleware checks it |
| UI text (`web/src/i18n/`) | developer, code + deploy |
| Which roles exist, their names and grants | `roles.manage`, on `/roles`. The baseline role is fixed |
| The registers, their order and both names | `members.manage`, on `/registers` |
| Members: identity, register, roles, password | `members.manage` |
| One's own password | any account holder |
| Events | `events.manage` |
| One's own answer to an event | `attendance.respond` |
| Somebody else's answer | `attendance.record_for_others` |
| Photos: the library on `/media`, and each photo slot on the page that shows it | `images.manage` |

So no permission enters the enum before middleware checks it.

**Who names a thing decides whether it can be translated.** A developer's name
is a catalogue key; a user-typed name is content, shown as typed. Roles and
registers therefore carry their own per-language labels (ADR 0026), resolved by
`roleName()` and `registerName()` in `web/src/i18n/`.

**Every write that changes who holds a permission calls `AccessIntegrity`.**
Nobody may take `members.manage` or `roles.manage` from its last holder or from
themselves, or touch the baseline role: there is no shell to repair a lockout.

## Language

- **Everything is written in English**: docs, ADRs, code, comments, table and
  column names, stored values, identifiers, slugs, file names.
- **API JSON bodies are English**, error tokens included. Translation happens
  only in `web/src/i18n/` (`POST /api/migrate` is the one exception).
- **French and German are for user-visible UI text only**: `fr-CH` at `/`,
  `de-CH` under `/de/*`. `de.ts` is typed `typeof fr`, so a key missing from
  either fails `npm run typecheck`.
- So `contact_messages` has `first_name`/`last_name` and `responses.answer`
  stores `participate`/`notparticipate`, while the UI reads French and German.

## Dos

- Run `npm run check` before pushing, and `npm run test:api` for API work.
- Match production versions (PHP 8.4, MariaDB 10.3).
- Put new tooling and config at the repo root.
- Add a **page** route in `web/src/routes.tsx` and to
  `web/screenshots/pages.json` (a test enforces it), and an **API** route in
  `api/routes/api.php`.
- Regenerate the client (`npm run openapi && npm run generate:api`) whenever an
  API response shape changes, and commit the result.
- Give every new API error token copy in **both** `fr.ts` and `de.ts`.
- Put `#[Emits('...')]` on any action that refuses with a code no middleware
  implies; the status comes from `App\Support\ErrorVocabulary`.
  `DeclaredCodesTest` and `EmittedCodesTest` fail if you forget.
- Put `etag:<facet>` on any new write that **replaces or removes** a thing, and
  give it a single-thing read for the tag (`App\Http\Middleware\ConditionalWrite`
  explains the coverage). A screen writes with the `ETag` of the read it opened
  with, never a fresher one.
- **Expect `{data, meta}` from every list endpoint**; `App\Http\Middleware\
  PaginatesCollections` adds it, so write nothing. Read rows through `rowsOf()`
  in `web/src/api/collection.ts`, and envelope mocked lists with `collection()`
  in `web/src/mocks/handlers.ts`.

## Don'ts

- Never commit `dist/build/`, `api/.env`, or any production data or DB dump.
- Never hand-edit `dist/build/` or `web/src/api/generated/`.
- Never store real member data or passwords in seed files.
- Never rename `_api/` without mirroring it in `PROTECTED_PATHS`
  (`tools/deploy/preflight.mjs`), or the next `--relist` deploy deletes every
  server's `_api/.env`. A rename to literally `api` would also need the
  `REDIRECT_STATUS` guard on the dispatch rules.
