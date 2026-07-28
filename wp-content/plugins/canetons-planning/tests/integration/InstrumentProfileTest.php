<?php
/**
 * Integration tests for the instrument-section user meta (spec §3.3).
 *
 * Exercises the registered meta and its sanitize callback through real
 * WordPress metadata calls — an unknown value must never persist.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Integration;

use Canetons\Planning\Instruments;
use WP_UnitTestCase;

final class InstrumentProfileTest extends WP_UnitTestCase {

	public function set_up(): void {
		parent::set_up();
		Instruments::register_meta();
	}

	public function test_a_known_slug_persists(): void {
		$user_id = self::factory()->user->create();

		update_user_meta( $user_id, Instruments::META_KEY, 'trumpet' );

		$this->assertSame(
			'trumpet',
			get_user_meta( $user_id, Instruments::META_KEY, true )
		);
	}

	public function test_an_unknown_slug_is_sanitized_away(): void {
		$user_id = self::factory()->user->create();

		update_user_meta( $user_id, Instruments::META_KEY, 'saxophone' );

		// The registered sanitize callback rejects it, storing the empty string.
		$this->assertSame(
			'',
			get_user_meta( $user_id, Instruments::META_KEY, true )
		);
	}

	public function test_a_member_has_no_section_by_default(): void {
		$user_id = self::factory()->user->create();

		$this->assertSame(
			'',
			get_user_meta( $user_id, Instruments::META_KEY, true )
		);
	}
}
