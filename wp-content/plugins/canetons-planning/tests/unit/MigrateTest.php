<?php
/**
 * Unit tests for the migration's pure mapping helpers (spec §7).
 *
 * The old-role -> WP-role map, the instrument-name -> slug inverse, and the
 * synthetic-address rule are pure; the database reads and WordPress writes are
 * exercised only on a real stack.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Unit;

use Canetons\Planning\Cli\Migrate;
use Canetons\Planning\Roles;
use PHPUnit\Framework\TestCase;

final class MigrateTest extends TestCase {

	public function test_roles_map_to_their_canetons_equivalents(): void {
		$this->assertSame( Roles::ROLE_MEMBER, Migrate::role_for( 'user' ) );
		$this->assertSame( Roles::ROLE_MODERATOR, Migrate::role_for( 'moderator' ) );
		$this->assertSame( Roles::ROLE_DIRECTION, Migrate::role_for( 'admin' ) );
	}

	public function test_an_unknown_role_falls_back_to_member(): void {
		$this->assertSame( Roles::ROLE_MEMBER, Migrate::role_for( 'wizard' ) );
		$this->assertSame( Roles::ROLE_MEMBER, Migrate::role_for( '' ) );
	}

	public function test_instrument_names_map_to_slugs(): void {
		$this->assertSame( 'trumpet', Migrate::instrument_slug_for( 'Trompette' ) );
		$this->assertSame( 'bass_drum', Migrate::instrument_slug_for( 'Grosses-Caisse' ) );
	}

	public function test_instrument_matching_is_tolerant(): void {
		// Case, surrounding/repeated whitespace, hyphens and accents do not
		// prevent a match.
		$this->assertSame( 'trumpet', Migrate::instrument_slug_for( '  TROMPETTE ' ) );
		$this->assertSame( 'committee', Migrate::instrument_slug_for( 'comite' ) );
		$this->assertSame( 'bass_drum', Migrate::instrument_slug_for( 'grosses caisse' ) );
	}

	public function test_an_unknown_or_empty_instrument_maps_to_nothing(): void {
		$this->assertSame( '', Migrate::instrument_slug_for( 'Saxophone' ) );
		$this->assertSame( '', Migrate::instrument_slug_for( '' ) );
	}

	public function test_synthetic_addresses_are_invalid_and_safe(): void {
		$this->assertSame( 'lucas@membres.lescanetons.invalid', Migrate::email_for( 'lucas' ) );
		// Unsafe characters are stripped from the local part.
		$this->assertSame( 'jeanpaul@membres.lescanetons.invalid', Migrate::email_for( 'jean paul' ) );
		// A username with nothing usable still yields a valid, deliverable-proof address.
		$this->assertSame( 'membre@membres.lescanetons.invalid', Migrate::email_for( 'é!' ) );
	}

	public function test_a_suffix_disambiguates_colliding_addresses(): void {
		$this->assertSame( 'lucas@membres.lescanetons.invalid', Migrate::email_for( 'lucas', 1 ) );
		$this->assertSame( 'lucas-2@membres.lescanetons.invalid', Migrate::email_for( 'lucas', 2 ) );
		$this->assertSame( 'membre-3@membres.lescanetons.invalid', Migrate::email_for( 'é!', 3 ) );
	}
}
