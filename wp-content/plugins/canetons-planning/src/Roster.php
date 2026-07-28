<?php
/**
 * The event roster (spec §3.6).
 *
 * "Convoqués" is derived, never stored: it is every user holding
 * `canetons_respond`. That falls out of the capability matrix — Direction and
 * administrators lack `canetons_respond`, so they are excluded automatically,
 * which is what makes "Pas de réponse" meaningful — and means adding a member
 * is creating exactly one WordPress user, with no second list to maintain.
 *
 * This is the WordPress-facing half of the summary; the counting is pure
 * ({@see Summary}).
 */

declare( strict_types=1 );

namespace Canetons\Planning;

final class Roster {
	/**
	 * The roster for an event, shaped for {@see Summary::compute()}: every
	 * respond-holder with their instrument slug and their answer (or null).
	 *
	 * @return list<array{id: int, username: string, instrument: string, answer: string|null}>
	 */
	public static function members( int $event_id ): array {
		$answers = Responses::answers_for_event( $event_id );

		// WP_User_Query's `capability` argument expands roles to their caps, so
		// this matches anyone whose role grants canetons_respond — the correct
		// derivation of the roster, not a hardcoded role list.
		$users = get_users(
			array(
				'capability' => Roles::CAP_RESPOND,
				'orderby'    => 'user_login',
				'order'      => 'ASC',
			)
		);

		$members = array();
		foreach ( $users as $user ) {
			$members[] = array(
				'id'         => $user->ID,
				'username'   => $user->user_login,
				'instrument' => (string) get_user_meta( $user->ID, Instruments::META_KEY, true ),
				'answer'     => $answers[ $user->ID ] ?? null,
			);
		}

		return $members;
	}
}
