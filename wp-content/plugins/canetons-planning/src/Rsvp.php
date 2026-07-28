<?php
/**
 * The member RSVP surface and its write handler (spec §1.2, §3.5).
 *
 * A logged-in member holding `canetons_respond` sees their own current answer
 * and two buttons on the planning list; submitting posts to admin-post.php.
 *
 * The security model (requirement 1.2) has three guards, all here:
 *   - a nonce bound to the specific event,
 *   - the `canetons_respond` capability — which Direction and administrators
 *     deliberately lack, so they cannot answer,
 *   - and the acting user taken from the session ({@see wp_get_current_user})
 *     and NEVER from request input, so no request can answer for someone else.
 *     This is the previously-fixed IDOR, kept closed.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

final class Rsvp {
	/** admin-post action name (the `action` field / hook suffix). */
	public const ACTION = 'canetons_respond';

	private const NONCE_FIELD = 'canetons_rsvp_nonce';

	/**
	 * Register the write handler. Only the authenticated variant is registered:
	 * responding requires a login, so there is deliberately no
	 * `admin_post_nopriv_*` hook.
	 */
	public static function register(): void {
		add_action( 'admin_post_' . self::ACTION, array( self::class, 'handle' ) );
	}

	/** The per-event nonce action, so a nonce for one event cannot answer another. */
	private static function nonce_action( int $event_id ): string {
		return self::ACTION . '_' . $event_id;
	}

	/**
	 * The RSVP controls for one event, or the empty string when the current user
	 * may not respond (anonymous visitors, Direction, administrators). Rendered
	 * inline by {@see Planning}. All output is escaped.
	 */
	public static function controls( int $event_id ): string {
		$user = wp_get_current_user();
		if ( 0 === $user->ID || ! user_can( $user, Roles::CAP_RESPOND ) ) {
			return '';
		}

		$current = Responses::answer_for( $user->ID, $event_id );
		$nonce   = wp_nonce_field( self::nonce_action( $event_id ), self::NONCE_FIELD, true, false );

		$button = static function ( string $answer, string $label ) use ( $current ): string {
			$is_current = ( $current === $answer );
			return sprintf(
				'<button type="submit" name="answer" value="%s" class="canetons-rsvp__button%s"%s>%s</button>',
				esc_attr( $answer ),
				$is_current ? ' is-current' : '',
				$is_current ? ' aria-pressed="true"' : '',
				esc_html( $label )
			);
		};

		return sprintf(
			'<form class="canetons-rsvp" method="post" action="%s">'
				. '<input type="hidden" name="action" value="%s">'
				. '<input type="hidden" name="event_id" value="%d">'
				. '%s%s%s</form>',
			esc_url( admin_url( 'admin-post.php' ) ),
			esc_attr( self::ACTION ),
			$event_id,
			$nonce,
			$button( Responses::ANSWER_PARTICIPATE, 'Participe' ),
			$button( Responses::ANSWER_NOT_PARTICIPATE, 'Ne participe pas' )
		);
	}

	/**
	 * Persist a member's answer. Runs on `admin_post_canetons_respond`.
	 *
	 * Order of the guards matters: authentication, then capability, then a
	 * valid event, then a valid answer. The user id written is always the
	 * session user's — request input names an event and an answer, never a user.
	 */
	public static function handle(): void {
		$user = wp_get_current_user();
		if ( 0 === $user->ID || ! user_can( $user, Roles::CAP_RESPOND ) ) {
			wp_die( 'Vous n’êtes pas autorisé à répondre.', '', array( 'response' => 403 ) );
		}

		$event_id = isset( $_POST['event_id'] ) ? absint( $_POST['event_id'] ) : 0;

		check_admin_referer( self::nonce_action( $event_id ), self::NONCE_FIELD );

		if ( EventType::POST_TYPE !== get_post_type( $event_id ) ) {
			wp_die( 'Événement introuvable.', '', array( 'response' => 400 ) );
		}

		$answer = isset( $_POST['answer'] ) ? sanitize_key( wp_unslash( $_POST['answer'] ) ) : '';
		if ( ! Responses::is_valid_answer( $answer ) ) {
			wp_die( 'Réponse invalide.', '', array( 'response' => 400 ) );
		}

		Responses::upsert( $user->ID, $event_id, $answer );

		wp_safe_redirect( wp_get_referer() ?: home_url( '/' ) );
		exit;
	}
}
