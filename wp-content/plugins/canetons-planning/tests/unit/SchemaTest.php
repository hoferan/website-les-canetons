<?php

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Unit;

use Canetons\Planning\Schema;
use PHPUnit\Framework\TestCase;

final class SchemaTest extends TestCase {

	public function test_a_never_installed_plugin_needs_the_upgrade(): void {
		$this->assertTrue( Schema::needs_upgrade( '', '1' ) );
	}

	public function test_an_older_installed_version_needs_the_upgrade(): void {
		$this->assertTrue( Schema::needs_upgrade( '1', '2' ) );
	}

	public function test_the_current_version_needs_no_upgrade(): void {
		$this->assertFalse( Schema::needs_upgrade( '2', '2' ) );
	}

	/**
	 * A downgrade must not re-run an older migration against a newer schema —
	 * that is how data gets destroyed. See Schema::needs_upgrade().
	 */
	public function test_a_newer_installed_version_is_left_alone(): void {
		$this->assertFalse( Schema::needs_upgrade( '3', '2' ) );
	}

	public function test_version_comparison_is_not_string_comparison(): void {
		// '10' < '9' as strings, but 10 > 9 as versions. Naive comparison would
		// skip the upgrade to 10 from 9, or re-run 9 over 10.
		$this->assertTrue( Schema::needs_upgrade( '9', '10' ) );
		$this->assertFalse( Schema::needs_upgrade( '10', '9' ) );
	}
}
