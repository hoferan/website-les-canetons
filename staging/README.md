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

## Deployment: build once, promote one artifact

```bash
npm run build           # -> public/  (the code artifact; no config.php)
npm run build:overlay   # -> dist/overlay/{test,qa,prod}/  (the 3 server-owned files, per env)
```

1. **First-time per server:** upload that env's `dist/overlay/<env>/` files
   (`.htaccess`, `robots.txt`, and for test/qa `.htpasswd`), and create
   `config.php` by hand. Re-run `build:overlay` and re-upload only the
   `.htaccess` when `app/.htaccess` or the auth block changes.
2. **Releasing (normal path — CI):** a merge to `main` auto-deploys to **TEST**;
   then approve the **QA** and **PROD** gates in the same CI run (see
   "CI: gated deploy pipeline" below). Each deploy writes a `deployment.json`
   marker to the site root recording the deployed commit.
   **Manual fallback:** `npm run deploy:test` / `deploy:qa` / `deploy:prod` do the
   same over FTP from your machine (creds from a git-ignored `.env`, see
   `.env.example`). Flags: `-- --dry-run` (preview new/changed/unchanged/stale —
   run before pruning), `-- --prune` (delete remote plain files the build no
   longer produces; dirs/symlinks and the server-owned files are always kept),
   `-- --force` (re-upload everything). WinSCP hand-copy remains available for
   recovery.
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

## CI: gated deploy pipeline

Everything is one pipeline in `.github/workflows/ci.yml`:

```
… checks … ─→ deploy-test ─→ deploy-qa ─→ deploy-prod
              (auto on main)  (gated)       (gated)
```

- **TEST** deploys automatically after all checks pass on a merge to `main`.
- **QA** and **PROD** are jobs gated by **Required reviewers** on the `qa` and
  `prod` GitHub Environments (Settings → Environments → `qa` / `prod`). The run
  pauses at each; a maintainer clicks **Review deployments → Approve**. QA is
  reachable once TEST is done; PROD once QA is done.
- Each `qa`/`prod` Environment needs `FTP_HOST`, `FTP_USER`, `FTP_PASS` and its
  own `FTP_DIR` secret (uniform name, scoped per Environment). The `deploy.mjs`
  path guard refuses any dir that does not match the env name, and `--prune` is
  never used in CI.
- A `deployment.json` at each site root (web-readable, e.g.
  `https://<prod-host>/deployment.json`) records the deployed commit, ref, time,
  and CI run URL.
