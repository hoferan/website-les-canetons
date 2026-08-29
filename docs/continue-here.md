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

Work on `feat/spa-cutover`. **Do not merge to `main` yet** — but the merge IS
the plan, and André confirmed it on 2026-08-29: *"merge to main at the end if
the full page is migrated."*

**The condition is precise: no route may still render `Placeholder`.** Today
thirteen do (sixteen counting the flag-gated souper three). A merge auto-deploys
TEST via `ci.yml`'s `deploy-test` job, so merging early puts a shell of empty
pages on TEST — which is the whole reason for the wait, not squeamishness about
merging.

So: one merge, at the end, as the cutover. `grep -c "Placeholder" web/src/routes.tsx`
reaching zero is the green light. Confirm with André before actually merging —
that deploy is the moment the site changes hands from the PHP app to the SPA.

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

**Sub-project B — auth and contact — is done too**, on 2026-08-29:
`/authentification_inscription` (login *and* logout, which the SPA had no way
to do before), `/contact` and `/confirmation`. Verified against the real
Laravel API in 21 checks: all three seeded accounts log in through the form and
survive a reload, only `demo.admin` sees the admin form, a contact message
reaches `contact_messages`, and an over-long subject comes back as
“Sujet est trop long (maximum 255 caractères)” against the offending input.

**Thirteen routes are still `Placeholder`** (sixteen counting the three
flag-gated souper ones). The remaining work was decomposed on 2026-08-29 into
four sub-projects, each getting its own spec, plan and implementation cycle —
see `docs/superpowers/specs/2026-08-29-auth-and-contact-design.md` for the
table. B is done; **A, C and D remain**:

| | Routes | Blocked on |
| --- | --- | --- |
| A. Content pages | accueil, historique, canetons, cd, commencement, moniteurs, sponsors, multimedia, comite_teamdirection | nothing — no API at all, pure markup and images |
| C. Members' area | sinscrire, inscriptions_utilisateurs, admin, inscriptions_admin | the broken `GET /api/responses` type |
| D. Souper | signup, signup_thanks, signups_admin | the broken `GET /api/signups` type |

The parity reference is `git show dcd7862^:app/pages/<page>.php` and the live
site.

