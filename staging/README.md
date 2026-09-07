# Staging environments

Access-control configuration for the two staging sites hosted on
`easy-hebergement.net`. These folders are **not** part of the `npm run build`
FTP payload — they are the small, hand-managed control layer that sits in front
of each staging deployment.

| Local folder    | Server folder (`public_html/staging/…`) | URL                 | Purpose               |
| --------------- | --------------------------------------- | ------------------- | --------------------- |
| `staging/test/` | `<test-host>/`                          | https://<test-host> | TEST — current `main` |
| `staging/qa/`   | `<qa-host>/`                            | https://<qa-host>   | QA                    |
| `staging/prod/` | `<prod-host>/`                          | https://<prod-host> | PROD                  |

> The local folder names (`test`, `qa`) are just a mirror for version control.
> On the server the directories are named after the hostname
> (`<test-host>`, `<qa-host>`), which is what the absolute
> `AuthUserFile` path in each `.htaccess` points at. Keep the `.htaccess` path in
> sync with the real server folder, not the local name.

## What actually lives on a staging server

A server folder is **two layers stacked in the same directory**:

1. **The application payload** — the exact output of `npm run build`: the SPA
   shell at the root (`index.html`, `assets/`) plus the whole Laravel project at
   `_api/`. Environment-agnostic: the _same bytes_ on test, qa, and prod.
   It does not include `_api/.env`.
2. **The server-owned files** — different on every environment, so they are set
   once per server and never travel with a code promotion:
   - `.htaccess` — test/qa add HTTP Basic Auth + `noindex` on top of the site
     rules; prod has the site rules only.
   - `robots.txt` — test/qa `Disallow: /`; prod the real one (or none).
   - `config.php` — **dead.** It configured the old front end, which no longer
     exists. Still present on every server because the deploy never deletes a
     protected path; delete it by hand, once per server, and note that it
     holds live DB credentials until you do.
   - `_api/.env` — the only configuration that matters now: `APP_KEY`, DB creds
     and `MIGRATE_TOKEN` (git-ignored, set by hand). See
     [Laravel's server-side `.env`](#laravels-server-side-env) below.

Two further `.htaccess` files travel **with** the code artifact instead —
tracked source, built into every `dist/build/`, not server-owned — because the
FTP account is chrooted to the web root and the Laravel API project (`api/`)
therefore sits physically *inside* the document root, unlike Laravel's normal
deployment where everything but `public/` lives outside it:

- `api/.htaccess` (ships as `_api/.htaccess`) — `Require all denied`
  over the whole Laravel tree, so `.env`, `vendor/` and `app/` are unreachable
  even though they are physically web-accessible.
- `api/public/.htaccess` (ships as `_api/public/.htaccess`) —
  `Require all granted`, re-granting access back for the one subdirectory
  that's meant to be reachable (Apache evaluates authorization against the
  resolved file's parent directories, and with `AuthMerging` at its default of
  `Off` the innermost `Require` replaces rather than adds to the inherited
  one).

