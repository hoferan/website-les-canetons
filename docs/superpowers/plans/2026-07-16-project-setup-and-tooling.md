# Project Setup & Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the "Les Canetons de Fribourg" repository with a clean deploy boundary, dev linting/formatting for PHP + JS/CSS, a Docker Compose local environment matching production, git hooks, CI, and a complete `CLAUDE.md` — without changing any application behavior.

**Architecture:** The app stays a buildless PHP site in `code/` (the exact FTP payload). All dev tooling lives at the repo root: Composer (PHP_CodeSniffer), Node (Prettier/ESLint/Stylelint/Husky), a top-level `config/` for config templates + the Docker config, `docker/` for the local stack, and `.github/` for CI. Portable Node scripts under `tools/` provide cross-platform lint/guard runners.

**Tech Stack:** PHP 8.1, MariaDB 10.3, mysqli, vanilla JS/CSS, Composer, Node 20, ESLint 9 (flat config), Stylelint 16, Prettier 3, Husky 9, lint-staged 15, Docker Compose, GitHub Actions.

## Global Constraints

- **PHP 8.1** and **MariaDB 10.3** everywhere (matches prod: PHP 8.1.34 / MariaDB 10.3.8).
- **`code/` is the FTP payload only** — no dev-only files inside it. All tooling at repo root.
- **Buildless** deployed site — no bundler/transpiler output ships; JS/CSS edited in place.
- **Never commit** `code/config.php` (real secrets) or any production data / DB dump.
- **Synthetic seed data only** — no real member names or passwords in git.
- Dev dependencies (`vendor/`, `node_modules/`) are never uploaded via FTP.
- **PHP/Composer are NOT installed on the dev machine.** Local PHP tooling (`php -l`, phpcs, phpcbf, composer) runs inside `php:8.1-cli` / `composer:2` Docker containers via cross-platform Node wrappers in `tools/`. Node, npm, and Docker ARE installed locally. CI runs PHP tooling natively via `shivammathur/setup-php` (no Docker in CI).
- Preserve the existing Superpowers Skills table in `CLAUDE.md`.

---

### Task 1: Repository hygiene — deploy boundary, `.gitignore`, `config/`

Establishes the `code/`-is-payload invariant: expands `.gitignore`, removes the stray empty `dist/`, and moves the config template into a new top-level `config/`.

**Files:**
- Modify: `.gitignore`
- Delete: `code/dist/` (empty dir)
- Move: `code/config.example.php` → `config/config.example.php`

**Interfaces:**
- Produces: `config/config.example.php` (the committed config template later tasks and CLAUDE.md reference); the `config/` directory that Task 5 adds `config.docker.php` to.

- [ ] **Step 1: Replace `.gitignore` with the expanded version**

```gitignore
# secrets & local-only
config.php
.env

# real prod data — never commit (use the synthetic Docker seed instead)
*.dump.sql
prod-*.sql

# dependencies (dev-only tooling; never deployed)
/node_modules/
/vendor/

# linter / tool caches
.php-cs-fixer.cache
.phpcs.cache

# OS / editor junk
.DS_Store
Thumbs.db
desktop.ini
.idea/
```

- [ ] **Step 2: Move the config template out of `code/`**

Run:
```bash
mkdir -p config
git mv code/config.example.php config/config.example.php
```
Expected: `config/config.example.php` exists; `code/config.example.php` gone.

- [ ] **Step 3: Remove the empty `dist/` directory**

Run:
```bash
rmdir code/dist
```
Expected: no error (it is empty). If it does not exist, skip.

- [ ] **Step 4: Verify the deploy boundary holds**

Run:
```bash
ls config
git status --short
git ls-files code/ | grep -E 'config\.(example\.)?php|/dist/' || echo "code/ has no config.example or dist — good"
```
Expected: `config/config.example.php` listed; the grep prints the "good" message (only the real, git-ignored `config.php` may sit in `code/`, and it is untracked).

- [ ] **Step 5: Commit**

