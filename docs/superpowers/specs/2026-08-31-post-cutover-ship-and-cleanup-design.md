# Post-cutover: ship, clean up, rework content — design

**Date:** 2026-08-31
**Branch:** `feat/spa-cutover` (sub-project A ships it to `main`)
**Status:** sub-project A approved, ready for a plan. B–E decomposed only.

## Why this exists

The SPA cutover is code-complete and verified green, but unmerged: `main` still
holds the old PHP front end and all three servers still run it. Separately,
four more things were asked for — an English-everywhere pass, a structural
clean-up including renaming `api-laravel/`, a deployment test, and a content
plus visual rework.

That is five independent workstreams, not one task. This document decomposes
them, records the decisions taken in conversation (several of which reverse the
original premise), and designs **sub-project A** in full. B–E get their own
spec each.

## The decomposition

| # | Sub-project | Depends on | Status |
| --- | --- | --- | --- |
| **A** | Ship the cutover: merge, deploy TEST, verify, tag | — | designed below |
| **B** | Structure clean-up: English filenames, dead files, tracked junk | A | not designed |
| **C** | Content audit: dead links, stale media, redundancy | A | not designed |
| **D** | Content corrections: committee, schedule, factual claims | C + owner input | not designed |
| **E** | Restyle polish + mobile optimisation | C, D | not designed |

**E deliberately comes last.** Restyling pages whose content is about to be
rewritten means styling them twice. C and D settle *what the pages say* before E
settles *how they look*.

## Decisions taken in conversation

These reverse or narrow the original request and are the reason this spec looks
different from the ask.

### `api-laravel/` is NOT renamed to `api/`

Requested as "if possible". It is possible, and it was rejected on
cost/benefit.

The dispatch in `config/htaccess/site.htaccess` works *only* because
`^api(/|$)` cannot match `api-laravel/…` — the hyphen defeats `(/|$)`. That is
the sole reason the substitution does not re-match its own output. Rename the
directory to `api` and the substitution matches itself; `[L]` ends only the
current rewrite pass, so Apache loops to its 10-internal-redirect limit and
answers **500 on every `/api/*` request**. Making it safe requires a
`REDIRECT_STATUS` guard on both dispatch rules.

The compounding problem is deployment, not Apache. `.htaccess` is
**server-owned and never uploaded by a deploy**, so the rename requires
hand-editing `.htaccess` on TEST, QA and PROD in lockstep with the code deploy.
Get the order wrong on any one of them and that server's API is down.

Against that: the directory is not web-reachable (the SPA fallback catch-all
serves the shell for it), appears in no URL, and is read by nobody day to day.
The payoff is a cosmetically nicer name in an FTP root.

**Decision: keep `api-laravel/`.** Sub-project B instead removes the leftovers
that genuinely confuse — the root `.env.example` sitting beside
`api/.env.example`, the untracked `.tmp/legacy/` scratch copy of the deleted PHP
app, and stale references in docs.

### "English everywhere" is already ~95% done

The database, API response bodies, error tokens, route comments and code
comments are already English, per `CLAUDE.md`'s language policy. What remains:

- **14 French page components**, e.g. `web/src/pages/Accueil.tsx`,
  `Sinscrire.tsx`, `Historique.tsx`, `PlanningRepet.tsx`,
  `InscriptionsUtilisateurs.tsx`. These mirror the **frozen French URLs** 1:1.
  Renaming them changes no URL and is safe, but costs that mapping — which is
  what makes `routes.tsx` legible and what the parity reference
  (`git show dcd7862^:app/pages/<page>.php`) is keyed to.
- **`souper` and `inscriptions_*`** in the API, mostly frozen route names
  appearing as string literals. `souper` is also the band's own name for the
  event, arguably a proper noun.

Sub-project B decides the filename question. It is a naming trade-off, not a
policy violation, and it is not urgent.

### The restyle already happened; E is a polish pass

`docs/superpowers/specs/2026-08-29-visual-foundation-design.md` chose the
*Scène* direction — black/neon chrome, light body, Lilita One + Karla — and all
23 routes were built on it two days ago. "Bring it to 2026" was clarified to
mean **keep Scène, polish it**: mobile ergonomics, spacing rhythm, motion,
image treatment, touch targets, and specifically the members' area on a phone
at a rehearsal, which is the site's only repeat-use surface.

### Content: audit first, then answers

Mechanical problems can be found in the tree. Factual ones cannot: who is on
the committee, whether the rehearsal schedule is current, whether the history
text is right. Sub-project C therefore produces a **written audit** — every
page, every claim, every link with its live HTTP status, flagged
`verify` / `likely stale` / `dead` — which the site owner answers. Nothing is
invented.

Already visible without the audit: 13 sponsor/carnival links, all plain
`http://`, several likely dead (`3canards.ch`, `lesgouillesagasses.com`,
`ladecaps.com`, `13carnavaleux.com`); and `web/src/pages/Multimedia.tsx` is a
single **2016** France 3 embed, now ten years old.

