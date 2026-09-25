# 0003. Put Laravel in the document root as `_api/`, behind one `.htaccess`

Status: Accepted, 2026-09-07

## Context

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

## Decision

The Laravel tree deploys as `_api/`. The name says "not public", names no framework,
and cannot re-match the dispatch pattern `^api(/|$)`, so the rewrite needs no loop
guard for it.

`api/.htaccess` denies the whole tree and `api/public/.htaccess` re-grants the one
directory meant to be reachable. Both use `<IfModule mod_authz_core.c>` pairs, so they
parse on 2.2 and 2.4. Apache authorizes during its directory walk, before mod_rewrite
runs, so the 403 holds whatever the rewrite does.

The site `.htaccess` (`config/htaccess/site.htaccess`) is ordered:

1. The canonical-host redirect, `www.<anything>` to `<anything>`, in mod_rewrite and
   guarded on `REDIRECT_STATUS`.
2. The `/api/*` and `/sanctum/*` dispatch to `_api/public/index.php`.
3. The SPA fallback: a catch-all guarded by `REDIRECT_STATUS`, serving `index.html`.

Every rule uses `[L]`, never `[END]`, which needs Apache 2.3.9. The fallback is a
catch-all rather than `!-f`/`!-d`, so a stray file such as a dead `config.php` is
served as the shell instead of as itself. There are no legacy redirects: the rebuild
made every URL English and owes no backwards compatibility.

## Consequences

`/_api/.env` answers 403 on TEST, confirmed 2026-09-14. QA and PROD are assumed to lack
the boundary until the same check passes there; `staging/README.md` has the checklist.

Any future redirect is dangerous here. `RedirectMatch` is mod_alias, which sees the
internal FastCGI paths on the re-entered pass; the template explains the mechanism at
the point where the old rules sat.

Renaming `_api/` has to be mirrored in the deploy tool's protected paths (ADR 0005),
and renaming it to the literal `api` would need `REDIRECT_STATUS` guards on both
dispatch rules.

The 2.2 branch of the authorization pair has never run anywhere. If a host rejects the
directives, every `/api/*` request answers 500.

`tools/build-overlays.test.mjs` pins the rule order and the guards.
