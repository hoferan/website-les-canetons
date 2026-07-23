# Laravel API Foundation (Sub-Project 2a-i) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a new, independent Laravel project (`api/`) with Sanctum SPA auth and a safely-adoptable migration baseline for the five tables this sub-project touches — deployable alongside the existing app, but not yet publicly dispatched (that's sub-project 2a-ii, once contact/signups/altcha also exist).

**Architecture:** `api/` is a second, independent Composer project (own `composer.json`, PSR-4 root) living alongside the existing repo-root one, deployed into the build artifact at `dist/build/api/`. Laravel owns its own `.htaccess`-based routing once reached; hardening `.htaccess` files keep its non-public files unreachable directly. Every migration is written with `Schema::hasTable()`/`Schema::hasColumn()` guards so the same file safely creates fresh (TEST) or adopts existing (future QA/PROD) schema.

**Tech Stack:** Laravel (latest stable, resolved by Composer at implementation time — record the exact version in your task report), Laravel Sanctum (SPA mode), Eloquent, PHP 8.4, MariaDB 10.3, PHPUnit (Laravel's default test framework via `composer create-project laravel/laravel` non-interactively).

## Global Constraints

- PHP `>=8.4` (matches the rest of this project).
- No new secrets checked in — `api/.env` is git-ignored, server-owned, following the same operational pattern as the existing `app/config.php`.
- `updated_at` is added to all five tables this sub-project touches (`instruments`, `users`, `contact_messages`, `signups`, `used_challenges`) — no `const UPDATED_AT = null;` anywhere, full Eloquent convention, no per-model exceptions.
- Every migration this plan adds is guarded with `Schema::hasTable()`/`Schema::hasColumn()` so it is safe to run against both a freshly-wiped database and one that already has the table/column (adopting the old app's existing schema) — this is the mechanism that makes a future QA/PROD promotion safe without a separate manual backfill step.
- `used_challenges` gets a proper auto-increment `id` primary key added via migration; `signature` becomes a unique-indexed column instead of the primary key (preserving the "each signature consumed once" guarantee).
- This plan does NOT activate the root `.htaccess` dispatch rule that makes `/api/*` publicly reachable — that happens in sub-project 2a-ii, once contact/signups/altcha also exist in Laravel, so there's never a window where a live route 404s because Laravel doesn't implement it yet.
- This plan does NOT touch `app/api/*.php`, `app/src/routes.php`, or any old-app file — that removal is 2a-ii's job, after the new routes are proven.
- No sharing of PHP classes/code between the old app (`App\` namespace under `app/src/`) and the new Laravel app (its own `App\` namespace under `api/app/`) — they are independent projects by design, avoiding a PSR-4 namespace collision between two separate Composer projects.

---

### Task 1: Rename the build-staging directory `public/` → `dist/build/`

**Files:**
- Modify: `tools/deploy.mjs:43`
- Modify: `.gitignore:34`
- Modify: `tools/build.mjs` (full-file replacement — see Step 1)
- Modify: `.github/workflows/ci.yml` (the `build` job's verification step)
- Modify: `CLAUDE.md` (every occurrence of the literal string `public/` — see Step 5)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `dist/build/` as the build-staging directory every later task's build/deploy work targets. `deploy.mjs`'s `LOCAL_ROOT` constant is `'dist/build'` for all subsequent tasks to rely on.

- [ ] **Step 1: Replace `tools/build.mjs` in full**

Replace the entire current file:

```javascript
// Assembles public/ — the FTP-ready deploy artifact — from app/ plus a
// production-only Composer vendor/ (installed via COMPOSER_VENDOR_DIR, no
// second composer.json needed). Never hand-edit public/; it's regenerated
// on every run.
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const mount = process.cwd().split('\\').join('/');

// Bundle JS/CSS first so app/assets/dist/ exists before the app/ -> public/
// copy below picks it up.
execFileSync('npx', ['vite', 'build'], { stdio: 'inherit' });

rmSync('public', { recursive: true, force: true });
cpSync('app', 'public', { recursive: true });

// The raw JS/CSS source is superseded by the bundled output just copied
// above (public/assets/dist/) — the server never references it directly
// anymore (see App\Assets), so don't ship dead source alongside the bundles.
rmSync('public/assets/js', { recursive: true, force: true });
rmSync('public/assets/css', { recursive: true, force: true });

// Ship the numbered migrations so the server-side endpoint (public/api/migrate.php)
// can apply them. They live under public/sql/migrations and are unreachable via
// direct HTTP: the front-controller catch-all (app/.htaccess) rewrites any
// non-/assets/ path to index.php, which 404s anything that isn't a route.
cpSync('sql/migrations', 'public/sql/migrations', { recursive: true });

// config.php is environment-specific and server-owned (real DB creds + env key).
// Never ship it in the deploy artifact: each server keeps its own, set once by
// hand, and it's excluded from every upload/promotion. Dropping it here (a local
// app/config.php gets copied by the recursive cpSync above) keeps public/ a pure,
// environment-agnostic artifact you can promote test -> qa -> prod unchanged.
rmSync('public/config.php', { force: true });

// Ship the template next to the real (never-uploaded) config.php so it's on
// every server for reference — diff it against config.php by hand to see
// what's missing. deploy.mjs also uses it to fail the deploy if config.php's
// shape has drifted (see checkConfigShape there).
cpSync('config/config.example.php', 'public/config.example.php');

execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${mount}:/app`,
    '-w',
    '/app',
    '-e',
    'COMPOSER_VENDOR_DIR=public/vendor',
    'composer:2',
    'install',
    '--no-dev',
    '--optimize-autoloader',
    '--no-interaction',
  ],
  { stdio: 'inherit' }
);

// The repo-root composer.json maps App\ -> app/src/ (correct for the dev
// tree, where composer.json sits next to app/). Inside the built public/,
// app/'s CONTENTS were copied flat (classes now live at public/src/, not
// public/app/src/), so the vendor/ installed above has the wrong autoload
// map for this tree. Regenerate it in place, scoped to public/'s own
// flattened layout, reusing the packages already installed — no network
// access, no package re-resolution, just a corrected class map.
//
// This must be the FULL composer.json (require section included), not just
// the autoload section: `composer dump-autoload` only includes a dependency's
// own autoload rules (e.g. nikic/fast-route's FastRoute\ namespace) for
// packages the current composer.json actually requires — a minimal
// autoload-only composer.json silently drops every vendor package's
// autoloading, even though the files are still physically installed.
const rootComposerJson = JSON.parse(readFileSync('composer.json', 'utf8'));
rootComposerJson.autoload = { 'psr-4': { 'App\\': 'src/' } };
writeFileSync('public/composer.json', JSON.stringify(rootComposerJson, null, 2));
execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${mount}:/app`,
    '-w',
    '/app/public',
    'composer:2',
    'dump-autoload',
    '--no-dev',
    '--optimize',
    '--no-interaction',
  ],
  { stdio: 'inherit' }
);
rmSync('public/composer.json');

console.log('Built public/ — ready to FTP upload.');
```

with:

```javascript
// Assembles dist/build/ — the FTP-ready deploy artifact — from app/ plus a
// production-only Composer vendor/ (installed via COMPOSER_VENDOR_DIR, no
// second composer.json needed). Never hand-edit dist/build/; it's
// regenerated on every run.
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const mount = process.cwd().split('\\').join('/');

// Bundle JS/CSS first so app/assets/dist/ exists before the app/ -> dist/build/
// copy below picks it up.
execFileSync('npx', ['vite', 'build'], { stdio: 'inherit' });

rmSync('dist/build', { recursive: true, force: true });
cpSync('app', 'dist/build', { recursive: true });

// The raw JS/CSS source is superseded by the bundled output just copied
// above (dist/build/assets/dist/) — the server never references it directly
// anymore (see App\Assets), so don't ship dead source alongside the bundles.
rmSync('dist/build/assets/js', { recursive: true, force: true });
rmSync('dist/build/assets/css', { recursive: true, force: true });

// Ship the numbered migrations so the server-side endpoint (dist/build/api/migrate.php)
// can apply them. They live under dist/build/sql/migrations and are unreachable via
// direct HTTP: the front-controller catch-all (app/.htaccess) rewrites any
// non-/assets/ path to index.php, which 404s anything that isn't a route.
cpSync('sql/migrations', 'dist/build/sql/migrations', { recursive: true });

// config.php is environment-specific and server-owned (real DB creds + env key).
// Never ship it in the deploy artifact: each server keeps its own, set once by
// hand, and it's excluded from every upload/promotion. Dropping it here (a local
// app/config.php gets copied by the recursive cpSync above) keeps dist/build/ a
// pure, environment-agnostic artifact you can promote test -> qa -> prod unchanged.
rmSync('dist/build/config.php', { force: true });

// Ship the template next to the real (never-uploaded) config.php so it's on
// every server for reference — diff it against config.php by hand to see
// what's missing. deploy.mjs also uses it to fail the deploy if config.php's
// shape has drifted (see checkConfigShape there).
cpSync('config/config.example.php', 'dist/build/config.example.php');

execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${mount}:/app`,
    '-w',
    '/app',
    '-e',
    'COMPOSER_VENDOR_DIR=dist/build/vendor',
    'composer:2',
    'install',
    '--no-dev',
    '--optimize-autoloader',
    '--no-interaction',
  ],
  { stdio: 'inherit' }
);

// The repo-root composer.json maps App\ -> app/src/ (correct for the dev
// tree, where composer.json sits next to app/). Inside the built dist/build/,
// app/'s CONTENTS were copied flat (classes now live at dist/build/src/, not
// dist/build/app/src/), so the vendor/ installed above has the wrong autoload
// map for this tree. Regenerate it in place, scoped to dist/build/'s own
// flattened layout, reusing the packages already installed — no network
// access, no package re-resolution, just a corrected class map.
//
// This must be the FULL composer.json (require section included), not just
// the autoload section: `composer dump-autoload` only includes a dependency's
// own autoload rules (e.g. nikic/fast-route's FastRoute\ namespace) for
// packages the current composer.json actually requires — a minimal
// autoload-only composer.json silently drops every vendor package's
// autoloading, even though the files are still physically installed.
const rootComposerJson = JSON.parse(readFileSync('composer.json', 'utf8'));
rootComposerJson.autoload = { 'psr-4': { 'App\\': 'src/' } };
writeFileSync('dist/build/composer.json', JSON.stringify(rootComposerJson, null, 2));
execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${mount}:/app`,
    '-w',
    '/app/dist/build',
    'composer:2',
    'dump-autoload',
    '--no-dev',
    '--optimize',
    '--no-interaction',
  ],
  { stdio: 'inherit' }
);
rmSync('dist/build/composer.json');

