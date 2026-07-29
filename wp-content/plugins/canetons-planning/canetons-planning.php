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

// WP_CLI is a global class, and unqualified class names resolve against the
// current namespace with no fallback to global — unlike the constant of the same
// name tested below, which does fall back. Without this import, `WP_CLI::` here
// would mean `Canetons\Planning\WP_CLI` and fatal on every WP-CLI invocation.
use WP_CLI;

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
 * 1 — the canetons_responses table (spec §3.2), created on activation.
 */
const SCHEMA_VERSION = '1';

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

// Events (spec §3.1): the custom post type and its meta and admin list, the
// event meta box, and the public planning list shortcode.
add_action( 'init', [ EventType::class, 'register' ] );
add_action( 'init', [ Planning::class, 'register' ] );
add_action( 'add_meta_boxes', [ EventMetaBox::class, 'register' ] );
add_action( 'save_post_' . EventType::POST_TYPE, [ EventMetaBox::class, 'save' ], 10, 2 );

// Responses and member RSVP (spec §3.2, §1.2): the write handler, and cleanup
// of a member's or an event's responses when that user or post is deleted.
add_action( 'admin_post_' . Rsvp::ACTION, [ Rsvp::class, 'handle' ] );
add_action( 'deleted_user', [ Responses::class, 'delete_for_user' ] );
add_action( 'before_delete_post', [ Responses::class, 'delete_for_event' ] );

// Attendance summary (spec §1.3, §3.6): the view_summary-gated wp-admin page.
add_action( 'admin_menu', [ SummaryPage::class, 'register' ] );

// Members' passwords are admin-managed (spec §7, requirement 1.5): no
// self-service reset for the three custom roles.
add_filter( 'allow_password_reset', [ Roles::class, 'deny_password_reset' ], 10, 2 );

// One-off data migration (spec §7), shipped in the plugin and removed after
// cutover. Registered only under WP-CLI.
if ( defined( 'WP_CLI' ) && WP_CLI ) {
	WP_CLI::add_command( 'canetons migrate', new Cli\Migrate() );
}