## Sub-project A — ship the cutover

### Verification recorded 2026-08-31 at `e304362`

Run before designing this, from PowerShell (the Git Bash/Vitest trap in
`CLAUDE.md` applies), with the Docker stack up. Every number matches the
2026-08-29 record, so nothing drifted:

| Command | Expected | Observed |
| --- | --- | --- |
| `npm run check` | exit 0 | exit 0 |
| `npx vitest run` | 196 tests, 29 files | 196, 29 |
| `node --test tools/…` | 85 | 85 |
| `npm run test:e2e` | 18 passed | 18 passed |
| `npm run build` | both halves present | 6526 files, 6494 in `api-laravel/` |
| `npm run smoke` | 13/13 | 13/13 |
| `php artisan test` (in Docker) | 234 passed, 718 assertions | 234, 718 |

### Server truth, probed read-only 2026-08-31

```
OK Preflight    — guards OK · .env shape OK
OK Scan         — 6524 files hashed
OK Remote state — .sync-state.json @ ffedf84 (6915 files)
OK Plan         — 15 new, 30 changed, 6479 unchanged, 406 stale
```

Four things this settles, each of which was an open risk:

1. **The mass-delete brake does not trip.** It needs `>50` deletions **and**
   `>20%` of the remote tree (`tools/deploy/sync.mjs`). 406 clears the first and
   not the second (20% of 6915 is 1383). So CI's `deploy-test` job, which runs
   `npm run deploy:test` with no flags, **succeeds as written**. No
   `--force-delete`, no hand deploy needed on the brake's account.
2. **No `.env` drift.** `git diff main..feat/spa-cutover` touches neither
   `api/.env.example` nor `api/database/migrations/`, and the live preflight
   confirms TEST's key set matches. Nothing to hand-edit before deploying.
3. **Nothing to migrate.** TEST's schema is already current. Confirmed against
   the live endpoint.
4. **TEST's Laravel API is already live**, so TEST's `.htaccess` already carries
   the `/api` dispatch. Only the SPA-fallback half is missing.

The 406 stale files are the old root `vendor/` (Twig and friends) plus the old
`app/` tree. `api-laravel/`'s 6479 files are byte-identical already.

The scan hashes 6524 files where the build wrote 6526: `walkBuild` excludes
PROTECTED basenames at any depth, and the artifact contains two — Laravel's own
`api-laravel/.htaccess` and `api-laravel/public/.htaccess`, neither of which is
ever uploaded. The two counts are consistent, not a discrepancy.

**A trap worth recording:** `npm run dbmigrate:<env>` defaults to **apply**, not
dry-run — `tools/dbmigrate.mjs` builds `?mode=apply` unless `-- --dry-run` is
passed. The probe above therefore ran in apply mode. It was harmless (nothing
was pending), but the flag matters before anyone points this at PROD.

### The load-bearing risk: the deploy alone breaks the site

`config/htaccess/site.htaccess` **does not exist on `main`.** On `main` the site
rules come from `app/.htaccess`, a front controller dispatching everything to
`index.php`; the SPA-fallback template is new on this branch. TEST's live
`.htaccess` is therefore *Basic Auth block + old front controller*, and
`.htaccess` is server-owned — the deploy never uploads it.

The deploy runs **Upload → Delete stale** (`tools/deploy/cli.mjs`), so:

1. **Upload phase** — new `index.html` and `assets/` land alongside the old app.
   Site still works, still serving PHP.
2. **Delete phase** — old `index.php` and `app/` are removed. **Site now
   broken**: `.htaccess` still routes every request to a file that is gone.
3. **`.htaccess` replaced** — the SPA fallback takes over. *This* is the cutover
   moment, not the deploy.

The window between 2 and 3 cannot be closed: FTP on shared hosting offers no
atomic swap. On TEST it costs nothing (Basic Auth, no visitors), and rehearsing
it there is how the PROD timing gets learned. Minimising it is why A3b is
scripted rather than done by hand in an FTP client.

### `config.php` is not deleted by the deploy

It is a PROTECTED basename (`tools/deploy/preflight.mjs`), deliberately: that
set is what stops a bootstrap or `--relist` run deleting files the tool did not
place. It holds live DB credentials from the old app and must be removed **by
hand, once per server**, after which it can drop out of the set.

`tools/put-overlay.mjs` deliberately does **not** delete it. A tool that
uploads one file and deletes nothing is trivially safe to run in a hurry, which
is the whole point of A3b; giving it a delete path would undo that. `config.php`
is also not time-critical — the SPA fallback already makes it unreachable over
HTTP — so it is a one-time manual clean-up per server, not part of the cutover
window.

### Phases

