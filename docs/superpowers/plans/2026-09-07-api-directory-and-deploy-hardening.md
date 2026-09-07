# `_api/` and deploy hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Laravel tree gets a real Apache authorization boundary instead of
one rewrite rule, is called `_api/` instead of `api-laravel/`, and the
`.htaccess` loses two of its three ways to take the site down.

**Architecture:** Four independent changes, sequenced so each one ends with a
green, usable verification. The deploy tool's protected set moves from
basename-at-any-depth to explicit root-relative paths, which is what finally
lets the two deny/grant `.htaccess` files reach a server. The three legacy 301
rules are deleted. Only then is the directory renamed, in one commit across all
sixteen functional touch points.

**Tech Stack:** Node (`node --test` over `tools/`), Apache `.htaccess`, Docker
Compose, `npm run smoke` against the built artifact on :8090.

**Spec:** `docs/superpowers/specs/2026-09-07-api-directory-and-deploy-hardening-design.md`

---

## Read before starting

The spec, and then the two files that explain why every rule in the
`.htaccess` is shaped the way it is: `config/htaccess/site.htaccess`'s own
comments, and `staging/README.md`'s layout section. Both are long and both are
load-bearing. **Do not "tidy" anything in that template that this plan does
not explicitly change.**

## Global Constraints

- **`[L]`, never `[END]`.** `END` is Apache 2.3.9+; this host's version is
  unresolved and an unknown `RewriteRule` flag is a syntax error — a 500 on
  every request to the whole site. No `<IfModule>` can guard a flag.
- **The SPA fallback stays a catch-all** with its `RewriteCond
  %{ENV:REDIRECT_STATUS} ^$` guard. The guard is what stops the rewrite
  re-matching its own output and looping into a 500 on this FastCGI host.
- **No deploy to any server from inside this plan.** Task 8 is a hand-run
  runbook and is the only thing that touches TEST.
- **Do not open a pull request.** A merge to `main` auto-deploys TEST, so a
  merge is a deploy.

## Verification you will use constantly

```bash
npm run test:js        # node --test over tools/ — the deploy tool's unit tests
npm run build          # rebuild dist/build/ (the artifact :8090 serves)
npm run dev            # regenerate the docker overlay + bring the stack up
npm run smoke          # HTTP checks against the built artifact on :8090
```

**`npm run smoke` is 8/13 before this plan starts.** Five checks fail because
they assert endpoints R1a deleted. Task 1 fixes that first, precisely so smoke
becomes a trustworthy instrument for every later task. Do not skip it and do
not "work around" a red smoke later.

**Never `docker compose up` directly** — `npm run dev` first regenerates
`dist/overlay/docker/.htaccess`, which `docker-compose.yml` bind-mounts. If it
does not exist Docker creates a *directory* in its place and the `web`
container refuses to start.

---

## File structure

**Modified — the deploy tool (Task 2)**

```
tools/deploy/preflight.mjs     PROTECTED -> PROTECTED_PATHS, root-relative
tools/deploy/local.mjs         walkBuild() matches the rel path, not the basename
tools/deploy/sync.mjs          classify() and classifyWithList() likewise
tools/deploy/cli.mjs           the new export name
tools/deploy/preflight.test.mjs   rewritten: the semantics changed
```

**Modified — Apache (Tasks 3 and 4)**

```
api/.htaccess                  version-agnostic deny
api/public/.htaccess           version-agnostic grant
config/htaccess/site.htaccess  delete three RedirectMatch rules; dispatch target
tools/build-overlays.test.mjs  the lookahead assertions go with the rules
```

**Modified — the rename (Task 5)**

```
tools/build.mjs                dist/build/api-laravel -> dist/build/_api
tools/deploy/preflight.mjs     the .env probe path
tools/put-overlay.mjs          the overlay content sanity check
tools/dbmigrate.mjs            diagnostic message text
tools/deploy/cli.mjs           diagnostic message text
docker-compose.yml             three nested bind mounts
docker/web/entrypoint.sh       two artisan calls and one chown
.github/workflows/ci.yml       the artifact assertion
tools/put-overlay.test.mjs     path references
```

**Modified — smoke (Tasks 1, 3 and 5)**

```
tools/smoke-docker.mjs         four dead checks deleted, one repointed,
                               the .env check tightened to 403, and in Task 5
                               the two request paths follow the rename
```

**Modified — documentation (Task 6)**

```
CLAUDE.md  README.md  staging/README.md  .gitignore
api/.env.example  .env.example  api/phpunit.xml
api/tests/Feature/ApiErrorVocabularyTest.php
docker/web/apache-canetons.conf
```

---

## Task 1: Make `npm run smoke` trustworthy again

**Why first.** It is 8/13 today. Five checks assert the domain R1a deleted, so
every later task in this plan would be verified against an already-red
instrument, and a *new* breakage would be invisible in the noise.

Run it and read the failures before changing anything:

```bash
npm run build && npm run dev
npm run smoke
```

Expected: `8/13 checks passed`, with these five failing:

| Check | Why it fails |
| --- | --- |
| `/api/* is not swallowed by the legacy .php redirect` | requests `/api/events`, deleted |
| `/api/* reaches Laravel, and the deny-all did not block it` | requests `/api/user`, which R1a's route table never had |
| `GET /api/events is public and served by Laravel` | deleted |
| `GET /api/signups matches what docker/api/env.docker configures` | deleted; the env key is gone too |
| `GET /api/altcha matches what docker/api/env.docker configures` | deleted; ditto |

**Files:**
- Modify: `tools/smoke-docker.mjs`

- [ ] **Step 1: Repoint the deny-all check at a route that exists**

This is **the most important check in the file for this plan** — it is the only
request whose resolved file sits under the denied tree, so it is what proves
`api/public/.htaccess`'s grant overrides the parent deny. It must not simply be
deleted along with the others.

`/api/me` is the replacement: it is behind `auth:sanctum`, so anonymously it
answers `401 {"error":"Not authenticated","code":"not_authenticated"}`
(verified 2026-09-07). That gives exactly the same three-way proof as the old
`/api/user`.

In `tools/smoke-docker.mjs`, replace the whole
`check('/api/* reaches Laravel, and the deny-all did not block it', …)` block
with:

```js
check('/api/* reaches Laravel, and the deny-all did not block it', async () => {
  // Three things at once. 401 rather than a 404 proves the dispatch rule won
  // against the SPA fallback (it says nothing about [L] specifically —
  // REDIRECT_STATUS is what actually defeats the catch-all on the second pass;
  // see the dispatch block's comment in the template). 401 rather than 403
  // proves api/public/.htaccess's "Require all granted" overrode the parent
  // deny — this is the ONLY request whose resolved file sits under that denied
  // tree. The JSON body distinguishes Laravel from any other 401.
  //
  // /api/me, not the framework's default /api/user: R1a's route table has no
  // /user, so this check asserted a 404 for weeks. Any authenticated route
  // would do; /api/me is the one guaranteed to exist for as long as there is a
  // session at all.
  const res = await request('/api/me', { headers: { Accept: 'application/json' } });
  if (res.status === 403) {
    return `got 403 — api/public/.htaccess is missing "Require all granted" (or the whole tree is 403ing — check the shell result first): ${await detail(res)}`;
  }
  if (res.status === 404) {
    return `got 404 — either the SPA fallback answered (the dispatch block lost to it, or is not first in the merged .htaccess), or Laravel booted with no /api/me route: ${await detail(res)}`;
  }
  if (res.status !== 401) return `expected 401 from Laravel, got ${await detail(res)}`;
  // The error contract, NOT Laravel's native {message: "Unauthenticated."}:
  // App\Exceptions\ApiError deliberately replaces that shape so that
  // web/src/i18n/'s translateApiError() has a stable machine token to map onto
  // French. Asserting `code` here is what pins that replacement in place end to
  // end, through the real HTTP stack.
  const body = await res.json().catch(() => ({}));
  return body.code === 'not_authenticated'
    ? null
    : `expected the {error, code} contract with code "not_authenticated", got ${JSON.stringify(body)}`;
});
```