console.log('Built dist/build/ — ready to FTP upload.');
```

- [ ] **Step 2: Update `tools/deploy.mjs`**

Replace:
```javascript
const LOCAL_ROOT = 'public';
```
with:
```javascript
const LOCAL_ROOT = 'dist/build';
```

- [ ] **Step 3: Update `.gitignore`**

Replace the line:
```
/public/
```
with:
```
/dist/build/
```

- [ ] **Step 4: Update `.github/workflows/ci.yml`'s build verification step**

Replace:
```yaml
      - name: Verify public/ was produced
        run: test -f public/index.php && test -d public/vendor
```
with:
```yaml
      - name: Verify dist/build/ was produced
        run: test -f dist/build/index.php && test -d dist/build/vendor
```

- [ ] **Step 5: Update `CLAUDE.md`**

Replace every occurrence of the literal string `public/` with `dist/build/` throughout the file (10 occurrences as of this plan being written, at approximately lines 38, 42, 44, 64, 177, 178, 201, 367, 368 — verify the exact count with the grep below rather than trusting these line numbers, since earlier edits in this session may have shifted them).

- [ ] **Step 6: Verify no stale references remain**

Run: `grep -rn "'public'" tools/build.mjs tools/deploy.mjs; grep -n "public/" .gitignore CLAUDE.md .github/workflows/ci.yml`
Expected: no matches in `tools/build.mjs`/`tools/deploy.mjs`/`.gitignore`/`.github/workflows/ci.yml`; `CLAUDE.md` should show zero remaining matches too (all replaced) — if the grep for `CLAUDE.md` shows any hits, Step 5 missed one, go back and fix it.

- [ ] **Step 7: Confirm the build still runs** (requires Docker — this step's own build/deploy machinery already required Docker before this rename; if you're in a Docker-free environment, skip this step and note it as a concern in your report rather than guessing)

Run: `npm run build`
Expected: completes successfully, ends with `Built dist/build/ — ready to FTP upload.`, and `dist/build/index.php` + `dist/build/vendor/` exist.

- [ ] **Step 8: Commit**

```bash
git add tools/build.mjs tools/deploy.mjs .gitignore .github/workflows/ci.yml CLAUDE.md
git commit -m "build: rename build-staging directory public/ to dist/build/"
```

---

### Task 2: Install Laravel in `api/` and wire minimal build integration

**Files:**
- Create: `api/` (Laravel project, scaffolded by the installer — do not hand-write its files)
- Modify: `tools/build.mjs` (add the `api/` build step)

**Interfaces:**
- Consumes: `dist/build/` from Task 1.
- Produces: a working Laravel project at `api/`, and `dist/build/api/` as its deployed location for later tasks to build on.

- [ ] **Step 1: Scaffold the Laravel project**

Run: `node tools/composer.mjs create-project laravel/laravel api --no-interaction`

Expected: a new `api/` directory is created containing a full Laravel project (`artisan`, `app/`, `bootstrap/`, `config/`, `database/`, `public/`, `routes/`, `composer.json`, `.env.example`, etc.). Note the exact Laravel version installed (check `api/composer.json`'s `require.laravel/framework` line, or run `cd api && php artisan --version`) and record it in your report.

- [ ] **Step 2: Confirm it runs locally**

Run: `cd api && php artisan --version`
Expected: prints a Laravel version string (e.g. `Laravel Framework 11.x.x` or newer) with no errors.

- [ ] **Step 3: Remove Laravel's default frontend scaffolding this project doesn't need**

This project is API-only — no Blade views, no default welcome page. Remove the view file and the route that renders it (which would otherwise error with "view not found" the moment anyone hits `/`):

```bash
rm -f api/resources/views/welcome.blade.php
```

Replace `api/routes/web.php`'s default contents:
```php
<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});
```
with:
```php
<?php

