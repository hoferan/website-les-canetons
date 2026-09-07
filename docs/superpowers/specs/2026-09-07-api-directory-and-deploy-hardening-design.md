# `_api/` — hardening the in-document-root Laravel deployment

Design, 2026-09-07. Supersedes nothing; implements §6 items 1–4 of
`docs/superpowers/specs/2026-09-05-rebuild-design.md`, which deferred them, and
adds the rename and the legacy-redirect removal.

---

## 1. The problem

The Laravel application is deployed **inside** the document root, because the
FTP account is chrooted and the host will not let the document root be pointed
at a subdirectory (confirmed with André, 2026-09-07). So `.env`, `vendor/`,
`app/` and `storage/` are all physically web-accessible.

Two `.htaccess` files were written for exactly this — `api/.htaccess` denying
the whole tree, `api/public/.htaccess` re-granting the one reachable
directory. **Neither has ever reached a server.**
`tools/deploy/preflight.mjs` protects the *basename* `.htaccess` at any depth,
so both are built into every artifact by `tools/build.mjs` and then silently
dropped from every upload. `staging/README.md` records this and justifies it as
redundant.

It is not redundant. On all three servers there is exactly **one** thing
between the internet and `api-laravel/.env`: the SPA fallback's catch-all
rewrite. That is application routing, not Apache authorization, and anything
that narrows it — a `!-f` guard, a tightened pattern, an overlay edit — exposes
the entire Laravel tree in the same change, with no error and no failing test.

Three further problems in the same file:

- **The directory name.** `api-laravel` leaks the framework and reads as a
  workaround. Its comment claims the name is load-bearing; that overstates it.
  The dispatch substitutes `api-laravel/public/index.php`, and the only
  requirement is that the substituted path not re-match `^api(/|$)`. **Any name
  except literally `api` satisfies that.**
- **Two negative-lookahead landmines** in the legacy 301 rules, each of which
  has already taken something down: the `.php` rule's `(?!.*api-laravel/)`
  (whose missing `.*` made the whole API answer 301 on TEST, reproducible only
  on the real host because of its FastCGI path prefix) and the `.html` rule's
  `(?!index\.html$)` (whose absence redirect-looped every URL).
- **Those 301s now redirect to nothing.** They map `/x.php` and `/x.html` to
  `/x` — French routes that the rebuild deletes (D10 makes every URL English).
  So `/historique.php` would 301 to `/historique` and get the SPA's 404 view.
  One hop, two landmines, no benefit.

## 2. Decisions taken

| # | Decision | Why |
|---|---|---|
| **A1** | `api-laravel/` becomes **`_api/`**. | A leading underscore is a widely-understood "not a public resource" marker, names no framework, survives a stack change without lying, and is loop-safe because `^api(/|$)` cannot match a path starting with `_`. |
| **A2** | `PROTECTED` becomes **path-based**, not basename-at-any-depth. | This is the one change that lets `_api/.htaccess` and `_api/public/.htaccess` reach a server. It is the whole point of the spec. |
| **A3** | The deny/grant pair is written **version-agnostically** (`mod_authz_core` present *and* absent). | The host's Apache version is unresolved — it 500s on `<RequireAny>`, which leans 2.2 — and `Require all denied` is 2.4-only. A directive the server rejects 500s every request in that directory. |
| **A4** | **All three legacy 301s are deleted.** | Their targets no longer exist (D10/D11: no backwards compatibility is owed), and they carry both lookahead landmines. |
| **A5** | `npm run smoke` asserts `/_api/.env` is **not served**. | The exposure has been invisible for the project's whole life. A check is what stops it returning. |
| **A6** | The FTP-mirror deploy is **left alone**. | Considered and rejected: with no SSH, no git, no server-side composer and a firewalled runner, a sha256-diffed mirror with a resumable manifest is a reasonable adaptation. The only alternative — upload one zip, unpack via a token-gated endpoint — trades FTP flakiness for `max_execution_time` on a shared host. Not worth the risk. |
| **A7** | TEST is cut over by **hard reset**, not by a staged two-tree swap. | Simpler, and it finally removes `config.php` (dead since the cutover, still holding live DB credentials) and the stale `.sync-state.json`. It also rehearses the from-nothing bootstrap QA has never had. |

## 3. What the `.htaccess` becomes

Removing A4's three rules leaves: header forwarding, dispatch, the SPA
fallback, MIME types, cache policy. The dispatch target changes to
`_api/public/index.php`.

**One load-bearing subtlety survives, down from three:** `[L]`, not `[END]`.
`END` is Apache 2.3.9+, an unknown `RewriteRule` flag is a syntax error, and no
`<IfModule>` can guard a flag — so an `[END]` on this host would 500 every
request to the whole site. `[L]` is valid on 2.2 and 2.4 and is correct here
because the substituted path cannot re-match `^api(/|$)`.

