<?php
/**
 * Unit tests for the answer vocabulary (spec §1.2).
 *
 * The set of valid answers is the pure part of Responses; the $wpdb-facing
 * upsert, read and delete are covered by tests/integration/ResponsesTableTest.php.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Unit;

use Canetons\Planning\Responses;
use PHPUnit\Framework\TestCase;

final class ResponsesTest extends TestCase {

	public function test_there_are_exactly_two_answers(): void {
		$this->assertSame(
			array( 'participate', 'notparticipate' ),
			Responses::answers()
		);
	}

	public function test_valid_answers_are_accepted(): void {
		$this->assertTrue( Responses::is_valid_answer( Responses::ANSWER_PARTICIPATE ) );
		$this->assertTrue( Responses::is_valid_answer( Responses::ANSWER_NOT_PARTICIPATE ) );
	}

	public function test_anything_else_is_rejected(): void {
		$this->assertFalse( Responses::is_valid_answer( 'maybe' ) );
		$this->assertFalse( Responses::is_valid_answer( '' ) );
		$this->assertFalse( Responses::is_valid_answer( 'Participate' ) );
	}
}