```bash
git add .gitignore config/config.example.php
git add -u code/
git commit -m "chore: expand .gitignore and move config template to config/"
```

---

### Task 2: PHP linting via Docker — Composer + PHP_CodeSniffer

PHP/Composer are not installed locally, so this task creates the PHP tooling config plus cross-platform Node wrappers that run PHP inside Docker (`php:8.1-cli`, `composer:2`), then installs the dev dependency and normalizes existing PHP to PSR-12. CI runs these tools natively (Task 6); the committed `composer.json`/`phpcs.xml` serve both paths.

**Files:**
- Create: `composer.json`
- Create: `phpcs.xml`
- Create: `tools/php-in-docker.mjs`
- Create: `tools/composer.mjs`
- Create: `tools/php-lint.mjs`
- Create: `tools/php-fix.mjs`
- Create: `tools/php-lint-file.mjs`
- Create (generated): `composer.lock`, `vendor/` (git-ignored)

**Interfaces:**
- Requires: Docker running locally.
- Produces: `vendor/squizlabs/php_codesniffer/bin/phpcs` (run via the wrappers); runnable scripts `node tools/composer.mjs <args>`, `node tools/php-lint.mjs` (full `php -l` sweep + phpcs), `node tools/php-fix.mjs` (phpcbf), `node tools/php-lint-file.mjs <files...>` (staged-file lint). Task 3 wires these into `package.json`; Task 4 uses `php-lint-file.mjs` in lint-staged.

- [ ] **Step 1: Create `composer.json`**

```json
{
    "name": "les-canetons/website",
    "description": "Dev tooling for the buildless Guggenmusik Les Canetons de Fribourg website.",
    "type": "project",
    "license": "proprietary",
    "require": {
        "php": ">=8.1"
    },
    "require-dev": {
        "squizlabs/php_codesniffer": "^3.10"
    },
    "config": {
        "optimize-autoloader": false,
        "sort-packages": true
    }
}
```

- [ ] **Step 2: Create `phpcs.xml`**

```xml
<?xml version="1.0"?>
<ruleset name="LesCanetons">
    <description>PSR-12 for the site's PHP (buildless, PHP 8.1).</description>

    <file>code</file>

    <exclude-pattern>code/vendor/*</exclude-pattern>
    <exclude-pattern>code/dist/*</exclude-pattern>
    <exclude-pattern>*/config.php</exclude-pattern>

    <arg name="extensions" value="php"/>
    <arg name="colors"/>
    <arg value="sp"/>

    <!-- Warnings (e.g. unavoidable long URLs) stay visible but do not fail the
         build, so a clean tree exits 0 for npm run check / CI. Errors stay fatal. -->
    <config name="ignore_warnings_on_exit" value="1"/>

    <rule ref="PSR12">
        <!-- Buildless app: classes live in the global namespace by design (plain
             `require` wiring in bootstrap.php, no autoloader). Namespacing would
             touch every consumer across code/**.php. -->
        <exclude name="PSR1.Classes.ClassDeclaration.MissingNamespace"/>
    </rule>
</ruleset>
```

- [ ] **Step 3: Create `tools/php-in-docker.mjs`**

```javascript
// Runs a shell command inside a php:8.1-cli container with the repo mounted
// at /app. Lets the project lint PHP without a local PHP install — the
// container matches production (PHP 8.1). Requires Docker to be running.
import { execFileSync } from 'node:child_process';

// Forward slashes so the bind mount works on Windows Docker Desktop too.
const mount = process.cwd().split('\\').join('/');

export function runInPhp(shellCommand) {
  execFileSync(
    'docker',
    ['run', '--rm', '-v', `${mount}:/app`, '-w', '/app', 'php:8.1-cli', 'sh', '-c', shellCommand],
    { stdio: 'inherit' }
  );
}
```

- [ ] **Step 4: Create `tools/composer.mjs`**