- [ ] **Step 2: Delete the four checks whose subjects no longer exist**

Delete these blocks entirely from `tools/smoke-docker.mjs`:

1. `check('/api/* is not swallowed by the legacy .php redirect', …)` — it
   requests `/api/events`, **and** Task 4 deletes the rule it guards. Nothing
   is lost by removing it: with no `.php` RedirectMatch there is no lookahead
   to get wrong, so the regression it watched for becomes structurally
   impossible rather than merely untested. Say so in the commit message.
2. `check('GET /api/events is public and served by Laravel', …)`
3. `check('GET /api/signups matches what docker/api/env.docker configures', …)`
4. `check('GET /api/altcha matches what docker/api/env.docker configures', …)`

Delete any helper left with no callers after those four go — in particular the
`dockerApiEnv()` reader, if `SOUPER_SIGNUP_ENABLED` was its only consumer.
Check with:

```bash
grep -n "dockerApiEnv" tools/smoke-docker.mjs
```

If it still has callers, leave it. If not, delete it and its import.

- [ ] **Step 3: Update the file's header comment**

The header lists what the file asserts. Replace the paragraph beginning
"Known blind spot:" — keep it — but fix the surrounding claim so it no longer
promises checks that are gone. Add, after the existing "See docs/..." line:

```js
// Trimmed 2026-09-07: four checks asserted the events/signups/altcha domain
// that R1a deleted, and the deny-all check requested the framework's default
// /api/user, which this app's route table has never had. The file was 8/13 for
// that whole period, which is worse than having no smoke test — a real
// breakage would have arrived as one more red line among five.
```

- [ ] **Step 4: Run it**

```bash
npm run smoke
```

Expected: **`9/9 checks passed`**. If any check still fails, do not proceed —
this task exists to make the instrument trustworthy.

- [ ] **Step 5: Commit**

```bash
git add tools/smoke-docker.mjs
git commit -m "test(smoke): stop asserting the domain R1a deleted

npm run smoke was 8/13. Four checks tested events/signups/altcha endpoints that
no longer exist, and the deny-all check requested the framework's default
/api/user, which this app's route table has never had — so it reported 404 and
proved nothing about the authorization boundary it exists for. Repointed at
/api/me, which answers 401 with the error contract.

A file that is permanently 8/13 is worse than no smoke test: a real breakage
arrives as one more red line among five."
```

---

## Task 2: A path-based protected set

**Why this is the highest-risk change in the plan.** The protected set is what
stops a `--relist` or bootstrap deploy deleting a server-owned file. Get it
subtly wrong and the next authoritative deploy removes a server's `.htaccess`,
`.htpasswd` or `.env` — the last of which holds `APP_KEY` and the DB
credentials and exists nowhere else.

It is also entirely pure logic with no I/O, so it is fully unit-testable before
anything touches a server.

**The one design decision:** the export is **renamed** from `PROTECTED` to
`PROTECTED_PATHS`. That is deliberate — a call site this plan forgets to
migrate then throws `PROTECTED is not defined` immediately, instead of
silently keeping basename semantics against a set of paths (which would match
nothing, and quietly make every server-owned file deletable).

**Files:**
- Modify: `tools/deploy/preflight.mjs`, `tools/deploy/local.mjs`,
  `tools/deploy/sync.mjs`, `tools/deploy/cli.mjs`
- Modify: `tools/deploy/preflight.test.mjs`

- [ ] **Step 1: Write the failing tests**

Replace the three `PROTECTED` tests at the top of
`tools/deploy/preflight.test.mjs` with these. Keep every other test in the file
untouched.

```js
test('PROTECTED_PATHS: the server-owned files, as ROOT-RELATIVE paths', () => {
  // Paths, not basenames. The basename form protected `.htaccess` at any
  // depth, which silently dropped api/.htaccess and api/public/.htaccess from
  // every upload for the whole life of the project — the two files that were
  // written to be the authorization boundary around the Laravel tree.
  for (const rel of [
    '.htaccess',
    'robots.txt',
    'config.php',
    '.htpasswd',
    'api-laravel/.env',
    '.sync-state.json',
  ]) {
    assert.ok(PROTECTED_PATHS.has(rel), `${rel} must be protected`);
  }
});

test('PROTECTED_PATHS: a bare .env is NOT protected — only the one in the API tree', () => {
  // There is no .env at the document root. Protecting the bare basename is
  // what caused the nested-file bug; asserting its absence is what stops a
  // future edit reintroducing it "for safety".
  assert.ok(!PROTECTED_PATHS.has('.env'));
});

test('PROTECTED_PATHS: the nested access files are NOT protected, so they deploy', () => {
  // The entire point of this change.
  assert.ok(!PROTECTED_PATHS.has('api-laravel/.htaccess'));
  assert.ok(!PROTECTED_PATHS.has('api-laravel/public/.htaccess'));
});

test('walkBuild: uploads a nested .htaccess and skips a protected root path', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'lc-walk-'));
  mkdirSync(path.join(root, 'api-laravel', 'public'), { recursive: true });
  writeFileSync(path.join(root, '.htaccess'), 'root — server-owned');
  writeFileSync(path.join(root, 'index.html'), 'shell');
  writeFileSync(path.join(root, 'api-laravel', '.htaccess'), 'deny all');
  writeFileSync(path.join(root, 'api-laravel', 'public', '.htaccess'), 'grant');

  const rels = walkBuild(root, PROTECTED_PATHS).map((f) => f.rel);

  assert.ok(!rels.includes('.htaccess'), 'the root .htaccess is server-owned');
  assert.deepEqual(rels.sort(), [
    'api-laravel/.htaccess',
    'api-laravel/public/.htaccess',
    'index.html',
  ]);

  rmSync(root, { recursive: true, force: true });
});

test('PROTECTED_PATHS: a --relist/bootstrap deploy never marks the API .env stale', () => {
  // api-laravel/.env is Laravel's server-owned configuration (APP_KEY, DB
  // credentials, MIGRATE_TOKEN) and exists nowhere else. On an authoritative
  // run, deletion is grounded in the real remote tree, so an unprotected .env
  // would be classified stale and deleted.
  const local = new Map([['index.php', { size: 1, hash: 'a' }]]);
  const remoteSizes = new Map([
    ['index.php', 1],
    ['api-laravel/.env', 900],
    ['api-laravel/.env.example', 900],
    ['api-laravel/storage/logs/laravel.log', 10],
  ]);

  const { stale } = classifyWithList(
    local,
    remoteSizes,
    { 'index.php': { size: 1, hash: 'a' } },
    PROTECTED_PATHS,
  );

  assert.ok(!stale.includes('api-laravel/.env'), 'api-laravel/.env must never be deleted');
  // .env.example is NOT protected and does not travel in this fixture's local
  // set, so it is correctly stale here.
  assert.deepEqual(stale, [
    'api-laravel/.env.example',
    'api-laravel/storage/logs/laravel.log',
  ]);
});

test('PROTECTED_PATHS: the fast-path diff also spares the API .env', () => {
  const { stale } = classify(
    new Map([['index.php', { size: 1, hash: 'a' }]]),
    { 'index.php': { size: 1, hash: 'a' }, 'api-laravel/.env': { size: 900, hash: 'b' } },
    PROTECTED_PATHS,
  );

  assert.deepEqual(stale, []);
});

test('PROTECTED_PATHS: a same-named file at a different path is still deletable', () => {
  // The inverse of the bug. `storage/robots.txt` is not the server-owned
  // /robots.txt, and a basename match would have spared it forever.
  const { stale } = classify(
    new Map(),
    { 'robots.txt': { size: 1, hash: 'a' }, 'storage/robots.txt': { size: 1, hash: 'a' } },
    PROTECTED_PATHS,
  );

  assert.deepEqual(stale, ['storage/robots.txt']);
});
```