// Intentionally empty — this project is API-only. All routes live in
// routes/api.php.
```

Leave `api/resources/views/` itself in place (Laravel expects the directory to exist) but confirm no other default view files remain:

Run: `ls api/resources/views/`
Expected: empty (or the directory doesn't error when Artisan needs it).

- [ ] **Step 4: Add the `api/` build step to `tools/build.mjs`**

Add this block to `tools/build.mjs`, after the existing old-app build logic (after the `console.log('Built dist/build/ — ready to FTP upload.');` line from Task 1):

```javascript

// --- Build the Laravel API project (api/) into dist/build/api/ -----------
console.log('\nBuilding api/ (Laravel)...');
rmSync('dist/build/api', { recursive: true, force: true });
cpSync('api', 'dist/build/api', { recursive: true });
rmSync('dist/build/api/vendor', { recursive: true, force: true });
rmSync('dist/build/api/node_modules', { recursive: true, force: true });
rmSync('dist/build/api/.env', { force: true });

execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${mount}:/app`,
    '-w',
    '/app/dist/build/api',
    'composer:2',
    'install',
    '--no-dev',
    '--optimize-autoloader',
    '--no-interaction',
  ],
  { stdio: 'inherit' }
);

console.log('Built dist/build/api/ — ready to FTP upload alongside dist/build/.');
```

- [ ] **Step 5: Verify YAML/JS syntax is unaffected**

Run: `node --check tools/build.mjs`
Expected: no output (a syntax error would print one and exit non-zero).

- [ ] **Step 6: Commit**

```bash
git add api tools/build.mjs
git commit -m "feat(api): scaffold Laravel project and wire it into the build pipeline"
```

---

### Task 3: Harden `api/`'s deployed files against direct web access

**Files:**
- Create: `api/.htaccess`

**Interfaces:**
- Consumes: `api/` from Task 2.
- Produces: `api/.htaccess`, copied into `dist/build/api/.htaccess` by Task 2's build step (part of the plain `cpSync('api', 'dist/build/api', ...)` — no separate build change needed for this file itself).

Recall from the design: since the FTP account is chrooted to the web-root, Laravel's whole project (`vendor/`, `.env`, `app/`, etc.) is deployed *inside* the web-accessible tree at `<ftp-root>/api/`. Laravel's own `api/public/.htaccess` (already created by the Task 2 installer, untouched) handles routing *within* `api/public/`. This task adds a **deny-all** rule one level up, at `api/.htaccess`, so nothing outside `api/public/` is reachable directly.

- [ ] **Step 1: Create `api/.htaccess`**

```apache
# Deny direct access to everything in this directory (Laravel project root:
# vendor/, app/, .env, etc.). Only api/public/ (Laravel's own front
# controller, which has its own .htaccess re-allowing access there) should
# ever be reachable — this file exists because the deploy FTP account is
# chrooted to the web-root, so this whole project sits inside the
# web-accessible tree instead of outside it (Laravel's normal convention).
<IfModule mod_authz_core.c>
    Require all denied
</IfModule>
<IfModule !mod_authz_core.c>
    Deny from all
</IfModule>
```

- [ ] **Step 2: Confirm Laravel's own `api/public/.htaccess` exists and is untouched**

Run: `cat api/public/.htaccess`
Expected: Laravel's standard default content (a `RewriteEngine On` block routing non-existent files/directories to `index.php`) — this file should already exist from Task 2's installer and needs no changes here.

- [ ] **Step 3: Commit**

```bash
git add api/.htaccess
git commit -m "feat(api): deny direct access to everything outside api/public/"
```

---

### Task 4: Add Sanctum and configure SPA stateful auth

**Files:**
- Modify: `api/composer.json` (via `composer require`)
- Create: `api/config/sanctum.php` (via `vendor:publish`)
- Modify: `api/bootstrap/app.php`
- Modify: `api/.env.example`

**Interfaces:**
- Consumes: `api/` from Task 2.
- Produces: Sanctum's `EnsureFrontendRequestsAreStateful` middleware active on the `api` middleware group; `SANCTUM_STATEFUL_DOMAINS` and `SESSION_DOMAIN` as env keys later tasks (and the eventual frontend) rely on.