```javascript
// Runs Composer inside the official composer:2 container (repo mounted at
// /app) so no local Composer/PHP install is needed.
// Usage: node tools/composer.mjs install --no-interaction
import { execFileSync } from 'node:child_process';

const mount = process.cwd().split('\\').join('/');
const args = process.argv.slice(2);

execFileSync('docker', ['run', '--rm', '-v', `${mount}:/app`, '-w', '/app', 'composer:2', ...args], {
  stdio: 'inherit',
});
```

- [ ] **Step 5: Create `tools/php-lint.mjs`**

```javascript
// Full PHP check: `php -l` over every code/**.php, then PHP_CodeSniffer,
// all in one php:8.1-cli container. `php -l` parse errors surface on stderr.
import { runInPhp } from './php-in-docker.mjs';

const script = [
  'fail=0',
  "for f in $(find code -name '*.php' -not -path 'code/vendor/*' -not -path 'code/dist/*'); do",
  '  if ! php -l "$f" >/dev/null; then fail=1; fi',
  'done',
  '[ "$fail" -eq 0 ] || { echo "php -l: syntax errors above"; exit 1; }',
  'echo "php -l: OK"',
  'php vendor/squizlabs/php_codesniffer/bin/phpcs --standard=phpcs.xml',
].join('\n');

try {
  runInPhp(script);
} catch {
  process.exit(1);
}
```

- [ ] **Step 6: Create `tools/php-fix.mjs`**

```javascript
// Auto-fixes PHP to PSR-12 with phpcbf (inside php:8.1-cli). phpcbf exits
// non-zero when it successfully fixes files, so a throw here is expected —
// verify the result with `node tools/php-lint.mjs` afterwards.
import { runInPhp } from './php-in-docker.mjs';

try {
  runInPhp('php vendor/squizlabs/php_codesniffer/bin/phpcbf --standard=phpcs.xml');
} catch {
  // phpcbf returns 1 when it fixed something — not a failure for our purposes.
}
```

- [ ] **Step 7: Create `tools/php-lint-file.mjs`**

```javascript
// lint-staged entry for staged .php files: `php -l` each + phpcs, in one
// php:8.1-cli container. Receives absolute paths; converts to repo-relative.
import { relative } from 'node:path';
import { runInPhp } from './php-in-docker.mjs';

const files = process.argv.slice(2).map((f) => relative(process.cwd(), f).split('\\').join('/'));
if (files.length === 0) process.exit(0);

const quoted = files.map((f) => `'${f}'`).join(' ');
const script = [
  `for f in ${quoted}; do php -l "$f" >/dev/null || exit 1; done`,
  `php vendor/squizlabs/php_codesniffer/bin/phpcs --standard=phpcs.xml ${quoted}`,
].join(' && ');

try {
  runInPhp(script);
} catch {
  process.exit(1);
}
```

- [ ] **Step 8: Install the PHP dev dependency via Docker**

Run (Docker must be running; first run pulls the `composer:2` and `php:8.1-cli` images):
```bash
node tools/composer.mjs install --no-interaction
ls vendor/squizlabs/php_codesniffer/bin/phpcs && echo "phpcs installed"
```
Expected: `vendor/` and `composer.lock` created; prints "phpcs installed".

- [ ] **Step 9: Normalize existing code to PSR-12, then verify**

Run:
```bash
node tools/php-fix.mjs
node tools/php-lint.mjs
```
Expected: `php-lint` prints `php -l: OK` and phpcs reports no errors. If a handful of non-auto-fixable errors remain (e.g. a naming rule), fix them by hand in the reported `code/**.php` files and re-run `node tools/php-lint.mjs` until clean. Do **not** relax PSR-12 wholesale; only these files are in scope.

- [ ] **Step 10: Commit**

```bash
git add composer.json composer.lock phpcs.xml tools/
git add -u code/
git commit -m "build: add Dockerized PHP tooling (Composer + phpcs PSR-12) and normalize PHP"
```
Note: `vendor/` is git-ignored (Task 1) — do not add it.

---

### Task 3: JS/CSS linting — Node toolchain (Prettier, ESLint, Stylelint)

