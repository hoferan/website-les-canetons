# Local Docker Production Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the ten-service `docker compose` stack to six and serve both PHP applications from a single Apache + PHP-FPM origin, dispatched by the same `.htaccess` rules production will use.

**Architecture:** One `web` container (`php:8.4-fpm` + Apache, `mod_proxy_fcgi`) serves a document root shaped exactly like the deployed `dist/build/` artifact, with sources bind-mounted into that shape so PHP edits stay instant. The Laravel API moves from its own `:8092` service to `api-laravel/` inside that document root, reached through a dispatch block that `tools/build-overlays.mjs` merges onto `app/.htaccess` — the same merge it already performs for the staging auth overlay. `app/.htaccess` itself is untouched, so TEST/QA/PROD are unaffected.

**Tech Stack:** Docker Compose, Apache 2.4 (`mod_proxy_fcgi`, `mod_rewrite`, `mod_headers`, `mod_expires`), PHP 8.4 FPM, MariaDB 10.3, Laravel 13, Node 20 (`node --test`).

**Spec:** `docs/superpowers/specs/2026-07-25-local-docker-prod-parity-design.md`

---

## Corrections to the spec, discovered while planning

The spec's §4 and §7 contain three assertions that are wrong. This plan implements the corrected behavior; update the spec if you want it to match.

1. **The deny-all hardening is not reachable by a direct request.** `app/.htaccess`'s catch-all rewrites every non-`/assets/` URL to `index.php` during the fixup phase, *before* authorization runs. So `GET /api-laravel/.env` resolves to `/var/www/html/index.php`, authorization is granted for that path, and the old app answers **404** — not 403. The `.env` and `vendor/` are therefore already protected by the catch-all; `Require all denied` is defense in depth for after 2a-ii/3 change the catch-all. Smoke assertions become "not 200, and no secret material in the body".
2. **`GET /api-laravel/public/index.php` proves nothing** and is dropped from the smoke script — the catch-all rewrites it to the old app too. What *does* prove `Require all granted` works is `GET /api/user` returning 401: that request is dispatched by the rewrite rule, so its resolved file really is `/var/www/html/api-laravel/public/index.php`, whose authorization walk passes through the denied parent.
3. **`[END]` disables Laravel's own `HTTP_AUTHORIZATION` forwarding.** `api/public/.htaccess` sets it with a `RewriteRule`, but `[END]` terminates rewrite processing before that file's rules run. Cookie-based Sanctum SPA auth does not care, but any future Bearer-token route would. The dispatch block therefore forwards the header itself, before the terminating rules.

