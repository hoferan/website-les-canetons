<?php
/**
 * schema.org Event JSON-LD for the public agenda (agenda design §3, §4).
 *
 * Pure by design — no WordPress — so ISO composition and the omission rules are
 * unit-testable (spec §9). It does use the timezone database, unlike
 * {@see EventDates}: an ISO 8601 value without an offset is ambiguous, and a
 * concert at 20:00 in Fribourg is not 20:00 UTC.
 *
 * Events deliberately have no public URL of their own (spec §3.1 registers the
 * post type `public: false`, `rewrite: false`), so every node points at the page
 * that lists it. That is why the page URL is a parameter rather than something
 * this class could derive.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;

final class EventSchema {
	/**
	 * One Event node, or null when the event cannot be described honestly.
	 *
	 * A node is dropped rather than patched: structured data is a machine-readable
	 * claim, and a node with an invented date is worse than no node.
	 *
	 * @param array<string, string> $event    title, start_date, start_time, end_date, end_time, location.
	 * @param array<string, string> $organizer name and url.
	 * @return array<string, mixed>|null
	 */
	public static function event_node( array $event, string $page_url, array $organizer, string $timezone ): ?array {
		$title      = trim( (string) ( $event['title'] ?? '' ) );
		$start_date = trim( (string) ( $event['start_date'] ?? '' ) );

		if ( '' === $title || '' === $start_date || ! self::is_date( $start_date ) ) {
			return null;
		}

		$start_time = (string) ( $event['start_time'] ?? '' );
		$start      = self::iso( $start_date, $start_time, $timezone );

		$node = array(
			'@type'               => 'Event',
			'name'                => $title,
			'startDate'           => $start,
			'eventStatus'         => 'https://schema.org/EventScheduled',
			'eventAttendanceMode' => 'https://schema.org/OfflineEventAttendanceMode',
			'url'                 => $page_url,
			'organizer'           => array(
				'@type' => 'Organization',
				'name'  => (string) ( $organizer['name'] ?? '' ),
				'url'   => (string) ( $organizer['url'] ?? '' ),
			),
		);

		$end_date = trim( (string) ( $event['end_date'] ?? '' ) );
		if ( '' === $end_date || ! self::is_date( $end_date ) ) {
			$end_date = $start_date;
		}

		$end_time = (string) ( $event['end_time'] ?? '' );

		// The end is expressed at the START's granularity. Without this, an event
		// with an end time but no start time emits a date-only startDate beside a
		// timed endDate: mixed granularity, and worse, an end time the rendered list
		// never shows — Planning::format_time_range() prints nothing when the start
		// time is absent. Structured data must not claim more than the page does.
		if ( '' === EventDates::format_time( $start_time ) ) {
			$end_time = '';
		}

		// Emitted only when the end is genuinely later than the start. Comparing
		// the FORMATTED values would not do: a date-only end and a datetime start
		// always differ as strings, so an event at 20:00 with no end time would
		// claim to end at midnight the same day — twenty hours before it began.
		$starts_at = self::moment( $start_date, $start_time, $timezone );
		$ends_at   = self::moment( $end_date, $end_time, $timezone );

		if ( $ends_at > $starts_at ) {
			$node['endDate'] = self::iso( $end_date, $end_time, $timezone );
		}

		// A Place with no name is noise, so an absent location omits the property.
		$location = trim( (string) ( $event['location'] ?? '' ) );
		if ( '' !== $location ) {
			$node['location'] = array(
				'@type' => 'Place',
				'name'  => $location,
			);
		}

		return $node;
	}

	/**
	 * The whole document: one @context, every surviving node in an @graph. Returns
	 * an empty array when nothing survives, so the caller can emit no script tag
	 * rather than an empty one.
	 *
	 * @param array<int, array<string, string>> $events
	 * @param array<string, string>             $organizer
	 * @return array<string, mixed>
	 */
	public static function build( array $events, string $page_url, array $organizer, string $timezone ): array {
		$nodes = array();
		foreach ( $events as $event ) {
			$node = self::event_node( $event, $page_url, $organizer, $timezone );
			if ( null !== $node ) {
				$nodes[] = $node;
			}
		}

		if ( empty( $nodes ) ) {
			return array();
		}

		return array(
			'@context' => 'https://schema.org',
			'@graph'   => $nodes,
		);
	}

	/** Y-m-d, and a real calendar date. */
	private static function is_date( string $date ): bool {
		try {
			EventDates::parse_date( $date );
			return true;
		} catch ( InvalidArgumentException ) {
			return false;
		}
	}

	/**
	 * `Y-m-d` when there is no usable time, else a full ISO 8601 value carrying the
	 * zone's offset for that date — which differs between CET and CEST, so it
	 * cannot be hardcoded.
	 */
	private static function iso( string $date, string $time, string $timezone ): string {
		$normalised = EventDates::format_time( $time );
		if ( '' === $normalised ) {
			return $date;
		}

		$moment = new DateTimeImmutable( $date . ' ' . $normalised, new DateTimeZone( $timezone ) );

		return $moment->format( 'Y-m-d\TH:i:sP' );
	}

	/**
	 * The moment a date plus optional time denotes. A missing time means the start
	 * of that day, which is what makes the endDate comparison below meaningful.
	 */
	private static function moment( string $date, string $time, string $timezone ): DateTimeImmutable {
		$normalised = EventDates::format_time( $time );

		return new DateTimeImmutable(
			$date . ' ' . ( '' === $normalised ? '00:00' : $normalised ),
			new DateTimeZone( $timezone )
		);
	}
}
