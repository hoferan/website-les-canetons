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

// Direct access executes this file outside WordPress, with no functions defined
// and no security context. Every entry point guards for it.
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
 * Composer is a dev-only dependency here (testing), so its autoloader is absent
 * from a deployed install and cannot be relied on at runtime.
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
register_deactivation_hook( __FILE__, [ Roles::class, 'unregister' ] );

// Member sections (spec §3.3): register the user meta and its administrator-only
// profile control. register_meta() belongs on `init`; the profile hooks fire
// only on the user-edit screen, so registering them unconditionally is cheap.
add_action( 'init', [ Instruments::class, 'register_meta' ] );
add_action( 'show_user_profile', [ Profile::class, 'render_field' ] );
add_action( 'edit_user_profile', [ Profile::class, 'render_field' ] );
add_action( 'personal_options_update', [ Profile::class, 'save_field' ] );
add_action( 'edit_user_profile_update', [ Profile::class, 'save_field' ] );