**Out of scope, recorded for sub-project 2a-ii:** `tools/dbmigrate.mjs:37` sends the migrate token as an `X-Migrate-Token` header (the old app's contract, read at `app/api/migrate.php:33`), while `api/app/Http/Controllers/Api/MigrateController.php:14` reads `$request->input('token')`. `npm run dbmigrate:<env>` will 403 the moment `/api/migrate` is dispatched to Laravel on a real server. Do not fix it here.

---

## File Structure

**Create:**

- `docker/web/api-dispatch.htaccess` — the Laravel dispatch block, and nothing else. Single responsibility: the exact rewrite rules that sub-project 2a-ii will move into `app/.htaccess` verbatim.
- `docker/web/apache-canetons.conf` — the Apache vhost: document root, `AllowOverride All`, the FastCGI handler.
- `docker/web/entrypoint.sh` — Laravel migrate, then php-fpm, then Apache in the foreground.
- `docker/api/env.docker` — Laravel's `.env` for local Docker, mounted read-only.
- `api/.htaccess` — deny-all over the Laravel tree.
- `tools/smoke-docker.mjs` — HTTP smoke checks against the single origin.
- `tools/build-overlays.test.mjs` — unit coverage for the new `docker` overlay target.

**Modify:**

- `docker/web/Dockerfile` — `php:8.4-apache` → `php:8.4-fpm` + Apache.
- `docker/web/install-vendor.sh` — install both projects' Composer deps.
- `api/public/.htaccess` — add `Require all granted`.
- `tools/build-overlays.mjs` — add the `docker` target.
- `docker-compose.yml` — the six-service stack.
- `package.json` — `dev`, `smoke`; widen `test:js`.
- `.gitignore` — new Docker mount-point stubs.
- `config/config.docker.php` — comments referencing the deleted `migrate` service.
- `CLAUDE.md`, `staging/README.md` — documentation.

**Delete:**

- `docker/api/Dockerfile`.

---

### Task 1: The dispatch block and the `docker` overlay target

**Files:**

- Create: `docker/web/api-dispatch.htaccess`
- Modify: `tools/build-overlays.mjs`
- Modify: `package.json` (the `test:js` script)
- Test: `tools/build-overlays.test.mjs`

**Interfaces:**

- Produces: `dist/overlay/docker/.htaccess` — the dispatch block followed by `app/.htaccess` verbatim. Consumed by the `web` service's bind mount in Task 7.
- `node tools/build-overlays.mjs docker` becomes a valid invocation; `node tools/build-overlays.mjs` (no arguments) keeps emitting exactly `test`, `qa`, `prod` and nothing else.

- [ ] **Step 1: Create the dispatch block**

Create `docker/web/api-dispatch.htaccess`:

```apache
# ---------------------------------------------------------------------------
# Laravel API dispatch.
#
# Local-dev only for now: tools/build-overlays.mjs merges this block onto
# app/.htaccess to produce the local Docker document root's .htaccess. Shipping
# it to a real server is sub-project 2a-ii's job, and only once Laravel actually
# implements contact/signups/altcha — today it would 404 five live endpoints.
# When that happens this block moves into app/.htaccess unchanged.
#
#   /api/*     -> the Laravel app in api-laravel/
#   /sanctum/* -> ditto. Sanctum's SPA flow needs GET /sanctum/csrf-cookie,
#                 which is not under /api/.
#
# The document root holds BOTH api/ (the old app's PHP endpoints) and
# api-laravel/ (the Laravel project) — see tools/build.mjs, which picks the
# api-laravel name so building Laravel cannot overwrite the old endpoints. The
# URL path /api/* therefore dispatches into api-laravel/, not api/.
# ---------------------------------------------------------------------------
RewriteEngine on

# Forward the Authorization header into the request environment BEFORE the
# dispatch rules below terminate rewrite processing. Laravel ships this same
# rule in its own public/.htaccess, but [END] means that file's rewrite rules
# never run, so it has to happen here. CGI-family SAPIs — which is what this
# host and now this container use — do not hand Authorization to PHP otherwise.
RewriteCond %{HTTP:Authorization} .
RewriteRule ^(api|sanctum)(/|$) - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]

# [END], not [L]. In per-directory context [L] only ends the current pass; the
# whole ruleset then re-runs against the rewritten path. On that second pass
# REDIRECT_STATUS is still empty and REQUEST_URI is still /api/..., so the
# front-controller catch-all below would hijack the request to index.php and
# the old app would answer every API call. [END] terminates rewrite processing
# outright (Apache 2.3.9+).
RewriteRule ^api(/|$) api-laravel/public/index.php [END]
RewriteRule ^sanctum(/|$) api-laravel/public/index.php [END]
```

- [ ] **Step 2: Write the failing test**

Create `tools/build-overlays.test.mjs`:

```js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const run = (...args) =>
  execFileSync(process.execPath, ['tools/build-overlays.mjs', ...args], { encoding: 'utf8' });

test('the docker target merges the dispatch block onto app/.htaccess', () => {
  run('docker');

  const out = readFileSync('dist/overlay/docker/.htaccess', 'utf8');
  const dispatch = readFileSync('docker/web/api-dispatch.htaccess', 'utf8').trimEnd();
  const frontController = readFileSync('app/.htaccess', 'utf8').trimEnd();

  assert.ok(out.startsWith(dispatch), 'the dispatch block must come first');
  assert.ok(out.endsWith(`${frontController}\n`), 'app/.htaccess must be appended verbatim');
});

test('the dispatch rules terminate rewriting so the catch-all cannot hijack them', () => {
  run('docker');

  const out = readFileSync('dist/overlay/docker/.htaccess', 'utf8');
  assert.match(out, /^RewriteRule \^api\(\/\|\$\) api-laravel\/public\/index\.php \[END\]$/m);
  assert.match(out, /^RewriteRule \^sanctum\(\/\|\$\) api-laravel\/public\/index\.php \[END\]$/m);
});

test('docker is not part of the default (server) run', () => {
  const stdout = run();
  assert.doesNotMatch(stdout, /dist\/overlay\/docker/);
});
```

- [ ] **Step 3: Widen the JS test glob so the new file runs**

In `package.json`, replace the `test:js` script:

```json
"test:js": "node --test \"tools/deploy/*.test.mjs\" \"tools/*.test.mjs\"",
```

Two explicit globs rather than `tools/**/*.test.mjs`: a bare directory argument fails on Node 24/Windows and recursive globs need Node 21+, while this quoted-glob form is the one already proven in this repo.

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test:js`

Expected: the first two `build-overlays` tests fail — `tools/build-overlays.mjs` rejects `docker` as an unknown environment (`Unknown environment(s): docker`), so `execFileSync` throws. The third (`docker is not part of the default run`) passes already, which is correct: it is a regression guard, not a driver. The deploy tests keep passing.

- [ ] **Step 5: Add the `docker` target**

In `tools/build-overlays.mjs`, replace this block:

```js
const ENVS = ['test', 'qa', 'prod'];

const requested = process.argv.slice(2).filter((a) => a !== 'all');
const targets = requested.length ? requested : ENVS;

const unknown = targets.filter((e) => !ENVS.includes(e));
if (unknown.length) {
  console.error(`Unknown environment(s): ${unknown.join(', ')}. Use: ${ENVS.join(' | ')} | all`);
  process.exit(1);
}
```

with:

```js
const ENVS = ['test', 'qa', 'prod'];
// `docker` is not a server. It generates the local Docker document root's
// .htaccess (Laravel API dispatch block + app/.htaccess) into
// dist/overlay/docker/, which docker-compose.yml bind-mounts. It lives here
// rather than in a tool of its own because it is the very same
// merge-a-block-onto-app/.htaccess operation the staging auth overlay performs,
// and because sub-project 2a-ii will promote that block into app/.htaccess —
// at which point this target simply stops being needed.
//
// It is never part of a default or `all` run: those emit server overlays you
// upload, and this one is a local build artifact. Ask for it by name.
const LOCAL = ['docker'];
const ALL = [...ENVS, ...LOCAL];

const requested = process.argv.slice(2).filter((a) => a !== 'all');
const targets = requested.length ? requested : ENVS;

const unknown = targets.filter((e) => !ALL.includes(e));
if (unknown.length) {
  console.error(`Unknown environment(s): ${unknown.join(', ')}. Use: ${ALL.join(' | ')} | all`);
  process.exit(1);
}
```

- [ ] **Step 6: Add the merge function**

In `tools/build-overlays.mjs`, immediately after the existing `mergedHtaccess(env)` function, add:

```js
/** docker .htaccess: Laravel API dispatch block first, then the front controller. */
function dockerHtaccess() {
  const dispatch = readFileSync('docker/web/api-dispatch.htaccess', 'utf8').trimEnd();
  return (
    `${dispatch}\n\n` +
    '# ---------------------------------------------------------------------------\n' +
    '# Front controller + cache policy (generated from app/.htaccess by\n' +
    '# tools/build-overlays.mjs — do not edit here; edit app/.htaccess)\n' +
    '# ---------------------------------------------------------------------------\n' +
    `${frontController}\n`
  );
}
```

- [ ] **Step 7: Branch on the target in the emit loop**

In `tools/build-overlays.mjs`, replace:

```js
  if (env === 'prod') {
```

with:

```js
  if (env === 'docker') {
    writeFileSync(`${outDir}/.htaccess`, dockerHtaccess());
  } else if (env === 'prod') {
```

- [ ] **Step 8: Keep the upload hint off local-only runs**

In `tools/build-overlays.mjs`, replace the final line:

```js
console.log('\nUpload each env overlay to its server once (config.php is set by hand, separately).');
```

with:

```js
if (targets.some((env) => ENVS.includes(env))) {
  console.log('\nUpload each env overlay to its server once (config.php is set by hand, separately).');
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm run test:js`

Expected: PASS, all deploy tests plus the three `build-overlays` tests.

- [ ] **Step 10: Verify the generated file by eye**

Run: `node tools/build-overlays.mjs docker && cat dist/overlay/docker/.htaccess`

Expected: the dispatch block, then the generated-from header comment, then the full contents of `app/.htaccess`.

- [ ] **Step 11: Commit**

```bash
git add docker/web/api-dispatch.htaccess tools/build-overlays.mjs tools/build-overlays.test.mjs package.json
git commit -m "feat(docker): add the Laravel dispatch block and a docker overlay target"
```

---

### Task 2: Harden the Laravel tree

**Files:**

- Modify: `api/.htaccess` — **it already exists**, created by commit `e904b92`
- Modify: `api/public/.htaccess`

**Interfaces:**

- Produces: an authorization boundary around the deployed Laravel tree. Consumed by nothing directly; verified in Task 8 by `GET /api/user` returning 401 rather than 403 (that request's resolved file is the only one whose authorization walk crosses this boundary).

`api/.htaccess` only ever *restricts* access. `api/public/.htaccess` does **not** — it grants, and under `AuthMerging Off` that grant removes an inherited restriction. See prerequisite 2 at the end of this plan before assuming either file is safe to activate on a real server.

**Two corrections to earlier drafts of this task, both established during implementation:**

1. **These files do NOT reach any server.** An earlier draft claimed they "already travel to servers today" because `tools/build.mjs` copies `api/` into `dist/build/api-laravel/`. It does — but the deploy CLI then filters them out. `tools/deploy/preflight.mjs:16` protects the *basenames* `.htaccess` / `robots.txt` / `config.php` / `.htpasswd` **at any depth** (`local.mjs:24` matches `entry.name`; `sync.mjs:51,79` match `path.posix.basename(rel)`). So `api-laravel/.htaccess`, `api-laravel/public/.htaccess` and `api-laravel/public/robots.txt` are dropped from every upload, and since protected names are never deleted either, nothing signals it. The boundary is live in local Docker only. **Making the protected set root-relative is a prerequisite for sub-project 2a-ii** — see "Prerequisites for 2a-ii" at the end of this plan. Not fixed here: `tools/deploy/` is what the unmerged `feat/deploy-tooling-improvements` branch rewrites, and changing it here would conflict.

2. **The host's Apache version is genuinely unknown — keep the guards because the question is open.** This item went through two wrong answers before landing here; don't reopen it without new evidence.

   - `staging/README.md` records that the host **500s on `<RequireAny>` / `Require expr`**. `<RequireAny>` is a valid `OR_AUTHCFG` container on 2.4, and `AuthConfig` override is demonstrably granted there (`Require valid-user` works at the document root in the same file). On 2.2 it is an unknown container → "Invalid command" → 500. This is the only real datapoint, and it **leans 2.2**.
   - `staging/test/.htaccess:28`'s unguarded `Require all denied` proves nothing to the contrary, despite a middle draft of this plan claiming it did. `Require` is declared `AP_INIT_RAW_ARGS` in httpd 2.2's `core.c`, so it parses cleanly there — no config-load error on either version. And that line sits inside `<FilesMatch "^\.(htaccess|htpasswd)$">`, which the host's stock global `<FilesMatch "^\.ht">` already denies, so it is never evaluated. "TEST serves normally" carries no information about the version.

   So: **keep the `<IfModule mod_authz_core.c>` / `<IfModule !mod_authz_core.c>` guards, and keep them because the version is unresolved** — not as vestigial belt-and-braces. On 2.2 an unguarded `Require all granted` is an unrecognized entity and yields 401/500 rather than a grant, which would break the API at exactly the cutover. Do not "simplify" the guard away.

   **Settle it cheaply before 2a-ii:** read `$_SERVER['SERVER_SOFTWARE']` from any deployed page on TEST, or just the `Server:` response header, and record the answer in `staging/README.md`. Prerequisite 2 below rests on `AuthMerging`, which is 2.4-only semantics — it fails safe either way, but it should not be presented as proven while the version is not.

- [ ] **Step 1: Improve the comment on the existing deny, keeping its guard**

`api/.htaccess` already contains a guarded `Require all denied`. Keep the directive's guarded shape exactly; replace only the comment, so it records the defense-in-depth reasoning, the fact that the file does not currently ship, and the real reason the guard stays:

```apache
# The FTP account on the shared host is chrooted to the web root, so this
# Laravel project physically lives INSIDE the document root — unlike Laravel's
# normal deployment, where everything but public/ sits outside it. Deny direct
# web access to the whole tree so .env, vendor/ and app/ are unreachable even
# though they are physically web-accessible; public/.htaccess grants access
# back for the one subdirectory that is meant to be reachable.
#
# Defense in depth, not the only line: the old app's front-controller catch-all
# (app/.htaccess) already rewrites every non-/assets/ URL to index.php before
# authorization runs, so a direct hit on /api-laravel/.env is answered by the
# old app's 404 today and never reaches this file. This matters once that
# catch-all changes — which sub-projects 2a-ii and 3 will do.
#
# NOTE: this file does NOT currently reach any server. The deploy CLI treats
# ".htaccess" as a protected basename at ANY depth (tools/deploy/preflight.mjs
# PROTECTED, applied in local.mjs walkBuild and sync.mjs), so it is filtered out
# of every upload even though tools/build.mjs copies it into dist/build/. The
# boundary below is therefore live only in the local Docker stack, from Task 7
# onward. Making the protected set root-relative is a prerequisite for
# sub-project 2a-ii — until then, dispatching /api/* on a real server would
# expose .env and vendor/.
#
# The host's Apache version is NOT established by anything in this repo, so
# both spellings stay guarded. staging/README.md's note that the host 500s on
# <RequireAny> leans 2.2 (it is a valid container on 2.4, and AuthConfig
# override is granted here). The unguarded "Require all denied" in
# staging/test/.htaccess proves nothing to the contrary: Require is RAW_ARGS on
# 2.2 so it parses there too, and that line sits in a <FilesMatch> the host's
# stock ^\.ht deny already covers, so it never runs. Do NOT simplify the guard
# away — on 2.2 an unguarded "Require all granted" is an unrecognized entity
# and yields 401/500 instead of a grant.
<IfModule mod_authz_core.c>
    Require all denied
</IfModule>
<IfModule !mod_authz_core.c>
    Deny from all
</IfModule>
```

- [ ] **Step 2: Grant access back inside `public/`**

In `api/public/.htaccess`, insert at the very top of the file, above the existing `<IfModule mod_rewrite.c>` line:

```apache
# Re-grant web access inside public/. The parent api/.htaccess denies the whole
# Laravel tree (it sits inside the document root on this host — see there).
# Apache evaluates authorization against the RESOLVED file, walking its parent
# directories; with AuthMerging at its default of Off, the innermost section's
# Require directives REPLACE inherited ones rather than adding to them. That is
# why this grant overrides the parent deny at all.
#
# WARNING for sub-project 2a-ii: that same replacement also discards the staging
# Basic Auth. TEST/QA carry "Require valid-user" at the document root
# (staging/*/.htaccess); once /api/* is dispatched here on a real server, this
# grant becomes the innermost section and the API would be reachable with no
# authentication. 2a-ii must handle it — e.g. have tools/build-overlays.mjs emit
# a per-env api-laravel/public/.htaccess carrying the auth block, the same
# merge-a-block pattern it already uses for the document root.
#
# No effect locally: the Docker stack deliberately runs without Basic Auth.
# "The root .htaccess" above means the local Docker overlay today; every
# environment from 2a-ii onward.
<IfModule mod_authz_core.c>
    Require all granted
</IfModule>
<IfModule !mod_authz_core.c>
    Order allow,deny
    Allow from all
</IfModule>

```

- [ ] **Step 3: Confirm nothing else changed in the Laravel file**

Run: `git diff api/public/.htaccess`

Expected: exactly one added hunk — the comment block, the guarded grant, and a blank line. The `<IfModule mod_rewrite.c>` block is untouched.

- [ ] **Step 4: Commit**

```bash
git add api/.htaccess api/public/.htaccess
git commit -m "feat(api): deny web access to the Laravel tree, grant it back in public/"
```

---

### Task 3: The smoke script (the failing test for the whole stack)

**Files:**

- Create: `tools/smoke-docker.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces: `npm run smoke` — exits 0 when every check passes, 1 otherwise, printing one `ok`/`FAIL` line per check. Consumed by Task 8 as the acceptance gate for the rewritten stack.
- Honours `SMOKE_BASE_URL`, defaulting to `http://localhost:8090`.

This is written before the stack exists on purpose: it is the failing test that Tasks 4-7 make pass.

- [ ] **Step 1: Write the smoke script**

Create `tools/smoke-docker.mjs`:

```js
// Smoke-tests the local Docker stack. Every check here asserts something that
// only holds because the stack matches production: both apps on ONE origin, the
// Laravel dispatch surviving the old app's catch-all, the authorization
// boundary the chrooted FTP layout forces around the Laravel tree, and the
// asset cache policy. Run after `npm run dev`.
//
// See docs/superpowers/specs/2026-07-25-local-docker-prod-parity-design.md.
import { readFileSync } from 'node:fs';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:8090';

/** Each check returns a failure string, or null when it passes. */
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

const get = (path, init = {}) => fetch(`${BASE}${path}`, { redirect: 'manual', ...init });

check('the old app is still served (front-controller catch-all intact)', async () => {
  const res = await get('/historique');
  return res.status === 200 ? null : `expected 200, got ${res.status}`;
});

check('/api/* reaches Laravel, and the deny-all did not block it', async () => {
  // Three things at once. 401 rather than the old app's 404 proves the dispatch
  // rule won against the catch-all ([END], not [L]). 401 rather than 403 proves
  // api/public/.htaccess's "Require all granted" overrode the parent deny —
  // this is the ONLY request whose resolved file sits under that denied tree.
  // The JSON body distinguishes Laravel from any other 401.
  const res = await get('/api/user', { headers: { Accept: 'application/json' } });
  if (res.status === 403) return 'got 403 — api/public/.htaccess is missing "Require all granted"';
  if (res.status !== 401) return `expected 401 from Laravel, got ${res.status}`;
  const body = await res.json().catch(() => ({}));
  return body.message === 'Unauthenticated.'
    ? null
    : `expected Laravel's unauthenticated JSON, got ${JSON.stringify(body)}`;
});

check('/sanctum/* reaches Laravel and starts the SPA cookie flow', async () => {
  const res = await get('/sanctum/csrf-cookie');
  if (res.status !== 204) return `expected 204, got ${res.status}`;
  const cookies = res.headers.getSetCookie().join('; ');
  return cookies.includes('XSRF-TOKEN') ? null : `no XSRF-TOKEN cookie in "${cookies}"`;
});

check("Laravel's .env is not readable over the web", async () => {
  // Answered by the old app's 404 today (its catch-all rewrites this to
  // index.php before authorization runs), and by api/.htaccess's deny-all once
  // that catch-all changes. Either way it must not be the file.
  const res = await get('/api-laravel/.env');
  if (res.status === 200) return 'served 200 — the .env is exposed';
  const body = await res.text();
  return body.includes('APP_KEY') ? 'the response body leaked .env contents' : null;
});

check("Laravel's vendor/ is not readable over the web", async () => {
  const res = await get('/api-laravel/vendor/autoload.php');
  if (res.status === 200) return 'served 200 — vendor/ is exposed';
  const body = await res.text();
  return body.includes('ComposerAutoloaderInit') ? 'the response body leaked PHP source' : null;
});

check('the token-gated migrate route works end to end', async () => {
  // Proves dispatch + Laravel boot + .env + DB connection all line up.
  //
  // The token is sent BOTH ways on purpose: MigrateController reads a `token`
  // request input, while tools/dbmigrate.mjs sends an X-Migrate-Token header
  // (the old app's contract). Sub-project 2a-ii has to reconcile those; sending
  // both keeps this check valid whichever way it lands.
  const res = await fetch(`${BASE}/api/migrate`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Migrate-Token': 'local-dev-migrate-token' },
    body: new URLSearchParams({ token: 'local-dev-migrate-token' }),
  });
  if (res.status !== 200) return `expected 200, got ${res.status}`;
  const json = await res.json().catch(() => ({}));
  return json.ok === true ? null : `expected {ok:true}, got ${JSON.stringify(json)}`;
});

check('built assets are served with the immutable cache policy', async () => {
  const manifestPath = 'app/assets/dist/.vite/manifest.json';
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return `no ${manifestPath} — has the assets container finished its first build?`;
  }
  const entry = Object.values(manifest).find((e) => typeof e.file === 'string' && e.file.endsWith('.css'));
  if (!entry) return 'no CSS entry in the Vite manifest';

  const res = await get(`/assets/dist/${entry.file}`);
  if (res.status !== 200) return `expected 200 for /assets/dist/${entry.file}, got ${res.status}`;
  const cacheControl = res.headers.get('cache-control') ?? '';
  return cacheControl.includes('immutable')
    ? null
    : `expected an immutable Cache-Control, got "${cacheControl}"`;
});

