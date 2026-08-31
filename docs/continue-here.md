# Where we left off — 2026-08-31

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
| The work itself, step by step | every plan in `docs/superpowers/plans/` dated 2026-08-28 or 2026-08-29 — **all of them are done** |
| The design decisions behind them | every spec in `docs/superpowers/specs/` dated 2026-08-29 |
| **What happens next, and why the obvious clean-ups were rejected** | `docs/superpowers/specs/2026-08-31-post-cutover-ship-and-cleanup-design.md` |
| How the cutover was shipped, step by step | `docs/superpowers/plans/2026-08-31-ship-the-cutover.md` |

## START HERE: what to do next

**The cutover is MERGED and LIVE ON TEST.** `main` is at tag
**`2026-08-31-f120b9f`**, TEST serves the SPA, and the old PHP front end is
gone. `app/` no longer exists anywhere but in history.

The next work is sub-projects **B, C, D or E** of
`docs/superpowers/specs/2026-08-31-post-cutover-ship-and-cleanup-design.md`:

| | | |
| --- | --- | --- |
| **B** | Structure clean-up (English filenames, dead files, deferred review items) | not started |
| **C** | Content audit — dead links, the 2016 video, redundancy | **done** — `docs/content-audit-2026-08-31.md` |
| **D** | Content corrections | **done** — all 14 answers acted on; see the same file |
| **E** | Restyle polish + mobile. Keep *Scène*; do not restart the design. | do last, after C and D |

**E is deliberately last** so pages are not styled twice.

### PROD IS BLOCKED: the site is full of visible placeholders

Sub-project D replaced every committee name, register roster, instructor list and
published phone number with a visible **"••• à compléter"** marker, because the
band did not yet know which were current. That was the right call — a stale name
sends a parent to the wrong person — but it means:

```bash
grep -rl "<Tbd" web/src/pages      # which pages still have gaps
```

Four pages today, rendering **17** fields — 8 committee names, 6 register
rosters, 1 booking number, 2 joining contacts. Note the call sites and the
rendered fields are different numbers: several `<Tbd />` sit inside a `.map()`,
so counting occurrences understates it. `grep -rl` on `web/src/pages` is the
honest check, and it must come back empty before PROD.

TEST and QA are behind HTTP Basic Auth so only the band sees them. **PROD is
public and has never been deployed.** Deploying it now would publish
"à compléter" where the committee should be. Nothing in CI enforces this — it is
a content gate, and this paragraph is the enforcement.

### Two things left undone on TEST

1. **`config.php` is still on the TEST server** and still holds live DB
   credentials from the old app. It is a PROTECTED basename, so no tool will
   remove it — delete it by hand, once, in an FTP client. Nothing reads it; the
   SPA fallback already makes it unreachable over HTTP.
2. **Nobody has logged in through a browser yet.** The API answers correctly and
   guests get 401, but the full Sanctum cookie round-trip — and the check that
   an admin is *refused in place* on `/inscriptions_utilisateurs` rather than
   bounced to login — has not been exercised by a human. Do that before trusting
   the members' area.

### QA and PROD are untouched, and are NOT ready

Both are still pre-cutover. Before either can take a deploy:

- **Place `api-laravel/.env` by hand.** Neither has one. Nothing recreates it,
  and a server without it 500s every `/api/*` request. It must exist *before*
  the first deploy.
- **Expect the mass-delete brake to trip.** Both are bootstrap runs with no
  `.sync-state.json`, where deletion is authoritative. `-- --dry-run` first,
  read the list, then `-- --force-delete`.
- **They would have hit the FastCGI 301 bug** (see the traps section) had they
  been deployed before `2026-08-31-f120b9f`. Deploy that tag or later.
- **The `.htaccess` must be swapped by hand right after the deploy**, with
  `npm run put-overlay:<env>`. A deploy alone deletes the old `index.php` and
  leaves the site broken until that lands.

## The numbers that mean "green"

Recorded 2026-08-31, at commit `f120b9f`, with the dev stack up. If a fresh
checkout does not match these, something moved before you started.