| | What | Gate |
| --- | --- | --- |
| **A2** | Open a PR from `feat/spa-cutover`, Conventional Commits title (`.github/workflows/pr-title.yml`), body from the template. CI green on the merge ref. Merge `--no-ff`. | 127 commits preserved; CI green |
| **A3a** | CI's `deploy-test` job auto-deploys on the merge | 15 new, 30 changed, 406 deleted; exit 0 |
| **A3b** | Run `npm run put-overlay:test` immediately: uploads `dist/overlay/test/.htaccess` only | site answers the SPA on `/` |
| **A3c** | Delete `config.php` on TEST, once — **by hand, in an FTP client** | gone |
| **A4** | Verify, then tag `2026-08-31-<short-sha>` | rollback target exists |

### A3b: `tools/put-overlay.mjs`

A deliberately small tool, because the alternative is a human racing a deploy in
an FTP client.

- **Signature:** `node tools/put-overlay.mjs <test|qa|prod> [--dry-run]`, wired
  as `npm run put-overlay:<env>`. Never invoked directly, per house convention.
- **Does exactly one thing:** upload `dist/overlay/<env>/.htaccess` (and
  `robots.txt` where the overlay emits one) to the site root. It uploads
  *nothing else* and deletes *nothing*.
- **Downloads and saves the existing `.htaccess` first**, printing the path, so
  a rollback has the file it needs. Refuses to proceed if that backup fails.
- **Reuses what exists:** `basic-ftp` is already a dependency;
  `tools/deploy/preflight.mjs`'s `checkTargetDir` guard is reused verbatim, so
  the tool hard-refuses unless `FTP_DIR` names the target env — the same
  wrong-environment protection the deploy has.
- **Refuses if the overlay is absent**, rather than uploading nothing and
  reporting success. `npm run build:overlay` must have run.
- **Refuses if the overlay still carries an unsubstituted auth path** — i.e. it
  contains the literal `AuthUserFile "__HTPASSWD_PATH__"`, which would lock the
  environment out with a 500. The check must match that *quoted directive form*,
  not the bare token: `mergedHtaccess()` in `tools/build-overlays.mjs`
  deliberately substitutes only the quoted value and leaves the bare
  `__HTPASSWD_PATH__` in the explanatory NOTE comment, so a bare-token check
  would refuse every correctly built test/qa overlay.
- **Does not upload `.htpasswd`**, even though the overlay may contain one. It
  is credentials, TEST already has a working copy, and re-uploading it during a
  cutover window adds a way to lock yourself out for no gain. It stays a
  hand-placed, once-per-server file per `staging/README.md`.
- **Uploads `robots.txt` only when the overlay emits one.** test/qa get one from
  `staging/<env>/robots.txt`; prod gets none now that `app/` is deleted, so the
  tool must treat it as optional rather than failing.
- **Credentials:** read the same way the deploy reads them, and never logged.
  Note the known, deliberate `FTP_PASSWORD` (in `.env.*`) versus `FTP_PASS`
  (read by the tooling) mismatch — the tool reads `FTP_PASS`; the env files are
  not to be "fixed".
- **Exit codes** match the deploy CLI: 0 ok, 1 failure, 2 refused by a guard.
- **Tested** in `tools/put-overlay.test.mjs` under `npm run test:js`: the env
  guard refuses a mismatched dir, a missing overlay refuses, an unsubstituted
  `__HTPASSWD_PATH__` refuses, a failed backup refuses, and `--dry-run` writes
  nothing. FTP itself is stubbed, as the deploy tests stub it.

### A4 verification gate

Against `https://test.lescanetons.org` with Basic Auth:

- `/` serves the SPA shell and the home page renders
- `/api/config` returns JSON with `env: "test"`, and the corner ribbon shows
- `/sanctum/csrf-cookie` sets the cookie
- a legacy URL — `/accueil.php` — 301s to `/`
- `/index.html` does **not** redirect (the loop guard holds)
- `demo.admin` logs in, reaches `/inscriptions_admin`, and is refused `respond`
- an unknown URL answers 200 with the SPA's own 404 view, by design
- `api-laravel/.env` is not readable over HTTP

Then tag `2026-08-31-<short-sha>` from the merge commit.

### Out of scope for A

**QA and PROD.** Both are bootstrap runs with no `.sync-state.json`, where
deletion is authoritative and the brake *will* trip; neither has a hand-placed
`api-laravel/.env`, without which every `/api/*` request 500s; and PROD has
never had the Laravel API at all (`/sanctum/csrf-cookie` 404s there). Promoting
to them is its own sub-project, after TEST proves this sequence.

## Testing strategy

A is a deployment, so its test is the A4 gate against a live server, not unit
tests. The one piece of new code — `tools/put-overlay.mjs` — is covered by
`tools/put-overlay.test.mjs` in `npm run test:js`, with FTP stubbed, following
the pattern already established in `tools/deploy/*.test.mjs`.

The existing suites are the regression net and were confirmed green at
`e304362` before any of this starts.

## Rollback

Redeploy the previous tag and restore the previous `.htaccess`. Both halves are
required: the code artifact and the server-owned file turn over together, so
rolling back one without the other leaves the same broken state A3b exists to
avoid. This is why `tools/put-overlay.mjs` backs up the live `.htaccess` before
overwriting it and prints where the copy went.
