<?php
/**
 * Integration tests for the public planning list (spec §1.1, §3.5).
 *
 * The list is readable without logging in, shows events whose span has not yet
 * ended (so an in-progress multi-day event stays visible), and is ordered by
 * start date ascending.
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

	private function make_event( string $title, string $start_date, ?string $end_date = null ): int {
		$id = self::factory()->post->create(
			array(
				'post_type'   => EventType::POST_TYPE,
				'post_title'  => $title,
				'post_status' => 'publish',
			)
		);
		update_post_meta( $id, EventType::META_START_DATE, $start_date );
		update_post_meta( $id, EventType::META_END_DATE, $end_date ?? $start_date );
		return $id;
	}

	private function days_from_now( int $days ): string {
		return gmdate( 'Y-m-d', strtotime( "{$days} days" ) );
	}

	public function test_empty_state_when_nothing_is_upcoming(): void {
		$this->assertStringContainsString( 'Aucun événement', do_shortcode( '[canetons_planning]' ) );
	}

	public function test_upcoming_events_render_in_start_date_order(): void {
		$this->make_event( 'Later', $this->days_from_now( 30 ) );
		$this->make_event( 'Sooner', $this->days_from_now( 7 ) );

		$html = do_shortcode( '[canetons_planning]' );

		$this->assertLessThan(
			strpos( $html, 'Later' ),
			strpos( $html, 'Sooner' ),
			'the sooner event should render first'
		);
	}

	public function test_past_events_are_excluded(): void {
		$this->make_event( 'Gone', $this->days_from_now( -7 ) );
		$this->make_event( 'Coming', $this->days_from_now( 7 ) );

		$html = do_shortcode( '[canetons_planning]' );

		$this->assertStringContainsString( 'Coming', $html );
		$this->assertStringNotContainsString( 'Gone', $html );
	}

	public function test_an_in_progress_multi_day_event_stays_visible(): void {
		// Started yesterday, ends tomorrow — still going today.
		$this->make_event( 'Weekend', $this->days_from_now( -1 ), $this->days_from_now( 1 ) );

		$this->assertStringContainsString( 'Weekend', do_shortcode( '[canetons_planning]' ) );
	}

	public function test_a_multi_day_event_drops_off_after_its_end(): void {
		$this->make_event( 'Over', $this->days_from_now( -3 ), $this->days_from_now( -1 ) );

		$this->assertStringNotContainsString( 'Over', do_shortcode( '[canetons_planning]' ) );
	}

	public function test_the_list_is_readable_when_logged_out(): void {
		wp_set_current_user( 0 );
		$this->make_event( 'Public', $this->days_from_now( 7 ) );

		$this->assertStringContainsString( 'Public', do_shortcode( '[canetons_planning]' ) );
	}
}
