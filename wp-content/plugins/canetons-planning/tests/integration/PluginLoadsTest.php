<?php

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Integration;

use Canetons\Planning\Activator;
use WP_UnitTestCase;

use const Canetons\Planning\SCHEMA_VERSION;
use const Canetons\Planning\VERSION;

final class PluginLoadsTest extends WP_UnitTestCase {

	public function test_the_plugin_is_loaded_inside_wordpress(): void {
		$this->assertTrue( defined( 'Canetons\Planning\VERSION' ) );
		$this->assertSame( '0.1.0', VERSION );
	}

	public function test_the_autoloader_resolves_plugin_classes(): void {
		$this->assertTrue( class_exists( Activator::class ) );
	}

	/**
	 * Activation must be safe to run repeatedly — WordPress fires the hook on
	 * every re-activation, and re-activating after a deploy is a normal
	 * recovery action.
	 */
	public function test_activation_is_idempotent(): void {
		Activator::activate();
		$first = get_option( Activator::SCHEMA_OPTION );

		Activator::activate();
		$second = get_option( Activator::SCHEMA_OPTION );

		$this->assertSame( SCHEMA_VERSION, $first );
		$this->assertSame( $first, $second );
	}
}
