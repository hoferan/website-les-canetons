# WordPress Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a local WordPress development environment matching production
versions, with an empty-but-activating `canetons-planning` plugin and two working
test harnesses, so that every later plan has somewhere to build and something to
test against.

**Architecture:** A second Docker Compose stack (`docker-compose.wp.yml`) runs
WordPress 6.9 on PHP 8.4 against MariaDB 10.3, alongside — not replacing — the
existing stack, which stays functional until cutover. Theme and plugin sources
live in a tracked `wp/` tree and are bind-mounted into `wp-content/`, mirroring
the two-directory deploy artifact. The plugin carries its own Composer dev
dependencies for testing and has no runtime dependencies.

**Tech Stack:** WordPress 6.9, PHP 8.4, MariaDB 10.3, Docker Compose, WP-CLI,
PHPUnit 11, `wp-phpunit/wp-phpunit`, `yoast/phpunit-polyfills`.

**Spec:** `docs/superpowers/specs/2026-07-28-wordpress-migration-design.md`

---

## Plan roadmap

This plan is **Plan 1 of 8**. The spec is 29–42 days of work; splitting it keeps
each plan independently reviewable and each one delivers working software.

| # | Plan | Delivers | Blocked by |
| --- | --- | --- | --- |
| **1** | **WordPress foundation (this plan)** | Local stack, plugin skeleton, both test harnesses | — |
| 2 | Roles, capabilities, instruments | Spec §3.3, §3.4 — the capability matrix with negative tests | 1 |
| 3 | Events custom post type | Spec §3.1 — CPT, meta box, public planning list | 2 |
| 4 | Responses and member RSVP | Spec §3.2, §3.5 — responses table, member planning surface | 3 |
| 5 | Attendance summary | Spec §3.6, §1.3 — counters, roster table, instrument counts | 4 |
| 6 | Design direction and theme | Spec §5 — `theme.json`, templates, block patterns | — (parallel) |
| 7 | Third-party plugins and content | Spec §4, §6 — contact form, SMTP, backups, nine pages | 6 |
| 8 | Data migration, deploy, cutover | Spec §7, §10, §11, §12 | 5, 7, and Task 0 below |

Plan 6 is independent of 1–5 and can run in parallel.

---

## Task 0: Verify the database topology

The spec records this as a blocking prerequisite (§7). It gates Plan 8 entirely
— both the data import and the coexistence-based rollback story depend on the
answer. It costs ten minutes and needs doing before anyone plans Plan 8.

**This task requires FTP access to TEST and is done by hand, not by an agent.**

**Files:**
- Modify: `docs/superpowers/specs/2026-07-28-wordpress-migration-design.md` (§7, record the finding)

- [ ] **Step 1: Read the old application's database name on TEST**

Fetch TEST's server-owned `config.php` over FTP (it is git-ignored and never
deployed, so it exists only on the server) and read the `db.name` value under
the `'db'` key.

- [ ] **Step 2: Compare against WordPress's**

TEST's `wp-test/wp-config.php` declares:

```
DB_NAME     = lescanetoqg5
DB_HOST     = sql1.cluster1.easy-hebergement.net
$table_prefix = 'qsjd_'
```

Compare `DB_NAME` against the `db.name` from Step 1.

- [ ] **Step 3: Record the finding in the spec**

Replace the prerequisite paragraph in §7 with the confirmed answer, one of:

- **Same database** — the migration command reads the old tables on WordPress's
  own `$wpdb` connection, and §12's coexistence rollback holds as written.
- **Different databases** — the migration command needs a second connection
  configured from the old `config.php`, and §12 should say the two installs sit
  in separate databases and therefore cannot collide at all (a stronger
  guarantee, not a weaker one).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-28-wordpress-migration-design.md
