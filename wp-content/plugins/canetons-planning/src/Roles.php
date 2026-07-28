<?php
/**
 * Roles and capabilities (spec §3.4).
 *
 * The capability matrix is deliberately NOT a hierarchy: the Team Direction
 * organises events but does not play in them, so it is excluded from `respond`.
 * That exclusion is what makes the "Pas de réponse" count meaningful — see
 * spec §1.4. WordPress does not implicitly grant custom capabilities to
 * administrators, so the non-hierarchy holds by default rather than needing to
 * be defended; `administrator` is granted the two management capabilities
 * explicitly (so site maintenance works) and is deliberately NOT granted
 * `canetons_respond`.
 *
 * The matrix itself lives in {@see self::definitions()} as a pure array with no
 * WordPress calls, so it can be asserted in a unit test. The WordPress-facing
 * side — add_role(), get_role()->add_cap() — lives in register()/unregister().
 */

declare( strict_types=1 );

namespace Canetons\Planning;

final class Roles {
	// Custom capabilities. English identifiers, per the project language
	// convention; nothing here is user-visible.
	public const CAP_RESPOND       = 'canetons_respond';
	public const CAP_MANAGE_EVENTS = 'canetons_manage_events';
	public const CAP_VIEW_SUMMARY  = 'canetons_view_summary';

	// Custom role slugs.
	public const ROLE_MEMBER    = 'canetons_member';
	public const ROLE_MODERATOR = 'canetons_moderator';
	public const ROLE_DIRECTION = 'canetons_direction';

	/**
	 * The three custom roles and their capabilities. Pure — no WordPress calls —
	 * so the matrix is unit-testable in isolation.
	 *
	 * Display names are French: they are user-visible in wp-admin. Capability
	 * and role slugs are English identifiers, per the language convention.
	 *
	 * The core `administrator` role is intentionally absent here. It already
	 * exists, so it is not (re)created; register() adds the two management
	 * capabilities to it separately. See {@see self::admin_capabilities()}.
	 *
	 * @return array<string, array{display_name: string, capabilities: array<string, bool>}>
	 */
	public static function definitions(): array {
		return array(
			self::ROLE_MEMBER    => array(
				'display_name' => 'Membre',
				'capabilities' => array(
					'read'             => true,
					self::CAP_RESPOND => true,
				),
			),
			self::ROLE_MODERATOR => array(
				'display_name' => 'Modérateur',
				'capabilities' => array(
					'read'             => true,
					self::CAP_RESPOND => true,
				),
			),
			self::ROLE_DIRECTION => array(
				'display_name' => 'Team Direction',
				'capabilities' => array(
					'read'                    => true,
					self::CAP_MANAGE_EVENTS => true,
					self::CAP_VIEW_SUMMARY  => true,
					// No CAP_RESPOND, on purpose — this is the non-hierarchy.
				),
			),
		);
	}

	/**
	 * The capabilities added to the core `administrator` role. Management only —
	 * never CAP_RESPOND, so an administrator cannot answer for a member and
	 * cannot inflate the participation counts. Pure, for the same reason as
	 * definitions().
	 *
	 * @return list<string>
	 */
	public static function admin_capabilities(): array {
		return array( self::CAP_MANAGE_EVENTS, self::CAP_VIEW_SUMMARY );
	}

	/**
	 * Register the roles and grant the administrator its management capabilities.
	 * Called on plugin activation (idempotent: safe on every re-activation).
	 *
	 * Each role is removed and re-added so that a capability change in a new
	 * plugin version actually lands — add_role() alone is a no-op when the role
	 * already exists and would leave stale capabilities in place. The window in
	 * which the role object is absent is within this single synchronous call;
	 * users keep their role slug in user meta and pick the definition back up as
	 * soon as it is re-added. This also means activation deterministically
	 * restores the exact matrix, which is the safe default for a security
	 * boundary even if an administrator adjusted it through the Members plugin.
	 */
	public static function register(): void {
		foreach ( self::definitions() as $slug => $definition ) {
			remove_role( $slug );
			add_role( $slug, $definition['display_name'], $definition['capabilities'] );
		}

		$administrator = get_role( 'administrator' );
		if ( null !== $administrator ) {
			foreach ( self::admin_capabilities() as $capability ) {
				$administrator->add_cap( $capability );
			}
		}
	}

	/**
	 * Strip the capabilities this plugin added to the core `administrator` role.
	 * Called on deactivation.
	 *
	 * The custom roles themselves are deliberately left in place: removing them
	 * would orphan every member assigned to one. Roles are removed only on
	 * uninstall (a later concern), following WordPress's own convention that
	 * roles survive deactivation.
	 */
	public static function unregister(): void {
		$administrator = get_role( 'administrator' );
		if ( null !== $administrator ) {
			foreach ( self::admin_capabilities() as $capability ) {
				$administrator->remove_cap( $capability );
			}
		}
	}
}
