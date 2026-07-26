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

1. **The application payload** — the exact output of `npm run build`
   (`index.php`, `src/`, `pages/`, `api/`, `partials/`, `assets/`, `vendor/`).
   Environment-agnostic: the _same bytes_ on test, qa, and prod. It does **not**
   include `config.php`.
2. **The four server-owned files** — different on every environment, so they
   are set once per server and never travel with a code promotion:
   - `.htaccess` — test/qa add HTTP Basic Auth + `noindex` on top of the
     front-controller rules; prod has the front-controller rules only.
   - `robots.txt` — test/qa `Disallow: /`; prod the real one (or none).
   - `config.php` — env key + DB creds for the old app (git-ignored, set by
     hand).
   - `api-laravel/.env` — the same thing for Laravel: `APP_KEY`, DB creds,
     `MIGRATE_TOKEN`, `ALTCHA_HMAC_SECRET` (git-ignored, set by hand). See
     [Laravel's server-side `.env`](#laravels-server-side-env) below.

Two further `.htaccess` files travel **with** the code artifact instead —
tracked source, built into every `dist/build/`, not server-owned — because the
FTP account is chrooted to the web root and the Laravel API project (`api/`)
therefore sits physically *inside* the document root, unlike Laravel's normal
deployment where everything but `public/` lives outside it:

- `api/.htaccess` (ships as `api-laravel/.htaccess`) — `Require all denied`
  over the whole Laravel tree, so `.env`, `vendor/` and `app/` are unreachable
  even though they are physically web-accessible.
- `api/public/.htaccess` (ships as `api-laravel/public/.htaccess`) —
  `Require all granted`, re-granting access back for the one subdirectory
  that's meant to be reachable (Apache evaluates authorization against the
  resolved file's parent directories, and with `AuthMerging` at its default of
  `Off` the innermost `Require` replaces rather than adds to the inherited
  one).

**Neither currently reaches any server.** `tools/deploy/preflight.mjs`
protects the basenames `.htaccess` / `robots.txt` / `config.php` /
`.htpasswd` / `.env` **at any depth**, not just at the site root, so both files
above are silently dropped from every upload even though `tools/build.mjs`
copies them into `dist/build/api-laravel/`. Nothing signals this today: no server
dispatches `/api/*` into `api-laravel/` yet, and — *precisely because the
deny-all was never uploaded* — a direct hit like `/api-laravel/.env` falls
through to the old app's front-controller catch-all and gets its 404.

That last point is worth stating carefully, because it is the reverse of what
happens locally. Where `api/.htaccess` **is** present, authorization is
evaluated during Apache's directory walk, before mod_rewrite's per-directory
rules run in the fixup phase, so the catch-all never sees the request and it
returns 403 instead (verified against the local stack; see the comments in
`api/.htaccess`). On a server the file is absent, so there is no denial to
evaluate and the catch-all does handle it. The 404 is therefore an accident of
the missing file, not evidence that the boundary is redundant. The boundary is
live only in the local Docker stack (see `## Local Development` in `CLAUDE.md`). Making the protected set root-relative — so it only excludes
the three files actually at the deploy root — is recorded as a prerequisite
for the sub-project that turns on real `/api/*` dispatch; see `api/.htaccess`'s
own comments for the full reasoning.

**If you do that rework, `.env` must not become root-relative with them.**
`api-laravel/.env` is nested by definition, is deliberately absent from the
artifact, and is unrecoverable from the repo — a root-relative protected set
would let the next `--relist` deploy delete every server's API configuration.
`.htaccess` is the opposite case: it *should* travel with the code at depth.

## Deployment: build once, promote one artifact

```bash
npm run build           # -> public/  (the code artifact; no config.php)
npm run build:overlay   # -> dist/overlay/{test,qa,prod}/  (the 3 server-owned files, per env)
```

1. **First-time per server:** upload that env's `dist/overlay/<env>/` files
   (`.htaccess`, `robots.txt`, and for test/qa `.htpasswd`), and create
   `config.php` by hand. Re-run `build:overlay` and re-upload only the
   `.htaccess` when `app/.htaccess` or the auth block changes.
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
3. **Always exclude the three server-owned files** from every upload/promotion
   so you never overwrite a server's `.htaccess`/`robots.txt`/`config.php`.
   WinSCP file mask: `| .htaccess; robots.txt; config.php`.