git commit -m "docs: confirm the database topology for the WordPress migration"
```

---

## File structure

Created by this plan:

| Path | Responsibility |
| --- | --- |
| `docker-compose.wp.yml` | The WordPress stack. Separate from `docker-compose.yml` so the existing stack keeps working until cutover. |
| `wp/plugins/canetons-planning/canetons-planning.php` | Plugin bootstrap: header, constants, activation hook wiring. Nothing else — logic lives in `src/`. |
| `wp/plugins/canetons-planning/src/Activator.php` | What happens on activation. In this plan: record the schema version. Later plans add roles and the responses table. |
| `wp/plugins/canetons-planning/src/Schema.php` | Schema-version comparison. Pure, no WordPress — the unit harness's first real subject. |
| `wp/plugins/canetons-planning/composer.json` | Dev-only dependencies (PHPUnit and the WordPress test library). The plugin has no runtime dependencies. |
| `wp/plugins/canetons-planning/phpunit-unit.xml.dist` | Unit suite: no WordPress bootstrap. |
| `wp/plugins/canetons-planning/phpunit-integration.xml.dist` | Integration suite: full WordPress bootstrap. |
| `wp/plugins/canetons-planning/tests/unit/bootstrap.php` | Composer autoload plus the plugin's `src/`. |
| `wp/plugins/canetons-planning/tests/integration/bootstrap.php` | Loads `wp-phpunit` and activates the plugin. |
| `wp/plugins/canetons-planning/tests/unit/SchemaTest.php` | Tests `Schema`. |
| `wp/plugins/canetons-planning/tests/integration/PluginLoadsTest.php` | Asserts the plugin actually loads inside WordPress. |
| `tools/wp-setup.sh` | Idempotent WordPress install: core, locale, hardening. |
| `wp/themes/canetons/` | Created empty here (with `.gitkeep`); Plan 6 fills it. |

Two directories — `wp/themes/canetons/` and `wp/plugins/canetons-planning/` —
are the entire deploy artifact (spec §10). Everything else in this plan is
development-only and never uploaded.

---

## Task 1: The WordPress Docker stack

**Files:**
- Create: `docker-compose.wp.yml`
- Create: `wp/themes/canetons/.gitkeep`
- Create: `wp/plugins/canetons-planning/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Create the tracked source directories**

```bash
mkdir -p wp/themes/canetons wp/plugins/canetons-planning
touch wp/themes/canetons/.gitkeep wp/plugins/canetons-planning/.gitkeep
```

- [ ] **Step 2: Resolve the WordPress image tag**

Run: `docker pull wordpress:6.9-php8.4-apache`

If that tag does not exist, run `docker pull wordpress:php8.4-apache` instead
and use that tag everywhere below. Record which one resolved in the compose
file's comment — the stack must pin an explicit tag either way, never `latest`.

- [ ] **Step 3: Write the compose file**

Create `docker-compose.wp.yml`:

```yaml
# The WordPress stack (spec §10). Deliberately a SECOND compose file rather than
# edits to docker-compose.yml: the existing app stays functional until cutover
# succeeds (spec §12), so both stacks must be able to run — and neither may
# claim the other's ports or volumes.
#
#   docker compose -f docker-compose.wp.yml up -d
#
# Ports are offset from the existing stack on purpose: 8100 vs 8090 (web),
# 3308 vs 3307 (db), 8101 vs 8091 (adminer).
services:
  # WordPress core lives in a named volume, NOT a bind mount. Core is
  # server-owned in every environment (spec §10) and is never part of the deploy
  # artifact, so it has no business in the tracked tree. Only the two artifact
  # directories are bind-mounted, below.
  wp:
    image: wordpress:6.9-php8.4-apache
    ports:
      - "8100:80"
    environment:
      WORDPRESS_DB_HOST: wp-db:3306
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpress
      WORDPRESS_DEBUG: 1
      # Hardening that must hold in every environment (spec §8). Set here as
      # well as locally so a developer never sees behaviour PROD will not allow.
      WORDPRESS_CONFIG_EXTRA: |
        define( 'DISALLOW_FILE_EDIT', true );
        define( 'WP_ENVIRONMENT_TYPE', 'local' );
    volumes:
      - wp_core:/var/www/html
      - ./wp/themes/canetons:/var/www/html/wp-content/themes/canetons
      - ./wp/plugins/canetons-planning:/var/www/html/wp-content/plugins/canetons-planning
    depends_on:
      wp-db:
        condition: service_healthy

  # WP-CLI shares wp_core and the same bind mounts so it sees exactly the
  # filesystem Apache does. Kept alive with `tail -f` rather than run one-shot,
  # so `docker compose exec` works and each command does not pay container
  # startup. Runs as uid 33 (www-data) to avoid writing root-owned files into
  # the volume, which would then break Apache.
  wp-cli:
    image: wordpress:cli-php8.4
    user: "33:33"
    environment:
      WORDPRESS_DB_HOST: wp-db:3306
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpress
    volumes:
      - wp_core:/var/www/html
      - ./wp/themes/canetons:/var/www/html/wp-content/themes/canetons
      - ./wp/plugins/canetons-planning:/var/www/html/wp-content/plugins/canetons-planning
    entrypoint: ["tail", "-f", "/dev/null"]
    depends_on:
      wp-db:
        condition: service_healthy

  wp-db:
    image: mariadb:10.3
    environment:
      MARIADB_DATABASE: wordpress
      MARIADB_USER: wordpress
      MARIADB_PASSWORD: wordpress
      MARIADB_ROOT_PASSWORD: root
    ports:
      - "3308:3306"
    volumes:
      - wp_db_data:/var/lib/mysql
    # -h 127.0.0.1, NOT localhost — the same trap already documented in
    # docker-compose.yml. Against `localhost` mysqladmin uses the unix socket,
    # which succeeds against MariaDB's temporary --skip-networking init server
    # while TCP is still unreachable, releasing dependents too early.
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -u root -proot || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 20

  adminer:
    image: adminer:latest
    ports:
      - "8101:8080"
    depends_on:
      - wp-db

volumes:
  wp_core:
  wp_db_data:
```