- [ ] **Step 1: Require Sanctum**

Run: `cd api && node ../tools/composer.mjs require laravel/sanctum --no-interaction`
Expected: completes successfully; `api/composer.json`'s `require` gains a `laravel/sanctum` entry.

- [ ] **Step 2: Publish Sanctum's config and migration**

Run: `cd api && php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"`
Expected: creates `api/config/sanctum.php` and a `database/migrations/*_create_personal_access_tokens_table.php` file. (This project uses SPA cookie auth, not API tokens, so `personal_access_tokens` will likely stay empty — but Sanctum's SPA middleware still depends on the package being installed and its config published; leave the migration file in place, it's harmless and Sanctum's own.)

- [ ] **Step 3: Register Sanctum's stateful middleware**

Read `api/bootstrap/app.php`. It should contain a `->withMiddleware(function (Middleware $middleware) { ... })` call (Laravel's post-11 style — if your installed version instead uses `app/Http/Kernel.php`'s `$middlewareGroups['api']` array, add `\Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class` as the first entry there instead, and note that difference in your report). For the `bootstrap/app.php` style, add the Sanctum middleware as the first entry in the `api` group:

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->statefulApi();
})
```

(`statefulApi()` is Laravel's built-in helper added specifically for this — it registers `EnsureFrontendRequestsAreStateful` on the `api` group without you needing to reference the class directly. Use it if your installed Laravel version has it; check with `php artisan route:list` after this step to confirm Sanctum's routes are registered, and fall back to manually referencing `EnsureFrontendRequestsAreStateful::class` in the `api` middleware group if `statefulApi()` doesn't exist on your installed version.)

- [ ] **Step 4: Set the stateful-domain and session config in `.env.example`**

Add these lines to `api/.env.example` (create the keys if Laravel's default `.env.example` doesn't already have them; if it does, update the values):

```
SANCTUM_STATEFUL_DOMAINS=localhost,127.0.0.1
SESSION_DOMAIN=localhost
SESSION_DRIVER=database
```

(`localhost`/`127.0.0.1` are placeholders for local development — the real per-server `.env` on TEST/QA/PROD sets these to the site's actual domain, following the same "server-owned, set once by hand" pattern as `config.php` today. `SESSION_DRIVER=database` needs a `sessions` table — Laravel's installer already publishes a `create_sessions_table` migration by default; confirm it exists at `api/database/migrations/*_create_sessions_table.php`.)

- [ ] **Step 5: Verify**

Run: `cd api && php artisan route:list --path=sanctum`
Expected: shows Sanctum's `GET sanctum/csrf-cookie` route.

- [ ] **Step 6: Commit**

```bash
git add api
git commit -m "feat(api): add Sanctum SPA stateful auth"
```

---

### Task 5: `User` model and capability-matrix helper

**Files:**
- Modify: `api/app/Models/User.php`
- Create: `api/app/Support/Capability.php`
- Test: `api/tests/Unit/CapabilityTest.php`

**Interfaces:**
- Consumes: nothing from other tasks (independent of migrations — this task doesn't touch the database, it defines the model/logic against the eventual `users` table shape from Task 7).
- Produces: `App\Models\User` (Eloquent model, `role` attribute) and `App\Support\Capability::can(?string $role, string $capability): bool` / `Capability::rolesWith(string $capability): array`. Neither is consumed by anything in this plan — login/logout/user don't need capability gating — this is deliberately forward-looking foundation for sub-project 2b (events/responses), which does need it. Goal 4 of the spec ("reimplement Auth's capability matrix") is satisfied by `Capability` existing and being correct now, not by anything in 2a-i calling it yet.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Unit;

use App\Support\Capability;
use PHPUnit\Framework\TestCase;

class CapabilityTest extends TestCase
{
    public function test_user_can_respond(): void
    {
        $this->assertTrue(Capability::can('user', 'respond'));
    }

    public function test_moderator_can_respond(): void
    {
        $this->assertTrue(Capability::can('moderator', 'respond'));
    }

    public function test_admin_cannot_respond(): void
    {
        $this->assertFalse(Capability::can('admin', 'respond'));
    }

    public function test_admin_can_manage_events(): void
    {
        $this->assertTrue(Capability::can('admin', 'manage_events'));
    }

    public function test_admin_can_view_summary(): void
    {
        $this->assertTrue(Capability::can('admin', 'view_summary'));
    }

    public function test_user_cannot_manage_events(): void
    {
        $this->assertFalse(Capability::can('user', 'manage_events'));
    }

    public function test_unknown_role_has_no_capabilities(): void
    {
        $this->assertFalse(Capability::can(null, 'respond'));
        $this->assertFalse(Capability::can('nonexistent', 'respond'));
    }

    public function test_roles_with_respond(): void
    {
        $this->assertEqualsCanonicalizing(['user', 'moderator'], Capability::rolesWith('respond'));
    }

    public function test_roles_with_manage_events(): void
    {
        $this->assertEqualsCanonicalizing(['admin'], Capability::rolesWith('manage_events'));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && php artisan test --filter=CapabilityTest`
Expected: FAIL — `Class "App\Support\Capability" not found`.

- [ ] **Step 3: Implement `Capability`**

Create `api/app/Support/Capability.php`:

```php
<?php

namespace App\Support;

/**
 * Capability matrix — the single source of truth for what each role may do.
 * NOT a hierarchy: admin manages events/summary but cannot respond; a
 * user/moderator responds but cannot manage. Mirrors the old app's
 * App\Auth::CAPABILITIES exactly (same roles, same capabilities).
 */
final class Capability
{
    private const MATRIX = [
        'user'      => ['respond'],
        'moderator' => ['respond'],
        'admin'     => ['manage_events', 'view_summary'],
    ];

    public static function can(?string $role, string $capability): bool
    {
        return in_array($capability, self::MATRIX[$role] ?? [], true);
    }

