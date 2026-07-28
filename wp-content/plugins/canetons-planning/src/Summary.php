<?php
/**
 * Attendance-summary aggregation (spec §1.3, §3.6).
 *
 * Pure by design — no WordPress, no database — so the counting arithmetic is
 * unit-testable in isolation (spec §9). The roster is fetched by {@see Roster}
 * and the result is rendered by {@see SummaryPage}; this class only counts.
 *
 * A "member" is an associative array:
 *   [ 'username' => string, 'instrument' => string (slug|''), 'answer' => ?string ]
 * where `answer` is a {@see Responses} answer or null for no response.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

final class Summary {
	// Row answer states — participate / notparticipate as stored, plus an
	// explicit "no response" that has no stored value.
	public const STATE_NONE = 'none';

	/**
	 * Compute the whole summary for one event's roster.
	 *
	 * @param list<array{username?: string, instrument?: string, answer?: string|null}> $members
	 * @param array<string, string> $instruments slug => French label (the canonical list)
	 * @return array{
	 *   convoques: int,
	 *   participate: int,
	 *   notparticipate: int,
	 *   no_response: int,
	 *   rows: list<array{username: string, instrument: string, answer: string}>,
	 *   per_instrument: list<array{slug: string, label: string, participate: int}>
	 * }
	 */
	public static function compute( array $members, array $instruments ): array {
		$participate    = 0;
		$notparticipate = 0;
		$rows           = array();

		// Seed every known section at zero so the per-instrument table is
		// complete, not just the sections that happen to have a participant.
		$per_instrument = array();
		foreach ( $instruments as $slug => $label ) {
			$per_instrument[ $slug ] = 0;
		}

		foreach ( $members as $member ) {
			$answer     = $member['answer'] ?? null;
			$instrument = $member['instrument'] ?? '';

			if ( Responses::ANSWER_PARTICIPATE === $answer ) {
				++$participate;
				$state = Responses::ANSWER_PARTICIPATE;
				// Per-instrument counts only participate answers (requirement 1.3).
				if ( '' !== $instrument && array_key_exists( $instrument, $per_instrument ) ) {
					++$per_instrument[ $instrument ];
				}
			} elseif ( Responses::ANSWER_NOT_PARTICIPATE === $answer ) {
				++$notparticipate;
				$state = Responses::ANSWER_NOT_PARTICIPATE;
			} else {
				$state = self::STATE_NONE;
			}

			$rows[] = array(
				'username'   => $member['username'] ?? '',
				'instrument' => $instrument,
				'answer'     => $state,
			);
		}

		$convoques = count( $members );

		return array(
			'convoques'      => $convoques,
			'participate'    => $participate,
			'notparticipate' => $notparticipate,
			// "Pas de réponse" is the roster minus the two answered totals
			// (requirement 1.3), never counted independently.
			'no_response'    => $convoques - $participate - $notparticipate,
			'rows'           => $rows,
			'per_instrument' => self::order_instruments( $per_instrument, $instruments ),
		);
	}

	/**
	 * Turn slug => count into an alphabetically-ordered list carrying the label,
	 * ordered by the French label (requirement 1.3). The canonical labels have
	 * no leading accents, so a case-insensitive comparison orders them correctly.
	 *
	 * @param array<string, int>    $counts
	 * @param array<string, string> $instruments
	 * @return list<array{slug: string, label: string, participate: int}>
	 */
	private static function order_instruments( array $counts, array $instruments ): array {
		$list = array();
		foreach ( $counts as $slug => $count ) {
			$list[] = array(
				'slug'        => $slug,
				'label'       => $instruments[ $slug ] ?? $slug,
				'participate' => $count,
			);
		}

		usort( $list, static fn ( array $a, array $b ): int => strcasecmp( $a['label'], $b['label'] ) );

		return $list;
	}
}