Add the imports the new tests need at the top of the file:

```js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { walkBuild } from './local.mjs';
```

and change the existing import of `PROTECTED` to `PROTECTED_PATHS`.

> The fixtures deliberately still say `api-laravel/`. Task 5 renames them.
> Keeping this task on the current layout means a failure here is about the
> protected-set logic and nothing else.

- [ ] **Step 2: Run them to verify they fail**

```bash
npm run test:js
```

Expected: FAIL. `PROTECTED_PATHS` is not exported, so the import is
`undefined` and every new test throws
`TypeError: Cannot read properties of undefined (reading 'has')`.

- [ ] **Step 3: Rewrite the set**

In `tools/deploy/preflight.mjs`, replace the `PROTECTED` export and its comment
block with:

```js
// Files that live on the server and must never be uploaded or deleted (plus
// the state file, which this tool owns and writes separately).
//
// ROOT-RELATIVE PATHS, matched exactly — NOT basenames at any depth, which is
// what this used to be. The basename form silently dropped api/.htaccess and
// api/public/.htaccess from every upload for the whole life of the project:
// tools/build.mjs copies both into the artifact, and they are the deny/grant
// pair that is supposed to be the authorization boundary around the Laravel
// tree, so the effect was that a server had exactly ONE thing between the
// internet and Laravel's .env — the SPA fallback's catch-all rewrite.
//
// Written without a leading slash so each entry compares === to the posix
// `rel` paths walkBuild() and the state file both use.
//
// The export was renamed along with the semantics, on purpose: a call site
// still passing this to something that does a basename match now throws
// instead of quietly matching nothing and making every server-owned file
// deletable.
export const PROTECTED_PATHS = new Set([
  // Server-owned: the site rules plus each staging environment's auth block.
  '.htaccess',
  // Server-owned: Disallow on test/qa, the real one (or none) on prod.
  'robots.txt',
  // Server-owned credentials for the staging Basic Auth. NO tool uploads this
  // — see tools/put-overlay.mjs, which refuses on purpose, because
  // re-uploading credentials during a cutover window is a way to lock yourself
  // out. It also lives INSIDE the document root on this host, so deleting it
  // leaves an .htaccess whose AuthUserFile points at nothing and Apache
  // answers 500 to every request.
  '.htpasswd',
  // Dead — it configured the front end deleted in the SPA cutover — but every
  // server still HAS it, and this set is what stops a bootstrap or --relist
  // deploy deleting files it did not put there. It holds live DB credentials
  // until removed by hand, once per server, after which this entry can go.
  'config.php',
  // Laravel's server-owned configuration: APP_KEY, DB credentials,
  // MIGRATE_TOKEN. Hand-placed, git-ignored, stripped from the artifact by
  // tools/build.mjs, and it exists NOWHERE ELSE — so without this entry a
  // --relist or bootstrap deploy classifies it as stale and deletes the API's
  // entire configuration.
  'api-laravel/.env',
  STATE_FILE,
]);
```

- [ ] **Step 4: Match on the path in `walkBuild`**

In `tools/deploy/local.mjs`, replace `walkBuild`:

```js
// Walk the build tree: [{rel, size}] with posix rel paths, sorted, excluding
// PROTECTED_PATHS (server-owned files must never even be candidates).
//
// The rel path is computed BEFORE the exclusion test, not after, because the
// test is now on the path rather than the basename — which is what lets a
// nested api-laravel/.htaccess upload while the root .htaccess stays
// server-owned.
export function walkBuild(root, protectedPaths) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        walk(full);
      } else if (!protectedPaths.has(rel)) {
        out.push({ rel, size: statSync(full).size });
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}
```

- [ ] **Step 5: Match on the path in both diffs**

In `tools/deploy/sync.mjs`, update the doc comment on `classify` and the two
`stale` filters.

In `classify`'s comment, replace the final clause:

```js
// FAST-PATH diff (no remote LIST): classify local files against the remote
// state file alone. `localEntries` is Map<rel, {size, hash}>; `remoteFiles` is
// the state file's `files` object (or null on bootstrap); `protectedPaths`
// holds ROOT-RELATIVE PATHS that are never uploaded or deleted.
```

and in both `classify` and `classifyWithList`, change the filter from

```js
    .filter((rel) => !localSet.has(rel) && !protectedSet.has(path.posix.basename(rel)))
```

to

```js
    .filter((rel) => !localSet.has(rel) && !protectedPaths.has(rel))
```

renaming each function's `protectedSet` parameter to `protectedPaths` so the
signature says which it is.

> `path` is still imported and used by `groupByDir` and
> `emptyDirsAfterDelete`, so leave the import alone.

- [ ] **Step 6: Update the caller**

In `tools/deploy/cli.mjs`, change the import and all three uses:

```js
import { PROTECTED_PATHS, TARGETS, checkTargetDir, checkEnvShape } from './preflight.mjs';
```

```js
    const files = walkBuild(LOCAL_ROOT, PROTECTED_PATHS);
```

```js
      ? classifyWithList(localEntries, remoteSizes, remoteState?.files, PROTECTED_PATHS)
      : classify(localEntries, remoteState.files, PROTECTED_PATHS);
```

Then prove nothing was missed:

```bash
grep -rn "PROTECTED\b" tools/ | grep -v PROTECTED_PATHS
```

Expected: no output.

- [ ] **Step 7: Run the tests**

```bash
npm run test:js
```

Expected: PASS, all files.

- [ ] **Step 8: Mutation-test the change**

The whole task is a safety mechanism, so prove the tests can see it break.

1. In `tools/deploy/local.mjs`, revert the exclusion to
   `!protectedPaths.has(entry.name)`. Re-run. **Expect** `walkBuild: uploads a
   nested .htaccess and skips a protected root path` to FAIL — the nested files
   vanish from the upload set, which is exactly the shipped bug.
2. Restore it, and remove `'api-laravel/.env'` from `PROTECTED_PATHS`. Re-run.
   **Expect** both the `--relist` and the fast-path tests to FAIL.
3. Restore. Re-run: green.

Record what failed in the commit message.

- [ ] **Step 9: Commit**

```bash
git add tools/deploy/preflight.mjs tools/deploy/local.mjs tools/deploy/sync.mjs \
        tools/deploy/cli.mjs tools/deploy/preflight.test.mjs
git commit -m "fix(deploy): protect server files by path, not by basename anywhere

The protected set matched the basename .htaccess at ANY depth, so
api/.htaccess and api/public/.htaccess — built into every artifact by
tools/build.mjs, and written to be the authorization boundary around the
Laravel tree — were silently dropped from every upload for the whole life of
the project. The effect on all three servers was exactly one thing between the
internet and Laravel's .env: the SPA fallback's catch-all rewrite, which is
application routing rather than Apache authorization.

Matching root-relative paths fixes that and also fixes the inverse: a
storage/robots.txt is no longer spared because it shares a name with the
server-owned one.

The export is renamed PROTECTED -> PROTECTED_PATHS deliberately, so any call
site still doing a basename match throws instead of quietly matching nothing
and making every server-owned file deletable.

Mutation-tested: reverting walkBuild's check to the basename form fails the
nested-upload test, and dropping the .env entry fails both diff tests."
```

