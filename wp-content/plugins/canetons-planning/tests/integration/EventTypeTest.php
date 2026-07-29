<?php
/**
 * Integration tests for the event post type (spec §3.1, §1.1).
 *
 * Covers the registration shape, the capability mapping (only manage_events
 * holders may write events — the negative case that a member may not), and the
 * meta-box save path's sanitization.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Integration;

use Canetons\Planning\EventType;
use Canetons\Planning\Roles;
use WP_UnitTestCase;

final class EventTypeTest extends WP_UnitTestCase {

	public function set_up(): void {
		parent::set_up();
		Roles::register();
		EventType::register();
	}

	public function test_the_post_type_is_registered_private_with_ui(): void {
		$object = get_post_type_object( EventType::POST_TYPE );

		$this->assertNotNull( $object );
		$this->assertFalse( $object->public );
		$this->assertTrue( $object->show_ui );
	}

	public function test_only_manage_events_holders_hold_the_type_edit_cap(): void {
		// The post type maps its `edit_posts` cap onto canetons_manage_events;
		// check the mapped cap, not the literal `edit_posts` primitive (which no
		// role here holds).
		$edit_cap  = get_post_type_object( EventType::POST_TYPE )->cap->edit_posts;
		$direction = self::factory()->user->create( array( 'role' => Roles::ROLE_DIRECTION ) );
		$member    = self::factory()->user->create( array( 'role' => Roles::ROLE_MEMBER ) );

		$this->assertSame( Roles::CAP_MANAGE_EVENTS, $edit_cap );
		$this->assertTrue( user_can( $direction, $edit_cap ) );
		$this->assertFalse( user_can( $member, $edit_cap ) );
	}

	public function test_edit_post_meta_cap_gates_a_specific_event(): void {
		$event     = self::factory()->post->create( array( 'post_type' => EventType::POST_TYPE ) );
		$direction = self::factory()->user->create( array( 'role' => Roles::ROLE_DIRECTION ) );
		$member    = self::factory()->user->create( array( 'role' => Roles::ROLE_MEMBER ) );

		// 'edit_post' is a meta cap: map_meta_cap resolves it to
		// canetons_manage_events for this post type.
		$this->assertTrue( user_can( $direction, 'edit_post', $event ) );
		$this->assertFalse( user_can( $member, 'edit_post', $event ) );
	}

	public function test_date_sanitization_rejects_a_non_date(): void {
		$this->assertSame( '2025-07-12', EventType::sanitize_date( '2025-07-12' ) );
		$this->assertSame( '', EventType::sanitize_date( '2025-13-40' ) );
		$this->assertSame( '', EventType::sanitize_date( 'tomorrow' ) );
	}

	public function test_time_sanitization_normalises_and_rejects(): void {
		$this->assertSame( '09:05', EventType::sanitize_time( '9:05' ) );
		$this->assertSame( '', EventType::sanitize_time( '99:99' ) );
	}
}