Adds the dev-only Node toolchain scoped to `code/assets/`, wires the unified `check`/`fix` runners (JS/CSS natively + PHP via the Task 2 Docker wrappers), adds the secret guard, and normalizes existing assets.

**Files:**
- Create: `package.json`
- Create: `eslint.config.js`
- Create: `.stylelintrc.json`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `tools/secret-guard.mjs`
- Create (generated): `package-lock.json`, `node_modules/` (git-ignored)

**Interfaces:**
- Consumes: `tools/php-lint.mjs`, `tools/php-fix.mjs`, `tools/php-lint-file.mjs`, `tools/composer.mjs` and `vendor/` from Task 2 (all present in the working tree).
- Requires: Docker running (the PHP sub-checks call the Task 2 wrappers).
- Produces: npm scripts `php:install`, `lint:php`, `lint:js`, `lint:css`, `format:check`, `format:write`, `guard`, `check`, `fix`; `tools/secret-guard.mjs` (used by Task 6 CI).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "les-canetons-website",
  "version": "0.0.0",
  "private": true,
  "description": "Dev tooling for the buildless Les Canetons de Fribourg website.",
  "type": "module",
  "scripts": {
    "php:install": "node tools/composer.mjs install --no-interaction",
    "lint:php": "node tools/php-lint.mjs",
    "lint:js": "eslint code/assets/js",
    "lint:css": "stylelint \"code/assets/css/**/*.css\"",
    "format:check": "prettier --check \"code/assets/**/*.{js,css}\"",
    "format:write": "prettier --write \"code/assets/**/*.{js,css}\"",
    "guard": "node tools/secret-guard.mjs",
    "check": "npm run lint:php && npm run lint:js && npm run lint:css && npm run format:check && npm run guard",
    "fix": "node tools/php-fix.mjs && eslint code/assets/js --fix && stylelint \"code/assets/css/**/*.css\" --fix && npm run format:write",
    "prepare": "husky"
  },
  "devDependencies": {
    "@eslint/js": "^9.9.0",
    "eslint": "^9.9.0",
    "globals": "^15.9.0",
    "husky": "^9.1.0",
    "lint-staged": "^15.2.0",
    "prettier": "^3.3.0",
    "stylelint": "^16.9.0",
    "stylelint-config-standard": "^36.0.0"
  },
  "lint-staged": {
    "code/**/*.php": "node tools/php-lint-file.mjs",
    "code/assets/js/**/*.js": ["eslint --fix", "prettier --write"],
    "code/assets/css/**/*.css": ["stylelint --fix", "prettier --write"]
  }
}
```
Note: `lint:php`, `fix` (PHP part), `php:install`, and the lint-staged `*.php` entry all delegate to the Task 2 Docker wrappers — no local PHP is used.

- [ ] **Step 2: Create `eslint.config.js`**

```javascript
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['code/assets/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
  },
];
```

- [ ] **Step 3: Create `.stylelintrc.json`**

```json
{
  "extends": "stylelint-config-standard",
  "rules": {
    "no-descending-specificity": null
  }
}
```

- [ ] **Step 4: Create `.prettierrc.json`**

```json
{
  "singleQuote": false,
  "printWidth": 100
}
```

- [ ] **Step 5: Create `.prettierignore`**

```gitignore
node_modules
vendor
code/dist
```

- [ ] **Step 6: Create `tools/secret-guard.mjs`**

```javascript
// Fails if secrets or production data are tracked by git.
import { execFileSync } from 'node:child_process';

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const offenders = tracked.filter(
  (f) => f === 'code/config.php' || /\.dump\.sql$/.test(f) || /(^|\/)prod-.*\.sql$/.test(f)
);

