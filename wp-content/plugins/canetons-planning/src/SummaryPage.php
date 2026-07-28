<?php
/**
 * The "Résumé des inscriptions" admin page (spec §1.3, §3.5).
 *
 * A submenu under Événements, gated on `canetons_view_summary` — so members and
 * moderators never see it, and Direction and administrators do. It takes an
 * event as its parameter and renders the four counters, the roster table and
 * the per-instrument participant counts. Read-only: no nonce, the capability is
 * the whole gate.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

use WP_Query;

final class SummaryPage {
	private const SLUG = 'canetons-summary';

	/** French label for each row answer state. */
	private const ANSWER_LABELS = array(
		Responses::ANSWER_PARTICIPATE     => 'Participe',
		Responses::ANSWER_NOT_PARTICIPATE => 'Ne participe pas',
		Summary::STATE_NONE               => 'Pas de réponse',
	);

	/** Register the submenu. Hooked on `admin_menu`. */
	public static function register(): void {
		add_submenu_page(
			'edit.php?post_type=' . EventType::POST_TYPE,
			'Résumé des inscriptions',
			'Résumé des inscriptions',
			Roles::CAP_VIEW_SUMMARY,
			self::SLUG,
			array( self::class, 'render' )
		);
	}

	/** Render the page. */
	public static function render(): void {
		if ( ! current_user_can( Roles::CAP_VIEW_SUMMARY ) ) {
			wp_die( 'Vous n’êtes pas autorisé à voir cette page.', '', array( 'response' => 403 ) );
		}

		$event_id = isset( $_GET['event_id'] ) ? absint( $_GET['event_id'] ) : 0;

		echo '<div class="wrap">';
		echo '<h1>' . esc_html( 'Résumé des inscriptions' ) . '</h1>';

		self::render_selector( $event_id );

		if ( 0 !== $event_id && EventType::POST_TYPE === get_post_type( $event_id ) ) {
			$summary = Summary::compute( Roster::members( $event_id ), Instruments::all() );
			self::render_summary( $summary, (string) get_the_title( $event_id ) );
		} else {
			echo '<p>' . esc_html( 'Choisissez un événement.' ) . '</p>';
		}

		echo '</div>';
	}

	/** The event picker: a GET form reloading the page with ?event_id=. */
	private static function render_selector( int $selected ): void {
		$events = new WP_Query(
			array(
				'post_type'      => EventType::POST_TYPE,
				'post_status'    => 'publish',
				'posts_per_page' => -1,
				'no_found_rows'  => true,
				'meta_key'       => EventType::META_DATE,
				'orderby'        => 'meta_value',
				'order'          => 'ASC',
			)
		);

		echo '<form method="get" action="' . esc_url( admin_url( 'edit.php' ) ) . '">';
		echo '<input type="hidden" name="post_type" value="' . esc_attr( EventType::POST_TYPE ) . '">';
		echo '<input type="hidden" name="page" value="' . esc_attr( self::SLUG ) . '">';
		echo '<select name="event_id">';
		echo '<option value="0">' . esc_html( '— Événement —' ) . '</option>';
		foreach ( $events->posts as $event ) {
			printf(
				'<option value="%d"%s>%s</option>',
				$event->ID,
				selected( $selected, $event->ID, false ),
				esc_html( get_the_title( $event ) )
			);
		}
		echo '</select> ';
		submit_button( 'Afficher', 'secondary', '', false );
		echo '</form>';

		wp_reset_postdata();
	}

	/**
	 * @param array{convoques: int, participate: int, notparticipate: int, no_response: int, rows: list<array{username: string, instrument: string, answer: string}>, per_instrument: list<array{slug: string, label: string, participate: int}>} $summary
	 */
	private static function render_summary( array $summary, string $title ): void {
		echo '<h2>' . esc_html( $title ) . '</h2>';

		// --- the four counters ---------------------------------------------
		$counters = array(
			'Convoqués'        => $summary['convoques'],
			'Participe'        => $summary['participate'],
			'Ne participe pas' => $summary['notparticipate'],
			'Pas de réponse'   => $summary['no_response'],
		);
		echo '<ul class="canetons-summary__counters">';
		foreach ( $counters as $label => $value ) {
			echo '<li><strong>' . esc_html( (string) $value ) . '</strong> ' . esc_html( $label ) . '</li>';
		}
		echo '</ul>';

		// --- the roster table ----------------------------------------------
		echo '<h3>' . esc_html( 'Convoqués' ) . '</h3>';
		echo '<table class="widefat striped"><thead><tr>';
		echo '<th>' . esc_html( 'Membre' ) . '</th>';
		echo '<th>' . esc_html( 'Instrument' ) . '</th>';
		echo '<th>' . esc_html( 'Réponse' ) . '</th>';
		echo '</tr></thead><tbody>';
		foreach ( $summary['rows'] as $row ) {
			echo '<tr>';
			echo '<td>' . esc_html( $row['username'] ) . '</td>';
			echo '<td>' . esc_html( (string) ( Instruments::label( $row['instrument'] ) ?? '—' ) ) . '</td>';
			echo '<td>' . esc_html( self::ANSWER_LABELS[ $row['answer'] ] ?? '' ) . '</td>';
			echo '</tr>';
		}
		echo '</tbody></table>';

		// --- per-instrument participant counts -----------------------------
		echo '<h3>' . esc_html( 'Participants par instrument' ) . '</h3>';
		echo '<table class="widefat striped"><thead><tr>';
		echo '<th>' . esc_html( 'Instrument' ) . '</th>';
		echo '<th>' . esc_html( 'Participants' ) . '</th>';
		echo '</tr></thead><tbody>';
		foreach ( $summary['per_instrument'] as $instrument ) {
			echo '<tr>';
			echo '<td>' . esc_html( $instrument['label'] ) . '</td>';
			echo '<td>' . esc_html( (string) $instrument['participate'] ) . '</td>';
			echo '</tr>';
		}
		echo '</tbody></table>';
	}
}