- [ ] **Step 4: Ignore the plugin's dev dependencies**

Create `wp/plugins/canetons-planning/.gitignore` — a plugin-local file rather
than rules in the root `.gitignore`, so the ignores travel with the directory
that is the deploy artifact, and so this task does not touch a root file that
may have unrelated uncommitted changes:

```
# Composer dev dependencies (PHPUnit and the WordPress test library). The plugin
# has NO runtime dependencies, so this directory is development-only and never
# part of the deploy artifact.
/vendor/
/.phpunit.cache/
```

- [ ] **Step 5: Bring the stack up**

Run: `docker compose -f docker-compose.wp.yml up -d`

Expected: four containers start; `wp` waits for `wp-db` to report healthy.

- [ ] **Step 6: Verify WordPress answers**

Run: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:8100/`

Expected: `302 http://localhost:8100/wp-admin/install.php` — an uninstalled
WordPress redirecting to its installer. Any `500` means the DB credentials or
the healthcheck gate are wrong; check `docker compose -f docker-compose.wp.yml logs wp`.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.wp.yml wp/
git commit -m "build(wp): add the WordPress development stack"
```

Note: `wp/plugins/canetons-planning/.gitignore` is inside `wp/`, so this picks it
up. Do not `git add .gitignore` at the root — it may carry unrelated
uncommitted changes.

---

## Task 2: Scripted, idempotent WordPress install

Installing by clicking through `install.php` is not reproducible. This script is
how every developer and every rebuilt container gets the same site.

**Files:**
- Create: `tools/wp-setup.sh`

- [ ] **Step 1: Write the setup script**

Create `tools/wp-setup.sh`:

```bash
#!/bin/sh
# Idempotent local WordPress setup. Safe to re-run: every step checks its own
# state first, so this is also the recovery path after `down -v`.
#
# Run via `npm run wp:setup`, never directly — the npm script supplies the
# compose file and the exec target.
set -eu

WP="wp --path=/var/www/html"

# --- core -------------------------------------------------------------------
if $WP core is-installed 2>/dev/null; then
  echo "core: already installed"
else
  echo "core: installing"
  $WP core install \
    --url="http://localhost:8100" \
    --title="Les Canetons de Fribourg" \
    --admin_user="admin" \
    --admin_password="admin" \
    --admin_email="admin@lescanetons.invalid" \
    --skip-email
fi

# --- locale ----------------------------------------------------------------
# The site is French-only (spec §2). Everything user-visible comes from core and
# plugin translations, so the locale is not cosmetic — it is the whole
# translation strategy.
if [ "$($WP option get WPLANG)" = "fr_FR" ]; then
  echo "locale: already fr_FR"
else
  echo "locale: installing fr_FR"
  $WP language core install fr_FR --activate
fi

# --- hardening (spec §8) ---------------------------------------------------
# Comments and trackbacks are closed site-wide: the site has no use for them,
# and an open comment form on shared hosting is a spam liability. These are
# options rather than code so they are visible and auditable in wp-admin.
$WP option update default_comment_status closed
$WP option update default_ping_status closed
$WP option update blog_public 0   # local only; PROD sets this to 1 at cutover

# --- timezone --------------------------------------------------------------
# Event dates and times are meaningless without this (spec §1.1).
$WP option update timezone_string "Europe/Zurich"

echo "setup: done — http://localhost:8100/wp-admin (admin / admin)"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x tools/wp-setup.sh
git update-index --chmod=+x tools/wp-setup.sh 2>/dev/null || true
```

- [ ] **Step 3: Mount the script into the wp-cli container**

The script has to be inside the container to run there. Add this to the `wp-cli`
service's existing `volumes:` list in `docker-compose.wp.yml`:

```yaml
      # The setup script only — wp-cli has no other business in the repo tree.
      - ./tools/wp-setup.sh:/usr/local/bin/wp-setup:ro
```

- [ ] **Step 4: Re-create the container and run the setup**

```bash
docker compose -f docker-compose.wp.yml up -d --force-recreate wp-cli
docker compose -f docker-compose.wp.yml exec -T wp-cli wp-setup
```

Expected output ends with:
`setup: done — http://localhost:8100/wp-admin (admin / admin)`

- [ ] **Step 5: Verify idempotency**

Run: `docker compose -f docker-compose.wp.yml exec -T wp-cli wp-setup`

Expected: `core: already installed` and `locale: already fr_FR`. No errors, no
second install.

- [ ] **Step 6: Verify the locale actually took**

Run: `docker compose -f docker-compose.wp.yml exec -T wp-cli wp --path=/var/www/html option get WPLANG`

