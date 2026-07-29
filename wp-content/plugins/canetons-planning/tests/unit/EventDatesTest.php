<?php
/**
 * Unit tests for event date/time arithmetic (spec §1.1, §9).
 *
 * Date validation, the multi-day test and HH:MM normalisation are pure, so they
 * are covered here without WordPress. French rendering is a display concern and
 * is not tested here.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Unit;

use Canetons\Planning\EventDates;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class EventDatesTest extends TestCase {

	public function test_a_valid_date_parses(): void {
		$this->assertSame( '2025-07-12', EventDates::parse_date( '2025-07-12' )->format( 'Y-m-d' ) );
	}

	public function test_an_invalid_date_is_rejected(): void {
		$this->expectException( InvalidArgumentException::class );
		EventDates::parse_date( '2025-13-40' );
	}

	public function test_a_non_date_string_is_rejected(): void {
		$this->expectException( InvalidArgumentException::class );
		EventDates::parse_date( 'not-a-date' );
	}

	public function test_a_single_day_event_is_not_multi_day(): void {
		$this->assertFalse( EventDates::is_multi_day( '2025-07-12', '' ) );
		$this->assertFalse( EventDates::is_multi_day( '2025-07-12', '2025-07-12' ) );
	}

	public function test_a_later_end_date_is_multi_day(): void {
		$this->assertTrue( EventDates::is_multi_day( '2025-07-12', '2025-07-13' ) );
		// Across month and year boundaries.
		$this->assertTrue( EventDates::is_multi_day( '2025-07-31', '2025-08-02' ) );
		$this->assertTrue( EventDates::is_multi_day( '2025-12-31', '2026-01-01' ) );
	}

	public function test_an_end_before_the_start_is_not_multi_day(): void {
		$this->assertFalse( EventDates::is_multi_day( '2025-07-12', '2025-07-10' ) );
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
			'already padded'      => array( '09:00', '09:00' ),
			'single-digit hour'   => array( '9:05', '09:05' ),
			'end of day'          => array( '23:59', '23:59' ),
			'seconds dropped'     => array( '14:30:00', '14:30' ),
			'hour out of range'   => array( '24:00', '' ),
			'minute out of range' => array( '09:60', '' ),
			'not a time'          => array( 'abc', '' ),
			'empty'               => array( '', '' ),
		);
	}
}
