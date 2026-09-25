---
status: accepted
date: 2026-09-07
decision-makers: André Hofer
---

# Put Laravel in the document root as `_api/`, behind one `.htaccess`

## Context and Problem Statement

The FTP account is chrooted to the web root, and the host confirmed on 2026-09-07 that
it will not point the document root at a subdirectory. Laravel's `.env`, `vendor/` and
`storage/` therefore sit inside the tree Apache serves.

Until that date the only thing between the internet and `.env` was the SPA fallback
rewrite, which is routing and not authorization.

The host runs PHP through a FastCGI wrapper. A per-directory rewrite re-enters the
ruleset, and the wrapper prefixes `/cgi-bin/php5.fcgi/` onto rewritten paths. It
answers 500 on `<RequireAny>`, which suggests Apache 2.2, and an unknown directive or
`RewriteRule` flag is a syntax error that takes down every request to the site.

Two outages came from this: legacy `RedirectMatch 301` rules made the whole API answer
301 once, and made every URL redirect-loop another time. The local smoke checks passed
against both broken builds.

How is the Laravel tree kept out of reach inside the document root, and how are the
site's rewrite rules written so they cannot take the site down?

## Considered Options

- Deploy the tree as `_api/`, deny it with `.htaccess` authorization, and order the
  site rules
- Have the host point the document root at a subdirectory
- Rely on the SPA fallback rewrite alone
- End rules with `[END]`
- Guard the SPA fallback with `!-f`/`!-d`
- Keep the legacy `RedirectMatch 301` rules

## Decision Outcome

Chosen option: "Deploy the tree as `_api/`, deny it with `.htaccess` authorization,
and order the site rules", because the host will not move the document root, and
Apache authorizes during its directory walk, before mod_rewrite runs, so the 403 holds
whatever the rewrite does.

The Laravel tree deploys as `_api/`. The name says "not public", names no framework,
and cannot re-match the dispatch pattern `^api(/|$)`, so the rewrite needs no loop
guard for it.

`api/.htaccess` denies the whole tree and `api/public/.htaccess` re-grants the one
directory meant to be reachable. Both use `<IfModule mod_authz_core.c>` pairs, so they
parse on 2.2 and 2.4.

The site `.htaccess` (`config/htaccess/site.htaccess`) is ordered:

1. The canonical-host redirect, `www.<anything>` to `<anything>`, in mod_rewrite and
   guarded on `REDIRECT_STATUS`.
2. The `/api/*` and `/sanctum/*` dispatch to `_api/public/index.php`.
3. The SPA fallback: a catch-all guarded by `REDIRECT_STATUS`, serving `index.html`.

Every rule uses `[L]`. The fallback is a catch-all, and there are no legacy redirects.

### Consequences

- Good, because `/_api/.env` answers 403 on TEST, confirmed 2026-09-14.
- Bad, because QA and PROD are assumed to lack the boundary until the same check
  passes there. `staging/README.md` has the checklist.
- Bad, because any future redirect is dangerous here. `RedirectMatch` is mod_alias,
  which sees the internal FastCGI paths on the re-entered pass; the template explains
  the mechanism at the point where the old rules sat.
- Bad, because renaming `_api/` has to be mirrored in the deploy tool's protected paths
  ([ADR-0005](0005-server-owned-files-never-travel-with-a-deploy.md)), and renaming it
  to the literal `api` would need `REDIRECT_STATUS` guards on both dispatch rules.
- Bad, because the 2.2 branch of the authorization pair has never run anywhere. If a
  host rejects the directives, every `/api/*` request answers 500.

### Confirmation

`tools/build-overlays.test.mjs` pins the rule order and the guards.

## Pros and Cons of the Options

### Have the host point the document root at a subdirectory

- Bad, because the host confirmed on 2026-09-07 that it will not.

### Rely on the SPA fallback rewrite alone

- Bad, because it is routing and not authorization, and until 2026-09-07 it was the
  only thing between the internet and `.env`.

### End rules with `[END]`

- Bad, because `[END]` needs Apache 2.3.9, the host's 500 on `<RequireAny>` suggests
  2.2, and an unknown `RewriteRule` flag takes down every request to the site.

### Guard the SPA fallback with `!-f`/`!-d`

- Bad, because a stray file such as a dead `config.php` would be served as itself
  instead of as the shell.

### Keep the legacy `RedirectMatch 301` rules

- Bad, because they caused two outages, one where the whole API answered 301 and one
  where every URL redirect-looped.
- Bad, because the rebuild made every URL English and owes no backwards compatibility.