Expected: `fr_FR`

- [ ] **Step 7: Commit**

```bash
git add tools/wp-setup.sh docker-compose.wp.yml
git commit -m "build(wp): script an idempotent local WordPress install"
```

---

## Task 3: Plugin skeleton that activates cleanly

Activation here is unconditional: it records the schema version and nothing else.
Task 4 adds the guard that decides *whether* to upgrade, test-first — which is
the only part with logic worth testing.

**Files:**
- Create: `wp/plugins/canetons-planning/canetons-planning.php`
- Create: `wp/plugins/canetons-planning/src/Activator.php`
- Delete: `wp/plugins/canetons-planning/.gitkeep`

- [ ] **Step 1: Write the plugin bootstrap**

Create `wp/plugins/canetons-planning/canetons-planning.php`:

```php
<?php
/**
 * Plugin Name:       Canetons Planning
 * Description:       Event planning and attendance for Guggenmusik Les Canetons de Fribourg.
 * Version:           0.1.0
 * Requires at least: 6.9
 * Requires PHP:      8.4
 * Author:            Guggenmusik Les Canetons de Fribourg
 * Text Domain:       canetons-planning
 *
 * This file is a bootstrap and nothing else: constants, autoloading, and hook
 * wiring. All behaviour lives in src/, so that everything except WordPress
 * integration can be unit-tested without loading WordPress.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

// Direct access to a plugin file executes it outside WordPress, with no
// functions defined and no security context. Every entry point guards for this.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const VERSION = '0.1.0';

/**
 * The schema version, bumped whenever the plugin's own tables change.
 *
 * Deliberately separate from VERSION: most releases touch no tables, and
 * conflating the two would run a needless upgrade path on every release.
 * Currently 0 — this plugin owns no tables yet; Plan 4 creates the first.
 */
const SCHEMA_VERSION = '0';

const PLUGIN_FILE = __FILE__;

/**
 * Minimal PSR-4 autoloader for this plugin's src/ tree.
 *
 * Composer is a dev-only dependency here (testing), so its autoloader is not
 * present in a deployed install and cannot be relied on at runtime.
 */
spl_autoload_register(
	static function ( string $class ): void {
		$prefix = __NAMESPACE__ . '\\';
		if ( ! str_starts_with( $class, $prefix ) ) {
			return;
		}

		$relative = substr( $class, strlen( $prefix ) );
		$path     = __DIR__ . '/src/' . str_replace( '\\', '/', $relative ) . '.php';

		if ( is_readable( $path ) ) {
			require_once $path;
		}
	}
);

register_activation_hook( __FILE__, [ Activator::class, 'activate' ] );
```

- [ ] **Step 2: Write the activator**

Create `wp/plugins/canetons-planning/src/Activator.php`:

```php
<?php
/**
 * Activation. Thin on purpose: it reads and writes WordPress state and delegates
 * every decision to pure code (Schema), which is where the tests are.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

final class Activator {
	public const SCHEMA_OPTION = 'canetons_planning_schema_version';

	/**
	 * Runs on plugin activation.
	 *
	 * Activation is not a one-time event: WordPress runs this hook on every
	 * re-activation, and a deploy plus re-activation is a normal recovery
	 * action. Everything here must therefore be idempotent.
	 *
	 * Task 4 adds the upgrade guard in front of the write below.
	 */
	public static function activate(): void {
		update_option( self::SCHEMA_OPTION, SCHEMA_VERSION, false );
	}
}
```

- [ ] **Step 3: Remove the placeholder**

```bash
rm wp/plugins/canetons-planning/.gitkeep
```

- [ ] **Step 4: Activate the plugin and verify**

```bash
docker compose -f docker-compose.wp.yml exec -T wp-cli wp --path=/var/www/html plugin activate canetons-planning
docker compose -f docker-compose.wp.yml exec -T wp-cli wp --path=/var/www/html plugin list --status=active --field=name
```

Expected: `Plugin 'canetons-planning' activated.` then `canetons-planning` in the
list. A PHP fatal here means the autoloader path or a namespace is wrong.

- [ ] **Step 5: Verify activation recorded the schema version**

Run: `docker compose -f docker-compose.wp.yml exec -T wp-cli wp --path=/var/www/html option get canetons_planning_schema_version`

Expected: `0`

- [ ] **Step 6: Commit**

```bash
git add wp/plugins/canetons-planning/
git commit -m "feat(wp): add the canetons-planning plugin skeleton"
```

---

## Task 4: Unit test harness and the schema-upgrade guard

Two suites exist because they need different bootstraps. This one loads no
WordPress at all, which is what keeps it fast and forces the interesting logic
to stay pure.

This task is written test-first: the guard deciding *whether* to run an upgrade
is the first piece of real logic in the plugin, and it gets its test before its
implementation.

