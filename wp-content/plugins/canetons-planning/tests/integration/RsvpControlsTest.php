<?php
/**
 * Integration tests for who sees the RSVP controls (spec §1.2, §3.5).
 *
 * The controls appear only for a member who may respond, and never for
 * Direction, administrators or anonymous visitors — the visible half of the
 * capability rule. The write-path enforcement lives in Rsvp::handle() and is
 * exercised through the same capability check.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Integration;

use Canetons\Planning\EventType;
use Canetons\Planning\Responses;
use Canetons\Planning\Roles;
use Canetons\Planning\Rsvp;
use WP_UnitTestCase;

final class RsvpControlsTest extends WP_UnitTestCase {

	private int $event;

	public function set_up(): void {
		parent::set_up();
		Roles::register();
		EventType::register();
		Responses::create_table();
		$this->event = self::factory()->post->create( array( 'post_type' => EventType::POST_TYPE ) );
	}

	public function test_a_member_sees_both_buttons(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => Roles::ROLE_MEMBER ) ) );

		$html = Rsvp::controls( $this->event );

		$this->assertStringContainsString( 'value="participate"', $html );
		$this->assertStringContainsString( 'value="notparticipate"', $html );
	}

	public function test_direction_sees_no_controls(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => Roles::ROLE_DIRECTION ) ) );
		$this->assertSame( '', Rsvp::controls( $this->event ) );
	}

	public function test_an_administrator_sees_no_controls(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$this->assertSame( '', Rsvp::controls( $this->event ) );
	}

	public function test_an_anonymous_visitor_sees_no_controls(): void {
		wp_set_current_user( 0 );
		$this->assertSame( '', Rsvp::controls( $this->event ) );
	}

	public function test_the_current_answer_is_marked(): void {
		$member = self::factory()->user->create( array( 'role' => Roles::ROLE_MEMBER ) );
		wp_set_current_user( $member );
		Responses::upsert( $member, $this->event, Responses::ANSWER_PARTICIPATE );

		$html = Rsvp::controls( $this->event );

		// The participate button carries the current-state marker; the other
		// does not.
		$this->assertMatchesRegularExpression(
			'/value="participate"[^>]*is-current/',
			$html
		);
	}
}
