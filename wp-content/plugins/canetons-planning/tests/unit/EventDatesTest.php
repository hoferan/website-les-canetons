<?php
/**
 * Unit tests for event date/time arithmetic (spec §1.1, §9).
 *
 * The weekend two-day range and the HH:MM normalisation are pure, so they are
 * covered here without WordPress. French rendering is a display concern and is
 * not tested here.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Unit;

use Canetons\Planning\EventDates;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class EventDatesTest extends TestCase {

	public function test_a_normal_event_is_a_single_day(): void {
		$range = EventDates::range( '2025-07-12', false );

		$this->assertSame( '2025-07-12', $range['start']->format( 'Y-m-d' ) );
		$this->assertNull( $range['end'] );
	}

	public function test_a_weekend_event_runs_through_the_following_day(): void {
		$range = EventDates::range( '2025-07-12', true );

		$this->assertSame( '2025-07-12', $range['start']->format( 'Y-m-d' ) );
		$this->assertNotNull( $range['end'] );
		$this->assertSame( '2025-07-13', $range['end']->format( 'Y-m-d' ) );
	}

	public function test_a_weekend_range_crosses_a_month_boundary(): void {
		$range = EventDates::range( '2025-07-31', true );
		$this->assertSame( '2025-08-01', $range['end']->format( 'Y-m-d' ) );
	}

	public function test_a_weekend_range_crosses_a_year_boundary(): void {
		$range = EventDates::range( '2025-12-31', true );
		$this->assertSame( '2026-01-01', $range['end']->format( 'Y-m-d' ) );
	}

	public function test_an_invalid_date_is_rejected(): void {
		$this->expectException( InvalidArgumentException::class );
		EventDates::range( '2025-13-40', false );
	}

	public function test_a_non_date_string_is_rejected(): void {
		$this->expectException( InvalidArgumentException::class );
		EventDates::range( 'not-a-date', false );
	}

	/**
	 * @dataProvider times
	 */
	public function test_time_normalisation( string $input, string $expected ): void {
		$this->assertSame( $expected, EventDates::format_time( $input ) );
	}

	/** @return array<string, array{0: string, 1: string}> */
	public static function times(): array {
		return array(
			'already padded'   => array( '09:00', '09:00' ),
			'single-digit hour' => array( '9:05', '09:05' ),
			'end of day'       => array( '23:59', '23:59' ),
			'seconds dropped'  => array( '14:30:00', '14:30' ),
			'hour out of range' => array( '24:00', '' ),
			'minute out of range' => array( '09:60', '' ),
			'not a time'       => array( 'abc', '' ),
			'empty'            => array( '', '' ),
		);
	}
}
