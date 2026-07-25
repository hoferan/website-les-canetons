# Local Docker Environment: Production Parity — Design

**Date:** 2026-07-25
**Status:** Approved (design)

## Problem

The local `docker compose` stack has drifted away from the shape of the real
host. It runs **ten services** and, more importantly, splits the two PHP
applications across **two origins**: the old app behind Apache on `:8090`, the
Laravel API behind `php artisan serve` on `:8092`. The real host
(`easy-hebergement.net`) is one machine, one Apache, one document root, one
origin, with PHP running as **FastCGI**.

Four concrete consequences:

1. **Two origins.** Sanctum SPA auth is *defined* by being same-origin. Locally
   that premise is false and papered over with
   `SANCTUM_STATEFUL_DOMAINS: localhost:8092,localhost,127.0.0.1`. The root
   `.htaccess` dispatch that makes `/api/*` and `/sanctum/*` same-origin in
   production is not exercised at all.
2. **`artisan serve` is not a web server you ship to.** PHP's built-in dev
   server means no Apache and no `.htaccess`, so neither Laravel's own
   `api/public/.htaccess` nor the planned `api/.htaccess` deny-all hardening
   (the thing protecting `.env` and `vendor/` from the web, since this host's
   FTP account is chrooted to the web root) is ever tested locally.
3. **mod_php vs FastCGI.** `php:8.4-apache` runs mod_php; prod runs FastCGI.
   The codebase already carries two workarounds written for CGI-family SAPIs —
   the `RewriteCond %{ENV:REDIRECT_STATUS} ^$` guard in `app/.htaccess`, and
   Laravel's `RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]`
   in `api/public/.htaccess` (CGI SAPIs strip the `Authorization` header).
   Under mod_php both are dead code locally.
4. **Service sprawl.** Ten services for what is, in reality, one machine plus a
   database.

Not a gap, and worth recording so it is not "fixed": the container's flattened
`App\ -> src/` autoload rewrite in `docker/web/install-vendor.sh` deliberately
matches what `tools/build.mjs` produces for `dist/build/`. It is
parity-preserving.

## Goals

1. One origin, one web server: both apps served from `http://localhost:8090`,
   dispatched by the same `.htaccess` rules production will use.
2. PHP as FastCGI (PHP-FPM behind Apache via `mod_proxy_fcgi`), so `.htaccess`
   and header behavior match the real host.
3. A document root shaped exactly like the deployed `dist/build/` artifact,
   with sources bind-mounted into that shape so PHP edits stay instant.
4. Fewer services: ten down to six.

## Non-goals

- **Not a byte-identical artifact run.** Apache serves the prod *structure*
  with sources mounted into it, not the output of `npm run build`. The fast
  edit loop is worth more than byte identity, which the deploy CLI's own
  verification step already covers on the way out.
- **Not porting any endpoint to Laravel.** This spec changes infrastructure
  only. The `/api/*` cutover's consequences are accepted here (see
  "Accepted cost"), and the ports themselves remain sub-projects 2a-ii and 2b.
- **Not changing the shipped `app/.htaccess`.** The dispatch rule stays
  local-only; shipping it would break five endpoints on TEST, QA and live PROD.
- **Not touching `tools/ensure-dev-stack.mjs`**, the Docker-free web-session
  path. See "Known limitation".
- **No Basic Auth overlay locally.** Prod has none; TEST/QA's overlay stays a
  staging concern.

## Design

### 1. Topology: ten services to six

| Service | Kind | Change |
| --- | --- | --- |
| `deps` | one-shot | **new** — merges `vendor` + `api-vendor`; two `composer install`s into the two volumes |
| `web` | long-running | **rewritten** — Apache + PHP-FPM, serves both apps on `:8090` |
| `db` | long-running | unchanged (`mariadb:10.3`, host `:3307`) |
| `assets` | long-running | unchanged (Vite `--watch`) |
| `mailpit` | long-running | unchanged (`:8025`) |
| `adminer` | long-running | unchanged (`:8091`) |

Removed:

- `api` — folded into `web`. Port `:8092` disappears.
- `vendor`, `api-vendor` — merged into `deps`. `docker/web/install-vendor.sh`
  grows to cover both projects: the old app's install keeps its `sed` autoload
  rewrite, Laravel's needs none (`api/` is mounted whole, so `vendor/` sits
  beside `app/` exactly as `api/composer.json` expects).
