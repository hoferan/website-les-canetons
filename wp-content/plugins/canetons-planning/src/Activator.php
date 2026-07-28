<?php
/**
 * Activation. Thin on purpose: it reads and writes WordPress state and delegates
 * every decision to pure code, which is where the tests are.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

final class Activator {
	public const SCHEMA_OPTION = 'canetons_planning_schema_version';

	/**
	 * Runs on plugin activation.
	 *
	 * Activation is not a one-time event: WordPress fires this hook on every
	 * re-activation, and a deploy plus re-activation is a normal recovery
	 * action. Everything here must therefore be idempotent.
	 */
	public static function activate(): void {
		// Roles are registered on every activation, before the schema guard:
		// they live in wp_user_roles (options), not this plugin's tables, so
		// their registration is independent of SCHEMA_VERSION and must run even
		// when no table upgrade is due. Roles::register() is idempotent.
		Roles::register();

		$installed = (string) get_option( self::SCHEMA_OPTION, '' );

		if ( ! Schema::needs_upgrade( $installed, SCHEMA_VERSION ) ) {
			return;
		}

		// Later plans add the responses table here, ahead of the write below.
		// Each must be idempotent, because WordPress fires this hook on every
		// re-activation.

		update_option( self::SCHEMA_OPTION, SCHEMA_VERSION, false );
	}
}
