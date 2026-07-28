<?php
/**
 * Unit tests for the attendance-summary arithmetic (spec §1.3, §9).
 *
 * Summary::compute is pure, so the counters, the "Pas de réponse = roster minus
 * answered" rule, and the per-instrument participant counting are all covered
 * here without WordPress.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Unit;

use Canetons\Planning\Responses;
use Canetons\Planning\Summary;
use PHPUnit\Framework\TestCase;

final class SummaryTest extends TestCase {

	/** A small, fixed instrument map, so the tests do not depend on the real list. */
	private const INSTRUMENTS = array(
		'trumpet'  => 'Trompette',
		'drums'    => 'Batterie',
		'bells'    => 'Cloches',
	);

	private function member( string $username, string $instrument, ?string $answer ): array {
		return array(
			'username'   => $username,
			'instrument' => $instrument,
			'answer'     => $answer,
		);
	}

	public function test_an_empty_roster_is_all_zeros(): void {
		$summary = Summary::compute( array(), self::INSTRUMENTS );

		$this->assertSame( 0, $summary['convoques'] );
		$this->assertSame( 0, $summary['participate'] );
		$this->assertSame( 0, $summary['notparticipate'] );
		$this->assertSame( 0, $summary['no_response'] );
		$this->assertSame( array(), $summary['rows'] );
	}

	public function test_counters_and_no_response_arithmetic(): void {
		$members = array(
			$this->member( 'a', 'trumpet', Responses::ANSWER_PARTICIPATE ),
			$this->member( 'b', 'drums', Responses::ANSWER_NOT_PARTICIPATE ),
			$this->member( 'c', 'bells', null ),
			$this->member( 'd', '', null ),
		);

		$summary = Summary::compute( $members, self::INSTRUMENTS );

		$this->assertSame( 4, $summary['convoques'] );
		$this->assertSame( 1, $summary['participate'] );
		$this->assertSame( 1, $summary['notparticipate'] );
		// 4 - 1 - 1 = 2 with no response.
		$this->assertSame( 2, $summary['no_response'] );
	}

	public function test_per_instrument_counts_only_participate(): void {
		$members = array(
			$this->member( 'a', 'trumpet', Responses::ANSWER_PARTICIPATE ),
			$this->member( 'b', 'trumpet', Responses::ANSWER_PARTICIPATE ),
			// Not-participate must NOT count towards the trumpet total.
			$this->member( 'c', 'trumpet', Responses::ANSWER_NOT_PARTICIPATE ),
			$this->member( 'd', 'drums', Responses::ANSWER_PARTICIPATE ),
		);

		$counts = array();
		foreach ( Summary::compute( $members, self::INSTRUMENTS )['per_instrument'] as $row ) {
			$counts[ $row['slug'] ] = $row['participate'];
		}

		$this->assertSame( 2, $counts['trumpet'] );
		$this->assertSame( 1, $counts['drums'] );
		// A section with no participants is present at zero.
		$this->assertSame( 0, $counts['bells'] );
	}

	public function test_per_instrument_is_ordered_alphabetically_by_label(): void {
		$labels = array_column(
			Summary::compute( array(), self::INSTRUMENTS )['per_instrument'],
			'label'
		);

		$this->assertSame( array( 'Batterie', 'Cloches', 'Trompette' ), $labels );
	}

	public function test_rows_carry_the_answer_state(): void {
		$members = array(
			$this->member( 'a', 'trumpet', Responses::ANSWER_PARTICIPATE ),
			$this->member( 'b', 'drums', 'garbage' ),
			$this->member( 'c', 'bells', null ),
		);

		$rows = Summary::compute( $members, self::INSTRUMENTS )['rows'];

		$this->assertSame( Responses::ANSWER_PARTICIPATE, $rows[0]['answer'] );
		// An unrecognised answer is treated as no response.
		$this->assertSame( Summary::STATE_NONE, $rows[1]['answer'] );
		$this->assertSame( Summary::STATE_NONE, $rows[2]['answer'] );
	}
}