**Files:**
- Create: `wp/plugins/canetons-planning/composer.json`
- Create: `wp/plugins/canetons-planning/phpunit-unit.xml.dist`
- Create: `wp/plugins/canetons-planning/tests/unit/bootstrap.php`
- Create: `wp/plugins/canetons-planning/src/Schema.php`
- Modify: `wp/plugins/canetons-planning/src/Activator.php`
- Test: `wp/plugins/canetons-planning/tests/unit/SchemaTest.php`

- [ ] **Step 1: Write the plugin's composer.json**

Create `wp/plugins/canetons-planning/composer.json`:

```json
{
    "name": "canetons/planning",
    "description": "Event planning and attendance for Guggenmusik Les Canetons de Fribourg.",
    "type": "wordpress-plugin",
    "license": "proprietary",
    "require": {
        "php": ">=8.4"
    },
    "require-dev": {
        "phpunit/phpunit": "^11.5",
        "wp-phpunit/wp-phpunit": "^6.9",
        "yoast/phpunit-polyfills": "^3.0"
    },
    "autoload": {
        "psr-4": {
            "Canetons\\Planning\\": "src/"
        }
    },
    "config": {
        "allow-plugins": {
            "dealerdirect/phpcodesniffer-composer-installer": false
        }
    }
}
```

There is no `require` beyond PHP itself, deliberately: the plugin ships no
runtime dependencies, so a deployed install needs no `vendor/` directory at all.

- [ ] **Step 2: Write the unit bootstrap**

Create `wp/plugins/canetons-planning/tests/unit/bootstrap.php`:

```php
<?php
/**
 * Unit-suite bootstrap. Loads Composer's autoloader and NOTHING else — no
 * WordPress, no database. A test that needs either belongs in tests/integration.
 */

declare( strict_types=1 );

$autoload = dirname( __DIR__, 2 ) . '/vendor/autoload.php';

if ( ! is_readable( $autoload ) ) {
	fwrite( STDERR, "Run `composer install` in wp/plugins/canetons-planning first.\n" );
	exit( 1 );
}

require_once $autoload;
```

- [ ] **Step 3: Write the unit PHPUnit config**

Create `wp/plugins/canetons-planning/phpunit-unit.xml.dist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="tests/unit/bootstrap.php"
         cacheDirectory=".phpunit.cache"
         colors="true"
         failOnWarning="true"
         failOnRisky="true">
    <testsuites>
        <testsuite name="unit">
            <directory>tests/unit</directory>
        </testsuite>
    </testsuites>
    <source>
        <include>
            <directory>src</directory>
        </include>
    </source>
</phpunit>
```

- [ ] **Step 4: Write the failing test**

Create `wp/plugins/canetons-planning/tests/unit/SchemaTest.php`:

```php
<?php

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Unit;

use Canetons\Planning\Schema;
use PHPUnit\Framework\TestCase;

final class SchemaTest extends TestCase {

	public function test_a_never_installed_plugin_needs_the_upgrade(): void {
		$this->assertTrue( Schema::needs_upgrade( '', '1' ) );
	}

	public function test_an_older_installed_version_needs_the_upgrade(): void {
		$this->assertTrue( Schema::needs_upgrade( '1', '2' ) );
	}

	public function test_the_current_version_needs_no_upgrade(): void {
		$this->assertFalse( Schema::needs_upgrade( '2', '2' ) );
	}

	/**
	 * A downgrade must not re-run an older migration against a newer schema —
	 * that is how data gets destroyed. See Schema::needs_upgrade().
	 */
	public function test_a_newer_installed_version_is_left_alone(): void {
		$this->assertFalse( Schema::needs_upgrade( '3', '2' ) );
	}

	public function test_version_comparison_is_not_string_comparison(): void {
		// '10' < '9' as strings, but 10 > 9 as versions. Naive comparison would
		// skip the upgrade to 10 from 9, or re-run 9 over 10.
		$this->assertTrue( Schema::needs_upgrade( '9', '10' ) );
		$this->assertFalse( Schema::needs_upgrade( '10', '9' ) );
	}
}
```

- [ ] **Step 5: Install dev dependencies**

```bash
docker run --rm -v "$PWD/wp/plugins/canetons-planning":/app -w /app composer:2 install
```

Expected: PHPUnit, `wp-phpunit` and the polyfills land in `vendor/`.

- [ ] **Step 6: Run the suite to verify it FAILS**

```bash
docker run --rm -v "$PWD/wp/plugins/canetons-planning":/app -w /app php:8.4-cli \
  ./vendor/bin/phpunit -c phpunit-unit.xml.dist
```

Expected: every test errors with
`Error: Class "Canetons\Planning\Schema" not found`.

That is the correct failure — `Schema` does not exist yet. A *pass* here means
the test is not reaching the code it claims to test.

- [ ] **Step 7: Write the minimal implementation**

