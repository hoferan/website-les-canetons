<?php
/**
 * The instrument-section field on the user-profile screen (spec §3.3).
 *
 * A member's section is administrator-managed, so the control appears on the
 * user-edit screen in wp-admin. Rendering and saving are separated from the
 * section data itself, which lives in {@see Instruments}.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

use WP_User;

final class Profile {
	/** Nonce action and field name for the profile update. */
	private const NONCE_ACTION = 'canetons_save_instrument';
	private const NONCE_FIELD  = 'canetons_instrument_nonce';

	/**
	 * Render the section <select> on the profile screen. Hooked on
	 * `show_user_profile` and `edit_user_profile`.
	 *
	 * Shown only to someone who may edit this user — the same capability the save
	 * side enforces — so a member cannot see (or, below, set) the field on their
	 * own profile.
	 */
	public static function render_field( WP_User $user ): void {
		if ( ! current_user_can( 'edit_user', $user->ID ) ) {
			return;
		}

		$current = (string) get_user_meta( $user->ID, Instruments::META_KEY, true );

		wp_nonce_field( self::NONCE_ACTION, self::NONCE_FIELD );
		?>
		<h2>Section</h2>
		<table class="form-table" role="presentation">
			<tr>
				<th>
					<label for="<?php echo esc_attr( Instruments::META_KEY ); ?>">Instrument</label>
				</th>
				<td>
					<select
						name="<?php echo esc_attr( Instruments::META_KEY ); ?>"
						id="<?php echo esc_attr( Instruments::META_KEY ); ?>">
						<option value="">— Aucune —</option>
						<?php foreach ( Instruments::all() as $slug => $label ) : ?>
							<option
								value="<?php echo esc_attr( $slug ); ?>"
								<?php selected( $current, $slug ); ?>>
								<?php echo esc_html( $label ); ?>
							</option>
						<?php endforeach; ?>
					</select>
				</td>
			</tr>
		</table>
		<?php
	}

	/**
	 * Save the section. Hooked on `personal_options_update` and
	 * `edit_user_profile_update`.
	 *
	 * The capability check and the value sanitization are the security boundary:
	 * only someone who may edit the user may change it, and the stored value can
	 * only ever be a known slug or the empty string ({@see Instruments::sanitize}
	 * runs here and again through register_meta()). An empty value deletes the
	 * meta rather than storing "".
	 */
	public static function save_field( int $user_id ): void {
		if ( ! current_user_can( 'edit_user', $user_id ) ) {
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

		$raw   = isset( $_POST[ Instruments::META_KEY ] )
			? wp_unslash( $_POST[ Instruments::META_KEY ] )
			: '';
		$value = Instruments::sanitize( $raw );

		if ( '' === $value ) {
			delete_user_meta( $user_id, Instruments::META_KEY );
			return;
		}

		update_user_meta( $user_id, Instruments::META_KEY, $value );
	}
}