**A was split, and A1 — the visual foundation — is done** (2026-08-29). The site
now has a design: the *Scène* direction, chosen from three mocked-up options
(https://claude.ai/code/artifact/ec2ff76f-b64a-4fd0-a5ed-89c5ab2c5a3b). Near-black
chrome, light page body, violet as the interface accent, Lilita One and Karla
self-hosted through Fontsource. The four already-ported pages are on it, and the
image directory went from **44.5 MB to 6.1 MB**.

**A2 (the nine content pages) and C (the members' area) are done too**
(2026-08-29). **Only THREE routes remain on `Placeholder`** — `/signup`,
`/signup_thanks` and `/signups_admin`, the flag-gated souper feature, which is
sub-project **D** and the last one.

`grep -c "<Placeholder" web/src/routes.tsx` returning **0** is the green light
for the merge to `main`. It currently returns 3.

C also carried two fixes worth knowing about:

- **`GET /api/responses` was typed `string[]` and is not.** Scramble cannot
  infer through the `Collection::map` that builds it — the same failure that
  made `GET /api/events` a `string[]`. Fixed with a literal `#[Response]`
  attribute plus `api/tests/Feature/ResponseShapeContractTest.php`, which fails
  if the attribute and the endpoint disagree. **`GET /api/signups` is still
  `string` and is D's to fix the same way.**
- **The register counts on the summary are derived from the response**, not from
  the hardcoded array of nine French instrument names the old page carried. The
  endpoint returns every user with their instrument, so the list falls out of
  the data and cannot drift from the `instruments` table.

`/admin` is a hub now — links to the planning page and the summaries — rather
than the old two buttons, both of which had become redundant. That was an
approved design change, not a port.

### Open content questions — for the band, not for code

Three things the port reproduced faithfully rather than deciding. None is a bug;
all three need someone who knows the band to answer.

1. **Who directs the band?** `/historique` says Delphine Maillard and Laura
   Mantel *"passent à présent le flambeau"* to Lilou Keller and Anaïs Meuwly,
   while `/comite_teamdirection` still lists Laura Mantel as Responsable Team
   Direction and the Direction musicale as *"Laura Mantel et Delphine
   Maillard"*. The live site has contradicted itself for a while; both pages
   were ported as they read.
2. **`comite.jpg` is not a photograph of the committee.** It is a stock picture
   of actual ducklings, sitting under the heading "Le comité". Its alt text now
   describes the ducklings, because telling a screen-reader user there is a
   photo of the committee when there is not is worse than being vague. If a real
   committee photograph exists, dropping it in fixes both.
3. **"Marc-Jérôme" or "Marc-Jérome"?** `/canetons` has the circumflex,
   `/moniteurs` does not. Both spellings are in the old PHP; both were carried
   across.

### The souper CTA is waiting for D

`/accueil` shipped with only its static half. The old page had a flag-gated
call-to-action for the souper, and **`GET /api/config` already returns
`occasion` with every field it needs** — `title`, `subtitle`, `dateDisplay`,
`teaser`, `invitation`. It was deferred only because its two buttons link to
`/signup` and `/signups_admin`, which are still placeholders. D builds the CTA
and its destinations together.

**Read that spec before touching the palette.** The old per-page CSS looks like
a decade of drift — magenta headings on one page, two blues on another — and it
is not. The band is a youth Guggenmusik that performs in **UV costumes at
night**; those colours came from the band's own look. Neon on black IS the
identity, and a tasteful white site would look like a different band. Open
`web/public/assets/img/canetons.jpg` before deciding otherwise.

**One gap C must close:** no route is wrapped in `RequireAuth` or
`RequireCapability` yet — `grep RequireAuth web/src/routes.tsx` returns nothing.
The guards are unit-tested and they do carry the attempted path into router
state, but nothing exercises the bounce end to end because there is no gated
URL to bounce from. C wires the first ones.

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

**The capability matrix is not a hierarchy, and the members' area is where
that bites.** `respond` belongs to user and moderator; `admin` holds
`manage_events` and `view_summary` instead. **An admin cannot respond** — on
`/sinscrire` a member sees "S'inscrire" and an admin sees "Résumé", different
buttons on the same row. Every intuition about roles says otherwise, and the
SPA's guards are UX only, so a mistake will not surface as a 403.

**MSW's mocked session lives in `sessionStorage`, which pages in one Playwright
context share.** A script that logs in as one user and then another in the same
context lands on the already-logged-in view instead of the form. Use a context
per role. And below `md` the nav collapses behind the hamburger, so the username
link is not a usable "logged in" signal at 390px — wait for the login form to
detach instead.

**An accessible name keeps `&nbsp;` as a literal U+00A0.** It is not collapsed
to an ordinary space, and the two are indistinguishable by eye. A test asserting
on a heading that contains one — `/cd`, `/commencement` — needs the real
character. The plan for those pages originally claimed the opposite and was
wrong twice over: its prose said "already contains the real character" while its
own code fence held an ASCII space. Both implementers caught it by rendering the
component and reading the codepoints instead of trusting the document.

**Every route had two `<h1>`s until 2026-08-29** — the header's brand and the
page's own title. The brand is a `<p>` now. If you add a page, its title is the
document's single `h1`; a script that walks every route and counts them is three
lines of Playwright and worth re-running after any layout change.

**Adding an npm dependency silently unstyles :5173 until the `assets` container
is restarted.** That service keeps `node_modules` in a named volume and installs
with `npm ci` at start, so a package installed on the host is simply absent
inside it. Tailwind's Vite plugin then fails to generate any CSS — the page
renders with structure but no colours, no fonts, no chrome — and the ONLY signal
is one line in `docker compose logs assets`:
`Can't resolve '@fontsource-variable/karla'`. Nothing in the browser, the tests
or the terminal says a word. `docker compose restart assets` fixes it in about
four seconds.

**`NavLink` ignores an `aria-current` you pass it.** It gates its own
`aria-current` on an internally-computed `isActive` that matches `to` literally
against the URL — which knows nothing about `ACTIVE_ALIASES` in `Layout.tsx`, so
on `/inscriptions_admin` the "Inscriptions" item was never marked current no
matter what was passed. The nav items are plain `Link`s now, with `aria-current`
and `className` both driven by the same `active` expression.

**A design change is only checkable by looking at it.** Two defects survived a
fully green `npm run check`, 132 unit tests, 11 e2e tests and a clean build: the
footer floated halfway up short pages (the old `main.css` sticky-footer pattern
was never ported, and it was invisible while the footer had no background), and
the env ribbon sat mostly outside the viewport. Screenshot the routes — driving
Playwright and reading the PNGs works well — rather than trusting the suite.

**Playwright's `getByLabel` is a case-insensitive SUBSTRING match; Testing
Library's is exact.** The same label works unqualified in a Vitest test and
fails strict mode in an e2e one: `getByLabel("Nom:")` also matches `"Prénom:"`,
because "nom:" is its tail. Every contact-form locator in `web/e2e/auth.spec.ts`
passes `{ exact: true }`, including the four that do not collide today — one
added field is all it takes, and the failure reads as a bug in the page.

**Nothing in Playwright's non-waiting API waits for the boot gate.**
`isVisible()` and `count()` return immediately, and `SessionProvider` renders
`null` until `GET /api/config` and `GET /api/user` resolve — so a check fired
straight after `page.reload()` or `page.goto()` reports "logged out" for a
perfectly good session, and "no admin form" for an admin. Worse, it reports the
*right* answer for the wrong reason on the negative cases, which is how a
verification script passes while proving nothing. Wait on a condition
(`.waitFor()`), and on the negative cases wait for the page's own content first.

**A refactor with full coverage can leave nothing pinning the new behaviour.**
When the form error region moved from inserted-on-error to always-resident,
every one of the 128 tests still passed against *both* shapes — `findByRole`
retries until the element appears, so it cannot tell them apart. Two tests were
added specifically to fail on the old shape. When you change a pattern, revert
your change and confirm something goes red; if nothing does, the change is
undefended.

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
