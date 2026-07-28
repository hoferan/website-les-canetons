<?php
/**
 * Integration tests for the public planning list (spec §1.1, §3.5).
 *
 * The list is readable without logging in, shows only upcoming events, and is
 * ordered by date ascending.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Integration;

use Canetons\Planning\EventType;
use Canetons\Planning\Planning;
use WP_UnitTestCase;

final class PlanningListTest extends WP_UnitTestCase {

	public function set_up(): void {
		parent::set_up();
		EventType::register();
		Planning::register();
	}

	private function make_event( string $title, string $date, bool $weekend = false ): int {
		$id = self::factory()->post->create(
			array(
				'post_type'  => EventType::POST_TYPE,
				'post_title' => $title,
				'post_status' => 'publish',
			)
		);
		update_post_meta( $id, EventType::META_DATE, $date );
		update_post_meta( $id, EventType::META_WEEKEND, $weekend ? '1' : '0' );
		return $id;
	}

	public function test_empty_state_when_nothing_is_upcoming(): void {
		$this->assertStringContainsString( 'Aucun événement', do_shortcode( '[canetons_planning]' ) );
	}

	public function test_upcoming_events_render_in_date_order(): void {
		$this->make_event( 'Later', gmdate( 'Y-m-d', strtotime( '+30 days' ) ) );
		$this->make_event( 'Sooner', gmdate( 'Y-m-d', strtotime( '+7 days' ) ) );

		$html = do_shortcode( '[canetons_planning]' );

		$this->assertLessThan(
			strpos( $html, 'Later' ),
			strpos( $html, 'Sooner' ),
			'the sooner event should render first'
		);
	}

	public function test_past_events_are_excluded(): void {
		$this->make_event( 'Gone', gmdate( 'Y-m-d', strtotime( '-7 days' ) ) );
		$this->make_event( 'Coming', gmdate( 'Y-m-d', strtotime( '+7 days' ) ) );

		$html = do_shortcode( '[canetons_planning]' );

		$this->assertStringContainsString( 'Coming', $html );
		$this->assertStringNotContainsString( 'Gone', $html );
	}

	public function test_the_list_is_readable_when_logged_out(): void {
		wp_set_current_user( 0 );
		$this->make_event( 'Public', gmdate( 'Y-m-d', strtotime( '+7 days' ) ) );

		$this->assertStringContainsString( 'Public', do_shortcode( '[canetons_planning]' ) );
	}
}