    /** @return string[] */
    public static function rolesWith(string $capability): array
    {
        $roles = [];
        foreach (self::MATRIX as $role => $capabilities) {
            if (in_array($capability, $capabilities, true)) {
                $roles[] = $role;
            }
        }
        return $roles;
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && php artisan test --filter=CapabilityTest`
Expected: PASS, 9/9 tests.

- [ ] **Step 5: Update the `User` model**

Replace `api/app/Models/User.php`'s contents (Laravel's default scaffolded model) with:

```php
<?php

namespace App\Models;

// Note: Notifiable/MustVerifyEmail traits from Laravel's default scaffold are
// intentionally omitted — this project sends no notification emails and has
// no email-verification flow, matching the old app's Auth behavior exactly.
//
// Deliberately no canRespond()/canManageEvents()/canViewSummary() convenience
// methods here yet — nothing in this sub-project needs capability gating
// (login/logout/user don't check it), so adding untested, unused wrappers
// around App\Support\Capability would be scope creep. Sub-project 2b (events/
// responses) adds them when it actually needs them.
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class User extends Authenticatable
{
    use HasFactory;

    protected $fillable = ['username', 'password', 'role', 'instrument_id'];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
        ];
    }
}
```

- [ ] **Step 6: Run the full test suite**

Run: `cd api && php artisan test`
Expected: all tests pass (Laravel's default scaffolded tests plus `CapabilityTest`), output pristine (no warnings).

- [ ] **Step 7: Commit**

```bash
git add api/app/Models/User.php api/app/Support/Capability.php api/tests/Unit/CapabilityTest.php
git commit -m "feat(api): add Capability matrix helper and update User model"
```

---

### Task 6: Auth routes — login, logout, current user

**Files:**
- Create: `api/app/Http/Controllers/Api/AuthController.php`
- Modify: `api/routes/api.php`
- Test: `api/tests/Feature/AuthTest.php`

**Interfaces:**
- Consumes: `App\Models\User` and `App\Support\Capability` from Task 5. Depends on the `users` table existing — Task 7 creates it, so this task's *tests* need Task 7's migration to run first even though the code itself has no direct file dependency on Task 7. Do Task 7 before this task if executing out of plan order; if executing in plan order, this is already satisfied.
- Produces: `POST /api/login`, `POST /api/logout`, `GET /api/user` routes.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_with_valid_credentials_succeeds(): void
    {
        User::create([
            'username' => 'demo.user',
            'password' => 'secret123',
            'role' => 'user',
        ]);

        $response = $this->postJson('/api/login', [
            'username' => 'demo.user',
            'password' => 'secret123',
        ]);

        $response->assertOk()->assertJson(['role' => 'user']);
        $this->assertAuthenticated();
    }

    public function test_login_with_wrong_password_fails(): void
    {
        User::create([
            'username' => 'demo.user',
            'password' => 'secret123',
            'role' => 'user',
        ]);

        $response = $this->postJson('/api/login', [
            'username' => 'demo.user',
            'password' => 'wrong',
        ]);

        $response->assertStatus(401);
        $this->assertGuest();
    }

    public function test_login_with_unknown_username_fails(): void
    {
        $response = $this->postJson('/api/login', [
            'username' => 'nobody',
            'password' => 'anything',
        ]);

        $response->assertStatus(401);
        $this->assertGuest();
    }

    public function test_current_user_endpoint_returns_role_when_authenticated(): void
    {
        $user = User::create([
            'username' => 'demo.admin',
            'password' => 'secret123',
            'role' => 'admin',
        ]);

        $response = $this->actingAs($user)->getJson('/api/user');

        $response->assertOk()->assertJson(['username' => 'demo.admin', 'role' => 'admin']);
    }

    public function test_current_user_endpoint_requires_auth(): void
    {
        $response = $this->getJson('/api/user');

        $response->assertStatus(401);
    }

    public function test_logout_clears_the_session(): void
    {
        $user = User::create([
            'username' => 'demo.user',
            'password' => 'secret123',
            'role' => 'user',
        ]);

        $this->actingAs($user)->postJson('/api/logout')->assertOk();
        $this->getJson('/api/user')->assertStatus(401);
    }

    public function test_legacy_plaintext_password_is_upgraded_on_successful_login(): void
    {
        // Bypass the User model's 'hashed' cast entirely (it would otherwise
        // hash this on write) to simulate a genuine pre-hashing legacy row,
        // matching what a real row created before hashing was added looks
        // like in the actual database.
        \Illuminate\Support\Facades\DB::table('users')->insert([
            'username' => 'legacy.user',
            'password' => 'plaintext-secret',
            'role' => 'user',
            'created_at' => now(),
        ]);

        $response = $this->postJson('/api/login', [
            'username' => 'legacy.user',
            'password' => 'plaintext-secret',
        ]);

        $response->assertOk()->assertJson(['role' => 'user']);

        $stored = \Illuminate\Support\Facades\DB::table('users')->where('username', 'legacy.user')->value('password');
        $this->assertStringStartsWith('$', $stored, 'password should be upgraded to a bcrypt hash after a successful legacy-plaintext login');
    }

    public function test_legacy_plaintext_login_fails_with_wrong_password(): void
    {
        \Illuminate\Support\Facades\DB::table('users')->insert([
            'username' => 'legacy.user2',
            'password' => 'plaintext-secret',
            'role' => 'user',
            'created_at' => now(),
        ]);

        $response = $this->postJson('/api/login', [
            'username' => 'legacy.user2',
            'password' => 'wrong-plaintext',
        ]);

        $response->assertStatus(401);
        $this->assertGuest();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && php artisan test --filter=AuthTest`
Expected: FAIL — routes don't exist yet (404s instead of the asserted status codes).

- [ ] **Step 3: Implement the controller**

