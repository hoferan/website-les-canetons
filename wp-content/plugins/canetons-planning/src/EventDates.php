<?php
/**
 * Event date and time arithmetic (spec §1.1).
 *
 * Pure by design — no WordPress, no timezone database — so the weekend two-day
 * range and the time normalisation are unit-testable in isolation (spec §9).
 * Turning these calendar values into French text is a rendering concern and
 * lives at the display layer ({@see Planning}), which applies the site locale.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

use DateTimeImmutable;
use InvalidArgumentException;

final class EventDates {
	/**
	 * The event's calendar span.
	 *
	 * A normal event is a single day, so `end` is null. A weekend event runs
	 * from its date through the following day (spec §1.1) — modelled here as a
	 * derived +1 day rather than a stored end date, matching the spec's decision
	 * to keep `weekend` a boolean.
	 *
	 * @return array{start: DateTimeImmutable, end: DateTimeImmutable|null}
	 * @throws InvalidArgumentException when $date is not a real Y-m-d date.
	 */
	public static function range( string $date, bool $weekend ): array {
		$start = DateTimeImmutable::createFromFormat( '!Y-m-d', $date );

		// createFromFormat is lenient about overflow (e.g. 2025-13-40 rolls
		// forward), so round-trip the value to reject anything that was not
		// already a real calendar date.
		if ( false === $start || $start->format( 'Y-m-d' ) !== $date ) {
			throw new InvalidArgumentException( "Not a valid Y-m-d date: {$date}" );
		}

		return array(
			'start' => $start,
			'end'   => $weekend ? $start->modify( '+1 day' ) : null,
		);
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