if (offenders.length > 0) {
  console.error('Secret guard FAILED — these must never be committed:');
  for (const f of offenders) console.error('  ' + f);
  process.exit(1);
}
console.log('Secret guard: OK (no secrets or prod dumps tracked).');
```

- [ ] **Step 7: Install and auto-fix existing assets, then check**

Run (Docker must be running — `check`/`fix` include the PHP sub-checks):
```bash
npm install
npm run fix
npm run check
```
Expected: `npm run check` ends with all five sub-checks passing (`lint:php`, `lint:js`, `lint:css`, `format:check`, `guard`). Likely residual work after `fix`:
- **ESLint `no-undef`** for functions/vars shared across JS files via the global scope: for each *legitimate* shared global, add it to `globals` in `eslint.config.js` (e.g. `globals: { ...globals.browser, myShared: 'readonly' }`); fix any that are real bugs.
- **Stylelint** errors auto-fix can't resolve: fix in the CSS, or if a rule is genuinely inappropriate for this hand-written CSS, disable just that rule in `.stylelintrc.json` with a comment.
Re-run `npm run check` until green.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json eslint.config.js .stylelintrc.json .prettierrc.json .prettierignore tools/secret-guard.mjs
git add -u code/
git commit -m "build: add JS/CSS tooling (prettier/eslint/stylelint) and normalize assets"
```
Note: `node_modules/` is git-ignored — do not add it.

---

### Task 4: Git hooks — Husky + lint-staged

Wires the pre-commit hook so staged files are checked automatically; the manual `npm run check`/`fix` runners from Task 3 remain the full-repo path.

**Files:**
- Create: `.husky/pre-commit`

**Interfaces:**
- Consumes: the `lint-staged` config from Task 3 and the `tools/*.mjs` runners from Tasks 2–3. Docker must be running for the PHP part of a commit touching `*.php`.

- [ ] **Step 1: Initialize Husky**

Run:
```bash
npx husky init
```
Expected: creates `.husky/` and a sample `.husky/pre-commit`; adds/keeps `"prepare": "husky"` in `package.json` (already present from Task 3).

- [ ] **Step 2: Set the pre-commit hook contents**

Overwrite `.husky/pre-commit` with exactly:
```sh
npx lint-staged
```

- [ ] **Step 3: Verify the hook blocks a bad commit and allows a clean one**

Run:
```bash
# introduce a deliberate style error in a JS file
printf '\nvar x=1' >> code/assets/js/main.js
git add code/assets/js/main.js
git commit -m "test: should be blocked or auto-fixed" ; echo "exit: $?"
```
Expected: lint-staged runs; ESLint/Prettier either auto-fix the staged file (commit proceeds with fixed content) or the commit is blocked on an unfixable error. Then revert the probe:
```bash
git reset --soft HEAD~1 2>/dev/null || true
git checkout -- code/assets/js/main.js
git restore --staged code/assets/js/main.js 2>/dev/null || true
```
Confirm `git status` is clean and `main.js` has no leftover `var x=1`.

- [ ] **Step 4: Commit**

```bash
git add .husky/pre-commit package.json
git commit -m "build: add Husky pre-commit running lint-staged"
```

---

### Task 5: Docker Compose local dev environment

A one-command local stack matching prod versions, wired so no dev file lands in `code/`, seeded with synthetic data on the real prod schema.

**Files:**
- Create: `docker-compose.yml`
- Create: `docker/web/Dockerfile`
- Create: `config/config.docker.php`
- Create: `docker/db/init/01-schema.sql`
- Create: `docker/db/init/02-seed.sql`

**Interfaces:**
- Consumes: `code/` (mounted web root); `config/` (from Task 1).
- Produces: `http://localhost:8080` (site), `http://localhost:8081` (Adminer), MariaDB on `localhost:3306`; documented test logins (`demo.admin`/`demo`, `demo.user`/`demo`, all seed passwords `demo`).

- [ ] **Step 1: Create `docker/web/Dockerfile`**

```dockerfile
FROM php:8.1-apache

# mysqli is required by code/src/Database.php and is NOT bundled in the base image.
# Also enable the Apache modules the .htaccess relies on and allow .htaccess overrides.
RUN docker-php-ext-install mysqli \
 && a2enmod headers expires rewrite \
 && sed -ri 's!AllowOverride None!AllowOverride All!g' /etc/apache2/apache2.conf
```

- [ ] **Step 2: Create `config/config.docker.php`**