| Command | Expect |
| --- | --- |
| `npm run check` | exit 0 |
| `npx vitest run` | **196** tests, 29 files |
| `npm run test:js` | **120** passed (85 before `put-overlay` landed) |
| `npm run test:e2e` | **18** passed |
| `npm run build` | exit 0, `dist/build/` holds `index.html`, `assets/`, `api-laravel/` |
| `npm run smoke` | 13/13 |
| `docker compose exec -w /var/www/html/api-laravel web php artisan test` | **234** passed (718 assertions) |
| `du -sh web/public/assets/img/` | ~6.1 MB (it was 44.5 MB before 2026-08-29) |

`npm run check` does **not** build and does **not** run the Laravel suite. Run
both separately. In Git Bash prefix the `docker compose exec` with
`MSYS_NO_PATHCONV=1`; PowerShell is fine as-is.

**Run the JS suites from PowerShell, not Git Bash** — see the trap below. From
Git Bash all 29 test files fail to collect at once, which looks exactly like a
catastrophic regression and is not one.

## Branch and merge history

`main` is the trunk again and carries the cutover. Two squash merges landed it:
`cfde526` (the cutover, PR #54) and `f120b9f` (the FastCGI 301 fix, PR #55).
Tag **`2026-08-31-f120b9f`** is the rollback point — tag `cfde526` is
deliberately NOT a rollback target, because its `.htaccess` template takes the
API down on the real host.

**The per-step history lives on `archive/spa-cutover-history`** (140 commits,
head `70a2661`). **Do not delete that branch.** The repo only permits squash
merges, so `main` shows the cutover as two opaque commits; every SHA that
`docs/` references — notably `dcd7862` for the parity reference
`git show dcd7862^:app/pages/<page>.php` — is reachable only through that
branch. `feat/spa-cutover` was auto-deleted on merge despite
`--delete-branch=false`; the archive branch was pushed to recover it.

## Where the three servers actually are

| | Runs | Notes |
| --- | --- | --- |
| **TEST** | `main` @ `f120b9f` — **the SPA** | Deployed 2026-08-31. `.htaccess` carries the SPA fallback + the fixed `.php` exclusion. `api-laravel/.env` present. `config.php` **still there — delete by hand.** Behind HTTP Basic Auth. |
| **QA** | pre-cutover artifact | Old `api/` and `sql/` trees, **no `api-laravel/`**, no `.sync-state.json`, **no `api-laravel/.env`** |
| **PROD** | pre-cutover artifact | Same. `/sanctum/csrf-cookie` 404s there, so the Laravel API has never been deployed to it |

Consequences worth knowing before any deploy:

- **QA and PROD have no `api-laravel/.env`.** Nothing recreates it, and a server
  without it 500s every `/api/*` request, so it must be placed by hand *before*
  the first deploy that dispatches into Laravel. See `staging/README.md`.
- **Their first deploy is a bootstrap run** (no `.sync-state.json`), where
  deletion is authoritative and will remove the entire old tree. It will trip
  the mass-delete brake. Review a `-- --dry-run` first, then `-- --force-delete`.
  (TEST did **not** trip it: 406 stale of 6915 is under the 20% threshold.)
- **Each server still has a dead `config.php`** holding live DB credentials. The
  deploy never removes a protected basename, so delete it by hand, once per
  server.
- `robots.txt` and `deployment.json` are unreachable over HTTP on every
  environment — the fallback catch-all serves the shell for them. That is by
  design (it is what hides `api-laravel/.env`), not a regression. Verified again
  on 2026-08-31.
- The souper feature is flag-gated per server via `SOUPER_SIGNUP_ENABLED` in
  that server's `api-laravel/.env`. A server with it off genuinely has no
  `/signup`, `/signup_thanks` or `/signups_admin`.
- **Environment-dependent values now live only in `api-laravel/.env`.** Config
  is not cached (nothing runs `php artisan config:cache`, and the artifact's
  `bootstrap/cache/` holds only `packages.php`/`services.php`), so editing that
  file takes effect on the next request — no deploy, no cache clear. If anyone
  ever runs `config:cache`, `.env` edits stop working until `config:clear`.

## What is done

Plan 1 (clean slate) is complete: no `app/`, no root Composer project, the tree
is `api/ + web/ + tools/ + docs/`, and `npm run build` emits `index.html` +
`assets/` + `api-laravel/`.

Plan 2 (shell and first page) is complete as well, all ten tasks. `/planning_repet`
is fully ported: the public list, the admin create/edit/delete form, French field
errors against the offending inputs, and both a unit suite and a Playwright
smoke. It was verified against the REAL Laravel API on the dev stack, not only
against the mocks — create, edit and delete each persist across a reload, and an
over-long title comes back as “Titre est trop long (maximum 255 caractères)”.

The remaining work was decomposed on 2026-08-29 into four sub-projects, each
getting its own spec, plan and implementation cycle — see
`docs/superpowers/specs/2026-08-29-auth-and-contact-design.md` for the table.
**All four are done:**

| | Routes | Status |
| --- | --- | --- |
| A. Content pages | accueil, historique, canetons, cd, commencement, moniteurs, sponsors, multimedia, comite_teamdirection | **done** — split into A1 (the visual foundation) and A2 (the nine pages) |
| B. Auth and contact | authentification_inscription, contact, confirmation | **done** |
| C. Members' area | sinscrire, inscriptions_utilisateurs, admin, inscriptions_admin | **done** |
| D. Souper | signup, signup_thanks, signups_admin | **done** — the last one |

The parity reference is `git show dcd7862^:app/pages/<page>.php` and the live
site.

**B — auth and contact** landed `/authentification_inscription` (login *and*
logout, which the SPA had no way to do before), `/contact` and `/confirmation`.
Verified against the real Laravel API in 21 checks: all three seeded accounts log
in through the form and survive a reload, only `demo.admin` sees the admin form,
a contact message reaches `contact_messages`, and an over-long subject comes back
as “Sujet est trop long (maximum 255 caractères)” against the offending input.

**A1 gave the site a design**: the *Scène* direction, chosen from three mocked-up
options (https://claude.ai/code/artifact/ec2ff76f-b64a-4fd0-a5ed-89c5ab2c5a3b).
Near-black chrome, light page body, violet as the interface accent, Lilita One
and Karla self-hosted through Fontsource. The image directory went from **44.5 MB
to 6.1 MB** at the same time.

**C — the members' area** carried two things worth knowing about:

- The register counts on the summary are **derived from the response**, not from
  the hardcoded array of nine French instrument names the old page carried. The
  endpoint returns every user with their instrument, so the list falls out of
  the data and cannot drift from the `instruments` table.
- `/admin` is a **hub** now — links to the planning page and the summaries —
  rather than the old two buttons, both of which had become redundant. That was
  an approved design change, not a port.

C also wired the first `RequireAuth` / `RequireCapability` guards; before it,
`grep RequireAuth web/src/routes.tsx` returned nothing and nothing exercised the
bounce end to end because there was no gated URL to bounce from.

**D — the souper** built the three flag-gated routes and the `/accueil`
call-to-action together, because the CTA's two buttons link to `/signup` and
`/signups_admin`. `GET /api/config` already returned `occasion` with every field
the CTA needs (`title`, `subtitle`, `dateDisplay`, `teaser`, `invitation`), so
the pages read the copy from the session rather than fetching anything extra.
The CTA splits on the `view_summary` capability, **not** on being logged in — a
`user` sees the same public half an anonymous visitor sees.

**Read the palette spec before touching the colours.** The old per-page CSS looks
like a decade of drift — magenta headings on one page, two blues on another —
and it is not. The band is a youth Guggenmusik that performs in **UV costumes at
night**; those colours came from the band's own look. Neon on black IS the
identity, and a tasteful white site would look like a different band. Open
`web/public/assets/img/canetons.jpg` before deciding otherwise.

### Open content questions — for the band, not for code

Three things the port reproduced faithfully rather than deciding. None is a bug;
all three need someone who knows the band to answer. **All three are still open.**

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

## Three contract defects that were fixed — do not reintroduce them

All were in committed code, none was caught by any test, and each made the data
layer silently wrong. **There are no known outstanding ones.**

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
3. **`GET /api/responses` was typed `string[]` too**, for the identical reason,
   and was fixed the identical way on 2026-08-29 —
   `api/tests/Feature/ResponseShapeContractTest.php` is the guard. It differs
   from `EventShapeContractTest` in needing a database: the event shape has a
   seam (`Event::toFrontendShape()`) callable on an unsaved model, and the
   response shape does not, so it asks the endpoint instead.
4. **`GET /api/signups` was typed `string`** — the whole summary, a bare string —
   for the third instance of the same failure, this time through both
   `Collection::map` and `SignupStats::compute()`. Fixed in D, the same way, and
   guarded by `api/tests/Feature/SignupShapeContractTest.php`.

   That test differs from its two siblings in **walking the shape recursively**:
   it compares key sets at every level, not just the top. That is not
   thoroughness for its own sake — the flat version was written first, and it
   accepted a nested `occasion: string` that the recursive one caught. It also
   asserts specifically on the `application/json` branch of the 200, because
   `index()` returns `JsonResponse|StreamedResponse` (`?format=xlsx` streams a
   spreadsheet) and the spreadsheet content type is legitimately a string; an
   assertion that took whichever branch came first would pass on the xlsx one
   and prove nothing about the JSON the SPA parses.

**`openapi-drift` would not have flagged any of these** — it checks the
committed document matches what Scramble emits, not that the shape is right.

## Decisions the souper took that the code cannot explain

- **The table-name datalist was dropped on purpose.** The old public form
  server-rendered a `<datalist>` of every existing table name to anonymous
  visitors — and the field's own label is *"nom de famille ou nom de table"*, so
  the page published the surnames of everyone who had already reserved, to
  anyone who opened it. The free-text field and its reworded hint are the
  replacement. The accepted cost is real and should be stated plainly: a typo
  splits a family across two tables and nothing warns them. The admin summary
  groups by exact string, so it is at least *visible* there and fixable in the
  database.
- **Per-person menu rows were kept over a quantity stepper.** A stepper would
  produce an identical payload — the API only ever counts `menus[]`, and their
  order is never read — and is fewer clicks for a table of eight. It was
  rejected anyway, as a visible change to a page returning visitors have already
  used. This is a port, and the stepper is a redesign.
- **The mocked backend answers 400, not 422.** `ApiError::validation()` returns
  **400**, and `OpenApiDocumentTest` explicitly pins that 422 is never used
  anywhere in the API. The MSW handlers had been wrong about this for `/contact`
  since before the souper existed; both it and the new signup handler are
  correct now. A mock that answers the wrong status trains the SPA against an
  API that does not exist.

## Lessons from D that are not in any file

- **A green suite still cannot see layout.** `/signups_admin` at 390px had
  `w-full` on the table inside its `overflow-x-auto` wrapper, so the table
  *squeezed* instead of scrolling: phone numbers stacked five lines deep and the
  Total column hung off the edge. Every automated check passed — including the
  one asserting the page body does not scroll sideways, which was true and
  irrelevant. It was found by screenshotting the page and looking at it. There
  is now an e2e test pinning that the table scrolls inside its own panel.
- **The honeypot's transmission is pinned by a unit test, not by e2e**, and it
  has to be. A trapped submission returns a plain `201 {"ok":true}` — byte for
  byte what a real success returns, deliberately, so a bot learns nothing —
  which means Playwright can observe no difference at all. Only the request body
  differs. The test asserts on what is submitted, not on what is rendered; a
  rendering test would have passed against a honeypot that was never sent.

## Verified against the real API — 2026-08-29

D was verified against the real Laravel API on the dev stack, not only the
mocks. Nine checks, all passing:

1. a reservation submitted through `/signup` reaches the `signups` table with
   `occasion: anniversary-supper`;
2. an over-long first name comes back as
   **“Prénom est trop long (maximum 255 caractères)”**, rendered against its own
   input;
3. a malformed address comes back as
   **“E-mail n'est pas dans un format valide”**, likewise against its own input;
4. the admin summary at `/signups_admin` counts the new reservation;
5. the export link downloads a real `.xlsx`;
6. that file carries the formula-injection guard — the leading `+` of a phone
   number is quoted;
7. `demo.user` is refused **in place** at `/signups_admin`, and
   `GET /api/signups` is never issued at all — the guard refuses before the
   query mounts, so the refusal is not merely cosmetic;
8. the confirmation mail arrives in Mailpit;
9. a honeypot submission returns 201 while storing no row and sending no mail.

**The dev `signups` table now holds one legitimate row** from that verification
(id 1, `anniversary-supper`). Do not assume a clean slate; the Laravel suite is
unaffected, since it uses the throwaway `laravel_api_test` database.

## Traps worth knowing before you touch anything

### The one that took TEST down, minutes after the cutover

**`easy-hebergement` runs PHP through a FastCGI wrapper, and that changes the
URL mod_alias sees on a re-entered rewrite pass.** Not
`/api-laravel/public/index.php` but:

```
/cgi-bin/php5.fcgi/api-laravel/public/index.php
```

So the start-anchored guard `^/(?!api-laravel/)(.*)\.php$` tested the characters
right after the leading slash — `cgi-bin/` — the exclusion never fired, and
**every `/api/*` and `/sanctum/*` request 301'd** to
`/cgi-bin/php5.fcgi/api-laravel/public/index`. The API was entirely down while
every public page rendered perfectly, which is exactly what makes this class of
bug easy to ship.

The fix is `(?!.*api-laravel/)` — match `api-laravel/` **anywhere** in the path,
so it holds whatever prefix the host's PHP wrapper adds. Do not "tidy" that `.*`
away; it looks redundant and is not.

**Two reasons nothing caught it, both now closed:**

1. **It is not reproducible locally.** The Docker stack serves PHP without that
   wrapper path, so `npm run smoke` passes 13/13 against a build that takes the
   real API down. **Local green does not mean the host is green** for anything
   touching `.htaccess`.
2. **The regression test was a substring check.** It asserted the pattern
   *contained* `(?!api-laravel/`, which stayed true while the rule was broken.
   `tools/build-overlays.test.mjs` now compiles the actual pattern and runs the
   fcgi-prefixed path through it. Assert behaviour, not spelling.

**How to check this in seconds after any `.htaccess` change:** request
`/api/config` with `redirect: 'manual'`. A `301` whose `Location` contains
`cgi-bin` means this bug is back. A `200` with JSON means the dispatch works.

### Check a display font's glyph data BEFORE adopting it

Lilita One was dropped on 2026-08-31 because its woff2 ships incorrect `glyf`
bounding boxes on **104 of its 210** outline glyphs, so Firefox's OpenType
Sanitiser logged a warning for every heading glyph it drew. Nothing rendered
wrong — it was console noise — but it is avoidable noise, and several other
fonts in the same heavy-display register are worse.

Measured with fontTools in a throwaway venv (this is not a project dependency,
and does not need to become one):

```bash
python -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli
/tmp/fontenv/bin/python - <<'EOF'
from fontTools.ttLib import TTFont
f = TTFont('node_modules/@fontsource/<name>/files/<name>-latin-400-normal.woff2')
glyf = f['glyf']
bad = 0
for n in f.getGlyphOrder():
    g = glyf[n]
    if getattr(g, 'numberOfContours', 0) == 0:
        continue
    old = (g.xMin, g.yMin, g.xMax, g.yMax)
    g.recalcBounds(glyf)
    bad += old != (g.xMin, g.yMin, g.xMax, g.yMax)
print(bad, 'glyphs with an incorrect bbox')
EOF
```

Results recorded 2026-08-31, so nobody re-measures: **clean** — Bungee (0/343),
Anton, Archivo Black, Alfa Slab One, Passion One, Righteous, Fredoka One, and
Karla (the body face, 0/274). **Not clean** — Lilita One (104/210), Bowlby One
(13, and no latin-ext), Titan One (9).

**This is deliberately NOT a CI test.** Doing it in Node means either a new
dependency or hand-parsing the woff2 glyf transform, and a partial parser would
give false confidence about the exact thing it is meant to guarantee. A display
face changes roughly never; the check is a minute by hand at the moment of
choosing, which is the only moment it matters.

Also worth knowing: **Bungee's lowercase glyphs are drawn as capitals.** It is a
signage face, so every heading renders in caps whatever the source text says.
That is the look, not a bug — but it means a heading cannot be sentence-case
while this face is in use.

### `npm run dbmigrate:<env>` defaults to APPLY, not dry-run

`tools/dbmigrate.mjs` builds `?mode=apply` unless you pass `-- --dry-run`. The
endpoint defaults to dry-run for anything that is not exactly `apply`, but the
tool sends `apply`. Do not point it at PROD casually.

### `build-overlays.mjs` deletes the directory it builds into

It opens each env with `rmSync(outDir, {recursive: true, force: true})`, so
anything you leave in `dist/overlay/<env>/` is destroyed by the next
`build:overlay`. This is why `put-overlay` writes its rollback backup to
`dist/htaccess-backups/` instead. It also substitutes only the *quoted*
`AuthUserFile "__HTPASSWD_PATH__"` and deliberately leaves the bare token in a
NOTE comment — so a guard matching the bare token refuses every correctly built
test/qa overlay.

### A deploy alone does not turn a server over — it breaks it

`.htaccess` is server-owned and never uploaded by a deploy. The deploy uploads
the SPA, then **deletes** the old `index.php`; until the new `.htaccess` lands
the site is down. Order: deploy, then **immediately**
`npm run put-overlay:<env>`. On TEST that window is free (Basic Auth, no
visitors). On PROD it is real downtime, and there is no atomic swap over FTP.


**Run the JS suites from PowerShell, not Git Bash.** Git Bash reports the cwd
with a **lowercase** drive letter (`c:\Workspace\...`) where PowerShell reports
`C:\`. Vitest 4 keys module resolution off that path, and from Git Bash it fails
to collect **every single test file** with *"Vitest failed to find the runner"*,
pointing at `web/src/setupTests.ts`. It presents as 29 red files and a
catastrophic regression, and it is a shell difference. This has cost two
debugging sessions; it is now also in `CLAUDE.md`.

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
buttons on the same row. The `/accueil` souper CTA splits the same way, on
`view_summary` rather than on being logged in. Every intuition about roles says
otherwise, and the SPA's guards are UX only, so a mistake will not surface as a
403.

**`Config200Occasion` types every field as a string LITERAL** — `title:
"Souper des 25 ans des Canetons"`, `maxGuests: 30`, and so on, because Scramble
read them off `App\Support\Occasion`'s constants. Any mock or fixture typed as
`Config200` must use those exact strings or it will not compile.

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

**A design change is only checkable by looking at it.** This has now bitten
three times. Two defects survived a fully green `npm run check`, 132 unit tests,
11 e2e tests and a clean build: the footer floated halfway up short pages (the
old `main.css` sticky-footer pattern was never ported, and it was invisible
while the footer had no background), and the env ribbon sat mostly outside the
viewport. The third was the squeezed admin table described above. Screenshot the
routes — driving Playwright and reading the PNGs works well — rather than
trusting the suite.

**Playwright's `getByLabel` is a case-insensitive SUBSTRING match; Testing
Library's is exact.** The same label works unqualified in a Vitest test and
fails strict mode in an e2e one: `getByLabel("Nom:")` also matches `"Prénom:"`,
because "nom:" is its tail. The souper form makes this worse still — it has
"Nom", "Prénom" *and* "Nom de table" on one page. Every locator in
`web/e2e/auth.spec.ts` and `web/e2e/souper.spec.ts` passes `{ exact: true }`,
including the ones that do not collide today — one added field is all it takes,
and the failure reads as a bug in the page.

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
npm run put-overlay:test   # upload the SERVER-OWNED .htaccess/robots.txt;
                           # backs up what it replaces, uploads nothing else,
                           # deletes nothing. Add -- --dry-run to rehearse.
```

Note that :8090 serves whatever `npm run build` last produced and does **not**
pick up source edits — that is the point, it is the parity check. Day-to-day
frontend work happens on :5173.

Seeded logins, all passwords `demo`: `demo.admin`, `demo.moderator`,
`demo.user`. The MSW mocks accept the same three.
