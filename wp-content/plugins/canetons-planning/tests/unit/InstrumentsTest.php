<?php
/**
 * Unit tests for the instrument-section list (spec §1.3, §3.3).
 *
 * Instruments::all() applies the `canetons_instruments` filter only when
 * WordPress is loaded, so the whole class is exercisable here without a
 * bootstrap.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Unit;

use Canetons\Planning\Instruments;
use PHPUnit\Framework\TestCase;

final class InstrumentsTest extends TestCase {

	public function test_the_nine_sections_of_the_spec_are_present(): void {
		$all = Instruments::all();

		$this->assertCount( 9, $all );
		// A representative slug -> French label mapping from spec §1.3.
		$this->assertSame( 'Trompette', $all['trumpet'] );
		$this->assertSame( 'Grosses-Caisse', $all['bass_drum'] );
		$this->assertSame( 'Maquillage', $all['makeup'] );
	}

	public function test_is_valid_distinguishes_known_from_unknown_slugs(): void {
		$this->assertTrue( Instruments::is_valid( 'trombone' ) );
		$this->assertFalse( Instruments::is_valid( 'guitar' ) );
		$this->assertFalse( Instruments::is_valid( '' ) );
	}

	public function test_label_returns_the_french_label_or_null(): void {
		$this->assertSame( 'Cloches', Instruments::label( 'bells' ) );
		$this->assertNull( Instruments::label( 'nope' ) );
	}

	public function test_sanitize_passes_known_slugs_and_rejects_everything_else(): void {
		$this->assertSame( 'lyre', Instruments::sanitize( 'lyre' ) );
		$this->assertSame( '', Instruments::sanitize( 'saxophone' ) );
		$this->assertSame( '', Instruments::sanitize( '' ) );
	}

	public function test_sanitize_rejects_non_strings(): void {
		$this->assertSame( '', Instruments::sanitize( null ) );
		$this->assertSame( '', Instruments::sanitize( array( 'trumpet' ) ) );
		$this->assertSame( '', Instruments::sanitize( 42 ) );
	}

	public function test_slugs_are_the_keys_of_the_list(): void {
		$this->assertSame( array_keys( Instruments::all() ), Instruments::slugs() );
	}
}