---

## Task 3: Deny and grant, on an Apache of unknown version

**Why it matters.** `Require all denied` is Apache 2.4-only. This host's
version is unresolved — `staging/README.md` records that it 500s on
`<RequireAny>`, which leans 2.2 — and a directive the server does not
understand 500s every request in that directory. Since Task 2 has just made
these files actually ship, an unguarded 2.4-ism would take the whole API down
on the next deploy.

**Files:**
- Modify: `api/.htaccess`, `api/public/.htaccess`
- Modify: `tools/smoke-docker.mjs`

- [ ] **Step 1: Rewrite the deny**

Replace the whole of `api/.htaccess`:

```apache
# Deny the entire Laravel tree to the web.
#
# WHY THIS FILE EXISTS. The FTP account is chrooted to the document root and
# this host will not let the document root be pointed at a subdirectory, so
# unlike a normal Laravel deployment — where everything but public/ sits above
# the docroot — .env, vendor/, app/ and storage/ are all physically
# web-accessible here. This is the boundary that makes them unreachable
# anyway, and api/public/.htaccess re-grants the one directory that is meant to
# be reached.
#
# It is STRONGER than the SPA fallback that used to be the only layer: Apache
# evaluates authorization during its directory walk, BEFORE mod_rewrite's
# per-directory rules run in the fixup phase. So a request for /_api/.env is
# refused with a real 403 and the rewrite never sees it. (The URL is
# /api-laravel/.env until Task 5 renames the directory to _api/.)
#
# WRITTEN TWICE, and both halves are load-bearing. `Require all denied` is
# Apache 2.4+; `Order`/`Deny` is 2.2 and deprecated in 2.4. This host's version
# is UNRESOLVED — staging/README.md records that it 500s on <RequireAny>, which
# leans 2.2 — and a directive the server does not understand 500s every request
# in this directory, which is every /api/* call. mod_authz_core exists only in
# 2.4, so its presence is the discriminator, and <IfModule> is evaluated at
# config-parse time so the wrong half is never seen.
#
# Do not collapse this to one block "because the host is obviously 2.4". The
# host is not obviously anything, which is also why the dispatch rules use [L]
# rather than [END].
<IfModule mod_authz_core.c>
  Require all denied
</IfModule>
<IfModule !mod_authz_core.c>
  Order allow,deny
  Deny from all
</IfModule>
```

- [ ] **Step 2: Rewrite the grant**

Replace the whole of `api/public/.htaccess`:

```apache
# Re-grant the one directory in the Laravel tree that is meant to be reachable.
#
# The parent api/.htaccess denies everything. Apache evaluates authorization
# against the resolved file's parent directories, and with AuthMerging at its
# default of Off the innermost Require REPLACES the inherited one rather than
# adding to it — so this grant wins for anything resolved under public/, and
# only for that.
#
# The dispatch in config/htaccess/site.htaccess rewrites /api/* to
# api-laravel/public/index.php (_api/public/index.php after Task 5), so the
# request that has to survive both files is
# exactly this one. npm run smoke asserts it: a 403 on /api/me means this file
# is missing or not being read.
#
# Written twice for the same reason as the parent — see its comment. Both
# halves must stay.
<IfModule mod_authz_core.c>
  Require all granted
</IfModule>
<IfModule !mod_authz_core.c>
  Order allow,deny
  Allow from all
</IfModule>
```

> **Laravel's own rewrite rules are deliberately NOT in this file.** Requests
> never arrive at `public/.htaccess` for routing — the site `.htaccess`
> dispatches straight to `public/index.php`. Adding Laravel's stock
> `RewriteRule` block here would be dead configuration at best and a second
> rewrite pass at worst.

- [ ] **Step 3: Tighten the smoke check now that the file will ship**

The `.env` check is currently loose on purpose, and its comment says why: on a
real server it would answer 404 rather than 403, because the deny file was
never uploaded. **Task 2 removed that reason.** Tighten it.

In `tools/smoke-docker.mjs`, replace the whole
`check("Laravel's .env is not readable over the web", …)` block:

```js
check("Laravel's .env is not readable over the web", async () => {
  // The single highest-value check in this file: the API's .env holds the DB
  // password, APP_KEY and MIGRATE_TOKEN, and it is a hand-placed server-owned
  // file, so nothing in the build or deploy pipeline would notice it being
  // exposed.
  //
  // 403 EXACTLY, not merely "not 200". This used to be loose because the
  // deny-all was never uploaded to a server — tools/deploy/preflight.mjs
  // protected the basename .htaccess at any depth and silently dropped it — so
  // a server answered 404 (the SPA catch-all) while the local stack answered
  // 403 (the mounted deny-all). That is fixed: PROTECTED_PATHS is
  // root-relative now and the file ships. So both layouts must give the same
  // answer, and asserting the loose form would hide the deny-all silently
  // failing to load — which is precisely the AllowOverride risk this file
  // exists to catch.
  // ORDER MATTERS, and an earlier draft of this check got it wrong: it
  // returned on `status === 200` BEFORE reading the body, which made the
  // APP_KEY leak test unreachable for the only status where it could ever
  // matter. Read the body first, then discriminate.
  //
  // A 200 here does NOT mean the file was served. The site .htaccess's
  // fallback is a deliberate catch-all that answers 200 with the SPA shell for
  // any unknown path — so a missing deny-all shows up as the shell, not as a
  // 404. (The comment this replaced claimed a server would 404. It never did.)
  // Distinguishing the two matters at 23:00: "the .env is exposed" and "the
  // boundary is missing but nothing leaked" call for very different panic.
  const res = await request('/api-laravel/.env');
  const body = await res.text();

  if (body.includes('APP_KEY') || body.includes('DB_PASSWORD')) {
    return `the response body leaked .env contents (status ${res.status})`;
  }
  if (res.status === 403) return null;
  if (res.status === 200) {
    return 'got 200 serving the SPA shell — the deny-all did not answer, so the only ' +
      'thing protecting the Laravel tree is the catch-all rewrite. api/.htaccess is ' +
      'either not being read (AllowOverride?) or did not deploy';
  }
  return `expected 403 from the deny-all, got ${res.status}`;
});
```

- [ ] **Step 4: Rebuild, restart and run smoke**

The two files travel in the artifact, and the `web` container serves
`dist/build/` — so a rebuild is required for the change to be visible.

```bash
npm run build
npm run dev
npm run smoke
```

Expected: **`9/9`**, with the `.env` check now passing on the strict 403.

If it reports the SPA shell instead, the local Apache is not reading
`api/.htaccess` — check `AllowOverride` in `docker/web/apache-canetons.conf`
before changing anything in this task.

- [ ] **Step 5: Mutation-test both halves**

```
1. Delete the <IfModule !mod_authz_core.c> block from api/.htaccess.
   npm run build && npm run smoke
   EXPECT: still 9/9 — the local Apache is 2.4, so only the first half is read.
   THIS IS THE POINT: the 2.2 half is UNTESTABLE locally, which is why it is
   written from the documentation rather than from a passing test. Restore it.

2. Delete api/public/.htaccess entirely.
   npm run build && npm run smoke
   EXPECT 5/9 (measured). FOUR checks fail, not one: /api/me, /sanctum/*, the
   migrate route and POST /api/contact all answer 403, because the grant is
   what keeps the WHOLE dispatch alive — every request Laravel serves resolves
   under public/. Restore it.

3. Delete api/.htaccess entirely.
   npm run build && npm run smoke
   EXPECT 7/9 (measured): the .env and vendor/ checks fail, both reporting a
   200 that serves the SPA SHELL — not the file, and not a 404. Confirm with
   curl that the body is the shell and carries no APP_KEY. Restore it.
```