`build:overlay` merges the auth block onto the current built front controller
automatically, so there's no hand-editing of `.htaccess` (which is how the
FastCGI 500 loop below crept in during early manual assembly).

### `.htaccess` gotcha: the front-controller loop guard

The built front-controller block routes every non-asset request to `index.php`.
On easy-hebergement (PHP runs as **FastCGI**), `RewriteRule ^ index.php [L]`
re-matches the rewritten `index.php` and loops until Apache returns a **500**
("Request exceeded the limit of 10 internal redirects"). The fix — a
`RewriteCond %{ENV:REDIRECT_STATUS} ^$` guard so the rule fires only on the
original request — lives in the tracked source `app/.htaccess`, so every build
carries it. Don't strip it when combining the auth overlay.

## Per-environment `config.php`

Each server's `config.php` is git-ignored and set by hand. Besides the `db`
block it declares the environment, which drives the non-prod corner ribbon (see
`App\Env` / `app/partials/env_banner.php`):

```php
return [
    'env' => 'test',   // 'test' on TEST, 'qa' on QA, 'prod' (or omitted) on prod
    'db'  => [ /* … */ ],
];
```

A missing/unknown `env` is treated as `prod` (no ribbon), so prod stays clean
even if the key is never added there.

### Keeping `config.php` in shape with `config.example.php`

Before uploading anything, the deploy CLI fetches the target's `config.php` and
compares its key **shape** (never its values) against the `config.example.php`
that ships with the artifact. Drift in **either** direction refuses the deploy
with **exit 2** and names the offending key paths: a key the code now expects
that the server is missing, *and* a key the server still has that the code no
longer expects. `-- --dry-run` reports the same drift but does **not** refuse
(exit 0) — only a real deploy stops.

**Operator step (do this before the deploy that lands the Laravel `/api/*`
cutover).** On **every** server — TEST, QA and PROD — hand-edit `config.php` and
delete these two entries, including their comments:

```php
'auto_migrate' => true,          // delete — App\AutoMigrator no longer exists
'migrate' => [                   // delete the whole block — Laravel's
    'token' => '…',              // /api/migrate reads MIGRATE_TOKEN from
],                               // api-laravel/.env instead
```

Until a server's `config.php` is trimmed, every deploy to it refuses with:

```
FAILED at Preflight: TEST's config.php has drifted from config.example.php
  (0 missing, 2 extra keys — listed above).
    config.php on TEST has EXTRA key:  auto_migrate
    config.php on TEST has EXTRA key:  migrate.token
```

That refusal is the pre-flight working, not a bug. Nothing is uploaded and
nothing is deleted — it stops before the scan.

`'altcha' => ['hmac_secret' => …]` and the `'mail'` block **stay** in
`config.php` for now: the pre-flight compares against `config.example.php`,
which still declares them, so removing them from a server would trip the same
brake in the other direction (`MISSING key`). Note that no PHP in the old app
reads either one any more — `bootstrap.php` consumes only `env`, `features` and
`db`; Altcha and mail moved to Laravel's `ALTCHA_HMAC_SECRET` / `MAIL_*`. Retiring
those two blocks is its own coordinated change to `config.example.php` **plus**
every server, not something to do piecemeal.

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
(auth block + current `app/.htaccess`). When you change where `.htpasswd` lives, set the **absolute** server path in
`HTPASSWD_PATH` in the per-env `.env.test` / `.env.qa` (uniform key name per file).

`build:overlay` injects it into the generated `.htaccess` in place of the `__HTPASSWD_PATH__`
token. Nothing host-specific is committed.

