# Where we left off — 2026-08-29

Read this first when picking the SPA cutover back up. It records what is **not**
derivable from the repository: the state of three servers, decisions taken in
conversation, and the handful of traps that cost time and would cost it again.

Everything else is in the tree and should be read there rather than duplicated
here:

| For | Read |
| --- | --- |
| Architecture, host constraints, commands | `CLAUDE.md` |
| Why the SPA is shaped the way it is | `docs/superpowers/specs/2026-07-27-frontend-spa-cutover-design.md` |
| What changed since (hard cutover, mocks) | `docs/superpowers/specs/2026-08-28-spa-clean-cutover-and-mocks-design.md` |
| The work itself, step by step | `docs/superpowers/plans/2026-08-28-spa-clean-slate.md` (done) and `…-spa-shell-and-first-page.md` (done) |

## The branch is pushed

`feat/spa-cutover` was pushed on 2026-08-29 and tracks
`origin/feat/spa-cutover`. It is no longer one disk failure from gone. Keep
pushing as you go — nothing else backs this work up.

## Branch and merge policy

Work on `feat/spa-cutover`. **Do not merge to `main`.** A merge auto-deploys
TEST via `ci.yml`'s `deploy-test` job, and sixteen of the seventeen routes are
still placeholders — TEST would serve a shell of empty pages. It merges once,
as the cutover, after every page is ported.

`main` stays at `ffedf84`. `feat/frontend-spa-cutover` is this branch's parent
and is not being developed. `origin/archive/php-laravel-stack` was deleted; the
old PHP front end is in `main`'s history and in this branch's, before `dcd7862`.

## Where the three servers actually are

None of them has seen any of this work.

| | Runs | Notes |
| --- | --- | --- |
| **TEST** | `main` @ `ffedf84` — the OLD PHP app | Deployed 2026-07-27, 6915 files. Behind HTTP Basic Auth. |
| **QA** | pre-cutover artifact | Still has the old `api/` and `sql/` trees, **no `api-laravel/`**, no `.sync-state.json` |
| **PROD** | pre-cutover artifact | Same. `/sanctum/csrf-cookie` 404s there, so the Laravel API has never been deployed to it |

Consequences worth knowing before any deploy:

- **QA and PROD have no `api-laravel/.env`.** Nothing recreates it, and a server
  without it 500s every `/api/*` request, so it must be placed by hand *before*
  the first deploy that dispatches into Laravel. See `staging/README.md`.
- **Their first deploy is a bootstrap run** (no `.sync-state.json`), where
  deletion is authoritative and will remove the entire old tree. It will trip
  the mass-delete brake. Review a `-- --dry-run` first, then `-- --force-delete`.
- **Each server still has a dead `config.php`** holding live DB credentials. The
  deploy never removes a protected basename, so delete it by hand, once per
  server.
- `robots.txt` and `deployment.json` are unreachable over HTTP on every
  environment — the fallback catch-all serves the shell for them. That is by
  design (it is what hides `api-laravel/.env`), not a regression.

## What is done, and what is next

Plan 1 (clean slate) is complete: no `app/`, no root Composer project, the tree
is `api/ + web/ + tools/ + docs/`, and `npm run build` emits `index.html` +
`assets/` + `api-laravel/`.

Plan 2 (shell and first page) is complete as well, all ten tasks. `/planning_repet`
is fully ported: the public list, the admin create/edit/delete form, French field
errors against the offending inputs, and both a unit suite and a Playwright
smoke. It was verified against the REAL Laravel API on the dev stack, not only
against the mocks — create, edit and delete each persist across a reload, and an
over-long title comes back as “Titre est trop long (maximum 255 caractères)”.

**Next: the sixteen routes that are still `Placeholder`.** Each needs porting
before the branch can merge; the parity reference is
`git show dcd7862^:app/pages/<page>.php` and the live site. Two of them,
`/inscriptions_admin` and `/signups_admin`, must also fix the response types
noted below — do that in the plan that builds them.

## Two contract defects that were fixed — do not reintroduce them

Both were in committed code, neither was caught by any test, and both made the
data layer silently wrong.

1. **The mutator must return orval's `{ data, status, headers }` envelope.**
   Every generated signature declares it, so returning the bare body
   type-checked at every call site and was `undefined` at runtime. Guarded from
   both sides now — two runtime tests in `web/src/api/http.test.ts` and a
   compile-time one in `contract.test.ts` — because neither alone would have
   caught it. Call sites read `query.data.data`: the outer is TanStack Query's,
   the inner is the envelope.
2. **`GET /api/events` was typed `string[]`.** Scramble cannot infer through
   `Collection::map`, so the endpoint the SPA is built on had no usable type. A
   `#[Response]` attribute on `EventController::index()` fixes it, and it must
   be a **literal** — Scramble resolves a `@phpstan-type` alias to a
   property-less object. That leaves the shape written twice, and
   `EventShapeContractTest` fails if they diverge.

**Still broken, deliberately left:** `GET /api/responses` is `array of string`
and `GET /api/signups` is `string`. Fix each in the plan that builds
`/inscriptions_admin` and `/signups_admin`. **`openapi-drift` will not flag
them** — it checks the committed document matches what Scramble emits, not that
the shape is right.

## Traps worth knowing before you touch anything