Create `wp/plugins/canetons-planning/src/Schema.php`:

```php
<?php
/**
 * Schema-version arithmetic. Pure by design — no WordPress, no database — so
 * that the rule deciding whether to run a migration is unit-testable in
 * isolation. The WordPress-facing side lives in Activator.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

final class Schema {
	/**
	 * Whether an installed schema version needs upgrading to the target.
	 *
	 * A never-installed plugin reports an empty string, which must count as
	 * needing the upgrade. An installed version AHEAD of the target (a
	 * downgrade — someone deployed an older plugin over a newer database) must
	 * NOT trigger an upgrade: re-running an older migration against a newer
	 * schema is how data gets destroyed. Such a version is left alone for a
	 * human to look at.
	 */
	public static function needs_upgrade( string $installed, string $target ): bool {
		if ( '' === $installed ) {
			return true;
		}

		return version_compare( $installed, $target, '<' );
	}
}
```

- [ ] **Step 8: Run the suite to verify it PASSES**

```bash
docker run --rm -v "$PWD/wp/plugins/canetons-planning":/app -w /app php:8.4-cli \
  ./vendor/bin/phpunit -c phpunit-unit.xml.dist
```

Expected: `OK (5 tests, 6 assertions)`.

If every test still fails on `Class ... not found`, the `autoload.psr-4` prefix in
`composer.json` does not match `src/Schema.php`'s namespace — fix it and re-run
`composer dump-autoload`.

- [ ] **Step 9: Wire the guard into the activator**

Replace `Activator::activate()` in
`wp/plugins/canetons-planning/src/Activator.php` with:

```php
	public static function activate(): void {
		$installed = (string) get_option( self::SCHEMA_OPTION, '' );

		if ( ! Schema::needs_upgrade( $installed, SCHEMA_VERSION ) ) {
			return;
		}

		// Later plans add the responses table and the roles here, ahead of the
		// write below. Each must be idempotent, because WordPress fires this
		// hook on every re-activation.

		update_option( self::SCHEMA_OPTION, SCHEMA_VERSION, false );
	}
```

Leave the docblock above it in place, minus its final `Task 4 adds the upgrade
guard` line, which is now done.

- [ ] **Step 10: Verify the plugin still activates**

```bash
docker compose -f docker-compose.wp.yml exec -T wp-cli wp --path=/var/www/html plugin deactivate canetons-planning
docker compose -f docker-compose.wp.yml exec -T wp-cli wp --path=/var/www/html plugin activate canetons-planning
docker compose -f docker-compose.wp.yml exec -T wp-cli wp --path=/var/www/html option get canetons_planning_schema_version
```

Expected: deactivates, re-activates with no fatal, and still prints `0`.

- [ ] **Step 11: Commit**

```bash
git add wp/plugins/canetons-planning/
git commit -m "test(wp): add the unit harness and guard schema upgrades"
```

---

## Task 5: Integration test harness

This is the suite that matters. Spec §9 puts capability enforcement here because
it is a security boundary, and Plans 2–5 all depend on this harness existing.

**Files:**
- Create: `wp/plugins/canetons-planning/phpunit-integration.xml.dist`
- Create: `wp/plugins/canetons-planning/tests/integration/bootstrap.php`
- Test: `wp/plugins/canetons-planning/tests/integration/PluginLoadsTest.php`
- Modify: `docker-compose.wp.yml`

- [ ] **Step 1: Create the test database**

WordPress's test harness **drops every table on every run**, so it must never
point at the development database.

```bash
docker compose -f docker-compose.wp.yml exec -T wp-db \
  mysql -uroot -proot -e "CREATE DATABASE IF NOT EXISTS wordpress_test; GRANT ALL ON wordpress_test.* TO 'wordpress'@'%';"
```

Verify: `docker compose -f docker-compose.wp.yml exec -T wp-db mysql -uroot -proot -e "SHOW DATABASES LIKE 'wordpress%';"`

Expected: both `wordpress` and `wordpress_test` listed.

- [ ] **Step 2: Write the integration bootstrap**

Create `wp/plugins/canetons-planning/tests/integration/bootstrap.php`:

```php
<?php
/**
 * Integration-suite bootstrap. Loads a real WordPress via wp-phpunit, then
 * activates this plugin inside it, so tests exercise genuine WordPress
 * behaviour — capabilities, hooks, $wpdb — rather than mocks of it.
 *
 * WARNING: the WordPress test harness DROPS EVERY TABLE in the database it is
 * pointed at. WP_TESTS_DB_NAME must be a throwaway database, never the
 * development one.
 */

declare( strict_types=1 );

require_once dirname( __DIR__, 2 ) . '/vendor/autoload.php';

$wp_phpunit = dirname( __DIR__, 2 ) . '/vendor/wp-phpunit/wp-phpunit';

// functions.php defines tests_add_filter, so it must load before the call below.
require_once $wp_phpunit . '/includes/functions.php';

// Load the plugin into the WordPress that is about to boot. muplugins_loaded is
// the earliest hook the harness offers, and loading there rather than activating
// afterwards means the plugin's registration hooks fire normally.
tests_add_filter(
	'muplugins_loaded',
	static function (): void {
		require dirname( __DIR__, 2 ) . '/canetons-planning.php';
	}
);

// Boots WordPress. Must be LAST: registering the filter after this point would
// register it after muplugins_loaded has already fired, and the plugin would
// never load — the tests would then fail on a missing class rather than on
// anything real.
require_once $wp_phpunit . '/includes/bootstrap.php';
```