let failed = 0;
for (const { name, fn } of checks) {
  let problem;
  try {
    problem = await fn();
  } catch (error) {
    problem = error.message;
  }
  if (problem) {
    failed += 1;
    console.error(`FAIL  ${name}\n      ${problem}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed against ${BASE}`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add after the `test:js` line:

```json
"smoke": "node tools/smoke-docker.mjs",
```

- [ ] **Step 3: Run it against the current stack to verify it fails**

Run: `npm run smoke`

Expected: FAIL. With the stack down, every check fails on a connection error. With today's stack up (`docker compose up -d`), `/historique` passes and everything Laravel-related fails, because `/api/*` is still answered by the old app on `:8090` and Laravel only listens on `:8092`.

- [ ] **Step 4: Commit**

```bash
git add tools/smoke-docker.mjs package.json
git commit -m "test(docker): add smoke checks for the single-origin stack"
```

---

### Task 4: The `web` image — Apache + PHP-FPM

**Files:**

- Modify: `docker/web/Dockerfile`
- Create: `docker/web/apache-canetons.conf`
- Create: `docker/web/entrypoint.sh`
- Delete: `docker/api/Dockerfile`

**Interfaces:**

- Produces: an image serving `/var/www/html` on port 80, with PHP handled by an in-container php-fpm pool on `127.0.0.1:9000`, `AllowOverride All`, and `mod_rewrite`/`mod_headers`/`mod_expires` enabled. Consumed by the `web` service in Task 7.
- The entrypoint expects `/var/www/html/api-laravel/artisan` to exist and the database to be reachable — Task 7 wires both.

- [ ] **Step 1: Replace the Dockerfile**

Replace the entire contents of `docker/web/Dockerfile`:

```dockerfile
# Local dev image: ONE container running Apache + PHP-FPM, mirroring the real
# host (easy-hebergement), where a single Apache serves both the old app and the
# Laravel API from one document root with PHP as FastCGI.
#
# php:8.4-fpm, not php:8.4-apache: production runs PHP as FastCGI, not mod_php.
# Two workarounds in this codebase only take effect under a CGI-family SAPI —
# app/.htaccess's REDIRECT_STATUS guard, and the Authorization-header
# forwarding in docker/web/api-dispatch.htaccess — and are dead code under
# mod_php, so a mod_php container cannot tell you whether they work.
FROM php:8.4-fpm

# mysqli: the old app (App\Database). pdo_mysql + mbstring: Laravel, which
# talks to MariaDB over PDO. ONE PHP runtime serves both applications, exactly
# as on the real host. libonig-dev is mbstring's build dependency.
RUN apt-get update \
 && apt-get install -y --no-install-recommends apache2 libonig-dev \
 && docker-php-ext-install mysqli pdo_mysql mbstring \
 && a2enmod proxy_fcgi setenvif rewrite headers expires \
 && a2dissite 000-default \
 && rm -rf /var/lib/apt/lists/*

COPY apache-canetons.conf /etc/apache2/sites-available/canetons.conf
RUN a2ensite canetons

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /var/www/html
EXPOSE 80

# Overrides the base image's `php-fpm` CMD: this container runs both processes.
CMD ["/usr/local/bin/entrypoint.sh"]
```

- [ ] **Step 2: Create the vhost**

Create `docker/web/apache-canetons.conf`:

```apache
<VirtualHost *:80>
    ServerName localhost
    DocumentRoot /var/www/html

    # AllowOverride All is not a convenience here — the ENTIRE routing story for
    # both applications lives in .htaccess files (front controller, Laravel
    # dispatch, cache policy, the authorization boundary around api-laravel/),
    # exactly as on the shared host. "All" rather than a narrower set because
    # the Require directives in api/.htaccess need AuthConfig too.
    <Directory /var/www/html>
        Options -Indexes -MultiViews +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # PHP as FastCGI: hand every .php file to the php-fpm pool listening on
    # 127.0.0.1:9000 inside this same container (the php:8.4-fpm image's
    # default). This is the line that makes the SAPI match production.
    <FilesMatch \.php$>
        SetHandler "proxy:fcgi://127.0.0.1:9000"
    </FilesMatch>

    ErrorLog /dev/stderr
    CustomLog /dev/stdout combined
</VirtualHost>
```

- [ ] **Step 3: Create the entrypoint**

Create `docker/web/entrypoint.sh`:

```sh
#!/bin/sh
set -e

cd /var/www/html

# Laravel's own migrations. On a real server the deploy triggers these over HTTP
# (POST /api/migrate); there is no deploy step locally, so run them before
# Apache accepts its first request.
#
# The old app needs no equivalent: config.docker.php sets auto_migrate => true,
# so App\AutoMigrator applies sql/migrations/*.sql on the first request under a
# GET_LOCK — which is exactly what production does. That is why the former
# one-shot `migrate` compose service is gone rather than folded in here.
php api-laravel/artisan migrate --force

# php-fpm in the background, Apache in the foreground so the container's
# lifetime tracks Apache. No supervisor: two processes, one of them daemonised
# by its own flag, is not worth the extra moving part.
php-fpm -D
exec apache2ctl -DFOREGROUND
```

- [ ] **Step 4: Delete the now-unused API image**

```bash
git rm docker/api/Dockerfile
```

This stages the deletion; Step 8's commit picks it up. The `api` service that used it disappears in Task 7 — Laravel now runs inside `web`.

- [ ] **Step 5: Verify the image builds**

Run: `docker build -t canetons-web-check ./docker/web`

Expected: build succeeds. If `docker-php-ext-install mbstring` fails, `libonig-dev` did not install — check the `apt-get` line.

- [ ] **Step 6: Verify the SAPI is FastCGI and mod_php is absent**

Run:

```bash
docker run --rm canetons-web-check apache2ctl -M
```

Expected: the output lists `proxy_fcgi_module`, `rewrite_module`, `headers_module` and `expires_module`, and does **not** list `php_module` or `php8_module`. This is the direct evidence that the SAPI matches production — no HTTP request can prove it, because no route in either app reflects its own SAPI.

- [ ] **Step 7: Clean up the throwaway image**

```bash
docker image rm canetons-web-check
```

- [ ] **Step 8: Commit**

```bash
git add docker/web/Dockerfile docker/web/apache-canetons.conf docker/web/entrypoint.sh
git commit -m "feat(docker): rebuild the web image as Apache + PHP-FPM"
```

The `docker/api/Dockerfile` deletion staged in Step 4 is included.

---

### Task 5: Laravel's mounted `.env`

**Files:**

- Create: `docker/api/env.docker`

**Interfaces:**

- Produces: a real dotenv file mounted read-only at `/var/www/html/api-laravel/.env` by the `web` service in Task 7. Replaces today's compose `environment:` block for the Laravel app.
- The `MIGRATE_TOKEN` value `local-dev-migrate-token` is the one `tools/smoke-docker.mjs` sends in Task 3. Keep them in sync.

A file rather than compose `environment:` keys for two reasons: it exercises Laravel's actual dotenv path (compose env vars bypass it), and it mirrors how every real server owns its `.env` by hand — the same pattern as `config/config.docker.php` → `config.php` for the old app.

- [ ] **Step 1: Create the file**

Create `docker/api/env.docker`:

```dotenv
# Laravel's .env for local Docker dev, mounted read-only at api-laravel/.env in
# the web container. The same operational pattern as
# config/config.docker.php -> config.php for the old app.
#
# Committed on purpose: throwaway local credentials only, for the compose `db`
# and `mailpit` services. Real per-server values are set by hand on each server
# and never travel with a deploy. See api/.env.example for the documented shape.
#
# NOT named ".env": the repo's .gitignore ignores that filename everywhere.
APP_NAME="Les Canetons API"
APP_ENV=local
APP_KEY=base64:laLm1TQBwlapjrscB5SkLK7IqyMJjX+p4VTcWKVQOE4=
APP_DEBUG=true
APP_URL=http://localhost:8090

APP_LOCALE=en
APP_FALLBACK_LOCALE=en

BCRYPT_ROUNDS=12

LOG_CHANNEL=stack
LOG_STACK=single
LOG_LEVEL=debug

# The SAME database the old app uses: this project shares one connection and
# gets no database of its own. The guarded migrations adopt the old app's
# tables in place rather than recreating them.
DB_CONNECTION=mysql
DB_HOST=db
DB_PORT=3306
DB_DATABASE=lescanetons
DB_USERNAME=canetons
DB_PASSWORD=canetons

# Sanctum SPA cookie session. Both apps are now served from ONE origin
# (http://localhost:8090), so this is a real same-origin setup rather than the
# cross-port workaround the old two-container stack needed
# (SANCTUM_STATEFUL_DOMAINS used to list localhost:8092,localhost,127.0.0.1).
SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_DOMAIN=localhost
SANCTUM_STATEFUL_DOMAINS=localhost:8090

QUEUE_CONNECTION=sync
CACHE_STORE=database

# Local mail goes to Mailpit: http://localhost:8025. Username, password and
# scheme stay unset so Symfony's SMTP transport attempts no AUTH and no TLS.
MAIL_MAILER=smtp
MAIL_HOST=mailpit
MAIL_PORT=1025
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_FROM_ADDRESS="noreply@les-canetons.localhost"
MAIL_FROM_NAME="${APP_NAME}"

# Shared secret for the token-gated POST /api/migrate route. tools/smoke-docker.mjs
# sends this exact value.
MIGRATE_TOKEN=local-dev-migrate-token
```

- [ ] **Step 2: Confirm the secret guard is happy**

Run: `npm run guard`

Expected: PASS. The `APP_KEY` here is the same throwaway value already committed in `docker-compose.yml` today, so the guard has already accepted it. If it now objects, add an allowance rather than changing the key — Task 7 removes the compose copy, so the value must stay valid.

- [ ] **Step 3: Commit**

```bash
git add docker/api/env.docker
git commit -m "feat(docker): give the Laravel app a real mounted .env"
```

---

### Task 6: One `deps` service installs both projects

**Files:**

- Modify: `docker/web/install-vendor.sh`

**Interfaces:**

- Produces: a populated `vendor` volume (old app, autoload rewritten to `App\ -> src/`) and a populated `api_vendor` volume (Laravel, dev dependencies included). Consumed by the `deps` service and both `web` bind mounts in Task 7.
- Expects `/repo/composer.json`, `/repo/composer.lock`, `/app/vendor` (volume), `/api` (the repo's `api/`), `/api/vendor` (volume).

- [ ] **Step 1: Rewrite the script**

Replace the entire contents of `docker/web/install-vendor.sh`:

```sh
#!/bin/sh
set -e

# Runs in the one-shot `deps` service (composer image) to populate BOTH vendor
# volumes the web container mounts. It replaces the former separate `vendor` and
# `api-vendor` services: one container, one place to look when an install fails.
# `web` waits for it via service_completed_successfully, which is why
# `docker compose up` needs no host-side vendor/ and no manual composer step
# for either application.

# --- Old app -----------------------------------------------------------------
# The web container serves app/'s contents flat at /var/www/html, so the App\*
# classes live at /var/www/html/src. Composer's autoload map is stored relative
# to vendor/'s parent, so it must read App\ -> src/. The repo composer.json maps
# App\ -> app/src/ (correct for the repo-root tree that host tooling and CI
# use), so reuse it and rewrite just that one path. The lock's content-hash
# ignores autoload, so `composer install` stays happy against the repo lock.
# tools/build.mjs performs the same rewrite when it assembles dist/build/, so
# this is parity-preserving, not a divergence.
cd /app
cp /repo/composer.json /repo/composer.lock ./
sed -i 's#"app/src/"#"src/"#' composer.json
composer install --no-dev --no-interaction --no-progress

# --- Laravel API -------------------------------------------------------------
# No autoload rewrite needed here: api/ is mounted whole into the web container,
# so vendor/ sits beside app/ exactly as api/composer.json's App\ -> app/ map
# expects. Dev dependencies stay installed, unlike the old app above — the
# Laravel test suite runs against this vendor.
cd /api
composer install --no-interaction --no-progress
```

- [ ] **Step 2: Verify the script is syntactically valid**

Run: `docker run --rm -v "$(pwd)/docker/web/install-vendor.sh:/s.sh:ro" composer:2 sh -n /s.sh`

Expected: no output, exit 0.

On PowerShell use `${PWD}` in place of `$(pwd)`.

- [ ] **Step 3: Commit**

```bash
git add docker/web/install-vendor.sh
git commit -m "refactor(docker): install both projects' PHP deps from one script"
```

---

### Task 7: The six-service compose stack

**Files:**

- Modify: `docker-compose.yml`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**

- Produces: `npm run dev` — generates `dist/overlay/docker/.htaccess`, then brings up six services with the site on `http://localhost:8090`. Consumed by Task 8's smoke run.
- Ports after this task: `8090` site, `8091` Adminer, `8025` Mailpit, `3307` MariaDB. **`8092` is gone.**

- [ ] **Step 1: Replace docker-compose.yml**

Replace the entire contents of `docker-compose.yml`:

```yaml
services:
  # One-shot init: installs BOTH projects' PHP deps into their shared volumes,
  # then exits. Replaces the former separate `vendor` and `api-vendor` services.
  deps:
    image: composer:2
    volumes:
      - ./composer.json:/repo/composer.json:ro
      - ./composer.lock:/repo/composer.lock:ro
      - ./docker/web/install-vendor.sh:/install-vendor.sh:ro
      - vendor:/app/vendor
      - ./api:/api
      - api_vendor:/api/vendor
    entrypoint: ["sh", "/install-vendor.sh"]
    restart: "no"

  # Rebuilds app/assets/dist/ whenever a JS/CSS source file under app/assets/
  # changes, so `web` always serves real built output from disk — same code path
  # as production, no HMR and no second port. The first build takes a few
  # seconds after `up`; a request before it finishes may 404 on an asset tag
  # until then (it self-resolves on the next refresh). Unlike the one-shot
  # `deps` service, `web` cannot wait for completion because this runs forever.
  assets:
    image: node:20
    working_dir: /repo
    volumes:
      - .:/repo
      - node_modules:/repo/node_modules
    command: sh -c "npm ci && npx vite build --watch"

  # ONE container, ONE origin: Apache + PHP-FPM serving both the old app and the
  # Laravel API from a single document root shaped exactly like the deployed
  # dist/build/ artifact — the way the real host works. The old `api` service on
  # :8092 and its `php artisan serve` are gone; so are the `api-migrate` and
  # `migrate` one-shots (see docker/web/entrypoint.sh for why).
  #
  # See docs/superpowers/specs/2026-07-25-local-docker-prod-parity-design.md.
  web:
    build: ./docker/web
    ports:
      - "8090:80"
    volumes:
      # The old app, mounted whole: index.php, src/, pages/, partials/,
      # templates/, assets/ and api/ all land at the document root, in the same
      # positions tools/build.mjs puts them in dist/build/.
      - ./app:/var/www/html
      # Generated by `node tools/build-overlays.mjs docker`, which `npm run dev`
      # chains ahead of `up` = the Laravel dispatch block + app/.htaccess.
      # It MUST exist before `up`, or Docker silently creates a DIRECTORY here
      # and Apache serves the site with no rules at all.
      - ./dist/overlay/docker/.htaccess:/var/www/html/.htaccess:ro
      - ./config/config.docker.php:/var/www/html/config.php:ro
      - vendor:/var/www/html/vendor:ro
      # In the document root because dist/build/ ships them there too
      # (tools/build.mjs) and App\AutoMigrator resolves them as
      # dirname(__DIR__)/sql/migrations. The entrypoint applies them before
      # Laravel's, so AutoMigrator finds nothing pending on the first request —
      # same code path as production, just already satisfied.
      - ./sql/migrations:/var/www/html/sql/migrations:ro
      # OUTSIDE the document root: dist/build/ does not ship tools/, so putting
      # it under /var/www/html would break the shape this mount list exists to
      # preserve. The entrypoint runs /srv/tools/migrate.php; the image
      # symlinks /srv/app/src -> /var/www/html/src for that script's relative
      # require of App\Migrator.
      - ./tools:/srv/tools:ro
      # The Laravel project lands at api-laravel/, not api/: the document root
      # already holds the old app's api/ endpoints. tools/build.mjs uses the
      # same name for the same reason. The URL path /api/* dispatches here.
      - ./api:/var/www/html/api-laravel
      - ./docker/api/env.docker:/var/www/html/api-laravel/.env:ro
      - api_vendor:/var/www/html/api-laravel/vendor
    # ONLY the old app's four DB_* keys, which tools/migrate.php reads from the
    # environment. Laravel deliberately gets nothing here — its configuration
    # comes from the .env file mounted above, which is the whole point (it
    # exercises Laravel's real dotenv path and mirrors how each server owns its
    # own .env). `php api-laravel/artisan` loads it natively from the project
    # base path. DB_HOST is the one key both tools read, and both want `db`.
    environment:
      DB_HOST: db
      DB_USER: root
      DB_PASS: root
      DB_NAME: lescanetons
    depends_on:
      deps:
        condition: service_completed_successfully
      db:
        condition: service_healthy
      assets:
        condition: service_started
      mailpit:
        condition: service_started

  db:
    image: mariadb:10.3
    environment:
      MARIADB_DATABASE: lescanetons
      MARIADB_USER: canetons
      MARIADB_PASSWORD: canetons
      MARIADB_ROOT_PASSWORD: root
    ports:
      - "3307:3306"
    volumes:
      - db_data:/var/lib/mysql
      - ./docker/db/init:/docker-entrypoint-initdb.d:ro
    # -h 127.0.0.1, NOT localhost. Against `localhost` mysqladmin uses the unix
    # socket, which succeeds against MariaDB's temporary --skip-networking init
    # server while TCP is still unreachable and the schema is unloaded — a
    # reproducible false positive that can release `web` too early (observed:
    # PASS at t=4s with zero tables, fail at t=5s, PASS for real at t=6s).
    # Forcing TCP makes the check mean what `depends_on: service_healthy` needs
    # it to mean.
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -u root -proot || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 20

  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "8025:8025"

  adminer:
    image: adminer:latest
    ports:
      - "8091:8080"
    depends_on:
      - db

volumes:
  db_data:
  vendor:
  api_vendor:
  node_modules:
```

- [ ] **Step 2: Ignore the new mount-point stubs**

In `.gitignore`, replace this entry:

```
# empty mount-point stub Docker creates when compose mounts the `vendor` volume
# into the ./app -> /var/www/html mount (docker-compose.yml); also the symlink
# tools/ensure-dev-stack.sh creates for native (Docker-less) web sessions. No
# trailing slash: unlike a directory-only pattern, this also matches the
# symlink, which `git status` would otherwise show as untracked.
/app/vendor
```

with:

```
# empty mount-point stubs Docker creates when compose nests mounts inside the
# ./app -> /var/www/html mount (docker-compose.yml): the `vendor` volume, the
# sql/migrations bind, and the Laravel tree at api-laravel/. Creating a nested
# mount point writes through to the host side of the outer bind, so these
# appear as untracked directories in app/. /app/vendor also covers the symlink
# tools/ensure-dev-stack.sh creates for native (Docker-less) web sessions — no
# trailing slash on these, so the pattern matches a symlink too.
/app/vendor
/app/sql
/app/api-laravel
```

- [ ] **Step 3: Add the `dev` scripts**

In `package.json`, add after the `build:overlay` line:

```json
"dev": "node tools/build-overlays.mjs docker && docker compose up -d --build",
"dev:down": "docker compose down",
```

`dev` chains the overlay generation deliberately: `docker compose up` on its own would create a directory where the `.htaccess` file mount expects a file.

- [ ] **Step 4: Bring the stack up**

Run: `npm run dev`

Expected: images build, `deps` runs to completion, six services reported. First run takes several minutes (two Composer installs plus `npm ci`).

- [ ] **Step 5: Verify the service list**

Run: `docker compose ps --services`

Expected exactly, in any order: `adminer`, `assets`, `db`, `deps`, `mailpit`, `web`. No `api`, no `api-vendor`, no `api-migrate`, no `migrate`, no `vendor`.

- [ ] **Step 6: Verify the entrypoint got through Laravel's migrations**

Run: `docker compose logs web | head -40`

Expected: Artisan migration output (`INFO  Nothing to migrate.` or a list of applied migrations), then Apache starting. If it reports a database connection error, `docker/api/env.docker`'s `DB_HOST` is wrong — it must be `db`.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml .gitignore package.json
git commit -m "feat(docker): collapse to a six-service single-origin stack"
```

---

### Task 8: Make the smoke checks pass

**Files:**

- No new files. Fixes land in whichever file the failures point at.

**Interfaces:**

- Consumes: `npm run smoke` from Task 3, the stack from Task 7.
- Produces: a green smoke run — the acceptance gate for the whole plan.

**Run this task's shell commands in Git Bash, not PowerShell.** In PowerShell `curl` is an alias for `Invoke-WebRequest`, which takes none of these flags — use `curl.exe` there, and note that `grep` and `rm -rf` are unavailable too.

- [ ] **Step 1: Run the smoke checks**

Run: `npm run smoke`

Expected: `8/8 checks passed against http://localhost:8090`.

- [ ] **Step 2: Work through any failures**

Each check names its own cause. The likely ones, and where to look:

| Failure | Cause | Fix |
| --- | --- | --- |
| `/api/user` returns 404 | either the catch-all won (`[L]` instead of `[END]`, or the dispatch block is not first in the merged file) or Laravel booted with no `/api/user` route. The check message distinguishes them; the response body tells you which app answered | `docker/web/api-dispatch.htaccess`; re-run `node tools/build-overlays.mjs docker` and `docker compose restart web` |
| `/api/user` returns 403 | `Require all granted` missing or below the `<IfModule>` block | `api/public/.htaccess` (Task 2, Step 2) |
| `/api/user` returns 500 | Laravel cannot boot — usually a missing `.env` mount or an unreadable `APP_KEY` | `docker compose exec web cat api-laravel/.env`, then `docker compose logs web` |
| `/sanctum/csrf-cookie` returns 404 | the `^sanctum(/\|$)` rule is missing from the dispatch block | `docker/web/api-dispatch.htaccess` |
| `/historique` returns 500 | the front-controller rewrite is looping; the merged `.htaccess` lost the `REDIRECT_STATUS` guard | check `dist/overlay/docker/.htaccess` contains `app/.htaccess` verbatim |
| `/historique` returns 403 or a directory listing | the `.htaccess` bind mounted as a directory — `up` ran without the overlay step | `docker compose down`, `rm -rf dist/overlay/docker`, `npm run dev` |
| migrate route returns 403 | `MIGRATE_TOKEN` in `docker/api/env.docker` does not match the value in `tools/smoke-docker.mjs` | make them match |
| asset check finds no manifest | the `assets` container has not finished its first build | `docker compose logs assets`, wait, re-run |

Re-run `npm run smoke` after each fix. Changes to `.htaccess` content need `node tools/build-overlays.mjs docker && docker compose restart web`; changes to the Dockerfile, vhost or entrypoint need `docker compose up -d --build web`.

- [ ] **Step 3: Verify the edit loop is still instant**

Add a temporary marker to a page — in `app/pages/historique.php`, insert `<!-- smoke-marker -->` as the first line — then:

Run: `curl -s http://localhost:8090/historique | grep -c smoke-marker`

Expected: `1`, with no rebuild and no container restart. Then remove the marker and confirm it is gone:

Run: `git checkout app/pages/historique.php && curl -s http://localhost:8090/historique | grep -c smoke-marker`

Expected: `0`.

- [ ] **Step 4: Confirm the old app's dynamic features are broken as designed**

Nothing to run — the smoke script's 8th check covers this.

An earlier draft of this step used `curl -s -o /dev/null -w "%{http_code}" .../api/contact -X POST` and expected `404`. It would in fact have caught a dispatch failure, but not for the reason given, and it could not confirm the success case. `app/src/routes.php:75` registers `contact` under `/api/`, so if dispatch failed the old app would run `app/api/contact.php`, which rejects the empty POST body and returns **400** JSON — not the 404 the draft assumed, and not HTML either (`app/api/contact.php:8` sets a JSON content-type first). So **status** is the discriminator, 400 versus 404; and `-o /dev/null` discarded the body, leaving no way to confirm a 404 came from Laravel rather than from an Apache error document. The smoke check asserts both, and names the 400 case explicitly.

This is the accepted cost recorded in the spec's §6, not a bug — `/api/contact` now goes to Laravel, which does not implement it until sub-project 2a-ii.

- [ ] **Step 5: Run the full check suite**

Run: `npm run check`

Expected: PASS. This also re-runs `test:js`, including Task 1's overlay tests.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(docker): make the single-origin smoke checks pass"
```

If Step 1 passed with no changes, skip this commit.

---

### Task 9: Documentation

**Files:**

- Modify: `CLAUDE.md`
- Modify: `staging/README.md`
- Modify: `config/config.docker.php`

**Interfaces:**

- Produces: documentation matching the shipped stack. No code depends on it.

- [ ] **Step 1: Fix the stale comments in the Docker config**

In `config/config.docker.php`, replace this comment block:

```php
    // On in dev too; the docker `migrate` service still applies dev migrations
    // before web starts, so this is effectively a no-op there (app/sql/migrations
    // is absent in the dev layout) — present so the config shape matches.
    'auto_migrate' => true,
    // Unused locally (docker migrates via the `migrate` service, not HTTP), but
    // present so the config shape matches config.example.php.
    'migrate' => [
        'token' => 'dev-local-unused',
    ],
```

with:

```php
    // On in dev, and now actually load-bearing: docker-compose.yml mounts
    // sql/migrations into the document root, so App\AutoMigrator applies
    // pending migrations on the first request exactly as on a real server. The
    // one-shot `migrate` service that used to do this is gone.
    'auto_migrate' => true,
    // Unused by the old app locally — /api/migrate is dispatched to Laravel,
    // which reads its own MIGRATE_TOKEN from docker/api/env.docker. Present so
    // the config shape matches config.example.php.
    'migrate' => [
        'token' => 'dev-local-unused',
    ],
```

- [ ] **Step 2: Rewrite CLAUDE.md's Local Development section**

In `CLAUDE.md`, replace everything from the `## Local Development` heading up to (but not including) the `**Laravel API (`api/`) in Docker:**` paragraph, with:

````markdown
## Local Development

```bash
npm run dev        # build the docker .htaccess overlay, then bring the stack up
npm run smoke      # HTTP smoke checks against the running stack
npm run dev:down   # stop
```

**Never `docker compose up` directly.** `npm run dev` first generates
`dist/overlay/docker/.htaccess` (the Laravel dispatch block merged onto
`app/.htaccess`, by `tools/build-overlays.mjs docker`). Compose bind-mounts
that file; if it does not exist, Docker silently creates a *directory* in its
place and Apache serves the site with no rules at all.

| URL | What |
| --- | --- |
| http://localhost:8090 | the site — **both** the old app and the Laravel API |
| http://localhost:8091 | Adminer |
| http://localhost:8025 | Mailpit |
| `localhost:3307` | MariaDB |

**One origin, one web server.** The `web` container runs Apache with PHP as
**FastCGI** (`php:8.4-fpm` + `mod_proxy_fcgi`), serving a document root shaped
exactly like the deployed `dist/build/` artifact, with sources bind-mounted
into that shape so PHP edits are live with no rebuild. This mirrors the real
host: `/api/*` and `/sanctum/*` are dispatched by `.htaccess` into the Laravel
app at `api-laravel/`, everything else goes to the old app's front controller.
There is no separate API port any more.

The stack is six services: `web`, `db`, `assets` (Vite `--watch`), `mailpit`,
`adminer`, and the one-shot `deps` (both projects' Composer installs, into the
`vendor` and `api_vendor` volumes — see `docker/web/install-vendor.sh`). No
host-side `vendor/` and no manual composer step are needed; changing a
dependency is picked up on the next `up`. Laravel's migrations run from the
`web` entrypoint; the old app's run themselves on the first request via
`App\AutoMigrator` (`auto_migrate => true`), exactly as in production.

**Known limitation — `/api/*` is ahead of the code.** The local stack runs the
*target* architecture: all of `/api/*` is dispatched to Laravel, which today
implements only `login`, `logout`, `user` and `migrate`. So locally
`/api/contact`, `/api/signups`, `/api/altcha`, `/api/events` and
`/api/responses` return 404, and login fails CSRF (419) because the old JS
never calls `/sanctum/csrf-cookie`. This is deliberate: sub-project 2a-ii
restores contact/signups/altcha, 2b restores events/responses, and 3 retires
the `$_SESSION` pages. Public pages are unaffected. See
`docs/superpowers/specs/2026-07-25-local-docker-prod-parity-design.md`.
````

- [ ] **Step 3: Update the Laravel-in-Docker paragraph**

In `CLAUDE.md`, replace the sentence that begins `**Laravel API (`api/`) in Docker:** the `api` service (`docker/api/Dockerfile`,` and runs through `...independent of the old app on :8090 — production dispatch (root `.htaccess` routing `/api/*` into Laravel on one origin) is a later sub-project.` with:

```markdown
**Laravel API (`api/`) in Docker:** Laravel runs inside the same `web`
container as the old app, under the same Apache and the same PHP-FPM pool,
reached at `http://localhost:8090/api/*` — there is no separate service or
port. Its `.env` is a real mounted file (`docker/api/env.docker` →
`api-laravel/.env`), mirroring how each server owns its own `.env` by hand.
```

- [ ] **Step 4: Note the hardening files in the staging README**

In `staging/README.md`, add at the end of the "What actually lives on a staging server" section, after the three server-owned files list:

```markdown
Two further `.htaccess` files travel *with* the code artifact rather than being
server-owned, because the FTP account is chrooted to the web root and the
Laravel project therefore sits inside it:

- `api-laravel/.htaccess` (tracked as `api/.htaccess`) — `Require all denied`
  over the whole Laravel tree, so `.env`, `vendor/` and `app/` are unreachable
  despite being physically web-accessible.
- `api-laravel/public/.htaccess` (tracked as `api/public/.htaccess`) —
  `Require all granted`, re-granting access for the one subdirectory that is
  meant to be reachable. Without it every dispatched API request 403s, since
  Apache inherits authorization from the parent directories of the resolved
  file.

Defense in depth today: the front-controller catch-all already rewrites every
non-`/assets/` URL to `index.php` before authorization runs, so a direct hit on
`/api-laravel/.env` gets the old app's 404. These matter once sub-projects
2a-ii and 3 change that catch-all.
```

- [ ] **Step 5: Verify the docs match reality**

Run: `docker compose ps --services` and check the six names against the CLAUDE.md list. Run `npm run smoke` once more and confirm it still passes.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md staging/README.md config/config.docker.php
git commit -m "docs(docker): document the single-origin six-service dev stack"
```

---

## Prerequisites for sub-project 2a-ii

Two defects found while implementing this plan. Neither has any effect today — no server dispatches into `api-laravel/`, and the old app's catch-all rewrites direct hits to a 404 — but both become live the moment 2a-ii turns on `/api/*` dispatch on a real server. Neither is fixed here.

**1. The deploy CLI never uploads nested `.htaccess` or `robots.txt`.** `tools/deploy/preflight.mjs:16` protects those basenames *at any depth* (`local.mjs:24` matches `entry.name`; `sync.mjs:51,79` match `path.posix.basename(rel)`), though the intent — per CLAUDE.md — was the three server-owned files **at the site root**. So `api-laravel/.htaccess`, `api-laravel/public/.htaccess` and `api-laravel/public/robots.txt` are dropped from every upload, and because protected names are never deleted either, nothing signals it. The Laravel tree has no authorization boundary on any server despite one existing in the repo since `e904b92`; at cutover, `.env`, `vendor/`, `storage/` and `tests/` would sit unprotected in the document root.

The boundary is live nowhere at the moment, and live in the local Docker stack from Task 7 onward.

Fix: make the protected set root-relative — test the posix-normalized path relative to the deploy root rather than the basename, updating `local.test.mjs` / `sync.test.mjs` accordingly. **Do this on `feat/deploy-tooling-improvements`**, which rewrites these files across 35 unmerged commits; landing it elsewhere would conflict.

**2. `api/public/.htaccess`'s grant defeats the staging Basic Auth.** Apache 2.4's `AuthMerging` defaults to `Off`, so the innermost section's `Require` directives replace inherited ones rather than accumulating. TEST/QA carry `Require valid-user` at the document root (`staging/*/.htaccess`). Once `/api/*` dispatches into `api-laravel/public/`, that file's `Require all granted` becomes innermost and overrides it — making the entire API publicly reachable on both staging sites, with no authentication and no crawler protection.

Fix options: have `tools/build-overlays.mjs` emit a per-env `api-laravel/public/.htaccess` carrying the auth block (same merge-a-block pattern it already uses for the document root); or restructure so no section ever grants — drop the tree-wide deny and place guarded denies on `app/`, `bootstrap/`, `config/`, `database/`, `routes/`, `storage/`, `tests/`, `vendor/` instead, leaving `public/` to inherit the site's auth normally. The second is more robust against this whole class of merge surprise, but it is a redesign and needs verification against a real staging server. Note it depends on fix 1 to reach a server at all.

## Done when

- `npm run dev` brings up exactly six services and the site answers on `http://localhost:8090`.
- `npm run smoke` reports `8/8 checks passed`.
- `npm run check` passes.
- A PHP edit under `app/` is visible on refresh with no rebuild and no restart.
- `docker compose ps --services` shows no `api`, `api-vendor`, `api-migrate`, `migrate` or `vendor` service, and nothing listens on `:8092`.
- `git status` is clean — no stray `app/sql`, `app/api-laravel` or `app/vendor` stubs showing as untracked.
