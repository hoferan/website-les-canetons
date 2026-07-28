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
	 *
	 * Task 4 adds the upgrade guard in front of the write below.
	 */
	public static function activate(): void {
		update_option( self::SCHEMA_OPTION, SCHEMA_VERSION, false );
	}
}
