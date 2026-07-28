<?php
/**
 * Unit tests for the capability matrix (spec §1.4, §3.4).
 *
 * These assert the pure definition of the matrix — the non-hierarchy — without
 * booting WordPress. The WordPress-side enforcement (user_can against a real
 * role) is covered by tests/integration/CapabilitiesTest.php.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Unit;

use Canetons\Planning\Roles;
use PHPUnit\Framework\TestCase;

final class RolesTest extends TestCase {

	public function test_members_and_moderators_may_respond_only(): void {
		foreach ( array( Roles::ROLE_MEMBER, Roles::ROLE_MODERATOR ) as $role ) {
			$caps = Roles::definitions()[ $role ]['capabilities'];

			$this->assertArrayHasKey( Roles::CAP_RESPOND, $caps, "$role should respond" );
			$this->assertTrue( $caps[ Roles::CAP_RESPOND ] );
			$this->assertArrayNotHasKey( Roles::CAP_MANAGE_EVENTS, $caps );
			$this->assertArrayNotHasKey( Roles::CAP_VIEW_SUMMARY, $caps );
		}
	}

	public function test_direction_manages_and_views_but_may_not_respond(): void {
		$caps = Roles::definitions()[ Roles::ROLE_DIRECTION ]['capabilities'];

		$this->assertTrue( $caps[ Roles::CAP_MANAGE_EVENTS ] );
		$this->assertTrue( $caps[ Roles::CAP_VIEW_SUMMARY ] );
		// The whole point of the non-hierarchy: Direction never responds.
		$this->assertArrayNotHasKey( Roles::CAP_RESPOND, $caps );
	}

	public function test_the_administrator_gets_management_but_never_respond(): void {
		$admin = Roles::admin_capabilities();

		$this->assertContains( Roles::CAP_MANAGE_EVENTS, $admin );
		$this->assertContains( Roles::CAP_VIEW_SUMMARY, $admin );
		$this->assertNotContains( Roles::CAP_RESPOND, $admin );
	}

	public function test_every_custom_role_can_read(): void {
		foreach ( Roles::definitions() as $role => $definition ) {
			$this->assertTrue(
				$definition['capabilities']['read'] ?? false,
				"$role should hold core read"
			);
		}
	}

	public function test_the_three_capabilities_are_distinct(): void {
		$caps = array( Roles::CAP_RESPOND, Roles::CAP_MANAGE_EVENTS, Roles::CAP_VIEW_SUMMARY );

		$this->assertCount( 3, array_unique( $caps ) );
	}
}
