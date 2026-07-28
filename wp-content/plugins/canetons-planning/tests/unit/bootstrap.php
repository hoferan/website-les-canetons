<?php
/**
 * Unit-suite bootstrap. Loads Composer's autoloader and NOTHING else — no
 * WordPress, no database. A test needing either belongs in tests/integration.
 */

declare( strict_types=1 );

$autoload = dirname( __DIR__, 2 ) . '/vendor/autoload.php';

if ( ! is_readable( $autoload ) ) {
	fwrite( STDERR, "Run composer install in wp-content/plugins/canetons-planning first.\n" );
	exit( 1 );
}

require_once $autoload;
