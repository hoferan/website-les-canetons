# Routing Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one-PHP-file-per-URL with a single front controller + `nikic/fast-route` router, clean URLs with 301 redirects from old `.php` paths, real PSR-4 autoloading for `App\*` classes, and a build step that assembles the FTP deploy payload into a generated `public/` directory.

**Architecture:** `code/` is renamed to `app/` (tracked source, edited in place — home to pages, API endpoints, partials, assets, and namespaced `App\` classes). A new `app/index.php` front controller dispatches every request via `app/src/routes.php`'s route table (clean routes + old-URL 301 redirects) to the appropriate page/API handler, which still `require`s the existing (now-namespaced-caller) page/endpoint file unchanged. `npm run build` copies `app/` into a git-ignored `public/` — the literal FTP payload — plus a production-only Composer `vendor/` installed via `COMPOSER_VENDOR_DIR`.

**Tech Stack:** PHP 8.1, `nikic/fast-route` ^1.3 (new runtime Composer dependency), Composer PSR-4 autoloading, Node.js build/tooling scripts, Docker (local dev + Dockerized Composer/PHP tooling), MariaDB 10.3.

## Global Constraints

- PHP version floor: `>=8.1` (matches prod PHP 8.1.34) — from spec §2, Goal 6 and CLAUDE.md.
- MariaDB 10.3 stays the DB engine; deploy stays **manual FTP** — spec §2 Non-Goals.
- One root `composer.json` — both runtime (`nikic/fast-route`) and dev (`squizlabs/php_codesniffer`) deps, one lockfile — spec §3.
- `app/src/` classes get real PSR-4 namespaces under `App\` — spec §3.
- No Twig/templating changes, no visual/CSS changes, no automated test framework introduced — spec §2 Non-Goals. Page/API internals stay behavior-identical; only reachable path and namespace imports change.
- `public/` is fully generated (git-ignored), never hand-edited — spec §3, §5.
- Every task must leave the site fully working end-to-end (local Docker dev) — no task may land in a broken intermediate state.

---

## Task 1: Rename `code/` → `app/`; update tooling path references

Pure rename — zero PHP behavior change. Every path reference to `code/` across Docker, CI, and lint tooling is updated in lockstep so the site and its checks keep working identically, just under the new directory name.

**Files:**
- Rename: `code/` → `app/` (git mv, all ~76 tracked files move with history)
- Modify: `docker-compose.yml`
- Modify: `package.json`
- Modify: `eslint.config.js`
- Modify: `.prettierignore`
- Modify: `.stylelintrc.json` (comment only)
- Modify: `phpcs.xml`
- Modify: `tools/php-lint.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `docker/web/Dockerfile` (comment only)

**Interfaces:**
- Produces: `app/` as the new source root, used by every subsequent task. `app/index.php` does not exist yet (still `app/index.php` = today's homepage content, unchanged this task).

- [ ] **Step 1: Rename the directory**

```bash
git mv code app
```

- [ ] **Step 2: Update `docker-compose.yml`**

Change the `web` service's source volume:

```yaml
    volumes:
      - ./code:/var/www/html
```

→

```yaml
    volumes:
      - ./app:/var/www/html
```

(Leave the `config/config.docker.php` mount line unchanged — it doesn't reference `code/`.)

- [ ] **Step 3: Update `package.json`**

```json
  "description": "Dev tooling for the buildless Les Canetons de Fribourg website.",
  "scripts": {
    "php:install": "node tools/composer.mjs install --no-interaction",
    "lint:php": "node tools/php-lint.mjs",
    "lint:js": "eslint code/assets/js",
    "lint:css": "stylelint \"code/assets/css/**/*.css\"",
    "format:check": "prettier --check \"code/assets/**/*.{js,css}\"",
    "format:write": "prettier --write \"code/assets/**/*.{js,css}\"",
```

→

```json
  "description": "Dev tooling for the Les Canetons de Fribourg website.",
  "scripts": {
    "php:install": "node tools/composer.mjs install --no-interaction",
    "lint:php": "node tools/php-lint.mjs",
    "lint:js": "eslint app/assets/js",
    "lint:css": "stylelint \"app/assets/css/**/*.css\"",
    "format:check": "prettier --check \"app/assets/**/*.{js,css}\"",
    "format:write": "prettier --write \"app/assets/**/*.{js,css}\"",
```

And the `lint-staged` block:

```json
  "lint-staged": {
    "code/**/*.php": "node tools/php-lint-file.mjs",
    "code/assets/js/**/*.js": [
      "eslint --fix",
      "prettier --write"
    ],
    "code/assets/css/**/*.css": [
      "stylelint --fix",
      "prettier --write"
    ]
  }
```

→

```json
  "lint-staged": {
    "app/**/*.php": "node tools/php-lint-file.mjs",
    "app/assets/js/**/*.js": [
      "eslint --fix",
      "prettier --write"
    ],
    "app/assets/css/**/*.css": [
      "stylelint --fix",
      "prettier --write"
    ]
  }
```

- [ ] **Step 4: Update `eslint.config.js`**

Replace every `code/assets/js` with `app/assets/js` (3 occurrences: the `files` array on lines 7 and 26, and the `ignores` array on line 27):

```js
    files: ['code/assets/js/**/*.js'],
```
→
```js
    files: ['app/assets/js/**/*.js'],
```
(both occurrences), and:
```js
    files: ['code/assets/js/**/*.js'],
    ignores: ['code/assets/js/session.js'],
```
→
```js
    files: ['app/assets/js/**/*.js'],
    ignores: ['app/assets/js/session.js'],
```

- [ ] **Step 5: Update `.prettierignore`**

```
node_modules
vendor
code/dist
```
→
```
node_modules
vendor
public
```

(`code/dist` never existed and is dead; `public/` is the new generated directory that must never be formatted.)

- [ ] **Step 6: Update `.stylelintrc.json`** (comment only, no behavior change)

```json
        "message": "p1 is a non-standard tag used intentionally as a custom element in the PHP templates (see code/commencement.php, code/moniteurs.php, code/partials/footer.php); not a typo for <p>."
```
→
```json
        "message": "p1 is a non-standard tag used intentionally as a custom element in the PHP templates (see app/pages/commencement.php, app/pages/moniteurs.php, app/partials/footer.php); not a typo for <p>."
```

(This anticipates Task 3's move of pages into `app/pages/`; harmless to reference now.)

- [ ] **Step 7: Update `phpcs.xml`**

```xml
    <file>code</file>

    <exclude-pattern>code/vendor/*</exclude-pattern>
    <exclude-pattern>code/dist/*</exclude-pattern>
    <exclude-pattern>*/config.php</exclude-pattern>
```
→
```xml
    <file>app</file>

    <exclude-pattern>*/config.php</exclude-pattern>
```

(`code/vendor` and `code/dist` never existed under `app/` either — Composer vendor dirs live at the repo root or in the generated `public/`, both outside `app/`'s scanned tree.)

- [ ] **Step 8: Update `tools/php-lint.mjs`**

```js
const script = [
  'fail=0',
  "for f in $(find code -name '*.php' -not -path 'code/vendor/*' -not -path 'code/dist/*'); do",
  '  if ! php -l "$f" >/dev/null; then fail=1; fi',
  'done',
```
→
```js
const script = [
  'fail=0',
  "for f in $(find app -name '*.php'); do",
  '  if ! php -l "$f" >/dev/null; then fail=1; fi',
  'done',
```

- [ ] **Step 9: Update `.github/workflows/ci.yml`**

```yaml
      - name: PHP syntax check (php -l)
        run: |
          find code -name '*.php' -not -path 'code/vendor/*' -not -path 'code/dist/*' -print0 \
            | xargs -0 -n1 -P4 php -l
```
→
```yaml
      - name: PHP syntax check (php -l)
        run: |
          find app -name '*.php' -print0 \
            | xargs -0 -n1 -P4 php -l
```

- [ ] **Step 10: Update `docker/web/Dockerfile`** (comment only)

```dockerfile
# mysqli is required by code/src/Database.php and is NOT bundled in the base image.
```
→
```dockerfile
# mysqli is required by app/src/Database.php and is NOT bundled in the base image.
```

- [ ] **Step 11: Verify — lint checks pass under the new paths**

Run: `npm run check`
Expected: all of `lint:php`, `lint:js`, `lint:css`, `format:check`, `guard` pass (identical result to before the rename — only paths changed, no content changed yet, so this must be a clean pass).

- [ ] **Step 12: Verify — site still boots identically in Docker**

```bash
docker compose down
docker compose up -d --build
```

Visit `http://localhost:8090` — the homepage, banner, nav, and images must render exactly as before. Visit `http://localhost:8090/historique.php` — must render normally. This confirms the rename alone didn't break anything (front controller/router don't exist yet — everything is still direct-file access, just from `app/` instead of `code/`).

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "refactor: rename code/ to app/; update tooling paths"
```

---

## Task 2: PSR-4 namespace `App\*` classes; Composer runtime dependency

Introduces the `nikic/fast-route` runtime dependency and gives `Auth`, `Database`, and the three repository classes real `App\` namespaces, autoloaded via Composer. Every direct caller of these classes (not yet relocated — that's Task 3) gets a `use` import. Zero URL/location changes in this task — old `.php` URLs still work exactly as before this task's changes. This task is deliberately a pure refactor: same behavior, real autoloading instead of manual `require`.

**Files:**
- Modify: `composer.json`
- Create/Modify: `composer.lock` (regenerated by Composer)
- Modify: `docker-compose.yml`
- Modify: `app/src/Auth.php`
- Modify: `app/src/Database.php`
- Modify: `app/src/repositories/EventRepository.php`
- Modify: `app/src/repositories/ResponseRepository.php`
- Modify: `app/src/repositories/UserRepository.php`
- Modify: `app/src/bootstrap.php`
- Modify: `app/partials/head.php`
- Modify: `app/sinscrire.php`
- Modify: `app/inscriptions_utilisateurs.php`
- Modify: `app/admin.php`
- Modify: `app/inscriptions_admin.php`
- Modify: `app/api/contact.php`
- Modify: `app/api/logout.php`
- Modify: `app/api/events.php`
- Modify: `app/api/login.php`
- Modify: `app/api/responses.php`
- Modify: `phpcs.xml`

**Interfaces:**
- Consumes: `app/` layout from Task 1.
- Produces: `App\Auth`, `App\Database`, `App\Repositories\{EventRepository,ResponseRepository,UserRepository}` — fully autoloaded, no manual `require` needed anywhere after `vendor/autoload.php` has run once. `app/src/bootstrap.php` now begins with `require __DIR__ . '/../vendor/autoload.php';` — every later task that needs these classes just adds a `use App\...;` import, no `require`.

- [ ] **Step 1: Add the runtime dependency and PSR-4 autoload config to `composer.json`**

Full new content of `composer.json`:

```json
{
    "name": "les-canetons/website",
    "description": "Guggenmusik Les Canetons de Fribourg website — app source in app/, deployed as the built public/ directory.",
    "type": "project",
    "license": "proprietary",
    "require": {
        "php": ">=8.1",
        "nikic/fast-route": "^1.3"
    },
    "require-dev": {
        "squizlabs/php_codesniffer": "^3.10"
    },
    "autoload": {
        "psr-4": {
            "App\\": "app/src/"
        }
    },
    "config": {
        "optimize-autoloader": false,
        "sort-packages": true
    }
}
```

- [ ] **Step 2: Regenerate `composer.lock` and the root `vendor/`**

Run: `npm run php:install`
Expected: exits 0; `composer.lock` is created/updated (now lists `nikic/fast-route`); `vendor/composer/autoload_psr4.php` includes an `App\\` entry pointing at `app/src/`.

- [ ] **Step 3: Mount the root `vendor/` into the Docker web container**

`docker-compose.yml`, `web` service volumes:

```yaml
    volumes:
      - ./app:/var/www/html
      - ./config/config.docker.php:/var/www/html/config.php:ro
```
→
```yaml
    volumes:
      - ./app:/var/www/html
      - ./vendor:/var/www/html/vendor:ro
      - ./config/config.docker.php:/var/www/html/config.php:ro
```

- [ ] **Step 4: Namespace `app/src/Database.php`**

```php
<?php

final class Database
```
→
```php
<?php

namespace App;

final class Database
```

- [ ] **Step 5: Namespace `app/src/repositories/EventRepository.php`**

```php
<?php

final class EventRepository
```
→
```php
<?php

namespace App\Repositories;

final class EventRepository
```

- [ ] **Step 6: Namespace `app/src/repositories/ResponseRepository.php`**

```php
<?php

final class ResponseRepository
```
→
```php
<?php

namespace App\Repositories;

final class ResponseRepository
```

- [ ] **Step 7: Namespace `app/src/repositories/UserRepository.php`**

```php
<?php

final class UserRepository
```
→
```php
<?php

namespace App\Repositories;

final class UserRepository
```

- [ ] **Step 8: Namespace `app/src/Auth.php` and import `UserRepository`**

```php
<?php

final class Auth
```
→
```php
<?php

namespace App;

use App\Repositories\UserRepository;

final class Auth
```

(`Database` needs no import — it's in the same `App` namespace as `Auth`.)

- [ ] **Step 9: Rewrite `app/src/bootstrap.php` to autoload instead of manual `require`**

Full new content:

```php
<?php

// Single entry point for shared logic. The front controller requires this once.

require __DIR__ . '/../vendor/autoload.php';

use App\Auth;
use App\Database;

$config = require __DIR__ . '/../config.php';
Database::connect($config['db']);
// Start the session up front (before any page output) so the authenticated
// role can be read safely everywhere — including public pages whose head.php
// injects it for the UI. Idempotent: guards/login/logout re-call it harmlessly.
Auth::startSession();
```

- [ ] **Step 10: Import `Auth` in `app/partials/head.php`**

```php
<?php /** @var string|null $pageTitle */ /** @var string $pageCss */ ?>
<?php require_once __DIR__ . '/../src/bootstrap.php'; // ensures Auth + session on every page, incl. public ones ?>
```
→
```php
<?php

use App\Auth;

/** @var string|null $pageTitle */
/** @var string $pageCss */
require_once __DIR__ . '/../src/bootstrap.php'; // ensures Auth + session on every page, incl. public ones
?>
```

And later in the same file:
```php
    <script>window.__sessionRole = <?= json_encode(Auth::role()) ?>;</script>
```
stays unchanged (now resolves via the `use` import).

- [ ] **Step 11: Import `Auth` in the 4 gated pages**

`app/sinscrire.php`:
```php
<?php require 'src/bootstrap.php';
Auth::requireLoginPage('sinscrire'); ?>
```
→
```php
<?php

use App\Auth;

require 'src/bootstrap.php';
Auth::requireLoginPage('sinscrire'); ?>
```

`app/inscriptions_utilisateurs.php`:
```php
<?php require 'src/bootstrap.php';
Auth::requireLoginPage('sinscrire'); ?>
```
→
```php
<?php

use App\Auth;

require 'src/bootstrap.php';
Auth::requireLoginPage('sinscrire'); ?>
```

`app/admin.php`:
```php
<?php
require 'src/bootstrap.php';
Auth::requireLoginPage('index');
if (!Auth::canManageEvents()) {
    http_response_code(403);
    exit('Accès refusé');
}
?>
```
→
```php
<?php

use App\Auth;

require 'src/bootstrap.php';
Auth::requireLoginPage('index');
if (!Auth::canManageEvents()) {
    http_response_code(403);
    exit('Accès refusé');
}
?>
```

`app/inscriptions_admin.php`:
```php
<?php
require 'src/bootstrap.php';
Auth::requireLoginPage('index');
if (!Auth::canViewSummary()) {
    http_response_code(403);
    exit('Accès refusé');
}
?>
```
→
```php
<?php

use App\Auth;

require 'src/bootstrap.php';
Auth::requireLoginPage('index');
if (!Auth::canViewSummary()) {
    http_response_code(403);
    exit('Accès refusé');
}
?>
```

- [ ] **Step 12: Import classes in the 5 API files**

`app/api/contact.php`:
```php
<?php

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
```
→
```php
<?php

use App\Database;

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
```

`app/api/logout.php`:
```php
<?php

require __DIR__ . '/../src/bootstrap.php';
Auth::logout();
```
→
```php
<?php

use App\Auth;

require __DIR__ . '/../src/bootstrap.php';
Auth::logout();
```

`app/api/events.php`:
```php
<?php

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
$repo = new EventRepository(Database::get());
```
→
```php
<?php

use App\Auth;
use App\Database;
use App\Repositories\EventRepository;

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
$repo = new EventRepository(Database::get());
```

`app/api/login.php`:
```php
<?php

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
```
→
```php
<?php

use App\Auth;

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
```

`app/api/responses.php`:
```php
<?php

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
$repo = new ResponseRepository(Database::get());
```
→
```php
<?php

use App\Auth;
use App\Database;
use App\Repositories\ResponseRepository;

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
$repo = new ResponseRepository(Database::get());
```

- [ ] **Step 13: Drop the now-stale "buildless, no namespace" exclusion in `phpcs.xml`**

```xml
    <rule ref="PSR12">
        <!-- Buildless app: classes live in the global namespace by design (plain
             `require` wiring in bootstrap.php, no autoloader). Namespacing would
             touch every consumer across code/**.php. -->
        <exclude name="PSR1.Classes.ClassDeclaration.MissingNamespace"/>
    </rule>
```
→
```php
    <rule ref="PSR12"/>
```

(Classes are namespaced now, so the exclusion no longer applies — and no longer needs excluding.)

- [ ] **Step 14: Verify — lint passes**

Run: `npm run check`
Expected: all checks pass (phpcs now actually verifies namespace declarations exist, which they do).

- [ ] **Step 15: Verify — full manual walkthrough on the (still old) URLs**

```bash
docker compose down
docker compose up -d --build
```

In a browser: load `http://localhost:8090/index.php`, confirm the page renders and the login button shows. Log in as `demo.admin` / `demo.moderator` / `demo.user` (password `demo`) via `authentification_inscription.php`, confirm each role's session UI and access matches before (RSVP for `demo.user`, manage events for `demo.admin` via `admin.php`/`planning_repet.php`, logout). This must all still work — only the class-loading mechanism changed, not any URL or behavior.

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "refactor: PSR-4 namespace App\\* classes; add nikic/fast-route dependency"
```

---

## Task 3: Front controller, router, clean URLs, and page/API restructuring

The core of the issue: a single front controller (`app/index.php`) dispatches every request via `nikic/fast-route`, using a route table (`app/src/routes.php`) that maps clean URLs to the existing page/API files (thin `require`, unchanged internals) and old `.php` URLs to 301 redirects. Pages move into `app/pages/`; API files stay at `app/api/` but become reachable only through the router. Every internal link (nav, forms, JS `fetch()` calls, login `returnTo` flow) is updated to the new clean paths. This task must land as one commit — moving pages without the router, or adding the router without moving pages, leaves the site in a broken intermediate state.

**Files:**
- Create: `app/src/routes.php`
- Create: `app/index.php` (front controller — replaces today's homepage content)
- Create: `app/pages/accueil.php` (former `app/index.php` homepage content)
- Move: `app/historique.php` → `app/pages/historique.php` (+ 12 more pages, see Step 3)
- Move: `app/sinscrire.php`, `app/inscriptions_utilisateurs.php`, `app/admin.php`, `app/inscriptions_admin.php` → `app/pages/`
- Modify: `app/partials/navigation.php`
- Modify: `app/partials/head.php`
- Modify: `app/api/contact.php`, `app/api/logout.php`, `app/api/events.php`, `app/api/login.php`, `app/api/responses.php`
- Modify: `app/src/Auth.php`
- Modify: `app/.htaccess`
- Modify: `app/assets/js/main.js`, `admin.js`, `authentification-inscription.js`, `inscriptions_utilisateurs.js`, `sinscrire.js`, `planning_repet.js`, `inscriptions_admin.js`
- Modify: `app/pages/contact.php` (API path + redirect target, on top of the Step 3 move)

**Interfaces:**
- Consumes: `App\Auth`, `App\Database`, `App\Repositories\*` (Task 2), `nikic/fast-route` (Task 2's `composer.json`).
- Produces: the clean-URL route table (page slugs = filename without `.php`; homepage = `/`; API routes = `/api/<name>`), consumed by no later task in this plan but this **is** the contract the next roadmap issue (Twig) builds on: `app/pages/*.php` files are the per-route view files, `app/src/routes.php` is the single place new routes get added.

- [ ] **Step 1: Add nikic/fast-route's `RouteCollector`/`Dispatcher` usage — create `app/src/routes.php`**

```php
<?php

namespace App;

use FastRoute\RouteCollector;

/**
 * Registers every route: clean page/API routes (thin require of the existing
 * page/endpoint file) plus 301-redirect routes for every old .php URL. The
 * single source of truth for the old->new URL mapping.
 */
return function (RouteCollector $r): void {
    $pages = [
        ''                             => 'accueil',
        'historique'                   => 'historique',
        'canetons'                     => 'canetons',
        'cd'                            => 'cd',
        'commencement'                  => 'commencement',
        'moniteurs'                     => 'moniteurs',
        'sponsors'                      => 'sponsors',
        'multimedia'                    => 'multimedia',
        'contact'                       => 'contact',
        'comite_teamdirection'          => 'comite_teamdirection',
        'authentification_inscription'  => 'authentification_inscription',
        'sinscrire'                     => 'sinscrire',
        'confirmation'                  => 'confirmation',
        'inscriptions_utilisateurs'     => 'inscriptions_utilisateurs',
        'planning_repet'                => 'planning_repet',
        'admin'                         => 'admin',
        'inscriptions_admin'            => 'inscriptions_admin',
    ];

    foreach ($pages as $route => $file) {
        $path = $route === '' ? '/' : '/' . $route;
        $r->addRoute('GET', $path, function () use ($file, $route): void {
            $GLOBALS['currentRoute'] = $route;
            require __DIR__ . '/../pages/' . $file . '.php';
        });
        if ($route !== '') {
            // Old direct-file URL -> 301 to the clean route.
            $r->addRoute('GET', '/' . $file . '.php', function () use ($path): void {
                header('Location: ' . $path, true, 301);
                exit;
            });
        }
    }
    // The homepage's old direct-file URL redirects to the root route.
    $r->addRoute('GET', '/index.php', function (): void {
        header('Location: /', true, 301);
        exit;
    });

    $apiMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    $apis = ['contact', 'logout', 'events', 'login', 'responses'];
    foreach ($apis as $name) {
        $r->addRoute($apiMethods, '/api/' . $name, function () use ($name): void {
            require __DIR__ . '/../api/' . $name . '.php';
        });
        $r->addRoute($apiMethods, '/api/' . $name . '.php', function () use ($name): void {
            header('Location: /api/' . $name, true, 301);
            exit;
        });
    }
};
```

- [ ] **Step 2: Create the front controller — `app/index.php`**

This file replaces today's homepage content (which moves to `app/pages/accueil.php` in Step 4).

```php
<?php

require __DIR__ . '/src/bootstrap.php';

use FastRoute\Dispatcher;
use function FastRoute\simpleDispatcher;

$dispatcher = simpleDispatcher(require __DIR__ . '/src/routes.php');
$routeInfo = $dispatcher->dispatch(
    $_SERVER['REQUEST_METHOD'],
    parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)
);

switch ($routeInfo[0]) {
    case Dispatcher::NOT_FOUND:
        http_response_code(404);
        echo '404 Not Found';
        break;
    case Dispatcher::METHOD_NOT_ALLOWED:
        http_response_code(405);
        echo '405 Method Not Allowed';
        break;
    case Dispatcher::FOUND:
        $routeInfo[1]();
        break;
}
```

- [ ] **Step 3: Move the 13 unguarded pages into `app/pages/`**

```bash
mkdir -p app/pages
git mv app/historique.php app/pages/historique.php
git mv app/canetons.php app/pages/canetons.php
git mv app/cd.php app/pages/cd.php
git mv app/commencement.php app/pages/commencement.php
git mv app/moniteurs.php app/pages/moniteurs.php
git mv app/sponsors.php app/pages/sponsors.php
git mv app/multimedia.php app/pages/multimedia.php
git mv app/contact.php app/pages/contact.php
git mv app/comite_teamdirection.php app/pages/comite_teamdirection.php
git mv app/authentification_inscription.php app/pages/authentification_inscription.php
git mv app/confirmation.php app/pages/confirmation.php
git mv app/sinscrire.php app/pages/sinscrire.php
git mv app/inscriptions_utilisateurs.php app/pages/inscriptions_utilisateurs.php
git mv app/planning_repet.php app/pages/planning_repet.php
git mv app/admin.php app/pages/admin.php
git mv app/inscriptions_admin.php app/pages/inscriptions_admin.php
```

In **every one of these 16 files**, fix the 4 partial `require` paths (now one directory deeper than `partials/`, `src/`), e.g. in `app/pages/historique.php`:

```php
require 'partials/head.php'; ?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>
```
→
```php
require __DIR__ . '/../partials/head.php'; ?>
<?php require __DIR__ . '/../partials/banner.php'; ?>
<?php require __DIR__ . '/../partials/navigation.php'; ?>
```
and
```php
<?php require 'partials/footer.php'; ?>
```
→
```php
<?php require __DIR__ . '/../partials/footer.php'; ?>
```

Apply this identical 4-line substitution (`partials/X.php` → `__DIR__ . '/../partials/X.php'`) to all 16 moved files: `historique.php`, `canetons.php`, `cd.php`, `commencement.php`, `moniteurs.php`, `sponsors.php`, `multimedia.php`, `contact.php`, `comite_teamdirection.php`, `authentification_inscription.php`, `confirmation.php`, `sinscrire.php`, `inscriptions_utilisateurs.php`, `planning_repet.php`, `admin.php`, `inscriptions_admin.php`.

For the 4 previously-gated files (`sinscrire.php`, `inscriptions_utilisateurs.php`, `admin.php`, `inscriptions_admin.php`), also **remove** the now-redundant `require 'src/bootstrap.php';` line — the front controller already ran it before dispatching here:

`app/pages/sinscrire.php`:
```php
<?php

use App\Auth;

require 'src/bootstrap.php';
Auth::requireLoginPage('sinscrire'); ?>
```
→
```php
<?php

use App\Auth;

Auth::requireLoginPage('sinscrire'); ?>
```

`app/pages/inscriptions_utilisateurs.php`: identical substitution (same 5 lines).

`app/pages/admin.php`:
```php
<?php

use App\Auth;

require 'src/bootstrap.php';
Auth::requireLoginPage('index');
if (!Auth::canManageEvents()) {
    http_response_code(403);
    exit('Accès refusé');
}
?>
```
→
```php
<?php

use App\Auth;

Auth::requireLoginPage('');
if (!Auth::canManageEvents()) {
    http_response_code(403);
    exit('Accès refusé');
}
?>
```

(`requireLoginPage('index')` → `requireLoginPage('')`: `'index'` was the old direct-file identifier; `''` now means "return to the root route `/`" — see Step 8's `Auth::requireLoginPage` redirect-target fix and the JS fix in Step 10.)

`app/pages/inscriptions_admin.php`:
```php
<?php

use App\Auth;

require 'src/bootstrap.php';
Auth::requireLoginPage('index');
if (!Auth::canViewSummary()) {
    http_response_code(403);
    exit('Accès refusé');
}
?>
```
→
```php
<?php

use App\Auth;

Auth::requireLoginPage('');
if (!Auth::canViewSummary()) {
    http_response_code(403);
    exit('Accès refusé');
}
?>
```

- [ ] **Step 4: Move the homepage into `app/pages/accueil.php`**

```bash
git mv app/index.php app/pages/accueil.php
```

Fix its partial paths the same way as Step 3:

```php
<?php $pageTitle = 'Accueil';
$pageCss = 'accueil.css';
require 'partials/head.php'; ?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>
```
→
```php
<?php $pageTitle = 'Accueil';
$pageCss = 'accueil.css';
require __DIR__ . '/../partials/head.php'; ?>
<?php require __DIR__ . '/../partials/banner.php'; ?>
<?php require __DIR__ . '/../partials/navigation.php'; ?>
```
and
```php
<?php require 'partials/footer.php'; ?>
```
→
```php
<?php require __DIR__ . '/../partials/footer.php'; ?>
```

- [ ] **Step 5: Fix `app/pages/admin.php`'s form actions to clean routes**

```php
    <form method="post" action="planning_repet.php?admin=true">
      <button type="submit">Ajouter un événement</button>
    </form>
    <form method="post" action="index.php" onsubmit="logoutUser()">
```
→
```php
    <form method="post" action="/planning_repet?admin=true">
      <button type="submit">Ajouter un événement</button>
    </form>
    <form method="post" action="/" onsubmit="logoutUser()">
```

- [ ] **Step 6: Fix `app/pages/contact.php`'s API path and redirect target**

```php
  <form id="contact-form" action="api/contact.php" method="POST">
```
→
```php
  <form id="contact-form" action="/api/contact" method="POST">
```

```js
    fetch("api/contact.php", { method: "POST", body: new FormData(this) })
      .then(function (r) {
        if (!r.ok) throw new Error("contact-failed");
        window.location.href = "confirmation.php";
      })
```
→
```js
    fetch("/api/contact", { method: "POST", body: new FormData(this) })
      .then(function (r) {
        if (!r.ok) throw new Error("contact-failed");
        window.location.href = "/confirmation";
      })
```

- [ ] **Step 7: Remove the redundant bootstrap `require` from the 5 API files**

`app/api/contact.php`:
```php
<?php

use App\Database;

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
```
→
```php
<?php

use App\Database;

header('Content-Type: application/json');
```

`app/api/logout.php`:
```php
<?php

use App\Auth;

require __DIR__ . '/../src/bootstrap.php';
Auth::logout();
```
→
```php
<?php

use App\Auth;

Auth::logout();
```

`app/api/events.php`:
```php
<?php

use App\Auth;
use App\Database;
use App\Repositories\EventRepository;

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
$repo = new EventRepository(Database::get());
```
→
```php
<?php

use App\Auth;
use App\Database;
use App\Repositories\EventRepository;

header('Content-Type: application/json');
$repo = new EventRepository(Database::get());
```

`app/api/login.php`:
```php
<?php

use App\Auth;

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
```
→
```php
<?php

use App\Auth;

header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
```

`app/api/responses.php`:
```php
<?php

use App\Auth;
use App\Database;
use App\Repositories\ResponseRepository;

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
$repo = new ResponseRepository(Database::get());
```
→
```php
<?php

use App\Auth;
use App\Database;
use App\Repositories\ResponseRepository;

header('Content-Type: application/json');
$repo = new ResponseRepository(Database::get());
```

- [ ] **Step 8: Fix `Auth::requireLoginPage`'s redirect target in `app/src/Auth.php`**

```php
    public static function requireLoginPage(string $returnTo): void
    {
        if (!self::check()) {
            header('Location: authentification_inscription.php?returnTo=' . urlencode($returnTo));
            exit;
        }
    }
```
→
```php
    public static function requireLoginPage(string $returnTo): void
    {
        if (!self::check()) {
            header('Location: /authentification_inscription?returnTo=' . urlencode($returnTo));
            exit;
        }
    }
```

- [ ] **Step 9: Rewrite `app/partials/navigation.php`'s active-link detection and hrefs**

The old `basename($_SERVER['SCRIPT_NAME'])` technique breaks under a front controller — `SCRIPT_NAME` is always `index.php` now. Use the route slug the front controller already sets in `$GLOBALS['currentRoute']` (see Step 1), and point every link at its clean route:

```php
<?php

$current = basename($_SERVER['SCRIPT_NAME']);
// The two inscription sub-pages highlight the "Inscriptions" (sinscrire) item,
// matching the old setActiveNavigation() behavior.
if ($current === 'inscriptions_admin.php' || $current === 'inscriptions_utilisateurs.php') {
    $current = 'sinscrire.php';
}
$active = fn(string $page): string => $current === $page ? 'active' : '';
?>
<nav class="nav">
  <button
    type="button"
    class="nav-toggle"
    aria-label="Menu de navigation"
    aria-expanded="false"
    aria-controls="nav-menu"
  >
    ☰
  </button>
  <ul id="nav-menu">
    <li class="<?= $active('index.php') ?>"><a href="index.php">Accueil</a></li>
    <li class="<?= $active('commencement.php') ?>"><a href="commencement.php">Commencer les Canetons</a></li>
    <li class="<?= $active('comite_teamdirection.php') ?>"><a href="comite_teamdirection.php">Contact Canetons</a></li>
    <li class="<?= $active('canetons.php') ?>"><a href="canetons.php">Les canetons</a></li>
    <li class="<?= $active('moniteurs.php') ?>"><a href="moniteurs.php">Moniteurs</a></li>
    <li class="<?= $active('planning_repet.php') ?>"><a href="planning_repet.php">Planning et répétitions</a></li>
    <li class="<?= $active('sinscrire.php') ?>"><a href="sinscrire.php">Inscriptions</a></li>
    <li class="<?= $active('cd.php') ?>"><a href="cd.php">CD</a></li>
    <li class="<?= $active('sponsors.php') ?>"><a href="sponsors.php">Sponsors et liens amis</a></li>
    <li class="<?= $active('historique.php') ?>"><a href="historique.php">Historique</a></li>
    <li><a
      href="https://www.flickr.com/photos/201962767@N02/collections"
      id="galerie-link"
      target="_blank"
    >Galerie ↗</a></li>
    <li class="<?= $active('multimedia.php') ?>"><a href="multimedia.php">Multimédia</a></li>
    <li class="nav-auth"><a href="#" id="nav-auth-link">Connexion</a></li>
  </ul>
</nav>
</header>
```
→
```php
<?php

$current = $GLOBALS['currentRoute'] ?? '';
// The two inscription sub-pages highlight the "Inscriptions" (sinscrire) item,
// matching the old setActiveNavigation() behavior.
if ($current === 'inscriptions_admin' || $current === 'inscriptions_utilisateurs') {
    $current = 'sinscrire';
}
$active = fn(string $page): string => $current === $page ? 'active' : '';
?>
<nav class="nav">
  <button
    type="button"
    class="nav-toggle"
    aria-label="Menu de navigation"
    aria-expanded="false"
    aria-controls="nav-menu"
  >
    ☰
  </button>
  <ul id="nav-menu">
    <li class="<?= $active('') ?>"><a href="/">Accueil</a></li>
    <li class="<?= $active('commencement') ?>"><a href="/commencement">Commencer les Canetons</a></li>
    <li class="<?= $active('comite_teamdirection') ?>"><a href="/comite_teamdirection">Contact Canetons</a></li>
    <li class="<?= $active('canetons') ?>"><a href="/canetons">Les canetons</a></li>
    <li class="<?= $active('moniteurs') ?>"><a href="/moniteurs">Moniteurs</a></li>
    <li class="<?= $active('planning_repet') ?>"><a href="/planning_repet">Planning et répétitions</a></li>
    <li class="<?= $active('sinscrire') ?>"><a href="/sinscrire">Inscriptions</a></li>
    <li class="<?= $active('cd') ?>"><a href="/cd">CD</a></li>
    <li class="<?= $active('sponsors') ?>"><a href="/sponsors">Sponsors et liens amis</a></li>
    <li class="<?= $active('historique') ?>"><a href="/historique">Historique</a></li>
    <li><a
      href="https://www.flickr.com/photos/201962767@N02/collections"
      id="galerie-link"
      target="_blank"
    >Galerie ↗</a></li>
    <li class="<?= $active('multimedia') ?>"><a href="/multimedia">Multimédia</a></li>
    <li class="nav-auth"><a href="#" id="nav-auth-link">Connexion</a></li>
  </ul>
</nav>
</header>
```

- [ ] **Step 10: Remove the now-redundant bootstrap `require_once` from `app/partials/head.php`**

The front controller always runs `bootstrap.php` before any page/partial is reached (see Step 12, which blocks direct access to `pages/`/`api/`), so this defensive require is dead weight:

```php
<?php

use App\Auth;

/** @var string|null $pageTitle */
/** @var string $pageCss */
require_once __DIR__ . '/../src/bootstrap.php'; // ensures Auth + session on every page, incl. public ones
?>
```
→
```php
<?php

use App\Auth;

/** @var string|null $pageTitle */
/** @var string $pageCss */
?>
```

- [ ] **Step 11: Update all internal-link/`fetch()` call sites in `app/assets/js/`**

`main.js`:
```js
// Current page identifier (without the .php extension), used for returnTo links.
var currentPage = window.location.pathname.split("/").pop().replace(".php", "");
```
→
```js
// Current page identifier (the route slug), used for returnTo links.
var currentPage = window.location.pathname.split("/").pop();
```

```js
      fetch("api/logout.php", { method: "POST" }).finally(function () {
        window.location.href = "index.php";
      });
    });
  } else {
    el.textContent = "Connexion";
    el.addEventListener("click", function (e) {
      e.preventDefault();
      window.location.href = "authentification_inscription.php?returnTo=" + currentPage;
```
→
```js
      fetch("/api/logout", { method: "POST" }).finally(function () {
        window.location.href = "/";
      });
    });
  } else {
    el.textContent = "Connexion";
    el.addEventListener("click", function (e) {
      e.preventDefault();
      window.location.href = "/authentification_inscription?returnTo=" + currentPage;
```

`admin.js`:
```js
function logoutUser() {
  fetch("api/logout.php", { method: "POST" }).finally(function () {
    window.location.href = "index.php";
  });
}
```
→
```js
function logoutUser() {
  fetch("/api/logout", { method: "POST" }).finally(function () {
    window.location.href = "/";
  });
}
```

`authentification-inscription.js`:
```js
var returnToPage = urlParams.get("returnTo");
returnToPage = returnToPage ? returnToPage + ".php" : "index.php";
```
→
```js
var returnToPage = urlParams.get("returnTo");
returnToPage = returnToPage ? "/" + returnToPage : "/";
```

```js
  fetch("api/login.php", {
```
→
```js
  fetch("/api/login", {
```

`inscriptions_utilisateurs.js`:
```js
    fetch("api/responses.php", {
```
→
```js
    fetch("/api/responses", {
```

```js
        window.location.href = "sinscrire.php";
```
→
```js
        window.location.href = "/sinscrire";
```

`sinscrire.js`:
```js
  fetch("api/events.php", { method: "GET" })
```
→
```js
  fetch("/api/events", { method: "GET" })
```

```js
          window.location.href = "inscriptions_utilisateurs.php?id=" + item.id;
```
→
```js
          window.location.href = "/inscriptions_utilisateurs?id=" + item.id;
```

```js
        window.location.href = "inscriptions_admin.php?id=" + item.id;
```
→
```js
        window.location.href = "/inscriptions_admin?id=" + item.id;
```

`planning_repet.js` (4 occurrences — lines 30, 127, 145, 218):
```js
  fetch("api/events.php", {
```
→
```js
  fetch("/api/events", {
```
(applies to the occurrence at line 30)

```js
    fetch("api/events.php", {
      method: "PUT",
```
→
```js
    fetch("/api/events", {
      method: "PUT",
```

```js
    fetch("api/events.php", {
      method: "POST",
```
→
```js
    fetch("/api/events", {
      method: "POST",
```

```js
      fetch("api/events.php?id=" + event.id, {
```
→
```js
      fetch("/api/events?id=" + event.id, {
```

`inscriptions_admin.js`:
```js
  fetch("api/responses.php?eventId=" + encodeURIComponent(eventId), { method: "GET" })
```
→
```js
  fetch("/api/responses?eventId=" + encodeURIComponent(eventId), { method: "GET" })
```

- [ ] **Step 12: Rewrite `app/.htaccess`** for the front-controller rewrite and to block direct access to internal-only directories

Full new content:

```apache
RewriteEngine on

# Legacy URL redirect. Old .html pages were migrated to .php, so any request
# for a .html file is permanently redirected (301) to the matching .php file.
# This keeps old bookmarks, inbound links, and search-engine results working,
# and tells search engines to update their index to the new .php URL.
RedirectMatch 301 ^(.*)\.html$ $1.php

# Deny direct web access to internal-only paths. pages/ and api/ are only
# ever reached via require() from the front controller (which has already
# run bootstrap.php); vendor/ and config.php must never be served directly.
RewriteRule ^pages/ - [F,L]
RewriteRule ^api/ - [F,L]
RewriteRule ^vendor/ - [F,L]
RewriteRule ^config\.php$ - [F,L]

# Front controller: any request that isn't an existing real file or directory
# (so assets/css, assets/js, assets/img keep serving directly) is dispatched
# to index.php, which routes it — see src/routes.php.
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.php [L]

# Cache policy for this site.
#
# HTML / CSS / JS are edited in place (no versioned filenames), so we tell
# browsers to ALWAYS revalidate them with the server before reuse. Apache
# returns a fast "304 Not Modified" when the file is unchanged, or the new file
# the moment you deploy one. This means deploys are picked up automatically —
# visitors do not need to hard-refresh (Ctrl+F5).
<IfModule mod_headers.c>
  <FilesMatch "\.(html|css|js)$">
    Header set Cache-Control "public, max-age=0, must-revalidate"
  </FilesMatch>
</IfModule>

# Images change rarely; let them cache for a day to stay fast. Bump the file
# name (or clear this rule) if you ever need an image to update immediately.
<IfModule mod_expires.c>
  ExpiresActive On
  <FilesMatch "\.(jpg|jpeg|png|gif|svg|ico|webp)$">
    ExpiresDefault "access plus 1 day"
  </FilesMatch>
</IfModule>
```

- [ ] **Step 13: Verify — lint passes**

Run: `npm run check`
Expected: all checks pass.

- [ ] **Step 14: Verify — full manual walkthrough on the NEW clean URLs**

```bash
docker compose down
docker compose up -d --build
```

In a browser:
1. Visit `http://localhost:8090/` — homepage renders (was `/index.php`).
2. Visit `http://localhost:8090/historique.php` — must 301-redirect to `/historique`, which renders normally. Repeat for at least 2 more old page URLs (e.g. `/canetons.php`, `/admin.php`).
3. Visit `http://localhost:8090/api/login.php` with a POST (or just confirm in devtools that old-path `fetch` calls no longer exist) — not required to manually test, but confirm no JS console errors on any page (which would indicate a stale `.php`-suffixed `fetch()` call was missed).
4. Click every nav link — each must land on its clean URL and the correct nav item must show `active`.
5. Log in as `demo.user`, RSVP to an event via `/sinscrire` → `/inscriptions_utilisateurs`, confirm the response saves and redirects to `/sinscrire`.
6. Log in as `demo.admin`, add an event via `/admin` → `/planning_repet?admin=true`, confirm it saves; view `/inscriptions_admin` summary.
7. Click "Déconnexion" — confirm it redirects to `/` and the session clears.
8. Click "Connexion" while logged out on a non-home page (e.g. `/historique`) — confirm it goes to `/authentification_inscription?returnTo=historique`, and after logging in, redirects back to `/historique`.
9. Confirm `http://localhost:8090/pages/historique.php` and `http://localhost:8090/vendor/autoload.php` both return `403 Forbidden` (direct access correctly blocked).

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "feat: add front controller + fast-route router with clean URLs and old-URL redirects"
```

---

## Task 4: Build pipeline (`npm run build` → `public/`)

Assembles the FTP-ready deploy artifact: a full copy of `app/` plus a production-only Composer `vendor/`, installed via `COMPOSER_VENDOR_DIR` so no second `composer.json` is needed.

**Files:**
- Create: `tools/build.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `app/` (Tasks 1–3), root `composer.json`/`composer.lock` (Task 2).
- Produces: `public/` — a complete, ready-to-FTP-upload directory tree, git-ignored, regenerated on every `npm run build`.

- [ ] **Step 1: Create `tools/build.mjs`**

```js
// Assembles public/ — the FTP-ready deploy artifact — from app/ plus a
// production-only Composer vendor/ (installed via COMPOSER_VENDOR_DIR, no
// second composer.json needed). Never hand-edit public/; it's regenerated
// on every run.
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';

const mount = process.cwd().split('\\').join('/');

rmSync('public', { recursive: true, force: true });
cpSync('app', 'public', { recursive: true });

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

console.log('Built public/ — ready to FTP upload.');
```

- [ ] **Step 2: Register the `build` script in `package.json`**

```json
    "php:install": "node tools/composer.mjs install --no-interaction",
```
→
```json
    "php:install": "node tools/composer.mjs install --no-interaction",
    "build": "node tools/build.mjs",
```

- [ ] **Step 3: Ignore the generated `public/` directory**

`.gitignore`:
```
# dependencies (dev-only tooling; never deployed)
/node_modules/
/vendor/
```
→
```
# dependencies (dev-only tooling; never deployed)
/node_modules/
/vendor/

# generated FTP deploy artifact (npm run build); never hand-edit or commit
/public/
```

- [ ] **Step 4: Verify — the build runs and produces a complete `public/`**

Run: `npm run build`
Expected: exits 0; prints `Built public/ — ready to FTP upload.`

```bash
test -f public/index.php && echo "front controller: OK"
test -d public/pages && echo "pages: OK"
test -d public/api && echo "api: OK"
test -d public/vendor/nikic/fast-route && echo "runtime vendor: OK"
test ! -d public/vendor/squizlabs && echo "dev deps excluded: OK"
```
Expected: all five lines print.

- [ ] **Step 5: Verify — `public/` serves correctly (parity with `app/`)**

Temporarily point Docker at the built artifact to confirm it behaves identically to Task 3's verified `app/`-based dev setup:

```bash
docker compose down
```

Edit `docker-compose.yml`'s `web` volumes, temporarily replacing `./app:/var/www/html` with `./public:/var/www/html` and removing the separate `./vendor:/var/www/html/vendor:ro` line (the built `public/vendor` already contains everything needed):

```bash
docker compose up -d --build
```

Visit `http://localhost:8090/`, click through nav links, and confirm `http://localhost:8090/historique.php` still 301-redirects to `/historique`. This confirms `public/` is a correct, self-contained deploy artifact.

**Revert** `docker-compose.yml` back to mounting `./app` + `./vendor` (local dev must keep using `app/` directly, per the spec's instant-edit-loop requirement — `public/` is deploy-only):

```bash
docker compose down
docker compose up -d --build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add npm run build assembling the public/ deploy artifact"
```

---

## Task 5: CI build gate; update CLAUDE.md and README.md

Adds a CI job that fails if `npm run build` breaks, and brings the two project docs in line with the new architecture — both explicitly contradict statements the earlier tasks just made false (see spec §8).

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `CLAUDE.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `npm run build` (Task 4).
- Produces: nothing consumed by later tasks — this is the terminal task of the plan.

- [ ] **Step 1: Add a `build` job to `.github/workflows/ci.yml`**

Add this job alongside the existing `php`, `assets`, and `guard` jobs (same file, top-level `jobs:` key):

```yaml
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install Node dev tools
        run: npm ci
      - name: Build deploy artifact
        run: npm run build
      - name: Verify public/ was produced
        run: test -f public/index.php && test -d public/vendor
```

- [ ] **Step 2: Rewrite `CLAUDE.md`'s Tech Stack section**

```markdown
## Tech Stack

- **PHP 8.1** (matches prod: PHP 8.1.34), **buildless** — no framework, no bundler,
  no runtime dependencies. Files are edited in place and deployed as-is.
- **MariaDB 10.3** (prod: 10.3.8) via the `mysqli` extension.
- **Vanilla JS + CSS** under `code/assets/` — no build step.
- **Apache** with `.htaccess` (cache policy) on `easy-hebergement.net` shared hosting.
- **Deployment:** manual FTP/SFTP upload of `code/`.
- **Dev tooling (never deployed):** Composer + PHP_CodeSniffer (PSR-12); Node with
  Prettier, ESLint, Stylelint; Husky + lint-staged; Docker Compose for local dev.
```
→
```markdown
## Tech Stack

- **PHP 8.1** (matches prod: PHP 8.1.34). `app/src/` classes are PSR-4
  autoloaded under the `App\` namespace via Composer.
- **MariaDB 10.3** (prod: 10.3.8) via the `mysqli` extension.
- **Vanilla JS + CSS** under `app/assets/` — no bundler (a JS/CSS build
  pipeline is a separate, later roadmap item).
- **Router:** `nikic/fast-route`, dispatched through a single front
  controller (`app/index.php`). Clean URLs; old `.php` URLs 301-redirect.
- **Apache** with `.htaccess` (front-controller rewrite + cache policy) on
  `easy-hebergement.net` shared hosting.
- **Build step:** `npm run build` assembles `app/` + a production-only
  Composer `vendor/` into a generated `public/` directory — the actual FTP
  payload. `public/` is git-ignored and never hand-edited.
- **Deployment:** manual FTP/SFTP upload of `public/`'s contents (built
  fresh via `npm run build` before each deploy).
- **Dev tooling (never deployed):** Composer + PHP_CodeSniffer (PSR-12); Node with
  Prettier, ESLint, Stylelint; Husky + lint-staged; Docker Compose for local dev.
```

- [ ] **Step 3: Rewrite `CLAUDE.md`'s Architecture section**

```markdown
## Architecture

- **`code/` is the exact FTP payload.** Never put dev-only files in it. All tooling
  lives at the repo root (`composer.json`, `package.json`, `phpcs.xml`, `docker/`,
  `config/`, `tools/`, `.github/`).
- **Entry point:** every page includes `partials/head.php`, which requires
  `code/src/bootstrap.php`. `bootstrap.php` loads `config.php`, connects the DB
  (`Database`), and starts the session (`Auth`).
- **No autoloader:** `src/` classes are wired via explicit `require` in `bootstrap.php`.
- **Auth:** `Auth` holds a capability matrix — `user`/`moderator` may `respond`;
  `admin` may `manage_events` / `view_summary`. Not a hierarchy. `assets/js/session.js`
  mirrors it on the client; the server session (`window.__sessionRole`) is source of truth.
- **API:** `code/api/*.php` return JSON and guard with `Auth::require*`.
- **Config:** the real `code/config.php` is git-ignored and uploaded via FTP. Create it
  locally with `cp config/config.example.php code/config.php`. For Docker, the stack
  mounts `config/config.docker.php` into the container instead.
```
→
```markdown
## Architecture

- **`app/` is the tracked source; `public/` is the generated FTP payload.**
  `public/` is produced by `npm run build` and is never hand-edited or committed.
  Never put dev-only files in `app/`. All tooling lives at the repo root
  (`composer.json`, `package.json`, `phpcs.xml`, `docker/`, `config/`, `tools/`,
  `.github/`).
- **Entry point:** `app/index.php` is the single front controller. It requires
  `app/src/bootstrap.php` (autoload + DB connect + session start), then
  dispatches via `nikic/fast-route` using the route table in
  `app/src/routes.php`. Route handlers `require` the matching file under
  `app/pages/` or `app/api/` — both blocked from direct web access by
  `.htaccess`, reachable only through the router.
- **PSR-4 autoloading:** `app/src/` classes are namespaced under `App\` and
  autoloaded via Composer (`composer.json`'s `autoload.psr-4`). No manual
  `require` needed once `vendor/autoload.php` has run (done once, in
  `bootstrap.php`).
- **Auth:** `App\Auth` holds a capability matrix — `user`/`moderator` may
  `respond`; `admin` may `manage_events` / `view_summary`. Not a hierarchy.
  `assets/js/session.js` mirrors it on the client; the server session
  (`window.__sessionRole`) is source of truth.
- **API:** `app/api/*.php` return JSON, reached via `/api/*` clean routes, and
  guard with `Auth::require*`.
- **Config:** the real `app/config.php` is git-ignored. Create it locally with
  `cp config/config.example.php app/config.php`. For Docker, the stack mounts
  `config/config.docker.php` into the container instead. `npm run build`
  copies `app/config.php` into `public/config.php` if present — **do not**
  let this overwrite a production server's `config.php` when FTP-syncing;
  exclude it from the upload selection.
```

- [ ] **Step 4: Update `CLAUDE.md`'s Dos and Don'ts**

```markdown
## Dos

- Keep the site buildless; edit JS/CSS in place.
- Match production versions (PHP 8.1, MariaDB 10.3).
- Run `npm run check` before pushing.
- Put new tooling/config at the repo root, never in `code/`.

## Don'ts

- Never commit `code/config.php` or any production data / DB dump.
- Never introduce a runtime build step or framework for the deployed site.
- Never store real member data or passwords in seed files.
```
→
```markdown
## Dos

- Edit `app/` source in place; run `npm run build` before every FTP deploy.
- Match production versions (PHP 8.1, MariaDB 10.3).
- Run `npm run check` before pushing.
- Put new tooling/config at the repo root, never in `app/`.
- Add new routes in one place: `app/src/routes.php`.

## Don'ts

- Never commit `app/config.php`, `public/`, or any production data / DB dump.
- Never hand-edit `public/` — it's fully regenerated by `npm run build`.
- Never store real member data or passwords in seed files.
```

- [ ] **Step 5: Rewrite `README.md`**

```markdown
## Tech stack

- **PHP 8.1**, **buildless** — no framework, no bundler, no runtime dependencies.
- **MariaDB 10.3** via `mysqli`.
- **Vanilla JS + CSS** (no build step), served by **Apache** with `.htaccess`.
- Hosted on `easy-hebergement.net` shared hosting; deployed by **manual FTP** of `code/`.
```
→
```markdown
## Tech stack

- **PHP 8.1**, PSR-4 autoloaded `App\*` classes, routed through a single
  front controller (`nikic/fast-route`).
- **MariaDB 10.3** via `mysqli`.
- **Vanilla JS + CSS** (no bundler yet), served by **Apache** with `.htaccess`.
- Hosted on `easy-hebergement.net` shared hosting; deployed by **manual FTP**
  of the built `public/` directory (`npm run build`).
```

```markdown
## Project structure

```
code/          The exact FTP deploy payload — pages, api/, assets/, partials/, src/, .htaccess
config/        Config templates (config.example.php) + local Docker config (config.docker.php)
docker/        Local dev stack (web Dockerfile, DB schema + synthetic seed)
tools/         Cross-platform dev scripts (Dockerized PHP lint, secret guard)
docs/          Design specs and implementation plans
.github/       CI workflow, PR & issue templates
```

`code/` contains **only** files that get deployed. All tooling lives at the repo root.
```
→
```markdown
## Project structure

```
app/           Tracked source — pages/, api/, assets/, partials/, src/ (App\* classes), .htaccess
public/        Generated FTP deploy payload (npm run build). Git-ignored; never hand-edited.
config/        Config templates (config.example.php) + local Docker config (config.docker.php)
docker/        Local dev stack (web Dockerfile, DB schema + synthetic seed)
tools/         Cross-platform dev scripts (Dockerized PHP/Composer, build, secret guard)
docs/          Design specs and implementation plans
.github/       CI workflow, PR & issue templates
```

`app/` is the source you edit. `public/` is what actually gets deployed — always
rebuild it (`npm run build`) before an FTP upload.
```

```markdown
## Configuration

The real `code/config.php` holds DB credentials, is **git-ignored**, and is uploaded
via FTP. Create it locally with:

```bash
cp config/config.example.php code/config.php
```

Local Docker uses `config/config.docker.php` automatically (mounted into the container).

## Deployment

Buildless — upload the contents of `code/` to the host via FTP/SFTP. There is no build
step; JS/CSS are edited in place.
```
→
```markdown
## Configuration

The real `app/config.php` holds DB credentials and is **git-ignored**. Create it
locally with:

```bash
cp config/config.example.php app/config.php
```

Local Docker uses `config/config.docker.php` automatically (mounted into the container).

## Deployment

```bash
npm run build
```

Upload the contents of the generated `public/` directory to the host via FTP/SFTP.
`public/` is regenerated fresh on every run — never edit it by hand. When
syncing, keep the server's existing `config.php` in place (exclude it from the
upload, or maintain a separate local prod-values copy of `app/config.php` used
only for from-scratch deploys) — `npm run build` will happily copy whatever
local `app/config.php` you have, which is a dev convenience, not a production
config source.
```

- [ ] **Step 6: Verify — CI passes end-to-end**

Push the branch (or run locally): confirm all four CI jobs (`php`, `assets`, `guard`, `build`) pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: update CLAUDE.md and README.md for app/public split; add CI build gate"
```

---

## Final verification (spec §9)

After Task 5, re-run the full manual checklist from Task 3 Step 14 one more time against a freshly built `public/`-served instance (per Task 4 Step 5's procedure) to confirm the end-to-end deploy artifact — not just the `app/`-mounted dev setup — is fully correct before considering this issue done.