- `api-migrate` — folded into `web`'s entrypoint.
- `migrate` — **deleted outright**. `config/config.docker.php` already sets
  `auto_migrate => true`, so `App\AutoMigrator` applies `sql/migrations/*.sql`
  on the first request under a single-flight `GET_LOCK`. That is exactly what
  prod does, so removing the service both drops a container *and* increases
  parity.

`docker/api/Dockerfile` is deleted along with the `api` service.

### 2. The `web` container

`docker/web/Dockerfile`, base **`php:8.4-fpm`** (matches prod's PHP 8.4):

- `apt-get install apache2` (plus `libonig-dev` for the `mbstring` build)
- `docker-php-ext-install mysqli pdo_mysql mbstring` — `mysqli` for the old
  app's `App\Database`, PDO + mbstring for Laravel. **One PHP runtime serving
  both applications**, as on the real host.
- `a2enmod proxy_fcgi setenvif rewrite headers expires`
- `AllowOverride All` on the document root
- `<FilesMatch \.php$> SetHandler "proxy:fcgi://127.0.0.1:9000"` — the official
  `php:8.4-fpm` image already listens on `9000`.

Entrypoint, no supervisor needed:

```sh
cd /var/www/html
php api-laravel/artisan migrate --force   # prod equivalent: the deploy POSTs /api/migrate
php-fpm -D
exec apache2ctl -DFOREGROUND
```

`web` depends on `deps` (`service_completed_successfully`), `db`
(`service_healthy`), `assets` (`service_started`), and `mailpit`.

Note the asymmetry this SAPI change finally exposes correctly: Laravel's
catch-all is guarded by `!-f`, so it cannot self-match; the old app's is a
*true* catch-all (deliberately, so raw files under `pages/`, `src/`, `vendor/`
stay unreachable), which is why it needs the `REDIRECT_STATUS` guard instead.
Both now run under the SAPI they were written for.

### 3. Document-root assembly

`DocumentRoot` is `/var/www/html`, shaped exactly like `dist/build/`. Eight
mounts:

```
/var/www/html/                      <- ./app                              (whole)
  index.php  src/  pages/  partials/  templates/  assets/  api/
  .htaccess                         <- ./dist/overlay/docker/.htaccess    :ro
  config.php                        <- ./config/config.docker.php         :ro
  vendor/                           <- volume `vendor`                    :ro
  sql/migrations/                   <- ./sql/migrations                   :ro
  api-laravel/                      <- ./api                              (whole)
    public/index.php
    .env                            <- ./docker/api/env.docker            :ro
    vendor/                         <- volume `api_vendor`
```

- Every PHP edit is live; Vite keeps writing `app/assets/dist/` on the host.
- `app/api/*.php` stays mounted although it is now unreachable over HTTP —
  `dist/build/` still contains it, so the local tree keeps matching the
  artifact.
- Laravel's `.env` becomes a **real mounted file** rather than compose
  `environment:` keys — the same pattern as `config.docker.php` → `config.php`,
  and it exercises Laravel's actual dotenv path.
- No writable directory is required: `App\View` sets Twig `'cache' => false`.

Two accepted, minor divergences from `dist/build/`: the raw `assets/js` and
`assets/css` source directories exist locally (the build strips them), so a
request under `/assets/js/…` returns 200 locally and 404 on a server; and
`config.example.php` / `deployment.json` are absent locally. Neither affects
application behavior.

### 4. The dispatch `.htaccess`

The rule text lives in one tracked file, `docker/web/api-dispatch.htaccess`.
`tools/build-overlays.mjs` gains a `docker` target that merges it onto
`app/.htaccess` — the identical mechanism it already uses to merge the staging
auth block — emitting `dist/overlay/docker/.htaccess`, which compose mounts.

`app/.htaccess` itself is untouched, so TEST/QA/PROD are unaffected.
Sub-project 2a-ii ships by moving this same, already-proven block into
`app/.htaccess`.

A new `npm run dev` chains `build-overlays docker` before `docker compose up`,
so the file always exists before Docker creates the bind mount — otherwise
Docker silently creates a *directory* named `.htaccess`.

The rule dispatches both `/api/*` and `/sanctum/*` (the Sanctum SPA flow needs
`/sanctum/csrf-cookie`, which is not under `/api/`) to
`api-laravel/public/index.php`, and must match a bare `/api` as well as
`/api/…`.

Two failure modes this design must handle — both would otherwise have been
discovered on TEST, over FTP:

- **The catch-all steals the request.** In per-directory context `[L]` ends the
  current pass, but the ruleset re-runs against the rewritten path. After
  `^api/ → api-laravel/public/index.php`, `REDIRECT_STATUS` is still empty and
  `REQUEST_URI` is still `/api/user`, so the old app's catch-all fires and
  hijacks the request to `index.php`. The dispatch rule must use **`[END]`**,
  not `[L]`. (`[END]` requires Apache 2.3.9+; if the host turns out to be
  older, the fallback is an extra `RewriteCond` on the catch-all.)
- **The hardening 403s the whole API.** Authorization walks the parent
  directories of the *resolved file*. With the Laravel root's `.htaccess` set
  to `Require all denied` and its `public/.htaccess` carrying no `Require`
  directive, the deny is inherited and every API request 403s.
  **`Require all granted` must be added to the `public/.htaccess`.**

Both files live in the tracked `api/` tree — `api/.htaccess` (deny-all) and
`api/public/.htaccess` (amended). Note that only the first *restricts*: the
`public/` file grants, and under `AuthMerging Off` that grant removes an
inherited restriction rather than adding one. See the correction below before
assuming either is safe to activate on a real server.

**Confirmed during implementation:** the 403 described above is exactly what
happens — verified against the running stack, where `/api-laravel/.env`,
`/api-laravel/vendor/autoload.php` and even a nonexistent path under the tree
all return 403 (`authz_core` `AH01630`). Authorization is evaluated during
Apache's directory walk, *before* mod_rewrite's per-directory rules run in the
fixup phase, so the old app's catch-all never sees these requests. (An
intermediate draft of the implementation plan claimed the opposite and was
wrong.) The deny-all is the load-bearing protection here, not a second layer.