Create `api/app/Http/Controllers/Api/AuthController.php`. Note this does NOT use `Auth::attempt()` — that only checks bcrypt hashes via the guard's internal `Hash::check()`, which can't accommodate the legacy-plaintext branch below, so credentials are checked manually and `Auth::login()` is called directly once they pass (mirroring the old app's `Auth::attemptLogin()` exactly, including the legacy-password-upgrade behavior):

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('username', $credentials['username'])->first();

        if (!$user) {
            return response()->json(['error' => 'Invalid credentials'], 401);
        }

        $stored = $user->getRawOriginal('password');

        if (password_verify($credentials['password'], $stored)) {
            Auth::login($user);
            $request->session()->regenerate();
            return response()->json(['role' => $user->role]);
        }

        // Legacy rows created before hashing was added store the password as
        // plain text (never a hash — hashes always start with '$'). Accept
        // once via a timing-safe compare, then upgrade the stored value (the
        // 'hashed' cast on User rehashes it automatically on save) so this
        // branch is never taken again for that user.
        if (!str_starts_with($stored, '$') && hash_equals($stored, $credentials['password'])) {
            $user->password = $credentials['password'];
            $user->save();
            Auth::login($user);
            $request->session()->regenerate();
            return response()->json(['role' => $user->role]);
        }

        return response()->json(['error' => 'Invalid credentials'], 401);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    public function user(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'username' => $user->username,
            'role' => $user->role,
        ]);
    }
}
```

- [ ] **Step 4: Register the routes**

Add to `api/routes/api.php`:

```php
<?php

use App\Http\Controllers\Api\AuthController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd api && php artisan test --filter=AuthTest`
Expected: PASS, 8/8 tests.

- [ ] **Step 6: Run the full test suite**

Run: `cd api && php artisan test`
Expected: all tests pass, output pristine.

- [ ] **Step 7: Commit**

```bash
git add api/app/Http/Controllers/Api/AuthController.php api/routes/api.php api/tests/Feature/AuthTest.php
git commit -m "feat(api): add login, logout, and current-user routes"
```

---

### Task 7: Baseline migrations — `instruments` and `users`

**Files:**
- Create: `api/database/migrations/2026_07_23_000001_create_instruments_table.php`
- Create: `api/database/migrations/2026_07_23_000002_create_users_table.php`
- Test: `api/tests/Feature/UsersMigrationTest.php`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `instruments` and `users` tables (guarded creation), matching the existing schema from `docker/db/init/01-schema.sql` plus a new `updated_at` column on both. Task 6's `AuthTest` and Task 5's `User` model rely on this table existing when tests run.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class UsersMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_instruments_table_has_expected_columns(): void
    {
        $this->assertTrue(Schema::hasTable('instruments'));
        $this->assertTrue(Schema::hasColumns('instruments', ['id', 'name', 'created_at', 'updated_at']));
    }

    public function test_users_table_has_expected_columns(): void
    {
        $this->assertTrue(Schema::hasTable('users'));
        $this->assertTrue(Schema::hasColumns('users', [
            'id', 'username', 'password', 'role', 'instrument_id', 'created_at', 'updated_at',
        ]));
    }

    public function test_username_is_unique(): void
    {
        \App\Models\User::create(['username' => 'dup', 'password' => 'x', 'role' => 'user']);

        $this->expectException(\Illuminate\Database\QueryException::class);
        \App\Models\User::create(['username' => 'dup', 'password' => 'y', 'role' => 'user']);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && php artisan test --filter=UsersMigrationTest`
Expected: FAIL — tables don't exist yet.

- [ ] **Step 3: Create the `instruments` migration**

Create `api/database/migrations/2026_07_23_000001_create_instruments_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('instruments')) {
            Schema::create('instruments', function (Blueprint $table) {
                $table->id();
                $table->string('name')->unique();
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->nullable();
            });
            return;
        }

        // Table already exists (created by the old app) — adopt it: add the
        // one column it's missing, leave everything else untouched.
        if (!Schema::hasColumn('instruments', 'updated_at')) {
            Schema::table('instruments', function (Blueprint $table) {
                $table->timestamp('updated_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('instruments');
    }
};
```

- [ ] **Step 4: Create the `users` migration**

Create `api/database/migrations/2026_07_23_000002_create_users_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table) {
                $table->id();
                $table->string('username')->unique();
                $table->string('password');
                $table->enum('role', ['user', 'moderator', 'admin'])->default('user');
                $table->foreignId('instrument_id')->nullable()->constrained('instruments')->nullOnDelete();
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->nullable();
            });
            return;
        }

        // Table already exists (created by the old app) — adopt it: add the
        // one column it's missing, leave everything else (including existing
        // rows and the instrument_id foreign key) untouched.
        if (!Schema::hasColumn('users', 'updated_at')) {
            Schema::table('users', function (Blueprint $table) {
                $table->timestamp('updated_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd api && php artisan test --filter=UsersMigrationTest`
Expected: PASS, 3/3 tests.

