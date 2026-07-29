<?php
/**
 * Event date and time arithmetic (spec §1.1).
 *
 * Pure by design — no WordPress, no timezone database — so date validation, the
 * multi-day test and time normalisation are unit-testable in isolation (spec §9).
 * Turning these values into French text is a rendering concern and lives at the
 * display layer ({@see Planning}), which applies the site locale.
 *
 * An event is modelled as a start date/time and an end date/time (spec §3.1, as
 * amended): a single-day event has the same start and end date, and a multi-day
 * event — a carnival weekend, say — has a later end date. This replaces the
 * earlier `weekend` boolean, which could only express a two-day span.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

use DateTimeImmutable;
use InvalidArgumentException;

final class EventDates {
	/**
	 * Parse a `Y-m-d` string into a date, rejecting anything that is not a real
	 * calendar date.
	 *
	 * @throws InvalidArgumentException when $date is not a real Y-m-d date.
	 */
	public static function parse_date( string $date ): DateTimeImmutable {
		$parsed = DateTimeImmutable::createFromFormat( '!Y-m-d', $date );

		// createFromFormat is lenient about overflow (2025-13-40 rolls forward),
		// so round-trip the value to reject anything that was not a real date.
		if ( false === $parsed || $parsed->format( 'Y-m-d' ) !== $date ) {
			throw new InvalidArgumentException( "Not a valid Y-m-d date: {$date}" );
		}

		return $parsed;
	}

	/**
	 * Whether an event spans more than one day. Both dates must be valid Y-m-d;
	 * an empty or absent end date means a single-day event. An end date before
	 * the start is treated as single-day (not multi-day) — the display and query
	 * layers fall back to the start.
	 */
	public static function is_multi_day( string $start_date, string $end_date ): bool {
		if ( '' === $end_date ) {
			return false;
		}

		$start = self::parse_date( $start_date );
		$end   = self::parse_date( $end_date );

		return $end > $start;
	}

	/**
	 * Normalise a time to `HH:MM` (24-hour, zero-padded), or return the empty
	 * string when it is not a valid time. Accepts `H:MM`, `HH:MM` and
	 * `HH:MM:SS`; the seconds, if given, are dropped.
	 */
	public static function format_time( string $time ): string {
		if ( ! preg_match( '/^(\d{1,2}):(\d{2})(?::\d{2})?$/', $time, $m ) ) {
			return '';
		}

		$hours   = (int) $m[1];
		$minutes = (int) $m[2];

		if ( $hours > 23 || $minutes > 59 ) {
			return '';
		}

		return sprintf( '%02d:%02d', $hours, $minutes );
	}
}