Each is written **twice**, once for `mod_authz_core` (2.4's `Require`) and once
for 2.2's `Order`/`Deny`, discriminated by `<IfModule mod_authz_core.c>`. This
host's Apache version is unresolved — it 500s on `<RequireAny>`, which leans
2.2 — and a directive the server does not understand 500s every request in that
directory, which is every `/api/*` call. Do not collapse either file to one
block.

**Every deploy from now on uploads both.** None ever did before 2026-09-07:
`tools/deploy/preflight.mjs` protected the basenames `.htaccess` /
`robots.txt` / `config.php` / `.htpasswd` / `.env` **at any depth**, so both
files above were silently dropped from every upload for the whole life of the
project, even though `tools/build.mjs` had always copied them into the
artifact. `PROTECTED_PATHS` is now a set of **exact root-relative paths** —
`.htaccess`, `robots.txt`, `.htpasswd`, `config.php` and `_api/.env` — so the
four at the deploy root stay server-owned while the two nested `.htaccess`
files travel with the code, which is what they were always for. (Three files
travel, strictly: the basename `robots.txt` also dropped Laravel's stock
`api/public/robots.txt`, which is harmless and unreachable behind the
catch-all.)

**That is a fact about the tool, not about any server. Assume the boundary is
absent until a server answers 403.** A server acquires the two files on its
first deploy after that change and nothing back-fills, so a server not deployed
to since still has neither — and there the SPA fallback's catch-all is still
the only layer, which is what it was on every server before the cutover: a
direct hit on `/api-laravel/.env` or `/api-laravel/vendor/autoload.php` was
rewritten to `index.html` and answered the SPA shell rather than the file. That
worked, and it was the judgement the `/api/*` cutover shipped on, but it was
one overlay edit away from not working, with no error and no test failing. Nor
is it yet established that this host will accept the new directives at all:
that is what the TEST cutover verifies, and if Apache 500s on them the
documented fallback is to FTP-delete both files, which leaves this host with no
Apache-level boundary available even in principle. The one thing that settles
it for a given server is `/_api/.env` there answering **403** rather than a 500
or the SPA shell.

**ANSWERED for this host, 2026-09-07.** The TEST cutover ran and `/api/config`
answered **200** while `/_api/.env` answered **403**, so easy-hebergement's
`AllowOverride` does permit `Require`/`Order` in a `.htaccess`: the
Apache-level boundary around the Laravel tree is real here, not merely
intended, and the FTP-delete contingency below was not needed. TEST is the only
server this has been established on — QA and PROD inherit the same overlay and
the same artifact, so they are expected to behave identically, but neither has
been deployed to yet. What it does NOT settle: the `<IfModule !mod_authz_core.c>`
arm is still untested anywhere (a host that needed it could not say so without
500ing), and it does not resolve the Apache *version* question that forced
`[L]` over `[END]`.

**Verified on TEST the same day, with no account and no browser.** Two checks
worth repeating after any future cutover, because between them they prove
Laravel booted, reached its database, and is hardening its session the way the
suite claims:

```bash
# Schema current? --dry-run is REQUIRED: this command defaults to apply.
npm run dbmigrate:test -- --dry-run
#   -> status ok, applied [], pending []

# Session cookie flags? Starting a session is enough — no login needed.
curl -si -u "USER:PASS" https://test.lescanetons.org/sanctum/csrf-cookie   | grep -i "^set-cookie"
```

The second answered `les-canetons-api-session` with **Secure, HttpOnly and
SameSite=strict**, and `XSRF-TOKEN` with Secure and SameSite=strict but
deliberately NOT HttpOnly — the SPA has to read that one to replay the header.
The `strict` on the session cookie is the notable half: Sanctum's
`EnsureFrontendRequestsAreStateful` forces `session.same_site` to `lax` on
every `/api` request, and `App\Http\Middleware\EnforceAbsoluteSessionLifetime`
restores the configured value before `StartSession` builds the header. Until
this run that fix had only ever been proven by the test suite.

(`GET /api/config` sets no cookie, which is consistent rather than odd: Sanctum
only starts a session for a request whose `Origin` matches
`SANCTUM_STATEFUL_DOMAINS`, and a bare curl sends none.)

**That FTP delete is not durable.** Both files are in the artifact and
deliberately *not* protected paths, so a routine state-based deploy leaves them
alone but a `--relist`, a `--force` or any bootstrap run sees them missing from
the remote tree, calls them new, and uploads them straight back — putting the
server back to 500 on every `/api/*` request, with nothing to catch it (`npm run
smoke` runs against localhost and CI cannot reach this host). Use the delete to
get the site back in the moment; the **durable rollback is to delete the two
files from `api/` in the repository and redeploy.**

Note the one entry that is deliberately *not* at the root. `_api/.env` is
nested by definition, is absent from the artifact, and exists nowhere else, so
it is named as a full path rather than dropped from the set — and that makes it
**the one thing a rename of the deployed directory must not miss**. If that
entry stops matching, the next `--relist` or bootstrap deploy classifies every
server's hand-placed API configuration as stale and deletes it.

**Where they land and are read, the boundary becomes Apache's authorization
rather than the app's routing** — and that is an upgrade, not a tidy-up.
Authorization is evaluated during Apache's directory walk, *before*
mod_rewrite's per-directory rules run in the fixup phase, so a request for
`/_api/.env` is refused with a real **403** and the SPA fallback never sees it
(verified against the local stack; see the comments in `api/.htaccess`).
`npm run smoke` asserts **exactly 403** on `/_api/.env` and
on `/_api/vendor/autoload.php` — it asserted only "not exposed" while either
mechanism could be the one answering, which meant the check could not tell the
two apart. A 200 there now means the deny-all did not answer: `_api/.htaccess`
either did not deploy, or is not being read (`AllowOverride`).

**The catch-all remains a layer in its own right, and weakening it is still
not free.** The deny-all covers only the Laravel tree; the catch-all is what
keeps everything *outside* it unreachable — each server's now-dead
`config.php`, with its live DB credentials, and any future stray file. Adding
an `!-f`/`!-d` guard, narrowing its pattern, or dropping it from an overlay
would serve those as themselves; it would also put the Laravel tree back on
one layer on any server whose `_api/.htaccess` failed to arrive. Treat the
catch-all in `config/htaccess/site.htaccess` as a security control — and, on
any server the deny-all has not reached, as the only one.

## Deployment: build once, promote one artifact

```bash
npm run build           # -> dist/build/  (index.html + assets/ + _api/; no .env)
npm run build:overlay   # -> dist/overlay/{test,qa,prod}/  (the generatable server-owned files, per env)
```

1. **First-time per server:** upload that env's `dist/overlay/<env>/` files
   (`.htaccess`, `robots.txt`, and for test/qa `.htpasswd`), and create
   `_api/.env` by hand (see
   [Laravel's server-side `.env`](#laravels-server-side-env)). Re-run
   `build:overlay` and re-upload only the `.htaccess` when
   `config/htaccess/site.htaccess` or the auth block changes — and note that
   the `/api/*` dispatch block lives in that template, so a server still
   running a pre-cutover overlay has no dispatch at all and answers every
   `/api/*` call from the SPA fallback instead.
2. **Releasing (normal path — CI):** a merge to `main` auto-deploys to **TEST**.
   Once you've verified TEST, dispatch `Tag Release` (see "CI: decoupled
   tag-based promotion" below) to stamp that commit; then dispatch `Deploy QA`
   and, once you've verified QA, `Deploy PROD` — each picking the tag from
   GitHub's ref selector, no approval click needed. Each deploy writes a
   `deployment.json` marker to the site root recording the deployed commit.
   **Manual fallback:** `npm run deploy:test` / `deploy:qa` / `deploy:prod` do the
   same over FTP from your machine (creds from a git-ignored `.env`, see
   `.env.example`). Flags: `-- --dry-run` (preview the full plan — new/changed/unchanged/stale —
   without changing anything), `-- --force` (re-upload everything),
   `-- --force-delete` (override the mass-delete safety brake after checking
   the plan), `-- --no-delete` (skip deletion once). Deletion of stale
   files/dirs is part of every deploy by default. WinSCP hand-copy remains
   available for recovery.
3. **Always exclude the five server-owned files** from every upload/promotion,
   so you never overwrite a server's `.htaccess`, `robots.txt`, `.htpasswd`,
   `config.php` or `_api/.env` — the same set `PROTECTED_PATHS` holds. **Two of
   them exist nowhere else.** `_api/.env` is hand-placed and in no repository.
   `.htpasswd` holds credential hashes that were never committed, and losing it
   is worse than it sounds: the `.htaccess` beside it points `AuthUserFile` at
   a path that no longer exists, so **Apache answers 500 to every request,
   including the ones you would use to diagnose it**. `config.php` is dead, and
   the `config.example.php` that used to ship beside it is gone. The two access
   `.htaccess` files are the opposite case — tracked source that *should*
   travel with the code.

   **Which is why a name-only mask is the wrong tool here — it is the same bug
   the deploy CLI carried until 2026-09-07.** WinSCP's
   `| .htaccess; robots.txt; config.php; .env` matches by name **at any
   depth**, so it also drops `_api/.htaccess` and `_api/public/.htaccess` —
   the deny/grant pair — and leaves the Laravel tree standing on the catch-all
   alone. Anchor every entry to the root instead:

   ```
   | /.htaccess; /robots.txt; /.htpasswd; /config.php; /_api/.env
   ```

   and afterwards check that both access files actually landed on the server.
   The mask is what should protect them; the check is what tells you it did.

**One known ordering property of the fan-out.** `tools/deploy/ftp.mjs` groups
uploads by directory and uploads the groups concurrently, so `_api/` is an early
batch and `_api/public/` a much later one: on a run that uploads both access
files, the deny-all lands seconds before the grant and `/api/*` answers **403**
in between — and a run that dies in that window leaves it 403ing until the
deploy is re-run. That only happens on a bootstrap or a `--force`/`--relist`
run, i.e. when the site is already down or being rewritten wholesale, so it is
recorded rather than fixed. If it ever matters, the fix is to order those two
uploads the way `tools/put-overlay.mjs` orders its own two ("so routing flips
only once") — not to serialise the whole deploy.

`build:overlay` merges the auth block onto the current site template
automatically, so there's no hand-editing of `.htaccess` (which is how the
FastCGI 500 loop below crept in during early manual assembly).

### `.htaccess` gotcha: the SPA fallback loop guard

The built block routes every non-asset request to `index.html`. On
easy-hebergement (PHP runs as **FastCGI**), `RewriteRule ^ index.html [L]`
re-matches its own output and loops until Apache returns a **500**
("Request exceeded the limit of 10 internal redirects"). The fix — a
`RewriteCond %{ENV:REDIRECT_STATUS} ^$` guard so the rule fires only on the
original request — lives in the tracked source
`config/htaccess/site.htaccess`, so every build carries it. Don't strip it when
combining the auth overlay.

## Per-environment configuration

There is exactly one per-environment config file left: **`_api/.env`**.
See [Laravel's server-side `.env`](#laravels-server-side-env) below for what
goes in it.

`config.php` used to sit beside it, holding the old front end's `env` key and DB
credentials. That application is gone. The file is still on every server —
`config.php` is a protected path, so no deploy will ever remove it — and it
still contains live database credentials, so **delete it by hand, once per
server**. Nothing reads it, and the SPA fallback makes it unreachable over HTTP,
but there is no reason to leave credentials lying in a web root.

The non-prod corner ribbon no longer comes from a file at all: the SPA reads it
from `GET /api/config`, which derives it from `APP_ENV` in `_api/.env`.

### Keeping `_api/.env` in shape with `api/.env.example`

Before uploading anything, the deploy CLI fetches the target's
`_api/.env` and compares its **key set** — never its values, which are
never read, returned or logged — against the `api/.env.example` in the
repository. Drift in **either** direction refuses the deploy with **exit 2** and
names the offending keys: a key the code now expects that the server is missing,
*and* a key the server still has that the code no longer expects. `-- --dry-run`
reports the same drift but does **not** refuse (exit 0) — only a real deploy
stops.

```
FAILED at Preflight: TEST's _api/.env has drifted from api/.env.example
  (1 missing, 0 extra keys — listed above).
    _api/.env on TEST is MISSING key: SOME_NEW_FLAG
```

That refusal is the pre-flight working, not a bug. Nothing is uploaded and
nothing is deleted — it stops before the scan. Fix the server's `.env` by hand,
then re-run.

A server with **no** `.env` at all only warns and continues: that is a
brand-new environment before its one-time hand provisioning, and the API cannot
run either way, so blocking would add no protection.

This check replaced an AST walk over each server's `config.php` (parsed with
`php-parser`, never evaluated). The dotenv version needs no parser at all and
covers the file that actually configures the API.

## What's tracked vs. not

- **Tracked:** `.htaccess`, `robots.txt` — no secrets, safe to version.
- **Git-ignored:** `.htpasswd` — it holds HTTP Basic Auth credentials. The
  hashes are not plaintext, but `$apr1$` is MD5-based and brute-forcible
  offline, and the usernames are exposed, so it stays out of the repo (see the
  root `.gitignore`). Create it by hand and upload it via FTP alongside the
  `.htaccess`.

## (Re)generating a `.htpasswd`

The `.htaccess` uses Apache's `$apr1$` (APR1 / MD5) hash format, so whatever you
use must produce that.

**Easiest (online, tested):**
[web2generators htpasswd generator](https://www.web2generators.com/apache-tools/htpasswd-generator)
— enter the username and password, choose the **APR1 (MD5)** format, and paste
the resulting `user:hash` line into `.htpasswd`.

**CLI alternatives (offline):**

```bash
# first user (-c creates/overwrites the file):
htpasswd -c staging/test/.htpasswd <username>
# add more users (omit -c so you don't wipe the file):
htpasswd    staging/test/.htpasswd <another-user>

# no htpasswd binary? openssl produces the same $apr1$ hash:
openssl passwd -apr1        # prompts for the password, prints the hash
# then write "<username>:<hash>" as a line in .htpasswd
```

Current credentials (kept out of git — record them in the team password manager,
not here):

- TEST: user `test`
- QA: user `qa`

## Editing these files

Edit the tracked sources here (`staging/<env>/.htaccess`, `robots.txt`); the
per-env `.htaccess` that actually ships is (re)generated by `npm run build:overlay`
(auth block + current `config/htaccess/site.htaccess`). When you change where `.htpasswd` lives, set the **absolute** server path in
`HTPASSWD_PATH` in the per-env `.env.test` / `.env.qa` (uniform key name per file).

`build:overlay` injects it into the generated `.htaccess` in place of the `__HTPASSWD_PATH__`
token. Nothing host-specific is committed.

- **Migration endpoint + Basic Auth:** the whole staging site (including the
  token-gated `/api/migrate`) stays behind Basic Auth. A per-path `.htaccess`
  exemption (`<RequireAny>`/`Require expr`) was tried but this host **500s** on
  it, so instead the migration trigger (`tools/dbmigrate.mjs`) authenticates
  through Basic Auth: set `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` in `.env.<env>`
  to the same credentials as the `.htpasswd`. PROD has no Basic Auth, so leave
  them blank there. These are for the machine you run `dbmigrate:<env>` from —
  not CI, which never reaches the site over HTTP at all.

## CI: decoupled tag-based promotion

`ci.yml` only auto-deploys TEST. TEST (again, on demand), QA, and PROD are also
each separate, manually-dispatched workflows, all sharing one reusable
deploy workflow:

```
… checks … ─→ deploy-test        Tag Release ──┬─→ Deploy TEST (manual)
              (auto on main)                    ├─→ Deploy QA (manual)
                                                 └─→ Deploy PROD (manual, checks QA)
                              (manual, no inputs, or a custom tag_name)
```

- **TEST** deploys automatically after all checks pass on a merge to `main`.
- **Tag Release** (`tag-release.yml`) is a `workflow_dispatch` with one
  optional input, `tag_name` — dispatch it from the commit you've verified on
  TEST (defaults to `main`); blank `tag_name` creates (or no-ops if one
  already exists) a tag named `YYYY-MM-DD-<short-sha>`; a custom `tag_name` is
  used instead, refusing rather than moving it if that name already points at
  a different commit.
- **Deploy TEST** (`deploy-test.yml`), **Deploy QA** (`deploy-qa.yml`), and
  **Deploy PROD** (`deploy-prod.yml`) are independent `workflow_dispatch`
  workflows with `dry_run`/`force` boolean inputs, all calling one
  shared reusable workflow (`_deploy.yml`) that does the actual
  checkout/build/deploy/summary — so the three stay in sync instead of
  drifting independently. Dispatch any of them by picking a tag from GitHub's
  native ref selector — never type a ref in by hand. No Required-reviewers
  approval gate on any of them — the deliberate act of dispatching with a
  chosen tag is the gate.
- **Deploy PROD** additionally runs its own `validate-qa` job first, which
  queries the GitHub Deployments API for the `qa` environment's most recent
  successful deployment and refuses to proceed (even with `dry_run`) unless
  its commit matches the ref being deployed to PROD.
- **Rollback** is redeploying an older tag with any of the three deploy
  workflows — there is no separate rollback mechanism or run-history lookup.
- Each `test`/`qa`/`prod` Environment needs `FTP_HOST`, `FTP_USER`, `FTP_PASS`
  and its own `FTP_DIR` secret (uniform name, scoped per Environment). The
  deploy CLI's path guard refuses any dir that does not match the env name.
- Each run's summary shows which flags were used, the deploy CLI's final
  summary line (`... deploy done in ... — N uploaded, D deleted, ...`), and the
  full deploy log in a collapsible section.
- A `deployment.json` at each site root (web-readable, e.g.
  `https://<prod-host>/deployment.json`) records the deployed commit, ref (the
  tag name, for TEST/QA/PROD manual deploys), time, and CI run URL.

## Database migrations & recovery

**Laravel owns the schema.** Migrations are Laravel's own, under
`api/database/migrations/`; the old app's `sql/migrations/*.sql` runner and
`App\AutoMigrator` are gone. There are two ways they get applied, and it matters
which one you are relying on.

**CI never migrates, and cannot.** No workflow runs `dbmigrate` — grep the seven
files in `.github/workflows/` and you will not find it. This is not an omission
to fix: **the host firewalls the GitHub runner's IP.** A runner can push a
deploy out over FTP, which is how every deploy works, but it can never reach the
site over HTTP to call `/api/migrate`. So a merge to `main` auto-deploys TEST and
leaves the schema untouched.

**1. Automatic, on the first request.**
`App\Http\Middleware\RunPendingMigrations` sits at the front of Laravel's `api`
and `web` middleware groups. If it finds pending migrations it takes a MySQL
advisory lock (`GET_LOCK('lescanetons_migrate')`, so concurrent PHP-FPM workers
cannot double-apply), runs `artisan migrate --force`, and releases it. This is
what closes the gap the firewall opens, and it is the Laravel port of what
`App\AutoMigrator` did for the old app. Gated by **`AUTO_MIGRATE`** in
`_api/.env`, which **defaults to `true`** — a server that never got the
key still self-heals.

It costs one directory scan and two indexed queries per request when there is
nothing pending, which is every request but the first after a deploy.

**2. Manual, and still the one to use for anything non-trivial.** From a machine
that can actually reach the site (remote MySQL login is blocked, so this runs
server-side either way):

```bash
npm run dbmigrate:<env> -- --dry-run   # lists pending, changes nothing
npm run dbmigrate:<env>                # applies
```

Both POST to `<SITE_URL>/api/migrate`, which Apache dispatches to Laravel's
`MigrateController` — it runs `artisan migrate --force` and answers with the
`applied[]` / `pending[]` migration names. A non-2xx response, or a `status`
other than `ok`, exits non-zero.

**Prefer this for any migration that is not trivial.** The request-path runner
has no timeout of its own: a long `ALTER` holds a PHP-FPM worker for its full
duration and will hit `max_execution_time` mid-run on this shared host, leaving
a half-applied schema that the next request retries from wherever it stopped.
`dbmigrate:<env>` runs the same code but lets you dry-run first, see the real
`output`, and watch it finish. The rule of thumb: if you would not be comfortable
with it running inside a page load, run it by hand **before** the deploy that
needs it.

Its secret comes from **`_api/.env`'s `MIGRATE_TOKEN`** on the server,
not from `config.php`. `tools/dbmigrate.mjs` sends it in the `X-Migrate-Token`
header and reads its own copy from `.env.<env>` on the machine you run it from;
the two must match or the endpoint answers 403.

**If a migration fails, the whole API stops.** The middleware refuses to serve
against a schema it cannot vouch for, so every `/api/*` request answers **503**
`service_unavailable` and `/sanctum/csrf-cookie` answers 503 too — and it retries
the failing migration on the next request, and the next.

**That takes the PUBLIC site down with it, and it used not to.** This
paragraph said "public pages are unaffected (they are the old app and touch no
Laravel table)" until 2026-09-07, which was true of the front end deleted in the
SPA cutover. There is now one application: `SessionProvider`'s boot gate renders
**nothing at all** until `GET /api/config` resolves, and on failure renders only
"Le site n’a pas pu démarrer" — so a failing migration is a total outage, not a
members'-area outage. Triage it as one.

Recovering, in order:

1. `npm run dbmigrate:<env> -- --dry-run` to see `error` and `output` — the same
   run, with the diagnostics the 503 does not carry. Laravel's own
   `_api/storage/logs/laravel.log` has the stack trace.
2. If you need the API back **before** you have a fix, set `AUTO_MIGRATE=false`
   in that server's `_api/.env`. That is the emergency switch: requests
   are served again, against the half-applied schema, until you set it back.
3. Fix the migration, deploy, re-run `dbmigrate:<env>`, then set `AUTO_MIGRATE`
   back to `true`.

This is why migrations must stay **idempotent and backward-compatible**: the
previously deployed code has to survive a half-applied schema, and the failing
migration will be retried — from the top — on every request until it succeeds.

## Laravel's server-side `.env`

`_api/.env` is to the Laravel API exactly what `config.php` is to the old
app: **server-owned, hand-placed, never in the artifact, never uploaded, never
deleted.** `tools/build.mjs` strips `.env` when it builds
`dist/build/_api/`, and `_api/.env` is a protected path in
`tools/deploy/preflight.mjs`, so no deploy — including `--relist` and the
bootstrap first deploy of a new environment — can touch it.

Nothing recreates it. **A server without it has no Laravel configuration at
all**, and the first request Apache dispatches into `_api/` dies on
"No application encryption key has been specified" — an opaque 500, because
`APP_DEBUG` is off. So this must be done **before** the deploy that turns on
`/api/*` dispatch, on TEST, QA and PROD alike.

**Provisioning, per server (once):**

1. Take `api/.env.example` from the repo — it documents every key the app
   reads, derived from `api/config/*.php`, with the traps commented.
2. Fill in every `CHANGE_ME`:
   - `APP_ENV` — `test` / `qa` / `production`. Not cosmetic: `/api/migrate`
     echoes it back and `dbmigrate:<env>` prints it, so a server left on
     Laravel's default reports `environment: production` during a QA migration.
   - `APP_DEBUG=false` — on **every** server, prod included.
   - `APP_URL` — the site's public base URL.
   - `DB_*` — the same database the site has always used. If this server still
     has its dead `config.php`, copy them out of it before deleting that file;
     otherwise take them from the hosting control panel.
   - `SANCTUM_STATEFUL_DOMAINS` — the site's hostname, no scheme. A mismatch
     does not error; it just 401s cookie-authed `/api/*` calls.
   - `CACHE_STORE=database` — the **key** is required: the key-shape check
     above refuses a deploy to a server that is missing it. The **value** is on
     you, because that check compares key sets and never reads a value, so it
     cannot tell you this one is wrong. Make it `database`: `array` is
     per-process and `file` is per-server, so any code that treats the cache as
     a store shared across PHP-FPM workers gets it silently wrong on anything
     else. (Until the R1a rebuild the concrete case was the Altcha replay guard
     behind the souper signup, which refused to run on anything else;
     `api/.env.example`'s comment on this key still describes that. The guard
     and the feature are gone, the reason for `database` is not.)
   - `MAIL_*` — `MAIL_SCHEME=smtps` with `MAIL_PORT=465` (easy-hebergement's
     ports are non-standard; unset, Symfony infers TLS from the port).
   - `MIGRATE_TOKEN` — must equal the `MIGRATE_TOKEN` in the `.env.<env>` of
     whatever machine runs `npm run dbmigrate:<env>`. There is no CI secret for
     it: CI never calls this endpoint (the host firewalls the runner's IP), so
     the only holder is you.
   - `AUTO_MIGRATE` — leave it `true`, or leave it out entirely; the default is
     `true`. It is what applies pending migrations on the first request after a
     deploy, and CI cannot do it for you. `false` is an emergency switch for a
     migration that is failing in a loop — see **Database migrations &
     recovery** above.

   **`ALTCHA_HMAC_SECRET` and `SOUPER_SIGNUP_ENABLED` were both listed here
   until 2026-09-07, and must NOT be set any more.** The souper signup, its
   Altcha challenge guard and every route they gated were deleted in the R1a
   rebuild, so neither key exists in `api/.env.example` — and because the
   key-shape check refuses on **extra** keys as well as missing ones, a server
   still carrying either one refuses every deploy with exit 2 until it is
   removed. If a `.env` you are copying from an older server has them, drop
   them. (The knowledge worth keeping from that entry: the value in
   `docker/api/env.docker` is public, so any secret ever taken from it is
   forgeable by anyone who can read this repository. Generate per-server
   secrets, always.)
3. Generate a **fresh** `APP_KEY` on that server (never reuse another
   environment's, never the public one in `docker/api/env.docker`):

   ```bash
   php _api/artisan key:generate --show   # paste the whole base64:… string
   ```

4. Upload it as `<docroot>/_api/.env` and make sure
   `_api/storage/` and `_api/bootstrap/cache/` are writable by the
   web user — Laravel writes logs, compiled views and the session/cache files
   there.
5. Verify: `npm run dbmigrate:<env> -- --dry-run`. A JSON body with the right
   `environment` proves dispatch, boot, `.env` and the DB connection all work.
   A 500 means `.env` is missing or wrong; a 403 with JSON means only the token
   is wrong.

**Adding a key later** is a manual step on every server, the same as
`config.php` was. Nothing automates it — but you will not ship code that needs
it and find out from a 500: the config-shape pre-flight described in
[Keeping `_api/.env` in shape](#keeping-_apienv-in-shape-with-apienvexample)
compares each server's key set against `api/.env.example` before uploading
anything, and **refuses the deploy with exit 2** naming the key. Add the key to
`api/.env.example` in the same commit as the code that reads it, and the
pre-flight tells every server that is behind.