```php
<?php
// Local Docker development config. Committed on purpose: it holds only
// throwaway credentials for the docker-compose `db` service — never real
// secrets. docker-compose mounts it into the web container at
// /var/www/html/config.php, so it never lives inside code/ on the host.
return [
    'db' => [
        'host' => 'db',
        'user' => 'canetons',
        'pass' => 'canetons',
        'name' => 'lescanetons',
        'charset' => 'utf8mb4',
    ],
];
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  web:
    build: ./docker/web
    ports:
      - "8080:80"
    volumes:
      - ./code:/var/www/html
      - ./config/config.docker.php:/var/www/html/config.php:ro
    depends_on:
      db:
        condition: service_healthy

  db:
    image: mariadb:10.3
    environment:
      MARIADB_DATABASE: lescanetons
      MARIADB_USER: canetons
      MARIADB_PASSWORD: canetons
      MARIADB_ROOT_PASSWORD: root
    ports:
      - "3306:3306"
    volumes:
      - db_data:/var/lib/mysql
      - ./docker/db/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h localhost -u root -proot || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 20

  adminer:
    image: adminer:latest
    ports:
      - "8081:8080"
    depends_on:
      - db

volumes:
  db_data:
```

- [ ] **Step 4: Create `docker/db/init/01-schema.sql` (exact prod schema)**

```sql
SET NAMES utf8mb4;
SET time_zone = "+00:00";

CREATE TABLE `contact_messages` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `last_name` varchar(255) NOT NULL,
  `first_name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `message` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `instruments` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_instruments_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `events` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `title` varchar(255) NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `location` varchar(255) NOT NULL,
  `attire` varchar(255) DEFAULT NULL,
  `weekend` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `users` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('user','moderator','admin') NOT NULL DEFAULT 'user',
  `instrument_id` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  KEY `fk_users_instrument` (`instrument_id`),
  CONSTRAINT `fk_users_instrument` FOREIGN KEY (`instrument_id`)
    REFERENCES `instruments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `responses` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `event_id` int(10) UNSIGNED NOT NULL,
  `answer` enum('participate','notparticipate') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_response` (`user_id`,`event_id`),
  KEY `fk_resp_event` (`event_id`),
  CONSTRAINT `fk_resp_event` FOREIGN KEY (`event_id`)
    REFERENCES `events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_resp_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 5: Create `docker/db/init/02-seed.sql` (synthetic data)**

```sql
SET NAMES utf8mb4;

-- Instrument names are not personal data; kept for realism.
INSERT INTO `instruments` (`id`, `name`) VALUES
(1, 'Trompette'),
(2, 'Trombone'),
(3, 'Sousaphone'),
(4, 'Cloches'),
(5, 'Batterie'),
(6, 'Lyre'),
(7, 'Grosses-Caisse'),
(9, 'Maquillage');

-- Synthetic users. All passwords are the literal string "demo" (the app compares
-- plaintext — see Auth.php). NO real member names or passwords.
INSERT INTO `users` (`id`, `username`, `password`, `role`, `instrument_id`) VALUES
(1, 'demo.user',      'demo', 'user',      1),
(2, 'demo.user2',     'demo', 'user',      2),
(3, 'demo.user3',     'demo', 'user',      5),
(4, 'demo.moderator', 'demo', 'moderator', NULL),
(5, 'demo.admin',     'demo', 'admin',     NULL),
(6, 'alex.muster',    'demo', 'user',      4),
(7, 'sam.beispiel',   'demo', 'user',      7),
(8, 'chris.exemple',  'demo', 'moderator', NULL);

INSERT INTO `events`
  (`id`, `date`, `title`, `start_time`, `end_time`, `location`, `attire`, `weekend`) VALUES
(1, '2026-08-22', 'Répétition',                              '10:00:00', '12:00:00', 'Werkhof',      'Libre',            0),
(2, '2026-08-29', 'Fête du Poulet',                          '10:00:00', '20:00:00', 'Sierre',       'T-shirt canetons', 0),
(3, '2026-10-03', 'Weekend musical',                         '09:00:00', '16:00:00', 'Lac Noir',     'Libre',            1),
(4, '2026-11-14', '20ème anniversaire des Gouilles Agasses', '10:00:00', '17:00:00', 'À confirmer',  'À confirmer',      0);

