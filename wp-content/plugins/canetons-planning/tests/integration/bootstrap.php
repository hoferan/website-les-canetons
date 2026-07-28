<?php
/**
 * Integration-suite bootstrap. Loads a real WordPress via wp-phpunit, then
 * loads this plugin inside it, so tests exercise genuine WordPress behaviour —
 * capabilities, hooks, $wpdb — rather than mocks of it.
 *
 * WARNING: the WordPress test harness DROPS EVERY TABLE in the database it is
 * pointed at. WP_TESTS_DB_NAME must be a throwaway database, never the
 * development one.
 */

declare( strict_types=1 );

require_once dirname( __DIR__, 2 ) . '/vendor/autoload.php';

$wp_phpunit = dirname( __DIR__, 2 ) . '/vendor/wp-phpunit/wp-phpunit';

// wp-phpunit ships a shim wp-tests-config.php that loads the real config from
// whatever path this variable names. Setting it here rather than in phpunit.xml
// keeps the path derived from __DIR__, so nothing hardcodes an absolute one.
//
// The config must define CONSTANTS (WP_TESTS_DOMAIN, WP_PHP_BINARY, the DB_*
// values, ...). phpunit.xml's <env> block cannot satisfy it — the harness checks
// with defined() and aborts naming the missing constants.
putenv( 'WP_PHPUNIT__TESTS_CONFIG=' . dirname( __DIR__ ) . '/wp-tests-config.php' );

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
// register it after muplugins_loaded has already fired, the plugin would never
// load, and the tests would fail on a missing class rather than on anything
// real.
require_once $wp_phpunit . '/includes/bootstrap.php';
