<?php
/**
 * Integration tests for the instrument-section profile field (spec §3.3).
 *
 * The section is administrator-managed. The field must appear only to a user
 * administrator (`edit_users`) — never to a member on their own profile, which
 * a naive `edit_user` check would wrongly allow (WordPress grants every role
 * `edit_user` on itself).
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Integration;

use Canetons\Planning\Instruments;
use Canetons\Planning\Profile;
use Canetons\Planning\Roles;
use WP_UnitTestCase;

final class ProfileTest extends WP_UnitTestCase {

	public function set_up(): void {
		parent::set_up();
		Roles::register();
	}

	private function render_for( int $acting_user, int $target_user ): string {
		wp_set_current_user( $acting_user );
		ob_start();
		Profile::render_field( get_userdata( $target_user ) );
		return (string) ob_get_clean();
	}

	public function test_an_administrator_sees_the_field(): void {
		$admin  = self::factory()->user->create( array( 'role' => 'administrator' ) );
		$member = self::factory()->user->create( array( 'role' => Roles::ROLE_MEMBER ) );

		$this->assertStringContainsString(
			'name="' . Instruments::META_KEY . '"',
			$this->render_for( $admin, $member )
		);
	}

	public function test_a_member_cannot_see_the_field_on_their_own_profile(): void {
		$member = self::factory()->user->create( array( 'role' => Roles::ROLE_MEMBER ) );

		// The member editing themselves: edit_user would be true, edit_users is not.
		$this->assertSame( '', $this->render_for( $member, $member ) );
	}

	public function test_a_moderator_cannot_see_the_field(): void {
		$moderator = self::factory()->user->create( array( 'role' => Roles::ROLE_MODERATOR ) );

		$this->assertSame( '', $this->render_for( $moderator, $moderator ) );
	}
}
