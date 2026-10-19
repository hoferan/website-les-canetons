# Servers: layout, deployment and recovery

The runbook for the three servers on `easy-hebergement.net`. The folders here
hold the hand-managed access-control layer that sits in front of each
deployment. They are not part of the `npm run build` payload.

| Local folder    | Server folder (`public_html/staging/…`) | URL                 | Deployed                      |
| --------------- | --------------------------------------- | ------------------- | ----------------------------- |
| `staging/test/` | `<test-host>/`                          | https://<test-host> | automatically, on merge to `main` |
| `staging/qa/`   | `<qa-host>/`                            | https://<qa-host>   | by dispatching `Deploy QA`    |
| `staging/prod/` | `<prod-host>/`                          | https://<prod-host> | by dispatching `Deploy PROD`  |

On the server the directories are named after the hostname, which is what the
absolute `AuthUserFile` path in each `.htaccess` points at. Keep that path in
step with the real server folder, not the local name.

## What lives on a server

A server folder holds two layers in the same directory.

1. **The application payload**, the output of `npm run build`: the SPA shell at
   the root (`index.html`, `assets/`) and the Laravel project at `_api/`. The
   same bytes go to every environment, and `_api/.env` is never among them.
2. **The server-owned files**, different on every server, set once and never
   uploaded by a deploy:
   - `.htaccess`: the site rules, plus HTTP Basic Auth and `noindex` on TEST
     and QA.
   - `robots.txt`: `Disallow: /` on TEST and QA.
   - `.htpasswd`: the Basic Auth credentials on TEST and QA.
   - `_api/.env`: the API's whole configuration (see
     [Laravel's server-side `.env`](#laravels-server-side-env)).
   - `config.php`: dead. It configured the old front end and still holds live
     database credentials. Delete it by hand, once per server. HTTP cannot tell
     you whether it is there, because the catch-all answers every path with the
     SPA shell, so check with an FTP listing.

`PROTECTED_PATHS` in `tools/deploy/preflight.mjs` names exactly these five
paths, relative to the deploy root, so no deploy uploads or deletes them.

### The authorization boundary around `_api/`

The FTP account is chrooted to the web root, so the Laravel project sits inside
the document root rather than beside it. Two `.htaccess` files travel with the
code to keep it unreachable:

- `api/.htaccess` (ships as `_api/.htaccess`): `Require all denied` over the
  whole Laravel tree, so `.env`, `vendor/` and `app/` cannot be fetched.
- `api/public/.htaccess` (ships as `_api/public/.htaccess`): `Require all
  granted`, re-granting the one directory meant to be reachable. With
  `AuthMerging` at its default of `Off`, the innermost `Require` replaces the
  inherited one.

Each is written twice, for Apache 2.4's `Require` and for 2.2's `Order`/`Deny`,
selected by `<IfModule mod_authz_core.c>`. This host's Apache version is
unresolved (it 500s on `<RequireAny>`, which leans 2.2), and a directive it does
not understand 500s every request in that directory. Do not collapse either file
to one block.

Authorization runs during Apache's directory walk, before mod_rewrite's
per-directory rules, so `/_api/.env` gets a real **403** and the SPA fallback
never sees the request. `npm run smoke` asserts exactly 403 on `/_api/.env` and
`/_api/vendor/autoload.php` locally.

**Assume the boundary is absent on a server until `/_api/.env` there answers
403.** A server gets the two files on its first deploy of the current code, and
nothing back-fills a server that has not been deployed to. A 500 there means
Apache rejected a directive; the SPA shell means the files are not there or not
being read.

If this host ever 500s on them, FTP-deleting both files brings the API back in
the moment, but a `--relist`, `--force` or bootstrap deploy uploads them again.
The durable rollback is to delete them from `api/` in the repository and
redeploy.

The SPA fallback's catch-all in `config/htaccess/site.htaccess` is a security
control in its own right. The deny-all covers only `_api/`; the catch-all is
what keeps everything outside it, `config.php` included, from being served as
itself. Adding an `!-f`/`!-d` guard or narrowing its pattern would expose those
files.

## Deploying

```bash
npm run build           # dist/build/: index.html, assets/, _api/ (no .env)
npm run build:overlay   # dist/overlay/{test,qa,prod}/: the generatable server-owned files
```

**First time on a server:** upload that environment's `dist/overlay/<env>/`
files (`.htaccess`, `robots.txt`, and on TEST and QA a `.htpasswd` you create,
see below), and create `_api/.env` by hand **before** the first deploy. Re-run
`build:overlay` and re-upload only the `.htaccess` when
`config/htaccess/site.htaccess` or the auth block changes. The `/api/*`
dispatch lives in that template, so a server with an older overlay answers
every `/api/*` call from the SPA fallback instead.

**Do not place the current overlay on a server that still runs the old
server-rendered site.** The template falls back to `index.html`, which such a
server does not have. The overlay and the artifact move together, at that
server's cutover. A server whose `GET /api/v1/config` answers HTML has not been
cut over.

### Through CI (the normal path)

A merge to `main` deploys to TEST once every check passes. QA and PROD are
promoted by hand:

```
… checks … ─→ deploy-test        Tag Release ──┬─→ Deploy TEST (manual)
              (auto on main)                    ├─→ Deploy QA (manual)
                                                 └─→ Deploy PROD (manual, checks QA)
```

- **Tag Release** (`tag-release.yml`): dispatch it on the commit you verified on
  TEST. With no input it creates `YYYY-MM-DD-<short-sha>`, or does nothing if
  that commit is already tagged; a custom `tag_name` refuses rather than moving
  an existing tag.
- **Deploy TEST / QA / PROD** (`deploy-test.yml`, `deploy-qa.yml`,
  `deploy-prod.yml`): dispatch with a tag picked from GitHub's ref selector,
  never a typed ref. All three call `_deploy.yml`. Each has `dry_run` and
  `force` inputs, and there is no reviewer gate: dispatching is the decision.
- **Deploy PROD** first checks, through the GitHub Deployments API, that the
  same commit is the last successful deployment to `qa`, and refuses otherwise,
  even with `dry_run`.
- **Rollback** is redeploying an older tag.
- Each environment needs the secrets `FTP_HOST`, `FTP_USER`, `FTP_PASS` and its
  own `FTP_DIR`.

### By hand

```bash
npm run status:<env>               # what is deployed there, no build
npm run deploy:<env> -- --dry-run  # the full plan, nothing changed
npm run deploy:<env>
```

`<env>` is `test`, `qa` or `prod`. Credentials come from a git-ignored
`.env.<env>` (falling back to `.env`; see `.env.example`). Never call
`node tools/deploy/cli.mjs` directly. **Always `--dry-run` the first deploy to a
new environment.**

Flags after `--`: `--dry-run`, `--force` (re-upload everything),
`--force-delete` (override the safety brake), `--relist` (rebuild the state
from a full remote listing), `--no-delete`, `--verbose`. Exit codes: 0 ok,
1 failure, 2 refused by a guard or the brake.

What the deploy does:

- **It mirrors.** It uploads new and changed files (changed means a different
  sha256), deletes remote files the build no longer has, and removes emptied
  directories deepest first.
- **It diffs against `.sync-state.json`** at the site root: each deployed path
  with its size and hash. A routine deploy reads that one file instead of
  listing the server, and an aborted deploy can be resumed. The full parallel
  listing runs only on the first deploy (no state file) or with `--relist`, and
  only those runs can see, and delete, files this tool did not deploy.
- **It refuses** unless `FTP_DIR` names the target environment, since one FTP
  account reaches all three.
- **It brakes** (exit 2) when it would delete more than 50 files and more than
  20% of the remote tree. Read the plan, then pass `--force-delete`.
- **It fans out** over `FTP_CONCURRENCY` connections (default 6, clamped 1 to
  8), reconnecting with exponential backoff, because this host drops
  connections under load.
- **It writes `deployment.json`** at the site root (commit, ref, time, run URL).
  The catch-all answers that URL with the SPA shell, so read it through
  `GET /api/health`, which also says whether the database answers and which
  migrations are pending. Any status but 200 means unhealthy.

The protected paths are exact. **A rename of the deployed `_api/` directory has
to be mirrored in `PROTECTED_PATHS`**, or the next `--relist` or bootstrap
deploy treats every server's `_api/.env` as stale and deletes it.

One ordering property: uploads are grouped by directory and the groups run
concurrently, so on a run that uploads both access files, `_api/.htaccess` (deny)
can land seconds before `_api/public/.htaccess` (grant), and `/api/*` answers
403 in between. That only happens on a bootstrap, `--force` or `--relist` run.
If it ever matters, upload the grant last the way `tools/put-overlay.mjs`
uploads `.htaccess` last, rather than serialising the whole deploy.

### Hand-copying with WinSCP

Exclude the server-owned files with a mask anchored to the root:

```
| /.htaccess; /robots.txt; /.htpasswd; /config.php; /_api/.env
```

A name-only mask (`| .htaccess; robots.txt; …`) matches at any depth and also
drops `_api/.htaccess` and `_api/public/.htaccess`. Check afterwards that both
landed. `.htpasswd` and `_api/.env` exist nowhere else, and losing `.htpasswd`
makes Apache answer 500 to every request, the diagnostic ones included.

## Laravel's server-side `.env`

`_api/.env` is server-owned, hand-placed, never in the artifact and never
uploaded or deleted. `tools/build.mjs` leaves it out of `dist/build/_api/`, and
it is a protected path. Nothing recreates it: a server without it answers 500 to
every `/api/*` request ("No application encryption key has been specified",
hidden behind `APP_DEBUG=false`).

**Provisioning, once per server:**

1. Start from `api/.env.example`. It lists every key the API reads, with the
   traps commented.
2. Fill in every `CHANGE_ME`:
   - `APP_ENV`: `test`, `qa` or `production`. `/api/migrate` reports it, so a
     wrong value shows up during a migration.
   - `APP_DEBUG=false`, on every server.
   - `APP_URL`: the site's public base URL.
   - `DB_*`: from the hosting control panel, or from that server's `config.php`
     before you delete it.
   - `SANCTUM_STATEFUL_DOMAINS`: the hostname, no scheme. A mismatch does not
     error; logins answer `400 stateful_request_required` and cookie-authed
     calls 401.
   - `CACHE_STORE=database`. `array` is per process and `file` per server, and
     the shape check below cannot see a wrong value.
   - `MAIL_*`: `MAIL_SCHEME=smtps` with `MAIL_PORT=465`.
     `MAIL_COMMITTEE_ADDRESS` must be a mailbox the committee reads, not
     `MAIL_FROM_ADDRESS`; `api/.env.example` says why.
   - `MIGRATE_TOKEN`: the same value as in the `.env.<env>` of the machine that
     runs `npm run dbmigrate:<env>`. There is no CI secret for it.
   - `AUTO_MIGRATE`: leave it `true` (the default). See
     [Migrations](#migrations-and-recovery).
3. Generate a fresh `APP_KEY` on that server. Never reuse another
   environment's, and never the public one in `docker/api/env.docker`: any
   secret taken from that file can be forged by anyone who reads this
   repository.

   ```bash
   php _api/artisan key:generate --show   # paste the whole base64:… string
   ```

4. Upload it as `<docroot>/_api/.env`, and make `_api/storage/` and
   `_api/bootstrap/cache/` writable by the web user.
5. Verify with `npm run dbmigrate:<env> -- --dry-run`. A JSON body with the
   right `environment` proves dispatch, boot, `.env` and the database. A 500
   means `.env` is missing or wrong; a 403 with JSON means only the token is.

### The shape check

Before uploading anything, the deploy fetches the target's `_api/.env` and
compares its **key set** with `api/.env.example`. Values are never read or
logged. Drift in either direction refuses the deploy with exit 2 and names the
keys:

```
FAILED at Preflight: TEST's _api/.env has drifted from api/.env.example
  (1 missing, 0 extra keys — listed above).
    _api/.env on TEST is MISSING key: SOME_NEW_FLAG
```

Nothing has been uploaded or deleted at that point. Fix the server's `.env` by
hand and re-run. `--dry-run` reports the drift without refusing, and a server
with no `.env` at all only warns.

So adding a key is a manual step on every server: add it to `api/.env.example`
in the same commit as the code that reads it, and the next deploy to each server
names it. A key on a server that `api/.env.example` no longer lists refuses just
the same, which is why an optional setting belongs in `api/config/*.php`, never
in `api/.env.example`.

## Migrations and recovery

Laravel owns the schema; migrations live in `api/database/migrations/`. CI
never runs them and cannot, because the host firewalls the GitHub runners: a
runner can push files over FTP but never reaches the site over HTTP.

**Automatically, on the first request.** `App\Http\Middleware\RunPendingMigrations`
is prepended to the `api` and `web` middleware groups. When migrations are
pending it takes a MySQL advisory lock (`GET_LOCK('lescanetons_migrate')`), runs
`artisan migrate --force` and releases it. `AUTO_MIGRATE` gates it and defaults
to `true`.

**By hand, to preview pending migrations or to watch them run:**

```bash
npm run dbmigrate:<env> -- --dry-run   # lists pending, changes nothing
npm run dbmigrate:<env>                # APPLIES
```

**With no flag it applies.** Only the endpoint defaults to a dry run. Both POST
to `<SITE_URL>/api/migrate` with the token in the `X-Migrate-Token` header and
answer with `applied[]` and `pending[]`; a non-2xx answer or a `status` other
than `ok` exits non-zero. On TEST and QA, set `BASIC_AUTH_USER` and
`BASIC_AUTH_PASS` in `.env.<env>` to the `.htpasswd` credentials (a per-path
exemption in `.htaccess` needs `<RequireAny>`, which this host 500s on).

The request-path runner has no timeout of its own. A long `ALTER` holds a
PHP-FPM worker until `max_execution_time` stops it halfway, and the next request
retries from wherever it stopped. Running it by hand does not help: the
migration file only reaches the server with a deploy, and `POST /api/migrate`
goes through the same `api` middleware group and the same PHP time limit. For a
heavy migration, ship it in a deploy of its own, ahead of the code that needs
it, and run `npm run dbmigrate:<env>` right after that deploy so you are the
request that runs it.

**A failing migration is a total outage.** `RunPendingMigrations` refuses to
serve against a schema it cannot vouch for, so every `/api/*` request and
`/sanctum/csrf-cookie` answer 503, and the SPA renders only "Le site n’a pas pu
démarrer" because it cannot load `GET /api/v1/config`. The migration is retried
on every request. To recover:

1. `npm run dbmigrate:<env> -- --dry-run` shows the `error` and `output` the 503
   does not carry. `_api/storage/logs/laravel.log` has the stack trace.
2. To bring the site back before you have a fix, set `AUTO_MIGRATE=false` in
   that server's `_api/.env`. Requests are served again, against the
   half-applied schema. That is deliberate (ADR 0030): this host has no shell,
   and this switch is the only way to stop the loop.
3. Fix the migration, deploy, run `dbmigrate:<env>`, and set `AUTO_MIGRATE`
   back to `true`.

That is why every migration must be idempotent and backward compatible: the
previous code has to survive a half-applied schema, and the failing migration
is retried from the top.

## Checking a server after a cutover

Two checks need no account and no browser, and between them prove that Laravel
booted, reached its database and sets its session cookies as intended:

```bash
npm run dbmigrate:<env> -- --dry-run
#   -> status ok, applied [], pending []

curl -si -u "USER:PASS" https://<host>/sanctum/csrf-cookie | grep -i "^set-cookie"
```

The session cookie should be Secure, HttpOnly and `SameSite=strict`;
`XSRF-TOKEN` Secure and strict but not HttpOnly, since the SPA reads it.
Sanctum forces `lax` on `/api` requests, and
`App\Http\Middleware\EnforceAbsoluteSessionLifetime` restores the configured
value, so `strict` here is the check that the fix works on the host. Then
`/_api/.env` should answer 403 (see above). `GET /api/v1/config` sets no cookie
for a bare curl, because Sanctum only starts a session for an `Origin` in
`SANCTUM_STATEFUL_DOMAINS`.

## `.htaccess` and `.htpasswd`

Edit the tracked sources here (`staging/<env>/.htaccess`, `robots.txt`).
`npm run build:overlay` generates the `.htaccess` that ships, merging the auth
block onto `config/htaccess/site.htaccess`, so nothing is assembled by hand.
That template carries the `RewriteCond %{ENV:REDIRECT_STATUS} ^$` guard without
which the SPA fallback re-matches its own output on this FastCGI host and loops
into a 500; keep it.

Set the absolute server path of `.htpasswd` as `HTPASSWD_PATH` in `.env.test`
and `.env.qa`. `build:overlay` substitutes it for the `__HTPASSWD_PATH__` token,
so nothing host-specific is committed.

`.htpasswd` is git-ignored: `$apr1$` hashes are brute-forcible offline and the
usernames are exposed. Generate it in APR1 (MD5) format, with
[web2generators](https://www.web2generators.com/apache-tools/htpasswd-generator)
or offline:

```bash
htpasswd -c staging/test/.htpasswd <username>   # -c creates or overwrites
htpasswd    staging/test/.htpasswd <another>    # adds a user

openssl passwd -apr1   # no htpasswd binary: prints the hash for "<username>:<hash>"
```

The usernames are `test` (TEST) and `qa` (QA). Keep the passwords in the team
password manager, not here.