The three-part order is load-bearing: `functions.php` (defines the helper) →
`tests_add_filter` (registers the plugin loader) → `bootstrap.php` (boots
WordPress and fires the hook).

- [ ] **Step 3: Write the integration PHPUnit config**

Create `wp/plugins/canetons-planning/phpunit-integration.xml.dist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="tests/integration/bootstrap.php"
         cacheDirectory=".phpunit.cache"
         colors="true">
    <testsuites>
        <testsuite name="integration">
            <directory>tests/integration</directory>
        </testsuite>
    </testsuites>
    <php>
        <!-- A THROWAWAY database. The harness drops every table in it. -->
        <env name="WP_TESTS_DB_NAME" value="wordpress_test"/>
        <env name="WP_TESTS_DB_USER" value="wordpress"/>
        <env name="WP_TESTS_DB_PASSWORD" value="wordpress"/>
        <env name="WP_TESTS_DB_HOST" value="wp-db"/>
        <env name="WP_TESTS_DOMAIN" value="localhost"/>
        <env name="WP_TESTS_EMAIL" value="admin@lescanetons.invalid"/>
        <env name="WP_TESTS_TITLE" value="Les Canetons de Fribourg"/>
    </php>
</phpunit>
```

- [ ] **Step 4: Write the failing test**

Create `wp/plugins/canetons-planning/tests/integration/PluginLoadsTest.php`:

```php
<?php

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Integration;

use Canetons\Planning\Activator;
use WP_UnitTestCase;

use const Canetons\Planning\SCHEMA_VERSION;
use const Canetons\Planning\VERSION;

final class PluginLoadsTest extends WP_UnitTestCase {

	public function test_the_plugin_is_loaded_inside_wordpress(): void {
		$this->assertTrue( defined( 'Canetons\Planning\VERSION' ) );
		$this->assertSame( '0.1.0', VERSION );
	}

	public function test_the_autoloader_resolves_plugin_classes(): void {
		$this->assertTrue( class_exists( Activator::class ) );
	}

	/**
	 * Activation must be safe to run repeatedly — WordPress fires the hook on
	 * every re-activation, and re-activating after a deploy is a normal
	 * recovery action.
	 */
	public function test_activation_is_idempotent(): void {
		Activator::activate();
		$first = get_option( Activator::SCHEMA_OPTION );

		Activator::activate();
		$second = get_option( Activator::SCHEMA_OPTION );

		$this->assertSame( SCHEMA_VERSION, $first );
		$this->assertSame( $first, $second );
	}
}
```

- [ ] **Step 5: Build a test-runner image with mysqli**

The unit suite ran in a throwaway `php:8.4-cli` container, but the integration
suite needs two things that image cannot give it: the `wp-db` hostname must
resolve (so the runner has to be on the compose network), and the WordPress test
harness talks to MariaDB through `mysqli`, which the base image does not bundle.

Create `docker/wp-test/Dockerfile`:

```dockerfile
# The plugin's integration-test runner. The WordPress test harness talks to
# MariaDB through mysqli, which php:8.4-cli does not bundle.
FROM php:8.4-cli
RUN docker-php-ext-install mysqli
```

- [ ] **Step 6: Add the runner service**

Add to `docker-compose.wp.yml`, before the `volumes:` block:

```yaml
  # Runs the plugin's integration suite. It has to be a compose service rather
  # than a `docker run` container so that WP_TESTS_DB_HOST=wp-db resolves on the
  # compose network. Kept alive by `tail -f` so `exec` works, exactly like
  # wp-cli, and so each test run does not pay container startup.
  wp-test:
    build: ./docker/wp-test
    working_dir: /plugin
    volumes:
      - ./wp/plugins/canetons-planning:/plugin
    entrypoint: ["tail", "-f", "/dev/null"]
    depends_on:
      wp-db:
        condition: service_healthy
```

- [ ] **Step 7: Start the runner**

```bash
docker compose -f docker-compose.wp.yml up -d --build wp-test
docker compose -f docker-compose.wp.yml exec -T wp-test php -m | grep mysqli
```

Expected: `mysqli`

- [ ] **Step 8: Run the integration suite**