The fallback stays a **catch-all** with its `REDIRECT_STATUS` guard. The guard
is what stops the rewrite re-matching its own output and looping into a 500 on
this FastCGI host. After this spec the catch-all is no longer the security
boundary — but it is still the reason an unknown URL answers 200 with the SPA's
own 404 view, which remains deliberate.

## 4. The two access-control files

```apache
# _api/.htaccess — deny the whole Laravel tree
<IfModule mod_authz_core.c>
  Require all denied
</IfModule>
<IfModule !mod_authz_core.c>
  Order allow,deny
  Deny from all
</IfModule>
```

```apache
# _api/public/.htaccess — re-grant the one directory that is meant to be reached
<IfModule mod_authz_core.c>
  Require all granted
</IfModule>
<IfModule !mod_authz_core.c>
  Order allow,deny
  Allow from all
</IfModule>
```

This is **stronger** than the catch-all, and the mechanism is worth stating
because it is what makes the layer real: Apache evaluates authorization during
its directory walk, *before* mod_rewrite's per-directory rules run in the fixup
phase. So a request for `/_api/.env` is refused with a genuine 403 and the
rewrite never sees it. `AuthMerging` defaults to `Off`, so the innermost
`Require` replaces the inherited one rather than adding to it — which is why
the grant in `public/` works. The local Docker stack already behaves this way
(these files are present there); after this spec, servers match it.

**The risk this introduces, stated plainly:** if the host's `AllowOverride`
does not permit these directives, every `/api/*` request answers 500. It cannot
be tested before the cutover — while the old catch-all is in place, a request
for `/_api/.env` is rewritten to the shell. So it is tested immediately after,
and the fallback is to FTP-delete the two files, which restores exactly today's
behaviour — but only until the next deploy that is not state-based. They are in
the artifact and are not protected paths, so a `--relist`, a `--force` or a
bootstrap run puts them straight back and the server 500s again. **The durable
rollback is to delete them from `api/` in the repository and redeploy;** the FTP
delete is the stopgap that buys the time to do it.

## 5. The protected set

From basenames matched at any depth, to explicit root-relative paths:

```
/.htaccess        server-owned: site rules + the staging auth block
/robots.txt       server-owned: per-environment
/.htpasswd        server-owned: credentials, never uploaded by any tool
/config.php       dead, but present until deleted by hand per server
/_api/.env        server-owned: APP_KEY, DB credentials, MIGRATE_TOKEN
/.sync-state.json owned by the deploy tool, written separately
```

Everything else in the artifact uploads, which now includes the two access
files. `_api/.env.example` continues to ship: it is the provisioning template,
and shipping it beside the real file is the point.

`config.php` can leave this list once it is gone from every server. After A7 it
is gone from TEST.

**This is the change most able to cause harm.** A path-based set that is subtly
wrong deletes a server-owned file on the next `--relist` or bootstrap deploy.
`tools/deploy/*.test.mjs` must cover: each protected path is never uploaded and
never deleted; a *nested* file sharing a protected basename (`_api/.htaccess`,
`_api/public/.htaccess`) **is** uploaded; and a remote file not in the artifact
and not protected is still classified as stale.

## 6. Touch points

Enumerated by `grep -rl api-laravel` rather than from memory, because a rename
that misses one is a broken stack. **Functional — the change breaks without
them:**

```
config/htaccess/site.htaccess     dispatch target; delete three RedirectMatch rules
api/.htaccess                     rewrite version-agnostically (A3)
api/public/.htaccess              rewrite version-agnostically (A3)
tools/build.mjs                   dist/build/api-laravel -> dist/build/_api
tools/deploy/preflight.mjs        PROTECTED becomes paths; the .env probe path
tools/deploy/sync.mjs             basename matching -> path matching
tools/deploy/cli.mjs              path references
tools/put-overlay.mjs             path references
tools/dbmigrate.mjs               path references
tools/smoke-docker.mjs            new /_api/.env check; drop the dead souper checks
docker-compose.yml                three bind mounts, all nested under the new name
docker/web/entrypoint.sh          runs `php api-laravel/artisan migrate` and chowns
                                  api-laravel/storage — the local stack will not
                                  start until these are renamed
.github/workflows/ci.yml          the build job asserts
                                  `test -d dist/build/api-laravel/vendor`, so CI
                                  goes red on the first push otherwise
```

**Tests that assert the old shape and must be rewritten, not just renamed:**

```
tools/deploy/preflight.test.mjs   the protected-set semantics change entirely
tools/put-overlay.test.mjs        path references
tools/build-overlays.test.mjs     it asserts the FastCGI-prefixed form of the
                                  .php rule's lookahead — a rule A4 deletes, so
                                  those assertions go with it
```

**Comment and documentation accuracy only — no behaviour depends on them, and
leaving them stale is how the next reader learns the wrong layout:**

