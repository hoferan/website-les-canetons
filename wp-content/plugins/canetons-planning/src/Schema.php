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
