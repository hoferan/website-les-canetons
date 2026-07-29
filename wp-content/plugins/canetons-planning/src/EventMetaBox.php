<?php
/**
 * The single event meta box (spec §3.1, §3.5).
 *
 * The only custom admin UI for events: start date/time and end date/time, plus
 * location and attire, on the event edit screen. Saving is nonce- and
 * capability-guarded, and every value goes through {@see EventType}'s registered
 * sanitizers. An empty end date defaults to the start date (a single-day event).
 */

declare( strict_types=1 );

namespace Canetons\Planning;

use WP_Post;

final class EventMetaBox {
	private const NONCE_ACTION = 'canetons_save_event';
	private const NONCE_FIELD  = 'canetons_event_nonce';

	/** Register the meta box on the event edit screen. Hooked on `add_meta_boxes`. */
	public static function register(): void {
		add_meta_box(
			'canetons_event_details',
			'Détails de l’événement',
			array( self::class, 'render' ),
			EventType::POST_TYPE,
			'normal',
			'high'
		);
	}

	/** Render the fields. */
	public static function render( WP_Post $post ): void {
		$start_date = (string) get_post_meta( $post->ID, EventType::META_START_DATE, true );
		$start_time = (string) get_post_meta( $post->ID, EventType::META_START_TIME, true );
		$end_date   = (string) get_post_meta( $post->ID, EventType::META_END_DATE, true );
		$end_time   = (string) get_post_meta( $post->ID, EventType::META_END_TIME, true );
		$location   = (string) get_post_meta( $post->ID, EventType::META_LOCATION, true );
		$attire     = (string) get_post_meta( $post->ID, EventType::META_ATTIRE, true );

		wp_nonce_field( self::NONCE_ACTION, self::NONCE_FIELD );
		?>
		<table class="form-table" role="presentation">
			<tr>
				<th><label for="canetons_event_start_date">Début</label></th>
				<td>
					<input type="date" id="canetons_event_start_date"
						name="<?php echo esc_attr( EventType::META_START_DATE ); ?>"
						value="<?php echo esc_attr( $start_date ); ?>" required>
					<input type="time"
						name="<?php echo esc_attr( EventType::META_START_TIME ); ?>"
						value="<?php echo esc_attr( $start_time ); ?>">
				</td>
			</tr>
			<tr>
				<th><label for="canetons_event_end_date">Fin</label></th>
				<td>
					<input type="date" id="canetons_event_end_date"
						name="<?php echo esc_attr( EventType::META_END_DATE ); ?>"
						value="<?php echo esc_attr( $end_date ); ?>">
					<input type="time"
						name="<?php echo esc_attr( EventType::META_END_TIME ); ?>"
						value="<?php echo esc_attr( $end_time ); ?>">
					<p class="description">Laissez la date de fin vide pour un événement d’un seul jour.</p>
				</td>
			</tr>
			<tr>
				<th><label for="canetons_event_location">Lieu</label></th>
				<td>
					<input type="text" class="regular-text" id="canetons_event_location"
						name="<?php echo esc_attr( EventType::META_LOCATION ); ?>"
						value="<?php echo esc_attr( $location ); ?>">
				</td>
			</tr>
			<tr>
				<th><label for="canetons_event_attire">Tenue</label></th>
				<td>
					<input type="text" class="regular-text" id="canetons_event_attire"
						name="<?php echo esc_attr( EventType::META_ATTIRE ); ?>"
						value="<?php echo esc_attr( $attire ); ?>">
					<p class="description">Optionnel.</p>
				</td>
			</tr>
		</table>
		<?php
	}

	/**
	 * Persist the fields. Hooked on `save_post_canetons_event`.
	 *
	 * Guards, in order: skip autosaves; require the nonce; require the
	 * management capability on this post (mapped to canetons_manage_events).
	 * Every value is sanitized through EventType's registered callbacks. An empty
	 * end date falls back to the start date, so a single-day event still has a
	 * queryable end.
	 */
	public static function save( int $post_id, WP_Post $post ): void {
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}

		if (
			! isset( $_POST[ self::NONCE_FIELD ] )
			|| ! wp_verify_nonce(
				sanitize_key( wp_unslash( $_POST[ self::NONCE_FIELD ] ) ),
				self::NONCE_ACTION
			)
		) {
			return;
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		$start_date = EventType::sanitize_date( self::posted( EventType::META_START_DATE ) );
		$end_date   = EventType::sanitize_date( self::posted( EventType::META_END_DATE ) );

		// An empty (or earlier-than-start) end date means a single-day event.
		if ( '' === $end_date || $end_date < $start_date ) {
			$end_date = $start_date;
		}

		update_post_meta( $post_id, EventType::META_START_DATE, $start_date );
		update_post_meta( $post_id, EventType::META_END_DATE, $end_date );
		update_post_meta( $post_id, EventType::META_START_TIME, EventType::sanitize_time( self::posted( EventType::META_START_TIME ) ) );
		update_post_meta( $post_id, EventType::META_END_TIME, EventType::sanitize_time( self::posted( EventType::META_END_TIME ) ) );
		update_post_meta( $post_id, EventType::META_LOCATION, sanitize_text_field( self::posted( EventType::META_LOCATION ) ) );
		update_post_meta( $post_id, EventType::META_ATTIRE, sanitize_text_field( self::posted( EventType::META_ATTIRE ) ) );
	}

	/** The unslashed raw POST value for a field, or the empty string. */
	private static function posted( string $key ): string {
		return isset( $_POST[ $key ] ) ? (string) wp_unslash( $_POST[ $key ] ) : '';
	}
}