- **Migration endpoint + Basic Auth:** the whole staging site (including the
  token-gated `/api/migrate`) stays behind Basic Auth. A per-path `.htaccess`
  exemption (`<RequireAny>`/`Require expr`) was tried but this host **500s** on
  it, so instead the migration trigger (`tools/dbmigrate.mjs`) authenticates
  through Basic Auth: set `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` in `.env.<env>`
  (and the env's CI secrets) to the same credentials as the `.htpasswd`. PROD has
  no Basic Auth, so leave them blank there.

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

**Laravel owns the schema.** The old app's `sql/migrations/*.sql` runner and
`App\AutoMigrator` are gone — nothing migrates itself on the first request any
more, so there is no self-healing pass and no fail-loud 503 loop to recover
from. Migrations are Laravel's own, under `api/database/migrations/`, and they
only run when something triggers them.

**Triggering them** is a deliberate step after each deploy, from an allowlisted
machine (remote MySQL login is blocked, so they run server-side):

```bash
npm run dbmigrate:<env> -- --dry-run   # lists pending, changes nothing
npm run dbmigrate:<env>                # applies
```

Both POST to `<SITE_URL>/api/migrate`, which Apache dispatches to Laravel's
`MigrateController` — it runs `artisan migrate --force` and answers with the
`applied[]` / `pending[]` migration names. A non-2xx response, or a `status`
other than `ok`, exits non-zero (which is what gates the CI step).

Its secret comes from **`api-laravel/.env`'s `MIGRATE_TOKEN`** on the server,
not from `config.php`. `tools/dbmigrate.mjs` sends it in the `X-Migrate-Token`
header and reads its own copy from `.env.<env>` on the machine you run it from;
the two must match or the endpoint answers 403.

**If a migration fails,** the site keeps serving against the current schema
(nothing 503s), so there is no emergency switch to flip. Read the `error` and
`output` keys in the response, fix the migration, redeploy, and re-run
`dbmigrate:<env>`. This is why migrations must stay backward-compatible: the
previously deployed code has to survive a half-applied schema.

## Laravel's server-side `.env`

`api-laravel/.env` is to the Laravel API exactly what `config.php` is to the old
app: **server-owned, hand-placed, never in the artifact, never uploaded, never
deleted.** `tools/build.mjs` strips `.env` when it builds
`dist/build/api-laravel/`, and `.env` is a protected basename in
`tools/deploy/preflight.mjs`, so no deploy — including `--relist` and the
bootstrap first deploy of a new environment — can touch it.

Nothing recreates it. **A server without it has no Laravel configuration at
all**, and the first request Apache dispatches into `api-laravel/` dies on
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
   - `DB_*` — copy from that server's `config.php`; Laravel shares the old
     app's database, it does not get one of its own.
   - `SANCTUM_STATEFUL_DOMAINS` — the site's hostname, no scheme. A mismatch
     does not error; it just 401s cookie-authed `/api/*` calls.
   - `CACHE_STORE=database` — **required.** The Altcha replay guard uses the
     cache as a single-use store; `array` is per-process and `file` is
     per-server, so either silently removes replay protection.
     `SignupController` refuses outright on anything else, so a wrong value
     turns every signup into a 403.
   - `MAIL_*` — `MAIL_SCHEME=smtps` with `MAIL_PORT=465` (easy-hebergement's
     ports are non-standard; unset, Symfony infers TLS from the port).
   - `MIGRATE_TOKEN` — must equal the `MIGRATE_TOKEN` in the `.env.<env>` of
     whatever runs `npm run dbmigrate:<env>`, and the env's CI secret.
   - `ALTCHA_HMAC_SECRET` — **required**, one long random string per server.
     Empty or `CHANGE_ME` makes `/api/altcha` answer 503 and every signup
     answer 403 `captcha_failed`, which reads as a broken form rather than a
     missing setting. Never the value in `docker/api/env.docker` — it is public,
     so challenges signed with it are forgeable by anyone reading the repo.
3. Generate a **fresh** `APP_KEY` on that server (never reuse another
   environment's, never the public one in `docker/api/env.docker`):

   ```bash
   php api-laravel/artisan key:generate --show   # paste the whole base64:… string
   ```

4. Upload it as `<docroot>/api-laravel/.env` and make sure
   `api-laravel/storage/` and `api-laravel/bootstrap/cache/` are writable by the
   web user — Laravel writes logs, compiled views and the session/cache files
   there.
5. Verify: `npm run dbmigrate:<env> -- --dry-run`. A JSON body with the right
   `environment` proves dispatch, boot, `.env` and the DB connection all work.
   A 500 means `.env` is missing or wrong; a 403 with JSON means only the token
   is wrong.

**Adding a key later** is a manual step on every server, the same as
`config.php`. There is no equivalent of the config-shape pre-flight for `.env` —
a deploy will not warn you that a server is missing a newly required key.