INSERT INTO `responses` (`user_id`, `event_id`, `answer`) VALUES
(1, 1, 'participate'),
(1, 2, 'participate'),
(2, 1, 'notparticipate'),
(3, 2, 'participate'),
(4, 1, 'participate'),
(6, 1, 'participate'),
(7, 3, 'participate');
```

- [ ] **Step 6: Bring the stack up and verify**

Run:
```bash
docker compose up -d --build
docker compose ps
```
Expected: `web`, `db`, `adminer` running; `db` healthy.

Then verify the app + DB:
```bash
# Home page renders (HTTP 200)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/index.php
# Login endpoint accepts a seeded account and returns its role
curl -s -X POST http://localhost:8080/api/login.php \
  -H "Content-Type: application/json" \
  -d '{"username":"demo.admin","password":"demo"}'
```
Expected: `200`, and JSON `{"role":"admin"}`. Open `http://localhost:8081` (Adminer, server `db`, user `canetons`, pass `canetons`, db `lescanetons`) and confirm the five seeded tables are present with data.

- [ ] **Step 7: Tear down and commit**

```bash
docker compose down
git add docker-compose.yml docker/ config/config.docker.php
git commit -m "feat: add Docker Compose local dev (PHP 8.1 + MariaDB 10.3 + Adminer) with synthetic seed"
```

---

### Task 6: GitHub Actions CI + PR template

Real CI enforcing the PHP + asset checks and the secret guard on every push/PR, plus a usable PR template.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/PULL_REQUEST_TEMPLATE.md`

**Interfaces:**
- Consumes: `composer.json`/`phpcs.xml` (Task 2), `package.json` scripts + `tools/secret-guard.mjs` (Task 3).

- [ ] **Step 1: Replace `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  php:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: "8.1"
          tools: composer
      - name: Install PHP dev tools
        run: composer install --no-interaction --no-progress
      - name: PHP syntax check (php -l)
        run: |
          find code -name '*.php' -not -path 'code/vendor/*' -not -path 'code/dist/*' -print0 \
            | xargs -0 -n1 -P4 php -l
      - name: PHP_CodeSniffer (PSR-12)
        run: vendor/bin/phpcs

  assets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install Node dev tools
        run: npm ci
      - name: ESLint
        run: npm run lint:js
      - name: Stylelint
        run: npm run lint:css
      - name: Prettier
        run: npm run format:check

  guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Secret / prod-data guard
        run: node tools/secret-guard.mjs
```

- [ ] **Step 2: Replace `.github/PULL_REQUEST_TEMPLATE.md`**

```markdown
## Summary

<!-- What does this PR change, and why? -->

## Changes

-

## Testing

- [ ] `npm run check` passes locally
- [ ] Verified in local Docker (`docker compose up`) where relevant

## Config & secrets safety

- [ ] No real credentials committed (`config.php` stays git-ignored)
- [ ] No production data / DB dumps committed
- [ ] `code/` contains only files meant to be deployed via FTP
```

- [ ] **Step 3: Validate the workflow YAML locally**

Run:
```bash
node -e "const y=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); if(!/jobs:/.test(y)||!/php-version/.test(y)) throw new Error('ci.yml malformed'); console.log('ci.yml looks structurally valid')"
```
Expected: prints "ci.yml looks structurally valid". (Full validation happens when CI runs on the PR.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .github/PULL_REQUEST_TEMPLATE.md
git commit -m "ci: add PHP + assets + secret-guard workflow and PR template"
```

---

### Task 7: Complete `CLAUDE.md`

Replace the TODO placeholders with real project documentation, preserving the Superpowers Skills table.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the `## Project Overview` … `## Development Commands` sections**

Keep the top title and the entire `## Superpowers Skills` section exactly as-is. Replace everything else so the file reads:

```markdown
## Project Overview

Public website and members' area for the Guggenmusik **Les Canetons de Fribourg**
(a Fribourg carnival brass band). Public pages present the band (history, sections,
committee, sponsors, media, contact). A members' area, gated by login, lets members
respond to events (participate / not) and lets the admin ("Team Direction") manage
events and view attendance summaries.

## Tech Stack

- **PHP 8.1** (matches prod: PHP 8.1.34), **buildless** — no framework, no bundler,
  no runtime dependencies. Files are edited in place and deployed as-is.
- **MariaDB 10.3** (prod: 10.3.8) via the `mysqli` extension.
- **Vanilla JS + CSS** under `code/assets/` — no build step.
- **Apache** with `.htaccess` (cache policy) on `easy-hebergement.net` shared hosting.
- **Deployment:** manual FTP/SFTP upload of `code/`.
- **Dev tooling (never deployed):** Composer + PHP_CodeSniffer (PSR-12); Node with
  Prettier, ESLint, Stylelint; Husky + lint-staged; Docker Compose for local dev.

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

## Local Development

```bash
docker compose up -d --build   # site: http://localhost:8080, Adminer: http://localhost:8081
docker compose down            # stop
```

Seeded test logins (all passwords `demo`, synthetic data only):
- `demo.admin` — admin (manage events, view summaries)
- `demo.moderator` — moderator (respond)
- `demo.user` — user (respond)

## Development Commands

PHP and Composer are **not** installed locally — the PHP tools run in Docker
(`php:8.1-cli` / `composer:2`) via wrappers in `tools/`. Docker must be running
for any PHP check. First-time setup: `npm install` then `npm run php:install`.

```bash
npm run php:install   # install PHP dev deps into vendor/ (Dockerized Composer; run once)
npm run check         # all checks: php -l + phpcs (Docker), eslint, stylelint, prettier, secret guard
npm run fix           # auto-fix: phpcbf (Docker) + eslint + stylelint + prettier
npm run lint:php      # PHP only (php -l sweep + phpcs, Dockerized)
```

A Husky pre-commit hook runs `lint-staged` on staged files automatically
(PHP hunks are linted through the same Docker wrappers).

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

- [ ] **Step 2: Verify the skills table is intact**

Run:
```bash
grep -c "using-superpowers" CLAUDE.md
grep -q "## Superpowers Skills" CLAUDE.md && echo "skills section present"
```
Expected: count ≥ 1 and "skills section present".

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: fill in CLAUDE.md (overview, stack, architecture, commands)"
```

---

## Self-Review

**Spec coverage:**
- §4 code location / invariant → Task 1 (+ documented in Task 7). ✓
- §5 `.gitignore` → Task 1. ✓
- §6 PHP tooling → Task 2. ✓
- §7 JS/CSS tooling → Task 3. ✓
- §8 Docker + synthetic seed → Task 5. ✓
- §9 hooks + manual runners → Task 3 (runners) + Task 4 (hooks). ✓
- §10 `.github` CI + PR template → Task 6. ✓
- §11 CLAUDE.md → Task 7. ✓
- §12 verification → per-task verify steps (php lint, `docker compose up` login, `npm run check`, CI on PR). ✓
- §13 follow-ups → out of scope by design (documented). ✓

**Placeholder scan:** No TBD/TODO in the tasks. The two "residual work" notes (Task 2 Step 4, Task 3 Step 9) are explicit triage instructions for introducing linters to an existing codebase, not deferrals — each ends with a concrete "re-run until green" gate.

**Type/name consistency:** Script names (`tools/php-lint.mjs`, `tools/php-lint-file.mjs`, `tools/secret-guard.mjs`) match their references in `package.json`, `.husky/pre-commit` (via lint-staged), and CI. Docker service name `db` matches `config/config.docker.php` host and the healthcheck. Seed passwords (`demo`) match the documented test logins in Task 7. phpcs invocation path (`vendor/squizlabs/php_codesniffer/bin/phpcs`) is consistent across both Node runners.