**Correction, established during implementation:** `api/.htaccess` was not new —
commit `e904b92` already added it — and neither file actually reaches a server.
Given the paragraph above, that is worse than it first appeared: on TEST, QA and
PROD the Laravel tree has no protection *and* no catch-all backstop for paths
resolving to real files.
The deploy CLI protects the basenames `.htaccess` / `robots.txt` / `config.php` /
`.htpasswd` **at any depth** (`tools/deploy/preflight.mjs:16`, applied by
basename in `local.mjs:24` and `sync.mjs:51,79`), though the documented intent is
the three server-owned files *at the site root*. So the Laravel tree has no
authorization boundary on TEST, QA or PROD. Separately, Apache 2.4's
`AuthMerging` defaults to `Off`, so `api/public/.htaccess`'s `Require all
granted` will *replace* the staging `Require valid-user` rather than accumulate
with it — exposing the whole API on TEST/QA once dispatch is on. Both are
inert today and both are hard prerequisites for sub-project 2a-ii; see
"Prerequisites for sub-project 2a-ii" in the implementation plan.

The host's Apache version also turns out to be **unknown**. `staging/README.md`'s
`<RequireAny>` 500 leans 2.2; nothing in the repo establishes 2.4. The
`<IfModule mod_authz_core.c>` guards in both files therefore stay, and the
version should be settled by reading `SERVER_SOFTWARE` (or the `Server:` header)
from TEST before 2a-ii — the `AuthMerging` behavior above is 2.4-only semantics.

**A note on the two `api` names.** The document root contains both `api/` (the
old app's PHP endpoints, copied from `app/api/`) and `api-laravel/` (the Laravel
project) — a collision `tools/build.mjs` already works around by choosing the
`api-laravel` name, so that building Laravel does not overwrite the old
endpoints. The URL path `/api/*` therefore dispatches into `api-laravel/`, not
`api/`. This spec keeps that arrangement unchanged; when 2a-ii deletes
`app/api/*.php` the collision disappears and `api-laravel/` can be renamed to
`api/` then. Throughout this document, `api/` refers to the tracked Laravel
source tree and `api-laravel/` to where it lands in the document root.

### 5. Sanctum: genuinely same-origin

| Key | Today | After |
| --- | --- | --- |
| `APP_URL` | `http://localhost:8092` | `http://localhost:8090` |
| `SANCTUM_STATEFUL_DOMAINS` | `localhost:8092,localhost,127.0.0.1` | `localhost:8090` |
| `SESSION_DOMAIN` | `localhost` | `localhost` |

The rest of today's compose `environment:` block (`APP_KEY`, DB, session/cache
drivers, Mailpit, `MIGRATE_TOKEN`) moves verbatim into `docker/api/env.docker`.

### 6. Accepted cost: `/api/*` goes to Laravel now

**This is a deliberate decision, taken with the consequences known.** The local
dispatch sends *all* of `/api/*` to Laravel immediately, ahead of the ports, so
the local environment runs the target architecture and the migration's
remaining work is under visible pressure.

Laravel implements only `login`, `logout`, `user` and `migrate`. Every other
interactive feature breaks locally:

| Caller | Endpoint | Result |
| --- | --- | --- |
| `contact.js` | `/api/contact` | 404 |
| `signup.js`, `signups_admin.js` | `/api/altcha`, `/api/signups` | 404 (`souper_signup` is `true` in `config.docker.php`) |
| `planning_repet.js`, `sinscrire.js` | `/api/events` | 404 |
| `inscriptions_admin.js`, `inscriptions_utilisateurs.js` | `/api/responses` | 404 |
| `authentification-inscription.js` | `/api/login` | **419**, not 401 |
| `main.js`, `admin.js` | `/api/logout` | 419 |

Login deserves precision: both handlers happen to return `{"role": …}`, so the
response shape matches. But `statefulApi()` puts these routes behind CSRF
verification and the old JS posts JSON without ever calling
`/sanctum/csrf-cookie`, so the request fails at the middleware, before auth.
Even once that is solved, Laravel sets a Sanctum session while old-app pages
read `$_SESSION`, so those pages still render logged-out.

Path back to a whole local environment:

1. **2a-ii** ports contact + signups + altcha → contact form and souper signup
   work again.
2. **2b** ports events + responses → those endpoints answer, but only for a
   Sanctum-authenticated client.
3. **Sub-project 3** (React SPA) retires the `$_SESSION` pages → member area
   whole.

The local member area therefore stays broken from this change until
sub-project 3.

**Out-of-scope observation for 2a-ii to consider:** both applications now run
in the *same PHP process pool*, so a small bridge in Laravel's `AuthController`
(`session_start()` plus setting `$_SESSION['user']`) would keep the old pages
logged in for the duration of the migration. Ugly and temporary, and not this
spec's decision — but it is newly cheap because of the single-container
topology, and was not possible while the two apps were separate services.

### 7. Verification

`tools/smoke-docker.mjs`, behind `npm run smoke`, asserting against
`http://localhost:8090`:

| Request | Expect | Proves |
| --- | --- | --- |
| `GET /historique` | 200 | old app still served; catch-all intact |
| `GET /api/user` (with `Accept: application/json`) | 401 | dispatch reaches Laravel; `[END]` beat the catch-all |
| `GET /sanctum/csrf-cookie` | 204 + `XSRF-TOKEN` cookie | `/sanctum/*` dispatch; SPA flow alive |
| `GET /api-laravel/.env` | 403 | deny-all hardening works |
| `GET /api-laravel/vendor/autoload.php` | 403 | same |
| `GET /api-laravel/public/index.php` | not 403 | `Require all granted` override works |
| `POST /api/login` with an `Authorization` header | header visible to PHP | FastCGI `HTTP_AUTHORIZATION` workaround exercised |
| `GET /assets/dist/<hashed>.css` | 200 + `immutable` | `mod_headers` / `mod_expires` policy applied |

The `HTTP_AUTHORIZATION` row is inert under today's mod_php and only becomes a
real test under FPM.

Manual checks beyond the script: a PHP edit under `app/pages/` is visible on
refresh without a rebuild, and a JS edit under `app/assets/js/` is picked up
after the Vite watcher rebuilds.

### 8. Files and docs

**New:**

- `docker/web/api-dispatch.htaccess` — the dispatch block
- `docker/api/env.docker` — Laravel's mounted `.env`
- `api/.htaccess` — deny-all hardening
- `tools/smoke-docker.mjs`

**Modified:**

- `docker-compose.yml` — the six-service stack
- `docker/web/Dockerfile` — `php:8.4-fpm` + Apache
- `docker/web/install-vendor.sh` — both Composer installs
- `api/public/.htaccess` — add `Require all granted`
- `tools/build-overlays.mjs` — add the `docker` target
- `package.json` — add `dev` and `smoke` scripts
- `CLAUDE.md` — Local Development section: ports (`:8092` gone), service list,
  `npm run dev`, and the `/api/*` limitation
- `staging/README.md` — the two `api/.htaccess` hardening files

**Deleted:**

- `docker/api/Dockerfile`

### Known limitation

`tools/ensure-dev-stack.mjs`, the Docker-free path used by Claude Code web
sessions, runs `php -S 127.0.0.1:8090 -t app`: no Apache, no `.htaccess`, no
dispatch, no FastCGI. This change widens that gap. It stays as-is and is
recorded here rather than silently accepted — a web session cannot exercise the
dispatch or hardening at all.