- [ ] **Step 6: Simulate the adoption path** (validates the `Schema::hasTable()`/`hasColumn()` guards against a pre-existing, old-shape table — the real QA/PROD scenario, simulated locally since real access isn't available)

Create a scratch database on the same MariaDB server your dev environment already uses (reusing its credentials, just a different schema name, so it can't collide with the main dev/test database), point Laravel at it for these commands only via a `DB_DATABASE` environment-variable override (Laravel's default `config/database.php` reads `DB_DATABASE` for the connection name), then drop it afterward:

```bash
mysql -h 127.0.0.1 -u root -proot -e "CREATE DATABASE IF NOT EXISTS laravel_scratch_test;"

cd api
DB_DATABASE=laravel_scratch_test php artisan tinker --execute="
use Illuminate\Support\Facades\DB;
DB::statement('CREATE TABLE instruments (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE)');
DB::statement('CREATE TABLE users (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, username VARCHAR(255) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, role ENUM(\'user\',\'moderator\',\'admin\') NOT NULL DEFAULT \'user\', instrument_id INT UNSIGNED NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
"
DB_DATABASE=laravel_scratch_test php artisan migrate --path=database/migrations/2026_07_23_000001_create_instruments_table.php --force
DB_DATABASE=laravel_scratch_test php artisan migrate --path=database/migrations/2026_07_23_000002_create_users_table.php --force
DB_DATABASE=laravel_scratch_test php artisan tinker --execute="var_dump(Illuminate\Support\Facades\Schema::hasColumn('users', 'updated_at'));"

mysql -h 127.0.0.1 -u root -proot -e "DROP DATABASE laravel_scratch_test;"
```

Expected: no errors from the migrate commands (they detect the tables already exist and only add the missing `updated_at` column), and the `var_dump` before cleanup prints `bool(true)`. If your environment's MariaDB root credentials differ from `-u root -proot`, use whatever `ensure-dev-stack.mjs` configured instead (check `api/.env` or the repo-root `app/config.php` for the working credentials).

- [ ] **Step 7: Run the full test suite**

Run: `cd api && php artisan test`
Expected: all tests pass, output pristine.

- [ ] **Step 8: Commit**

```bash
git add api/database/migrations/2026_07_23_000001_create_instruments_table.php api/database/migrations/2026_07_23_000002_create_users_table.php api/tests/Feature/UsersMigrationTest.php
git commit -m "feat(api): add guarded baseline migrations for instruments and users"
```

---

### Task 8: Baseline migrations — `contact_messages` and `signups`

**Files:**
- Create: `api/database/migrations/2026_07_23_000003_create_contact_messages_table.php`
- Create: `api/database/migrations/2026_07_23_000004_create_signups_table.php`
- Test: `api/tests/Feature/ContactSignupsMigrationTest.php`

**Interfaces:**
- Consumes: nothing from other tasks (independent tables, no FKs to `users`/`instruments`).
- Produces: `contact_messages` and `signups` tables, matching `docker/db/init/01-schema.sql` and `sql/migrations/001_create_signups.sql` respectively, each plus a new `updated_at` column.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ContactSignupsMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_contact_messages_table_has_expected_columns(): void
    {
        $this->assertTrue(Schema::hasTable('contact_messages'));
        $this->assertTrue(Schema::hasColumns('contact_messages', [
            'id', 'last_name', 'first_name', 'email', 'subject', 'message', 'created_at', 'updated_at',
        ]));
    }

    public function test_signups_table_has_expected_columns(): void
    {
        $this->assertTrue(Schema::hasTable('signups'));
        $this->assertTrue(Schema::hasColumns('signups', [
            'id', 'occasion', 'first_name', 'last_name', 'address', 'phone', 'email',
            'table_name', 'menus', 'created_at', 'updated_at',
        ]));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && php artisan test --filter=ContactSignupsMigrationTest`
Expected: FAIL — tables don't exist yet.

- [ ] **Step 3: Create the `contact_messages` migration**

Create `api/database/migrations/2026_07_23_000003_create_contact_messages_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('contact_messages')) {
            Schema::create('contact_messages', function (Blueprint $table) {
                $table->id();
                $table->string('last_name');
                $table->string('first_name');
                $table->string('email');
                $table->string('subject')->nullable();
                $table->text('message');
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->nullable();
            });
            return;
        }

        if (!Schema::hasColumn('contact_messages', 'updated_at')) {
            Schema::table('contact_messages', function (Blueprint $table) {
                $table->timestamp('updated_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('contact_messages');
    }
};
```

- [ ] **Step 4: Create the `signups` migration**

Create `api/database/migrations/2026_07_23_000004_create_signups_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('signups')) {
            Schema::create('signups', function (Blueprint $table) {
                $table->id();
                $table->string('occasion', 64);
                $table->string('first_name');
                $table->string('last_name');
                $table->string('address');
                $table->string('phone', 64);
                $table->string('email');
                $table->string('table_name');
                $table->text('menus');
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->nullable();
                $table->index('occasion', 'idx_signups_occasion');
                $table->index(['occasion', 'table_name'], 'idx_signups_table');
            });
            return;
        }

        if (!Schema::hasColumn('signups', 'updated_at')) {
            Schema::table('signups', function (Blueprint $table) {
                $table->timestamp('updated_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('signups');
    }
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd api && php artisan test --filter=ContactSignupsMigrationTest`
Expected: PASS, 2/2 tests.

- [ ] **Step 6: Run the full test suite**

Run: `cd api && php artisan test`
Expected: all tests pass, output pristine.

- [ ] **Step 7: Commit**

```bash
git add api/database/migrations/2026_07_23_000003_create_contact_messages_table.php api/database/migrations/2026_07_23_000004_create_signups_table.php api/tests/Feature/ContactSignupsMigrationTest.php
git commit -m "feat(api): add guarded baseline migrations for contact_messages and signups"
```

---

### Task 9: `used_challenges` migration, with the primary-key fix

**Files:**
- Create: `api/database/migrations/2026_07_23_000005_create_used_challenges_table.php`
- Test: `api/tests/Feature/UsedChallengesMigrationTest.php`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `used_challenges` with a proper auto-increment `id` primary key (the fix — the old table's primary key was `signature` itself, with no `id` column at all) and `signature` as a unique-indexed column instead, preserving the "each signature consumed once" guarantee.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class UsedChallengesMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_table_has_an_id_primary_key(): void
    {
        $this->assertTrue(Schema::hasTable('used_challenges'));
        $this->assertTrue(Schema::hasColumns('used_challenges', ['id', 'signature', 'created_at', 'updated_at']));
    }

    public function test_signature_is_unique(): void
    {
        DB::table('used_challenges')->insert(['signature' => str_repeat('a', 64)]);

        $this->expectException(\Illuminate\Database\QueryException::class);
        DB::table('used_challenges')->insert(['signature' => str_repeat('a', 64)]);
    }

    public function test_id_auto_increments(): void
    {
        $firstId = DB::table('used_challenges')->insertGetId(['signature' => str_repeat('b', 64)]);
        $secondId = DB::table('used_challenges')->insertGetId(['signature' => str_repeat('c', 64)]);

        $this->assertGreaterThan($firstId, $secondId);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && php artisan test --filter=UsedChallengesMigrationTest`
Expected: FAIL — table doesn't exist yet.

- [ ] **Step 3: Create the migration**

Create `api/database/migrations/2026_07_23_000005_create_used_challenges_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('used_challenges')) {
            // Fresh creation (e.g. a wiped TEST database): create it directly
            // in the corrected shape — id as the real primary key, signature
            // as a unique-indexed column instead of the primary key.
            Schema::create('used_challenges', function (Blueprint $table) {
                $table->id();
                $table->char('signature', 64)->unique();
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->nullable();
                $table->index('created_at', 'idx_used_challenges_created');
            });
            return;
        }

        // Table already exists in the OLD shape (created by the old app):
        // signature CHAR(64) is the primary key, no id column at all. Convert
        // it to the corrected shape without losing existing rows.
        if (!Schema::hasColumn('used_challenges', 'id')) {
            // MariaDB requires the new AUTO_INCREMENT column to be part of a
            // key at the moment it's added, so add it with its own unique
            // key first, then swap the primary key, in explicit statements
            // (Laravel's Schema Builder has no single portable helper for
            // "replace the primary key" on an already-populated table).
            DB::statement('ALTER TABLE used_challenges DROP PRIMARY KEY');
            DB::statement('ALTER TABLE used_challenges ADD COLUMN id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY FIRST');
            DB::statement('ALTER TABLE used_challenges ADD UNIQUE KEY used_challenges_signature_unique (signature)');
        }

        if (!Schema::hasColumn('used_challenges', 'updated_at')) {
            Schema::table('used_challenges', function (Blueprint $table) {
                $table->timestamp('updated_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('used_challenges');
    }
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && php artisan test --filter=UsedChallengesMigrationTest`
Expected: PASS, 3/3 tests.

- [ ] **Step 5: Simulate the adoption path against the OLD shape**

Same mechanism as Task 7 Step 6 — a scratch database on the same MariaDB server, selected via `DB_DATABASE`, dropped afterward:

```bash
mysql -h 127.0.0.1 -u root -proot -e "CREATE DATABASE IF NOT EXISTS laravel_scratch_test;"

cd api
DB_DATABASE=laravel_scratch_test php artisan tinker --execute="
use Illuminate\Support\Facades\DB;
DB::statement('CREATE TABLE used_challenges (signature CHAR(64) NOT NULL PRIMARY KEY, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
DB::table('used_challenges')->insert(['signature' => str_repeat('z', 64)]);
"
DB_DATABASE=laravel_scratch_test php artisan migrate --path=database/migrations/2026_07_23_000005_create_used_challenges_table.php --force
DB_DATABASE=laravel_scratch_test php artisan tinker --execute="
use Illuminate\Support\Facades\DB;
echo 'row count: ' . DB::table('used_challenges')->count() . PHP_EOL;
echo 'has id: ' . var_export(Illuminate\Support\Facades\Schema::hasColumn('used_challenges', 'id'), true) . PHP_EOL;
"

mysql -h 127.0.0.1 -u root -proot -e "DROP DATABASE laravel_scratch_test;"
```

Expected: no errors; the output before cleanup shows `row count: 1` (the pre-existing row survived the conversion) and `has id: true`. If your environment's MariaDB root credentials differ from `-u root -proot`, use whatever `ensure-dev-stack.mjs` configured instead.

- [ ] **Step 6: Run the full test suite**

Run: `cd api && php artisan test`
Expected: all tests pass, output pristine.

- [ ] **Step 7: Commit**

```bash
git add api/database/migrations/2026_07_23_000005_create_used_challenges_table.php api/tests/Feature/UsedChallengesMigrationTest.php
git commit -m "feat(api): add used_challenges migration with the primary-key fix"
```

---

### Task 10: Migrate-trigger route and `.env.example` finalization

**Files:**
- Create: `api/app/Http/Controllers/Api/MigrateController.php`
- Modify: `api/routes/api.php`
- Modify: `api/.env.example`
- Test: `api/tests/Feature/MigrateTest.php`

**Interfaces:**
- Consumes: nothing from other tasks (works with whatever migrations exist at the time it's called — Tasks 7-9's migrations are what it'll actually run in this sub-project, but the route itself is generic).
- Produces: `POST /api/migrate`, matching the existing `POST /api/migrate` contract `tools/dbmigrate.mjs` already calls (same URL, same token-based auth) — no changes needed to `tools/dbmigrate.mjs` itself.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use Tests\TestCase;

class MigrateTest extends TestCase
{
    public function test_migrate_requires_a_valid_token(): void
    {
        $response = $this->postJson('/api/migrate', ['token' => 'wrong-token']);

        $response->assertStatus(403);
    }

    public function test_migrate_requires_a_token_at_all(): void
    {
        $response = $this->postJson('/api/migrate', []);

        $response->assertStatus(403);
    }

    public function test_migrate_runs_with_a_valid_token(): void
    {
        config(['app.migrate_token' => 'test-token-123']);

        $response = $this->postJson('/api/migrate', ['token' => 'test-token-123']);

        $response->assertOk()->assertJsonStructure(['ok', 'output']);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && php artisan test --filter=MigrateTest`
Expected: FAIL — route doesn't exist yet (404s).

- [ ] **Step 3: Add the `migrate_token` config key**

Add to `api/config/app.php`'s returned array (any top-level key is fine — this follows Laravel's convention of exposing env-backed config through `config/*.php` rather than reading `env()` directly in application code):

```php
    'migrate_token' => env('MIGRATE_TOKEN'),
```

- [ ] **Step 4: Implement the controller**

Create `api/app/Http/Controllers/Api/MigrateController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

class MigrateController extends Controller
{
    public function __invoke(Request $request)
    {
        $expectedToken = config('app.migrate_token');
        $providedToken = $request->input('token');

        if (!$expectedToken || !$providedToken || !hash_equals($expectedToken, (string) $providedToken)) {
            return response()->json(['error' => 'Invalid or missing token'], 403);
        }

        Artisan::call('migrate', ['--force' => true]);

        return response()->json([
            'ok' => true,
            'output' => Artisan::output(),
        ]);
    }
}
```

- [ ] **Step 5: Register the route**

Add to `api/routes/api.php`:

```php
use App\Http\Controllers\Api\MigrateController;

Route::post('/migrate', MigrateController::class);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd api && php artisan test --filter=MigrateTest`
Expected: PASS, 3/3 tests.

- [ ] **Step 7: Add `MIGRATE_TOKEN` to `.env.example`**

Add to `api/.env.example`:

```
MIGRATE_TOKEN=
```

(Left blank in the example — each server sets its own real value by hand, same operational pattern as the old app's `migrate.token` in `config.php` today.)

- [ ] **Step 8: Run the full test suite**

Run: `cd api && php artisan test`
Expected: all tests pass, output pristine.

- [ ] **Step 9: Commit**

```bash
git add api/app/Http/Controllers/Api/MigrateController.php api/routes/api.php api/config/app.php api/.env.example api/tests/Feature/MigrateTest.php
git commit -m "feat(api): add token-gated migrate route, matching the existing /api/migrate contract"
```