```
CLAUDE.md                         the `.htaccess` section, Architecture, Don'ts
README.md                         project structure
staging/README.md                 the whole layout narrative, incl. §7's runbook
.env.example (root)               the MIGRATE_TOKEN comment
api/.env.example                  path comments
api/phpunit.xml                   two comments about the mounted .env
api/tests/Feature/ApiErrorVocabularyTest.php
                                  two doc comments. It resolves paths via
                                  __DIR__ and /srv/web, so nothing functional
                                  hangs on the rename — verified.
docker/web/apache-canetons.conf   one comment (DocumentRoot is dist/build)
.gitignore                        `/app/vendor` and `/app/api-laravel` are dead
                                  entries for the deleted front end and can go;
                                  the live half of that comment — the nested
                                  env mount writing a 0-byte api/.env on the
                                  host — still applies under the new name
```

Untracked and irrelevant: `api/storage/framework/views/*` (compiled Blade) and
`api/storage/logs/laravel.log`.

`tools/smoke-docker.mjs` is in the functional list deliberately: it currently
asserts the souper endpoints R1a deleted, so `npm run smoke` is already broken
on this branch and that residue has an owner in no release. It is being edited
here anyway.

## 7. The TEST cutover

`.htpasswd` lives **inside** the document root
(`HTPASSWD_PATH=…/staging/test.lescanetons.org/.htpasswd`, and
`FTP_DIR=/public_html/staging/test.lescanetons.org`). No tool uploads it —
`tools/put-overlay.mjs` refuses on purpose, because re-uploading credentials
during a cutover window is a way to lock yourself out — and there is no copy in
`staging/test/`. **Deleting it leaves an `.htaccess` whose `AuthUserFile`
points at nothing, and Apache answers 500 to every request, including the ones
needed to diagnose it.**

`_api/.env` likewise exists only on the server.

**Before deleting anything:** download `api-laravel/.env` and keep it somewhere
git-ignored. It holds `APP_KEY`, the DB credentials and `MIGRATE_TOKEN`.

1. Delete everything in TEST's document root **except `.htpasswd`**.
2. Upload the saved file as `_api/.env`, adding the keys spec B introduces.
3. `npm run put-overlay:test` — places the new `.htaccess` and `robots.txt`.
4. `npm run deploy:test` — a bootstrap: no state file, empty tree, nothing to
   delete, so the mass-delete brake never trips.
5. Verify, in this order:
   - `GET /api/config` → **200**. A **500** means `AllowOverride` refuses the
     new directives: FTP-delete `_api/.htaccess` and `_api/public/.htaccess`
     and re-verify — then make it durable by deleting them from `api/` in the
     repository and redeploying, because they are in the artifact and not
     protected paths, so a `--relist`, `--force` or bootstrap run uploads them
     back and the 500 returns.
   - `GET /_api/.env` → **403**. The SPA shell means the deny file is not being
     honoured; a 200 serving the file means it is not there at all.
   - A browser login works, and the session cookie is `HttpOnly`,
     `SameSite=Strict`.

Rollback is a redeploy of the previous tag plus the previous `.htaccess`
(`put-overlay` backs up the live one before overwriting). TEST is private,
holds only synthetic data, and is rebuildable in one deploy, which is what
makes the hard reset the cheaper option.

QA and PROD need no migration: neither has an `_api/.env` or an
`api-laravel/.env`, so both get `_api/` from their first deploy.

## 8. Out of scope

- **Moving the document root.** Not available on this host; that answer is what
  makes this spec the fallback rather than the fix.
- **Changing the deploy transport** (A6).
- **HTTPS redirect, HSTS and the four security headers.** Still owed from
  rebuild §6 and still a separate `.htaccess` change; deliberately not bundled
  with a rename, so a 500 has one possible cause instead of two.
- **Deleting `config.php` from QA and PROD.** Neither runs the rebuilt stack
  yet; it goes when they are provisioned.

## 9. Open items

1. **`AllowOverride` on easy-hebergement is unverified.** §7 step 5 is the
   test, and the fallback is documented. Worth recording the answer in
   `staging/README.md` once known — it is the same unresolved-Apache-version
   question that already forced `[L]` over `[END]`.
2. **The post-deploy verifier is still deferred** (it predates this spec). Until
   it exists, §7 step 5 is done by hand.
3. **The deny lands before the grant.** `tools/deploy/ftp.mjs` groups uploads by
   directory and fans out, so `_api/` is an early batch and `_api/public/` a much
   later one: the deny-all arrives seconds before the grant and `/api/*` answers
   403 in between, and a run that dies in that window leaves it 403ing until the
   deploy is re-run. The window exists only on runs where the site is already
   down or being force-rewritten (bootstrap, `--force`, `--relist`), so this is
   recorded, not fixed. If it ever matters, order those two uploads — the way
   `tools/put-overlay.mjs` already orders its own two — rather than serialising
   the whole deploy.