Record all three outcomes in the commit message, including the honest one:
step 1 cannot be verified here.

- [ ] **Step 6: Commit**

```bash
git add api/.htaccess api/public/.htaccess tools/smoke-docker.mjs
git commit -m "fix(api): a deny/grant pair that works on an Apache of unknown version

Now that PROTECTED_PATHS lets these two files actually deploy, they have to
survive whatever Apache this host runs. Require all denied is 2.4-only and an
unrecognised directive 500s every request in the directory — which here is
every /api/* call. mod_authz_core's presence discriminates, and <IfModule> is
resolved at config-parse time so the wrong half is never seen.

The smoke check on the .env is tightened from 'not 200' to exactly 403. It was
loose because a server answered 404 (the SPA catch-all) while the local stack
answered 403 (the mounted deny-all); with the file shipping, both must agree,
and the loose form would have hidden the deny-all failing to load at all.

Mutation-tested: removing public/.htaccess makes /api/me 403, and removing the
deny makes the .env check report the catch-all. Removing the 2.2 half changes
nothing locally — that half is untestable here and is written from the
documentation, which is why it carries a comment saying so."
```

---

## Task 4: Delete the three legacy 301s

**Why they can go.** They map `/x.php` and `/x.html` to `/x` — French routes
the rebuild removes, because D10 makes every URL English and D11 owes no
backwards compatibility. So `/historique.php` would 301 to `/historique` and
get the SPA's 404 view: one extra hop to the same place. Meanwhile they carry
**both** of the template's negative-lookahead landmines, each of which has
already broken something:

- the `.php` rule's `(?!.*api-laravel/)` — with the `.*` missing, every
  `/api/*` request 301s and the whole API is down while every page still
  renders. Only reproducible on the real host, whose FastCGI wrapper prefixes
  `/cgi-bin/php5.fcgi/` onto the re-entered path.
- the `.html` rule's `(?!index\.html$)` — without it the fallback's own output
  is 301'd and every URL of the site redirect-loops.

**Files:**
- Modify: `config/htaccess/site.htaccess`
- Modify: `tools/build-overlays.test.mjs`

- [ ] **Step 1: Delete the rules and their commentary**

In `config/htaccess/site.htaccess`, delete everything from the comment block
beginning `# Legacy URL 301s.` through the last of the three lines:

```apache
RedirectMatch 301 ^/(?:index\.php|accueil\.(?:php|html))$ /
RedirectMatch 301 ^/(?!index\.html$)(.*)\.html$ /$1
RedirectMatch 301 ^/(?!.*api-laravel/)(.*)\.php$ /$1
```

In their place, leave a short record — the reasoning is worth keeping even
though the rules are not:

```apache
# ---------------------------------------------------------------------------
# There are deliberately NO legacy URL redirects here.
#
# Three RedirectMatch 301 rules lived at this point until 2026-09-07, mapping
# the pre-SPA site's /x.php and /x.html URLs onto today's clean ones. They were
# removed because their targets no longer exist: the rebuild makes every URL
# English (design D10) and owes no backwards compatibility (D11), so
# /historique.php would have 301'd to /historique and then answered the SPA's
# own 404 view — one extra hop to the same place.
#
# They also carried both of this file's negative-lookahead landmines, and each
# had already broken something: the .php rule's `(?!.*api-laravel/)` (with the
# `.*` missing, EVERY /api/* request 301s and the whole API is down while every
# page still renders — only reproducible on the real host, whose FastCGI
# wrapper prefixes /cgi-bin/php5.fcgi/ onto the re-entered path) and the .html
# rule's `(?!index\.html$)` (without it the fallback's own output is 301'd and
# every URL redirect-loops).
#
# If a redirect is ever needed again, note what made these dangerous: a
# RedirectMatch is mod_alias, which runs on the re-entered pass after
# mod_rewrite's substitution, so it sees INTERNAL paths — including whatever
# prefix this host's PHP wrapper adds. Anchor on the full path, exclude the
# dispatch target with a `.*`-prefixed lookahead, and add a case to
# tools/build-overlays.test.mjs asserting the fcgi-prefixed form.
# ---------------------------------------------------------------------------
```

- [ ] **Step 2: Delete the assertions that test the deleted rules**

Find them:

```bash
grep -n "RedirectMatch\|301\|fcgi\|lookahead" tools/build-overlays.test.mjs
```

Delete every test that asserts the `.php` or `.html` RedirectMatch behaviour,
including the FastCGI-prefix case. **Keep** every test about the dispatch
rules, the fallback, the `REDIRECT_STATUS` guard and the overlay merge order.

Add one test in their place, so the removal itself is pinned:

```js
test('the site rules carry no legacy RedirectMatch', () => {
  // Deleted 2026-09-07 with their targets (design D10/D11). They carried both
  // of the template's negative-lookahead landmines, so a re-added rule needs
  // its own assertions — see the note left in site.htaccess.
  const template = readFileSync('config/htaccess/site.htaccess', 'utf8');

  assert.ok(
    !/^\s*RedirectMatch/m.test(template),
    'a RedirectMatch was re-added without the fcgi-prefix assertions that made the old ones safe',
  );
});
```

> Use whatever `readFileSync`/assert imports the file already has rather than
> adding duplicates.

- [ ] **Step 3: Run the tool tests**

```bash
npm run test:js
```

Expected: PASS.

- [ ] **Step 4: Rebuild the overlay, restart, run smoke**

```bash
npm run build
npm run dev
npm run smoke
```

Expected: **`9/9`**. Note that Task 1 already deleted the check that asserted
the `.php` rule's behaviour, so nothing here should move.

- [ ] **Step 5: Verify by hand that a legacy URL now 404s rather than looping**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:8090/historique.php
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:8090/index.php
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:8090/accueil.html
```

Expected: `200` with an empty redirect URL for all three — the SPA shell,
which renders its own 404 view. **A `301` means a rule survived; a `500` means
something loops.**

- [ ] **Step 6: Commit**

```bash
git add config/htaccess/site.htaccess tools/build-overlays.test.mjs
git commit -m "refactor(htaccess): delete the legacy 301s and both their landmines

They mapped the pre-SPA site's /x.php and /x.html onto clean URLs that the
rebuild removes (D10 makes every URL English, D11 owes no compatibility), so
/historique.php 301'd to /historique and then answered the SPA's 404 view —
one hop to the same place.

They also carried both negative-lookahead landmines: the .php rule's missing
`.*` had taken the entire API down with 301s while every page still rendered,
reproducible only on the real host because of its FastCGI path prefix, and the
.html rule's exclusion was the only thing stopping the fallback 301'ing its own
output into a loop on every URL.

That takes this file from three load-bearing subtleties to one ([L], not
[END]). The reasoning stays as a comment, because a future redirect needs it."
```

---

## Task 5: The rename

**Do this in ONE commit.** The local stack is broken between the build output
moving and the container mounts following it, so a partial rename is a stack
that will not start.

`^api(/|$)` matches only a path that is exactly `api` or begins `api/`. Every
other name is loop-safe, including `_api`, which begins with an underscore.
The current comments in `tools/build.mjs` and `config/htaccess/site.htaccess`
claim the hyphen specifically is what saves it; that is true but narrower than
the real rule, and both comments are corrected here.

**Files:** the sixteen functional touch points, enumerated by
`grep -rl api-laravel`.

- [ ] **Step 1: Confirm the full list before editing anything**

```bash
grep -rln "api-laravel" --exclude-dir=dist --exclude-dir=node_modules \
  --exclude-dir=vendor --exclude-dir=.git . | grep -v "^./docs/" | sort
