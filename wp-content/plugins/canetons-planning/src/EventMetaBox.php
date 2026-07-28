<?php
/**
 * The single event meta box (spec §3.1, §3.5).
 *
 * The only custom admin UI for events: the date, times, location, attire and
 * weekend fields on the event edit screen. Saving is nonce- and
 * capability-guarded, and every value goes through {@see EventType}'s registered
 * sanitizers.
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
		$date     = (string) get_post_meta( $post->ID, EventType::META_DATE, true );
		$start    = (string) get_post_meta( $post->ID, EventType::META_START_TIME, true );
		$end      = (string) get_post_meta( $post->ID, EventType::META_END_TIME, true );
		$location = (string) get_post_meta( $post->ID, EventType::META_LOCATION, true );
		$attire   = (string) get_post_meta( $post->ID, EventType::META_ATTIRE, true );
		$weekend  = '1' === (string) get_post_meta( $post->ID, EventType::META_WEEKEND, true );

		wp_nonce_field( self::NONCE_ACTION, self::NONCE_FIELD );
		?>
		<table class="form-table" role="presentation">
			<tr>
				<th><label for="canetons_event_date">Date</label></th>
				<td>
					<input type="date" id="canetons_event_date"
						name="<?php echo esc_attr( EventType::META_DATE ); ?>"
						value="<?php echo esc_attr( $date ); ?>" required>
				</td>
			</tr>
			<tr>
				<th><label for="canetons_event_start">Heure de début</label></th>
				<td>
					<input type="time" id="canetons_event_start"
						name="<?php echo esc_attr( EventType::META_START_TIME ); ?>"
						value="<?php echo esc_attr( $start ); ?>">
				</td>
			</tr>
			<tr>
				<th><label for="canetons_event_end">Heure de fin</label></th>
				<td>
					<input type="time" id="canetons_event_end"
						name="<?php echo esc_attr( EventType::META_END_TIME ); ?>"
						value="<?php echo esc_attr( $end ); ?>">
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
			<tr>
				<th>Week-end</th>
				<td>
					<label>
						<input type="checkbox" value="1"
							name="<?php echo esc_attr( EventType::META_WEEKEND ); ?>"
							<?php checked( $weekend ); ?>>
						Événement sur deux jours (le jour indiqué et le suivant).
					</label>
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
	 * Every value is sanitized through EventType's registered callbacks so the
	 * meta box and any programmatic write share one definition of "valid".
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

		$text_fields = array(
			EventType::META_DATE       => array( EventType::class, 'sanitize_date' ),
			EventType::META_START_TIME => array( EventType::class, 'sanitize_time' ),
			EventType::META_END_TIME   => array( EventType::class, 'sanitize_time' ),
			EventType::META_LOCATION   => 'sanitize_text_field',
			EventType::META_ATTIRE     => 'sanitize_text_field',
		);

		foreach ( $text_fields as $key => $sanitize ) {
			$raw   = isset( $_POST[ $key ] ) ? wp_unslash( $_POST[ $key ] ) : '';
			$value = call_user_func( $sanitize, $raw );
			update_post_meta( $post_id, $key, $value );
		}

		// A checkbox is absent from the POST body when unchecked.
		$weekend = EventType::sanitize_weekend( $_POST[ EventType::META_WEEKEND ] ?? '0' );
		update_post_meta( $post_id, EventType::META_WEEKEND, $weekend );
	}
}
