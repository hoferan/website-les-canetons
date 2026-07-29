<?php
/**
 * Unit tests for the JSON-LD builder (agenda design §3, §4).
 *
 * Pure: no WordPress. The builder does use the timezone database, unlike
 * EventDates, because an ISO 8601 offset cannot be produced without it.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Unit;

use Canetons\Planning\EventSchema;
use PHPUnit\Framework\TestCase;

final class EventSchemaTest extends TestCase {

	private const ORGANIZER = array(
		'name' => 'Guggenmusik Les Canetons de Fribourg',
		'url'  => 'https://lescanetons.org',
	);

	private const PAGE = 'https://lescanetons.org/fr/agenda/';
	private const TZ   = 'Europe/Zurich';

	/**
	 * @param array<string, string> $overrides
	 * @return array<string, string>
	 */
	private function event( array $overrides = array() ): array {
		return array_merge(
			array(
				'title'      => 'Concert de gala',
				'start_date' => '2026-08-22',
				'start_time' => '20:00',
				'end_date'   => '2026-08-22',
				'end_time'   => '23:00',
				'location'   => 'Fribourg',
			),
			$overrides
		);
	}

	public function test_a_node_carries_the_required_fields(): void {
		$node = EventSchema::event_node( $this->event(), self::PAGE, self::ORGANIZER, self::TZ );

		$this->assertSame( 'Event', $node['@type'] );
		$this->assertSame( 'Concert de gala', $node['name'] );
		$this->assertSame( self::PAGE, $node['url'] );
		$this->assertSame( 'https://schema.org/EventScheduled', $node['eventStatus'] );
		$this->assertSame( 'https://schema.org/OfflineEventAttendanceMode', $node['eventAttendanceMode'] );
		$this->assertSame( 'Organization', $node['organizer']['@type'] );
	}

	/** August is CEST, so the offset must be +02:00 — not UTC, and not naive. */
	public function test_a_time_produces_an_iso_value_with_the_zurich_offset(): void {
		$node = EventSchema::event_node( $this->event(), self::PAGE, self::ORGANIZER, self::TZ );

		$this->assertSame( '2026-08-22T20:00:00+02:00', $node['startDate'] );
		$this->assertSame( '2026-08-22T23:00:00+02:00', $node['endDate'] );
	}

	/** January is CET. The offset is not a constant. */
	public function test_a_winter_date_uses_the_winter_offset(): void {
		$node = EventSchema::event_node(
			$this->event( array( 'start_date' => '2027-01-23', 'end_date' => '2027-01-23' ) ),
			self::PAGE,
			self::ORGANIZER,
			self::TZ
		);

		$this->assertSame( '2027-01-23T20:00:00+01:00', $node['startDate'] );
	}

	public function test_a_missing_time_yields_a_date_only_value(): void {
		$node = EventSchema::event_node(
			$this->event( array( 'start_time' => '', 'end_time' => '' ) ),
			self::PAGE,
			self::ORGANIZER,
			self::TZ
		);

		$this->assertSame( '2026-08-22', $node['startDate'] );
		$this->assertArrayNotHasKey( 'endDate', $node, 'a same-day event with no times has no distinct end' );
	}

	public function test_a_multi_day_event_keeps_its_end_date(): void {
		$node = EventSchema::event_node(
			$this->event( array( 'end_date' => '2026-08-23', 'end_time' => '02:00' ) ),
			self::PAGE,
			self::ORGANIZER,
			self::TZ
		);

		$this->assertSame( '2026-08-23T02:00:00+02:00', $node['endDate'] );
	}

	public function test_an_absent_end_date_falls_back_to_the_start(): void {
		$node = EventSchema::event_node(
			$this->event( array( 'end_date' => '', 'end_time' => '' ) ),
			self::PAGE,
			self::ORGANIZER,
			self::TZ
		);

		$this->assertSame( '2026-08-22T20:00:00+02:00', $node['startDate'] );
		$this->assertArrayNotHasKey( 'endDate', $node, 'an end no later than the start carries no information' );
	}

	/**
	 * The common case for this band: a rehearsal with a start time and no end time.
	 * A date-only endDate here would place the end at midnight, before the start.
	 */
	public function test_a_start_time_without_an_end_time_omits_the_end(): void {
		$node = EventSchema::event_node(
			$this->event( array( 'end_time' => '' ) ),
			self::PAGE,
			self::ORGANIZER,
			self::TZ
		);

		$this->assertSame( '2026-08-22T20:00:00+02:00', $node['startDate'] );
		$this->assertArrayNotHasKey( 'endDate', $node );
	}

	/** A later end DATE is still meaningful without an end time. */
	public function test_a_multi_day_event_without_an_end_time_keeps_its_end_date(): void {
		$node = EventSchema::event_node(
			$this->event( array( 'end_date' => '2026-08-23', 'end_time' => '' ) ),
			self::PAGE,
			self::ORGANIZER,
			self::TZ
		);

		$this->assertSame( '2026-08-23', $node['endDate'] );
	}

	public function test_a_missing_location_omits_the_place(): void {
		$node = EventSchema::event_node(
			$this->event( array( 'location' => '' ) ),
			self::PAGE,
			self::ORGANIZER,
			self::TZ
		);

		$this->assertArrayNotHasKey( 'location', $node, 'an empty Place is worse than no Place' );
	}

	public function test_a_location_becomes_a_named_place(): void {
		$node = EventSchema::event_node( $this->event(), self::PAGE, self::ORGANIZER, self::TZ );

		$this->assertSame( 'Place', $node['location']['@type'] );
		$this->assertSame( 'Fribourg', $node['location']['name'] );
	}

	public function test_an_event_without_a_title_or_date_is_dropped(): void {
		$this->assertNull(
			EventSchema::event_node( $this->event( array( 'title' => '' ) ), self::PAGE, self::ORGANIZER, self::TZ )
		);
		$this->assertNull(
			EventSchema::event_node( $this->event( array( 'start_date' => '' ) ), self::PAGE, self::ORGANIZER, self::TZ )
		);
	}

	public function test_an_impossible_date_is_dropped_rather_than_rolled_forward(): void {
		$this->assertNull(
			EventSchema::event_node(
				$this->event( array( 'start_date' => '2026-13-40' ) ),
				self::PAGE,
				self::ORGANIZER,
				self::TZ
			)
		);
	}

	public function test_build_wraps_the_nodes_in_one_graph(): void {
		$document = EventSchema::build(
			array( $this->event(), $this->event( array( 'title' => 'Cortège' ) ) ),
			self::PAGE,
			self::ORGANIZER,
			self::TZ
		);

		$this->assertSame( 'https://schema.org', $document['@context'] );
		$this->assertCount( 2, $document['@graph'] );
		$this->assertSame( 'Cortège', $document['@graph'][1]['name'] );
	}

	public function test_build_returns_nothing_when_no_event_survives(): void {
		$this->assertSame(
			array(),
			EventSchema::build( array( $this->event( array( 'title' => '' ) ) ), self::PAGE, self::ORGANIZER, self::TZ ),
			'an empty document must be distinguishable, so the caller can emit no script at all'
		);
	}
}