```

Expected: 29 files, of which `api/storage/framework/views/*` (compiled Blade)
and `api/storage/logs/laravel.log` are untracked artifacts to ignore. Work
through the rest. **Do not run a blind `sed -i` over all of them** — several
are prose comments where the sentence needs rewriting, not the token swapping.

- [ ] **Step 2: The build output**

In `tools/build.mjs`, replace the comment block above `laravelBuild` and the
constant itself:

```js
// The Laravel project's directory name inside the artifact.
//
// config/htaccess/site.htaccess dispatches /api/* with `RewriteRule ^api(/|$)
// _api/public/index.php [L]`. In per-directory context that substitution
// re-enters the whole ruleset, so the rule must not match its own output.
//
// `^api(/|$)` matches a path that is EXACTLY `api` or that begins `api/`, so
// every other name is safe — including this one, which begins with an
// underscore. (The previous name, api-laravel, was safe for the same reason,
// though the comment here used to credit the hyphen specifically, which is
// true but narrower than the actual rule.) Rename this to dist/build/api/ and
// the rule matches itself on every pass: Apache aborts at "Request exceeded
// the limit of 10 internal redirects" and every /api/* call 500s.
//
// So if this ever has to be renamed to something `^api(/|$)` CAN match, first
// add a `RewriteCond %{ENV:REDIRECT_STATUS} ^$` guard to BOTH dispatch rules,
// the way the SPA fallback below them already carries one.
//
// The leading underscore is also the point: it reads as "not a public
// resource" in an FTP listing, and it names no framework, so it does not have
// to change if the stack ever does.
const laravelBuild = 'dist/build/_api';
```

Then update the file's header comment (line 3) and the two `console.log` lines
that name the directory.

- [ ] **Step 3: The dispatch**

In `config/htaccess/site.htaccess`, change both dispatch rules:

```apache
RewriteRule ^api(/|$) _api/public/index.php [L]
RewriteRule ^sanctum(/|$) _api/public/index.php [L]
```

and update every mention of `api-laravel` in that file's comments. **THREE
comments need their reasoning corrected, not just the token swapped, because
Tasks 2 and 3 made them false.** Read each in full before editing:

- **The dispatch block's** "the hyphen defeats `(/|$)`" becomes: `^api(/|$)`
  matches only exactly `api` or a path beginning `api/`, so `_api/...` cannot
  match — and neither could any name but `api` itself. Its final sentence
  ("Never rename that directory without first adding a REDIRECT_STATUS guard")
  should say the guard is needed only for a name `^api(/|$)` can actually
  match, i.e. literally `api`.
- **The header-forwarding block** currently says Laravel ships the same rules
  in `api/public/.htaccess` "but that file never reaches a server (the deploy
  CLI treats .htaccess as a protected basename at any depth)". **Both halves
  are now wrong.** Task 2 made the protected set path-based so the file does
  reach a server, and Task 3 deleted Laravel's stock rewrite block from it
  entirely. Rewrite it to say what is true: these rules live here because a
  dispatched request never runs `public/`'s own per-directory rules, and
  `_api/public/.htaccess` deliberately contains only an authorization grant.
- **The fallback block's** paragraph claiming `api-laravel/*` "is never
  reachable as raw files … even though the deny-all in api/.htaccess never gets
  uploaded to a server" must now say the opposite: `_api/.htaccess` ships and is
  the PRIMARY protection (Apache authorization, evaluated during the directory
  walk before mod_rewrite's fixup phase), the catch-all is a useful second
  layer and is still what makes an unknown URL answer 200 with the SPA's own
  404 view. Its numbered property 2 should keep saying the catch-all must not
  become an `!-f`/`!-d` guard, but no longer as the sole reason the Laravel
  tree is safe.

- [ ] **Step 4: The deploy tool's two functional paths**

In `tools/deploy/preflight.mjs`:

```js
      await client.downloadTo(tmpEnv, `${remoteRoot}/_api/.env`);
```

and update `PROTECTED_PATHS`' entry and its comment:

```js
  '_api/.env',
```

and the `checkEnvShape` doc comment's opening line:

```js
// Fetch the target's _api/.env and compare its key set against
```

In `tools/put-overlay.mjs`, the overlay sanity check:

```js
  return text.includes('_api/public/index.php') && text.includes('index.html');
```

and the diagnostic string near line 289 that names the same path.

- [ ] **Step 5: The diagnostic message text**

`tools/deploy/cli.mjs` (four strings) and `tools/dbmigrate.mjs` (two strings)
mention `api-laravel/.env` and the dispatch in operator-facing messages.
Update the text. Nothing functional depends on them, and a stale path in an
error message is how the next person edits the wrong file at 23:00.

- [ ] **Step 6: The container**

In `docker-compose.yml`, the three nested mounts:

```yaml
      - ./api:/var/www/html/_api
      - ./docker/api/env.docker:/var/www/html/_api/.env:ro
      - api_vendor:/var/www/html/_api/vendor
```

and the comment block above them (currently explaining the hyphen) rewritten
to match Step 2's reasoning.

In `docker/web/entrypoint.sh`, all three commands:

```sh
retry php _api/artisan migrate --force
```

```sh
retry php _api/artisan db:seed --force
```

```sh
chown -R www-data:www-data _api/storage _api/bootstrap/cache
```

- [ ] **Step 7: CI**

In `.github/workflows/ci.yml`, the artifact assertion and its comment:

```yaml
      # The deployed document root is exactly the SPA shell plus _api/.
      # Asserting both catches the build-order bug tools/build.mjs warns about:
      # if Vite ran after the Laravel copy it would empty the outDir and
      # _api/ would be missing here.
      - name: Verify dist/build/ was produced
        run: test -f dist/build/index.html && test -d dist/build/_api/vendor
```

**This one goes red on the first push if it is missed**, which makes it the
cheapest of the sixteen to get wrong.

- [ ] **Step 8: The two request paths inside smoke**

`tools/smoke-docker.mjs` asks for the Laravel tree by URL, so its paths are
functional, not cosmetic. Task 3 tightened the first of these to assert exactly
403 — leave it asking for the old path and it will request something that no
longer exists, get the SPA shell, and fail.

```js
  const res = await request('/_api/.env');
```

```js
  const res = await request('/_api/vendor/autoload.php');
```

Also update the surrounding comments in both checks, which name
`api-laravel/.env` in prose.

- [ ] **Step 9: The tests that carry the old path in fixtures**

`tools/deploy/preflight.test.mjs` — the fixtures Task 2 deliberately left on
the old name, plus the `'_api/.env'` assertion.

`tools/put-overlay.test.mjs` — path references.

Then:

```bash
npm run test:js
```

Expected: PASS.

- [ ] **Step 10: Prove nothing functional was missed**

```bash
grep -rn "api-laravel" --exclude-dir=dist --exclude-dir=node_modules \
  --exclude-dir=vendor --exclude-dir=.git --exclude-dir=docs . \
  | grep -v "^./api/storage/"
```

Every remaining hit must be in `CLAUDE.md`, `README.md`, `staging/README.md`,
`.gitignore`, `api/.env.example`, `.env.example`, `api/phpunit.xml`,
`api/tests/Feature/ApiErrorVocabularyTest.php` or
`docker/web/apache-canetons.conf` — all documentation, all handled in Task 6.
Anything else is a functional file this task skipped.

- [ ] **Step 11: Rebuild from scratch and bring the stack up**

The container mount paths changed, so the containers must be **recreated**, not
restarted.

```bash
npm run dev:down
npm run build
test -d dist/build/_api/vendor && echo "artifact OK"
npm run dev
```

Wait for the stack, then:

```bash
npm run smoke
```

Expected: **`9/9`**. A 404 on the Laravel checks means the dispatch and the
build output disagree about the name; a 500 means the entrypoint could not find
`_api/artisan`, so check `docker compose logs web`.

- [ ] **Step 12: Confirm the boundary still holds under the new name**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8090/_api/.env
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8090/_api/vendor/autoload.php
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8090/api-laravel/.env
```

Expected: `403`, `403`, and `200` for the third — the old path no longer
exists, so it falls through to the SPA shell. That third result is the one
worth pausing on: it is the catch-all doing its job, and it is exactly what a
server looked like for `.env` before this plan.

- [ ] **Step 13: Run the Laravel suite**

The container's working directory changed, so the documented test command
changes with it.

```bash
docker compose exec -w /var/www/html/_api web php artisan test
```

Expected: PASS. In Git Bash prefix with `MSYS_NO_PATHCONV=1`.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "refactor: api-laravel/ becomes _api/

The old name leaks the framework and reads as a workaround, and its comments
claimed it was load-bearing. It was not, quite: ^api(/|$) matches only exactly
'api' or a path beginning 'api/', so every other name is loop-safe and the
hyphen was never the reason. The leading underscore reads as 'not a public
resource' in an FTP listing and names no framework, so it survives a stack
change.

One commit across all sixteen functional touch points, because the local stack
is broken between the build output moving and the container mounts following
it. Two of them fail loudly if missed — docker/web/entrypoint.sh cannot find
_api/artisan, and CI's artifact assertion goes red — which is what makes this
safe to do at once.

Verified: 9/9 smoke, the full Laravel suite, and /\_api/.env still 403 while
the retired /api-laravel/.env now falls through to the SPA shell."
```

> **Note for anyone reading the history:** the documented Laravel test command
> is now `docker compose exec -w /var/www/html/_api web php artisan test`.
> Task 6 updates `CLAUDE.md` accordingly.

---

## Task 6: The documentation, and the dead `.gitignore` entries

**Why it is a task and not a footnote.** Every file below describes the layout
to the next person who touches it. `staging/README.md` in particular contains
the paragraph asserting that the two access files "never actually reach any
server, including after the `/api/*` cutover" — which Task 2 has just made
false, and which is exactly the kind of stale claim that gets trusted.

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `staging/README.md`, `.gitignore`
- Modify: `api/.env.example`, `.env.example`, `api/phpunit.xml`
- Modify: `api/tests/Feature/ApiErrorVocabularyTest.php`
- Modify: `docker/web/apache-canetons.conf`

- [ ] **Step 1: `CLAUDE.md`**

Four places:

1. The **Tech Stack** section: "Deployed as `api-laravel/` inside the document
   root" becomes `_api/`.
2. The **`.htaccess`** section: it lists "three things that will take the site
   down". There are now **two** — the `/api/*` dispatch staying first, and
   `[L]` not `[END]`. Delete item 3 (the two negative lookaheads) and replace
   it with a short note that the legacy 301s carrying them were deleted on
   2026-09-07, and that the fallback is no longer the only thing protecting the
   Laravel tree — `_api/.htaccess` is, and `npm run smoke` asserts it at
   exactly 403.
3. The **Deployment** section: the note about excluded server-owned files must
   describe path matching, not "matched by **basename** at any depth, which is
   what protects the nested `api-laravel/.env`". That sentence is now wrong in
   both halves.
4. The **Don'ts**: "Never rename `api-laravel/` without first adding a
   `REDIRECT_STATUS` guard" becomes `_api/`, and gains the correction that the
   guard is needed only for a name `^api(/|$)` can actually match — i.e.
   literally `api`.

Also update the documented Laravel test command everywhere it appears
(`-w /var/www/html/api-laravel` → `-w /var/www/html/_api`), including in the
**Development Commands** section.

- [ ] **Step 2: `staging/README.md`**

The layout section needs real rewriting, not a token swap. Specifically:

- the per-server file list: `api-laravel/.env` → `_api/.env`, and
  `SOUPER_SIGNUP_ENABLED` should go from the key list — that feature was
  deleted in R1a.
- the paragraph beginning "Two further `.htaccess` files travel **with** the
  code artifact" — keep it, and delete the "**Neither actually reaches any
  server**" claim that follows, replacing it with what is now true: they ship,
  because `PROTECTED_PATHS` is root-relative; the boundary is Apache's
  authorization rather than the app's routing; and `npm run smoke` asserts
  exactly 403 on `/_api/.env`.
- the paragraph beginning "**That is a single layer, and it is the app's, not
  Apache's**" — this is now historical. Rewrite it as: it *was* a single layer
  until 2026-09-07, the catch-all is still a useful second one, and weakening
  it is still not free.
- the QA/PROD bootstrap checklist: `api-laravel/.env` → `_api/.env`, and drop
  the line about the FastCGI 301 bug, since the rule that caused it is gone.

- [ ] **Step 3: `README.md`**

The project-structure section names `api-laravel/`. Update it.

- [ ] **Step 4: `.gitignore`**

Two edits:

1. `/app/vendor` and `/app/api-laravel` (and the whole comment block above
   them) describe mount stubs inside a `./app -> /var/www/html` mount. **The
   `app/` front end was deleted in the SPA cutover**, so all of it is dead.
   Delete both entries. Keep the live half of the knowledge by moving it into
   the comment on `/api/.env` (line 32):

```gitignore
# Laravel's real configuration, per developer. ALSO an empty stub Docker
# creates: docker-compose.yml mounts docker/api/env.docker onto
# /var/www/html/_api/.env, which nests inside the ./api -> _api mount and
# writes through to a 0-byte api/.env on the host. Harmless to the container,
# but note the stub SILENTLY SHADOWS a real .env for host-side `php artisan`
# use under api/ — Laravel finds a (useless) .env already present instead of
# none.
/api/.env
```

2. Check whether `/app/php-error.log` and `/app/assets/dist/` are equally dead
   (they are, for the same reason) and delete them too. Nothing else in the
   tree writes to `app/`.

- [ ] **Step 5: The remaining comment-only files**

- `api/.env.example` — path comments.
- `.env.example` (repo root) — the `MIGRATE_TOKEN` comment naming
  `api-laravel/.env`.
- `api/phpunit.xml` — two comments about the mounted `.env` (in the
  `AUTO_MIGRATE` and `SESSION_SECURE_COOKIE` blocks).
- `api/tests/Feature/ApiErrorVocabularyTest.php` — two doc comments. **Nothing
  functional here**: it resolves paths via `__DIR__` and `/srv/web`, verified
  2026-09-07. Only the prose mentioning the container path changes.
- `docker/web/apache-canetons.conf` — one comment.

- [ ] **Step 6: Verify no functional reference survives**

```bash
grep -rn "api-laravel" --exclude-dir=dist --exclude-dir=node_modules \
  --exclude-dir=vendor --exclude-dir=.git . | grep -v "^./api/storage/"
```

Expected: only `docs/` (historical specs and plans, which correctly describe
what was true when written) and any deliberate historical note left in
`CLAUDE.md` or `staging/README.md`.

- [ ] **Step 7: Full green run**

```bash
npm run test:js
npm run smoke
```

```powershell
npm run check
```

Expected: all green. `npm run check` runs typecheck, Pint, the web suite,
eslint, stylelint, prettier and the secret guard.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: describe the layout that now exists, and drop dead ignores

staging/README.md asserted that the two access .htaccess files 'never actually
reach any server' and that the app's catch-all was the only layer. Both were
true when written and are false now, and a confidently stated false claim about
a security boundary is worse than no claim.

CLAUDE.md's 'three things that will take the site down' is two: the legacy 301s
that carried both negative lookaheads are gone. Its deployment section also
described the protected set as basename-matched 'which is what protects the
nested api-laravel/.env' — wrong in both halves now.

.gitignore's /app/* entries were mount stubs for the front end deleted in the
SPA cutover. The one live fact in that comment — the nested env mount writing a
0-byte api/.env that shadows a real one for host-side artisan — moves to
/api/.env, where it applies."
```

---

## Task 7: One last look at the whole change

- [ ] **Step 1: Rebuild from nothing and re-verify**

```bash
npm run dev:down
rm -rf dist/build
npm run build
npm run dev
npm run smoke
npm run test:js
```

Expected: artifact rebuilt, stack up, **9/9**, tool tests green.

- [ ] **Step 2: Confirm the artifact's shape by eye**

```bash
ls dist/build
ls dist/build/_api/.htaccess dist/build/_api/public/.htaccess
```

Expected: `index.html`, `assets/`, `_api/`, `deployment.json` — and **both
access files present in the artifact**. They have always been present; what
changed is that they will now be uploaded.

- [ ] **Step 3: Confirm what a deploy would actually do**

Without deploying:

```bash
npm run status:test
```

Read the output. It reports the remote tree against the local artifact. This is
the last chance to see, before Task 8, that the plan's understanding of TEST
matches reality.

- [ ] **Step 4: Browser check**

At http://localhost:8090: the SPA shell loads, `/login` renders its form, and
`/_api/.env` shows Apache's 403 page rather than the SPA.

- [ ] **Step 5: Commit any fixes, then stop**

Do not deploy. Task 8 is a hand-run runbook and needs a human at the FTP
client.

---

## Task 8: The TEST cutover — hand-run, not automated

**This task is a runbook.** It is written as checkboxes so a human can work
through it and record what happened, and it must not be handed to an agent that
cannot see the FTP client.

**Read this before touching anything:** two files on TEST exist nowhere else.

- `.htpasswd` — **inside the document root**
  (`HTPASSWD_PATH=/var/www/sites/…/staging/test.lescanetons.org/.htpasswd`,
  `FTP_DIR=/public_html/staging/test.lescanetons.org`). No tool uploads it, on
  purpose. Delete it and the new `.htaccess` points `AuthUserFile` at nothing,
  and **Apache answers 500 to every request, including the ones needed to
  diagnose it.**
- `api-laravel/.env` — holds `APP_KEY`, the DB credentials and
  `MIGRATE_TOKEN`.

- [ ] **Step 1: Download `api-laravel/.env` and keep it**

Put it somewhere git-ignored. Everything after this depends on having it.

- [ ] **Step 2: Delete everything in TEST's document root EXCEPT `.htpasswd`**

Including `api-laravel/`, `index.html`, `assets/`, `.htaccess`, `robots.txt`,
`.sync-state.json`, `deployment.json` and **`config.php`** — which is dead
since the cutover and holds live DB credentials, and whose removal is one of
the reasons this is a hard reset rather than a staged swap.

TEST is down from here until step 5. It is private, behind Basic Auth, and
holds synthetic data only.

- [ ] **Step 3: Upload the saved file as `_api/.env`**

Create `_api/` and put it there. If Plan B (Scalar) has already landed, add
`API_DOCS_ENABLED=true` in the same edit. If the R1b plan has landed, add its
`BOOTSTRAP_ADMIN_*` keys too — the config-shape pre-flight compares the whole
key set and refuses on any drift, so one edit is cheaper than three.

- [ ] **Step 4: Place the `.htaccess` and `robots.txt`**

```bash
npm run put-overlay:test
```

- [ ] **Step 5: Deploy**

```bash
npm run deploy:test -- --dry-run
```

Read the plan. It is a bootstrap — no state file, empty remote tree — so it
should be **all uploads and zero deletions**, and the mass-delete brake should
not be mentioned. If it proposes deletions, stop: something survived step 2.

```bash
npm run deploy:test
```

- [ ] **Step 6: Verify, in this order**

```bash
curl -su "USER:PASS" -o /dev/null -w "%{http_code}\n" https://test.lescanetons.org/api/config
```

- **200** → the dispatch works and `AllowOverride` accepts the new directives.
- **500** → `AllowOverride` refuses them. FTP-delete `_api/.htaccess` and
  `_api/public/.htaccess`, re-check, and record the result: it means this host
  cannot have the Apache-level boundary and the catch-all is the only layer
  available. **Note it in `staging/README.md` and in the spec's open items.**

```bash
curl -su "USER:PASS" -o /dev/null -w "%{http_code}\n" https://test.lescanetons.org/_api/.env
```

- **403** → two layers, as designed.
- **200 serving the SPA shell** → the deny file is not being read; the
  catch-all answered. Same diagnosis as a 500 above.
- **200 serving the file** → stop everything; the boundary is gone entirely.

Then run the smoke suite against TEST rather than against the local stack:

```bash
SMOKE_BASE_URL=https://test.lescanetons.org npm run smoke
```

Expect Basic Auth to make most checks fail — the suite sends no credentials.
That is a known gap; the two curls above are the real verification, and
automating them is the deferred post-deploy verifier's job, not this plan's.

- [ ] **Step 7: A browser, as a human**

Log in at https://test.lescanetons.org. Confirm the session cookie is
`HttpOnly` and `SameSite=Strict` in the browser's own devtools.

- [ ] **Step 8: Record what happened**

Tick this plan's boxes, leave anything skipped **unticked with a note saying
why**, and write the `AllowOverride` answer into `staging/README.md` — it is
the same unresolved-Apache-version question that already forced `[L]` over
`[END]`, and knowing it is worth more than this plan.

```bash
git add docs/superpowers/plans/2026-09-07-api-directory-and-deploy-hardening.md staging/README.md
git commit -m "docs: record the TEST cutover result"
```

---

## Done when

- `npm run test:js` is green.
- `npm run smoke` is **9/9** against the local stack.
- `npm run check` is green.
- `docker compose exec -w /var/www/html/_api web php artisan test` is green.
- `dist/build/_api/.htaccess` and `dist/build/_api/public/.htaccess` both exist
  in the artifact, and `walkBuild` includes them (proved by Task 2's test).
- `grep -rn "api-laravel"` outside `docs/` and `api/storage/` returns only
  deliberate historical notes.
- `config/htaccess/site.htaccess` contains **no** `RedirectMatch`.
- On TEST: `/api/config` → 200 and `/_api/.env` → 403, both recorded.
- No pull request has been opened.

## Carried out of this plan

- **HTTPS redirect, HSTS and the four security headers** — still owed from
  rebuild §6, deliberately not bundled with a rename so that a 500 has one
  possible cause instead of two.
- **`config.php` on QA and PROD.** Gone from TEST by Task 8. It leaves
  `PROTECTED_PATHS` only when it is gone from all three.
- **Smoke against a Basic-Auth'd environment.** `SMOKE_BASE_URL` already
  exists, but the suite sends no credentials, so it cannot verify TEST. That is
  the deferred post-deploy verifier's job.
- **The `AllowOverride` answer**, until Task 8 step 6 produces it.
