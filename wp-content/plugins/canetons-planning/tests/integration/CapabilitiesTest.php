<?php
/**
 * Integration tests for capability enforcement (spec §1.4, §3.4, §9).
 *
 * This is the security boundary. Spec §9 puts it here, against real WordPress
 * roles, because the non-hierarchy must hold as WordPress actually evaluates it
 * — not merely as this plugin defines it. The negative cases carry the weight:
 * that Direction and administrators CANNOT respond, and that members CANNOT
 * reach management or the summary.
 *
 * Roles::register() runs on activation on a real server; here it is called
 * directly so the assertions do not depend on activation-hook ordering.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Integration;

use Canetons\Planning\Roles;
use WP_UnitTestCase;

final class CapabilitiesTest extends WP_UnitTestCase {

	public function set_up(): void {
		parent::set_up();
		Roles::register();
	}

	/**
	 * @return array<string, array{0: string, 1: bool, 2: bool, 3: bool}>
	 *   role slug => [may respond, may manage_events, may view_summary]
	 */
	public static function role_expectations(): array {
		return array(
			'member'        => array( Roles::ROLE_MEMBER, true, false, false ),
			'moderator'     => array( Roles::ROLE_MODERATOR, true, false, false ),
			'direction'     => array( Roles::ROLE_DIRECTION, false, true, true ),
			'administrator' => array( 'administrator', false, true, true ),
		);
	}

	/**
	 * @dataProvider role_expectations
	 */
	public function test_capabilities_per_role(
		string $role,
		bool $may_respond,
		bool $may_manage,
		bool $may_view
	): void {
		$user = self::factory()->user->create_and_get( array( 'role' => $role ) );

		$this->assertSame(
			$may_respond,
			user_can( $user, Roles::CAP_RESPOND ),
			"$role respond"
		);
		$this->assertSame(
			$may_manage,
			user_can( $user, Roles::CAP_MANAGE_EVENTS ),
			"$role manage_events"
		);
		$this->assertSame(
			$may_view,
			user_can( $user, Roles::CAP_VIEW_SUMMARY ),
			"$role view_summary"
		);
	}

	public function test_the_roles_exist_after_registration(): void {
		$this->assertNotNull( get_role( Roles::ROLE_MEMBER ) );
		$this->assertNotNull( get_role( Roles::ROLE_MODERATOR ) );
		$this->assertNotNull( get_role( Roles::ROLE_DIRECTION ) );
	}

	public function test_unregister_strips_admin_caps_but_leaves_roles(): void {
		Roles::unregister();

		$admin = self::factory()->user->create_and_get( array( 'role' => 'administrator' ) );
		$this->assertFalse( user_can( $admin, Roles::CAP_MANAGE_EVENTS ) );
		$this->assertFalse( user_can( $admin, Roles::CAP_VIEW_SUMMARY ) );

		// Member roles survive deactivation so assignments are not orphaned.
		$this->assertNotNull( get_role( Roles::ROLE_MEMBER ) );
	}
}
