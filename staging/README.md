# Staging environments

Access-control configuration for the two staging sites hosted on
`easy-hebergement.net`. These folders are **not** part of the `npm run build`
FTP payload — they are the small, hand-managed control layer that sits in front
of each staging deployment.

| Local folder      | Server folder (`public_html/staging/…`) | URL                          | Purpose               |
| ----------------- | ---------------------------------------- | ---------------------------- | --------------------- |
| `staging/test/`   | `test.lescanetons.org/`                  | https://test.lescanetons.org | TEST — current `main` |
| `staging/qa/`     | `qa.lescanetons.org/`                    | https://qa.lescanetons.org   | QA                    |

> The local folder names (`test`, `qa`) are just a mirror for version control.
> On the server the directories are named after the hostname
> (`test.lescanetons.org`, `qa.lescanetons.org`), which is what the absolute
> `AuthUserFile` path in each `.htaccess` points at. Keep the `.htaccess` path in
> sync with the real server folder, not the local name.

## What actually lives on a staging server

A staging server folder is **two layers stacked in the same directory**:

1. **The application payload** — the exact output of `npm run build` (`index.php`,
   `src/`, `pages/`, `api/`, `partials/`, `assets/`, `vendor/`, `config.php`, and
   the built **front-controller `.htaccess`** from `app/.htaccess`). This is the
   same payload prod gets.
2. **The access-control overlay** — the files tracked here (`staging/<env>/`):
   an `.htaccess` that adds HTTP Basic Auth + `noindex`, a git-ignored
   `.htpasswd`, and a `robots.txt`. This is what keeps staging private.

On the server these two `.htaccess` files are **combined into one** (auth block
first, then the built front-controller block). A ready-to-upload combined mirror
is assembled under `.tmp/staging/<host>/` (git-ignored); that mirror is what gets
FTP-synced.

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

## Deploying a change to these files

The `.htaccess` / `robots.txt` here are uploaded manually to the matching server
folder. When you change the `AuthUserFile` path, remember it must be the
**absolute** server path, which is host-specific
(`/var/www/sites/lescanetoqg/public_html/staging/<host>/.htpasswd` on
easy-hebergement.net as of 2026-07-18).