```bash
docker compose -f docker-compose.wp.yml exec -T wp-test \
  ./vendor/bin/phpunit -c phpunit-integration.xml.dist
```

Expected: `OK (3 tests, 5 assertions)`.

If it fails with `Could not find wp-tests-config.php`, the `<env>` values in
`phpunit-integration.xml.dist` are not reaching the harness — confirm the file
is the one being loaded by adding `-v` and checking the reported configuration
path.

- [ ] **Step 9: Commit**

```bash
git add wp/plugins/canetons-planning/ docker-compose.wp.yml docker/wp-test/
git commit -m "test(wp): add the WordPress integration test harness"
```

---

## Task 6: Wire up npm scripts and document the stack

Nobody should need to remember the compose invocations above.

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add the scripts**

Add to `package.json`'s `scripts`, keeping the existing entries untouched:

```json
    "wp:dev": "docker compose -f docker-compose.wp.yml up -d",
    "wp:down": "docker compose -f docker-compose.wp.yml down",
    "wp:reset": "docker compose -f docker-compose.wp.yml down -v",
    "wp:setup": "docker compose -f docker-compose.wp.yml exec -T wp-cli wp-setup",
    "wp:cli": "docker compose -f docker-compose.wp.yml exec -T wp-cli wp --path=/var/www/html",
    "wp:test:unit": "docker compose -f docker-compose.wp.yml exec -T wp-test ./vendor/bin/phpunit -c phpunit-unit.xml.dist",
    "wp:test:integration": "docker compose -f docker-compose.wp.yml exec -T wp-test ./vendor/bin/phpunit -c phpunit-integration.xml.dist",
    "wp:test": "npm run wp:test:unit && npm run wp:test:integration"
```

`wp:reset` takes `-v`, which destroys the database and the WordPress core
volume. That is the intended recovery path — re-run `wp:dev` then `wp:setup`.

- [ ] **Step 2: Verify both suites through npm**

Run: `npm run wp:test`

Expected: `OK (5 tests, 6 assertions)` then `OK (3 tests, 5 assertions)`.

- [ ] **Step 3: Document it**

Add to `README.md`, as a new section directly after the existing local
development section:

```markdown
## WordPress stack (the rebuild)

The WordPress rebuild runs in its own Compose stack, alongside the existing one
— see `docs/superpowers/specs/2026-07-28-wordpress-migration-design.md`.

```bash
npm run wp:dev      # start the stack
npm run wp:setup    # install WordPress (idempotent; run after wp:dev)
npm run wp:test     # both plugin suites
npm run wp:down     # stop
npm run wp:reset    # stop AND destroy the database — recovery path
```

| URL | What |
| --- | --- |
| http://localhost:8100 | the WordPress site (`admin` / `admin`) |
| http://localhost:8101 | Adminer |
| `localhost:3308` | MariaDB |

Ports are offset from the existing stack (8090/8091/3307) so both can run.

Tracked sources are `wp/themes/canetons/` and
`wp/plugins/canetons-planning/` — bind-mounted into `wp-content/`, and together
the entire deploy artifact. WordPress core, third-party plugins and uploads are
server-owned and never deployed.
```

- [ ] **Step 4: Commit**

```bash
git add package.json README.md
git commit -m "docs(wp): document the WordPress development stack"
```

---

## Definition of done

- [ ] `npm run wp:dev && npm run wp:setup` produces a French WordPress at
      http://localhost:8100 from a clean checkout.
- [ ] `npm run wp:test` runs both suites green: 5 unit tests, 3 integration
      tests.
- [ ] `canetons-planning` activates with no notice or fatal, and records
      `canetons_planning_schema_version`.
- [ ] `npm run wp:reset && npm run wp:dev && npm run wp:setup` fully recovers.
- [ ] The existing stack still works: `npm run dev` then `npm run smoke` passes
      its 11 checks. Nothing in this plan may break it.
- [ ] Task 0's database-topology finding is recorded in the spec.

---

## Notes for later plans

Discovered while writing this plan; each belongs to a later one, recorded here
so it is not rediscovered:

- **Plan 2** adds roles to `Activator::activate()`. The `administrator` role
  must be granted `canetons_manage_events` and `canetons_view_summary` but
  **not** `canetons_respond` (spec §3.4) — and that negative case needs a test,
  because it is the whole non-hierarchy.
- **Plan 4** bumps `SCHEMA_VERSION` from `'0'` to `'1'` when it adds the
  responses table. `Schema::needs_upgrade()` and its tests already handle that
  transition.
- **Plan 8** must not deploy `wp/plugins/canetons-planning/vendor/`,
  `composer.json`, `phpunit-*.xml.dist` or `tests/`. The artifact is source
  only; the plugin has no runtime dependencies by design.
- **Plan 6** will want `wp:cli` to reach the theme directory, which it already
  mounts.