**The `assets` container needs two env vars, both set in `docker-compose.yml`.**
`VITE_API_PROXY_TARGET=http://web`, because inside that container
`localhost:8090` is the container itself — with the default, every API call
answers 502 and the SPA looks broken with no clue why. And `VITE_USE_POLLING=1`,
because bind-mount filesystem events do not reach it on Docker Desktop; without
polling an edit never triggers HMR, the dev server keeps serving the previous
version, and the only thing that helps is restarting the container, which nobody
guesses.

**`npm run check` does not build and does not run the Laravel suite.** Building
was removed from it on purpose: `build:web` empties `dist/build/`, which would
delete `api-laravel/` out from under the running stack. The Laravel suite needs
a database:

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```

In Git Bash prefix that with `MSYS_NO_PATHCONV=1`, or the `-w` argument is
rewritten to a Windows path and Docker rejects it. PowerShell is unaffected.

**`.env.test` / `.env.qa` / `.env.prod` use `FTP_PASSWORD`; the deploy CLI reads
`FTP_PASS`.** This is not a bug to fix — a previous session already tried.
Inject it for a one-off command instead:

```powershell
Get-Content .env.test | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { Set-Item -Path "env:$($matches[1])" -Value $matches[2] } }
$env:FTP_PASS = $env:FTP_PASSWORD
node tools/deploy/cli.mjs test --status
```

**Never `docker compose up` directly.** `npm run dev` generates
`dist/overlay/docker/.htaccess` first; without it Docker creates a *directory*
at that path and the `web` container refuses to start. Relatedly, the
`dist/build` mount must **not** be `:ro` — the `.htaccess` mount nests inside
it and Docker cannot create the mountpoint against a read-only parent.

**Two `.htaccess` lookaheads are load-bearing.** The `.php` legacy redirect
excludes `api-laravel/`, or the dispatch's own rewrite target gets 301'd and the
entire API answers 301 while every page still looks fine. The `.html` one
excludes `index.html`, or the fallback's own output gets 301'd and every URL
redirect-loops. Both have regression tests; the first also has a smoke check.

**Testing Library needs explicit `cleanup()`** here — this project imports
`test`/`expect` rather than using Vitest globals, so RTL's auto-cleanup never
registers. It is in `web/src/setupTests.ts`. Without it renders accumulate and
the next test fails with "Found multiple elements", which reads like a component
bug and is not one.

**Playwright runs on 5174, and must.** The dev stack's `assets` container
publishes an *unmocked* Vite on 5173, and `reuseExistingServer` cannot tell it
apart from the harness's own `--mode mock` server: with the stack up, Playwright
silently adopts it and the whole suite runs against the real API and the real
database. It fails on a seeded row count, which reads as a broken assertion
rather than "you are testing the wrong server". Do not move the harness back
onto 5173 to "match dev".

**MSW's handlers run in the PAGE, not in the service worker.** So their module
state dies on every reload — which meant a mocked login did not survive a
refresh, while a real Sanctum cookie does. The session is kept in
`sessionStorage` now to close that gap. Any new mock state that should outlive a
reload needs the same treatment; anything that should not, must not get it.

**Never copy a prop into form state with a `useEffect`.** `EventForm` did, and
React committed and painted the render that switched the form to edit mode a
frame before the effect filled the inputs — an empty form flash on every
"Modifier". Seed the state during render and let a `key` on the caller reset it.
jsdom cannot catch this class of bug at all: Testing Library wraps every
interaction in `act()`, which flushes effects before any assertion runs, so the
window does not exist there. `web/e2e/planning.spec.ts` samples animation frames
for it instead.

**Name any list a page renders.** The layout's nav is a list too, so an unscoped
`getByRole("listitem")` counts nav items — four events came back as seventeen
rows. And `getByText` cannot match text split across a `<strong>` label; assert
on `textContent`, remembering JSX keeps the space after `</strong>`.

## Decisions taken in conversation, not visible in the code

- **WordPress is abandoned.** A greenfield rebuild was designed and half-built
  between 2026-07-28 and 2026-08-28, then dropped: *"the effort to migrate
  completely to wordpress is too high! I don't want to learn wordpress, I'm a
  developer."* The branch, its remote and its Docker volumes are deleted. Any
  WordPress design document still reachable in history — including one claiming
  to supersede every other design — is void.
- **The backend question was reopened and closed: Laravel stays.** It is built,
  tested, owns the schema, does Sanctum cookie auth, generates the client, and
  already runs on this shared FTP host.
- **Hard cutover over building alongside.** `app/` was deleted up front rather
  than kept as a running parity reference. The consequence is that the parity
  reference is now `git show dcd7862^:app/pages/<page>.php` and the live site.
- **Icons are `lucide-react`** — same set as the old site, as components. There
  is no central icon registry; the old `assets/js/icons.js` existed only because
  the vanilla library needed one.
- **Guards refuse in place rather than redirect** when a logged-in member lacks
  the capability. Bouncing someone already past the login form reads as "your
  session expired" and invites them to log in again at something they will never
  be allowed to see.

## Starting the stack

```bash
npm run dev        # the whole stack; serves the BUILT artifact on :8090
npm run dev:web    # Vite on :5173, proxying /api to the real API
npm run dev:mock   # Vite on :5173 with MSW — no Docker needed at all
npm run build      # refresh what :8090 serves
npm run smoke      # 13 HTTP checks against the built artifact
```

Note that :8090 serves whatever `npm run build` last produced and does **not**
pick up source edits — that is the point, it is the parity check. Day-to-day
frontend work happens on :5173.

Seeded logins, all passwords `demo`: `demo.admin`, `demo.moderator`,
`demo.user`. The MSW mocks accept the same three.
