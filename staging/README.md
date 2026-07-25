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
2. **The three server-owned files** — different on every environment, so they
   are set once per server and never travel with a code promotion:
   - `.htaccess` — test/qa add HTTP Basic Auth + `noindex` on top of the
     front-controller rules; prod has the front-controller rules only.
   - `robots.txt` — test/qa `Disallow: /`; prod the real one (or none).
   - `config.php` — env key + DB creds (git-ignored, set by hand).

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
`.htpasswd` **at any depth**, not just at the site root, so both files above
are silently dropped from every upload even though `tools/build.mjs` copies
them into `dist/build/api-laravel/`. Nothing signals this today: no server
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

Migrations apply automatically **server-side** on the first request after a
deploy: `bootstrap.php` runs `App\AutoMigrator`, which applies any pending
`sql/migrations/*.sql` under a single-flight `GET_LOCK`. (CI no longer triggers
migrations — the runner can't reach the staging hosts.)

**Fail-loud:** if a migration fails, the whole environment serves HTTP 503
("Site en maintenance…") on every request until fixed — this is intentional, so
a broken schema is never served.

**Recovery (per environment):**

1. In that server's `config.php`, set `'auto_migrate' => false` (stops the 503
   loop; the site serves again against the current schema).
2. From an allowlisted machine, inspect and apply manually:
   `npm run dbmigrate:<env> -- --dry-run` then `npm run dbmigrate:<env>`
   (or POST `/api/migrate`). Fix the offending migration if it errors.
3. Once migrations are clean, set `'auto_migrate' => true` again.
