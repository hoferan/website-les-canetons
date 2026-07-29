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

	/** Decode the JSON-LD block, or fail loudly. */
	private function schema_from( string $html ): array {
		$this->assertMatchesRegularExpression(
			'#<script type="application/ld\+json">.*</script>#s',
			$html,
			'the planning list should emit a JSON-LD block'
		);

		preg_match( '#<script type="application/ld\+json">(.*?)</script>#s', $html, $m );
		$decoded = json_decode( (string) $m[1], true );

		$this->assertIsArray( $decoded, 'the JSON-LD block must be valid JSON: ' . json_last_error_msg() );

		return $decoded;
	}

	public function test_each_upcoming_event_gets_a_schema_node(): void {
		$this->make_event( 'Concert', $this->days_from_now( 7 ) );
		$this->make_event( 'Cortège', $this->days_from_now( 14 ) );

		$schema = $this->schema_from( do_shortcode( '[canetons_planning]' ) );

		$this->assertSame( 'https://schema.org', $schema['@context'] );
		$this->assertCount( 2, $schema['@graph'] );
		$this->assertSame( 'Event', $schema['@graph'][0]['@type'] );
		$this->assertSame( 'Concert', $schema['@graph'][0]['name'] );
	}

	public function test_past_events_contribute_no_schema_node(): void {
		$this->make_event( 'Passé', $this->days_from_now( -30 ) );
		$this->make_event( 'À venir', $this->days_from_now( 7 ) );

		$schema = $this->schema_from( do_shortcode( '[canetons_planning]' ) );

		$this->assertCount( 1, $schema['@graph'] );
		$this->assertSame( 'À venir', $schema['@graph'][0]['name'] );
	}

	public function test_no_schema_block_when_nothing_is_upcoming(): void {
		$this->assertStringNotContainsString(
			'application/ld+json',
			do_shortcode( '[canetons_planning]' ),
			'an empty graph must produce no script tag at all'
		);
	}

	/**
	 * Only a user holding `unfiltered_html` can store raw HTML in a post title:
	 * WordPress hooks wp_filter_kses onto title_save_pre for everyone else, so a
	 * Team Direction author's `<script>` is stripped before the post is saved. In
	 * single-site an administrator DOES hold it, so an administrator-authored title
	 * is what actually reaches our encoder — and what this test must therefore use.
	 *
	 * Creating the event as anyone else would make this pass vacuously: the payload
	 * would be gone before the code under test ever saw it.
	 */
	public function test_a_title_cannot_break_out_of_the_script_block(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$title = 'Bal </script><script>alert(1)</script>';
		$this->make_event( $title, $this->days_from_now( 7 ) );

		$html = do_shortcode( '[canetons_planning]' );

		preg_match( '#<script type="application/ld\+json">(.*?)</script>#s', $html, $m );
		$this->assertStringNotContainsString( '</script>', (string) $m[1], 'the payload must not contain a literal closing tag' );

		$decoded = json_decode( (string) $m[1], true );
		$this->assertSame( $title, $decoded['@graph'][0]['name'], 'escaping must not corrupt the value' );
	}
}
