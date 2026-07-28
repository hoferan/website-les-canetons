<?php
/**
 * Configuration for the WordPress integration test harness.
 *
 * wp-phpunit ships a shim `wp-tests-config.php` that loads whatever file the
 * WP_PHPUNIT__TESTS_CONFIG environment variable points at. That variable is set
 * from tests/integration/bootstrap.php, derived from __DIR__ — so this file is
 * found without any absolute path being hardcoded in phpunit.xml.
 *
 * These have to be CONSTANTS, not environment variables: the harness checks with
 * defined() and aborts listing exactly which ones are missing. Putting them in
 * phpunit.xml's <env> block does not work.
 *
 * WARNING: the harness DROPS EVERY TABLE in DB_NAME on every run. It points at
 * the throwaway `wordpress_test` database, never the development `wordpress`
 * one. Do not change DB_NAME to the latter.
 */

declare( strict_types=1 );

// WordPress core, as mounted in the `wp` container. The integration suite runs
// only there — it needs both a real core install and the `wp-db` hostname — so a
// container path is correct rather than a limitation.
define( 'ABSPATH', getenv( 'WP_TESTS_ABSPATH' ) ?: '/var/www/html/' );

define( 'DB_NAME', 'wordpress_test' );
define( 'DB_USER', 'wordpress' );
define( 'DB_PASSWORD', 'wordpress' );
define( 'DB_HOST', 'wp-db' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

define( 'WP_TESTS_DOMAIN', 'localhost' );
define( 'WP_TESTS_EMAIL', 'admin@lescanetons.invalid' );
define( 'WP_TESTS_TITLE', 'Les Canetons de Fribourg' );
define( 'WP_PHP_BINARY', 'php' );

define( 'WP_DEBUG', true );

// The harness's own prefix, deliberately NOT the site's. It isolates test tables
// from anything else that might share the database.
$table_prefix = 'wptests_';
