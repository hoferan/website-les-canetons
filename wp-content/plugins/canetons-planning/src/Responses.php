<?php
/**
 * The responses table and its data access (spec §3.2, §1.2).
 *
 * A real table rather than post or user meta, for two reasons the spec calls
 * out: the UNIQUE KEY (user_id, event_id) makes "answering again updates the
 * existing answer" true by construction rather than by application logic, and
 * the attendance summary (Plan 5) is an aggregate join that meta tables serve
 * badly.
 *
 * The set of valid answers is pure and unit-testable; everything else here is
 * $wpdb-facing. Rows are removed when their user or event is deleted, via the
 * deleted_user / before_delete_post hooks wired in the plugin bootstrap — there
 * are no MySQL foreign keys, matching WordPress core and shared-hosting reality.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

final class Responses {
	public const ANSWER_PARTICIPATE     = 'participate';
	public const ANSWER_NOT_PARTICIPATE = 'notparticipate';

	/** Unprefixed table name; {@see self::table()} adds the site prefix. */
	private const TABLE = 'canetons_responses';

	/**
	 * The two permitted answers. Pure — no WordPress — so validity is
	 * unit-testable.
	 *
	 * @return list<string>
	 */
	public static function answers(): array {
		return array( self::ANSWER_PARTICIPATE, self::ANSWER_NOT_PARTICIPATE );
	}

	/** Whether a string is exactly one of the permitted answers (requirement 1.2). */
	public static function is_valid_answer( string $answer ): bool {
		return in_array( $answer, self::answers(), true );
	}

	/** The prefixed table name. */
	public static function table(): string {
		global $wpdb;
		return $wpdb->prefix . self::TABLE;
	}

	/**
	 * Create the table. Called on activation behind the schema-version guard, so
	 * it runs once per version bump; dbDelta() is itself idempotent.
	 */
	public static function create_table(): void {
		global $wpdb;

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$table   = self::table();
		$collate = $wpdb->get_charset_collate();

		// dbDelta is whitespace-sensitive: two spaces after PRIMARY KEY, each
		// field on its own line, lower-case types.
		$sql = "CREATE TABLE {$table} (
	id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
	user_id bigint(20) unsigned NOT NULL,
	event_id bigint(20) unsigned NOT NULL,
	answer enum('participate','notparticipate') NOT NULL,
	created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at timestamp NULL DEFAULT NULL,
	PRIMARY KEY  (id),
	UNIQUE KEY user_event (user_id,event_id)
) {$collate};";

		dbDelta( $sql );
	}

	/**
	 * Insert or update a member's answer for an event (requirement 1.2). The
	 * UNIQUE KEY makes this a genuine upsert: a second answer for the same
	 * (user, event) overwrites the first rather than adding a row.
	 *
	 * The caller passes the acting user; this method never reads it from request
	 * input. That is the structural half of requirement 1.2's own-response-only
	 * rule — see {@see Rsvp::handle()} for the capability and session half.
	 */
	public static function upsert( int $user_id, int $event_id, string $answer ): bool {
		if ( ! self::is_valid_answer( $answer ) ) {
			return false;
		}

		global $wpdb;
		$table = self::table();

		$sql = $wpdb->prepare(
			"INSERT INTO {$table} (user_id, event_id, answer) VALUES (%d, %d, %s)
			ON DUPLICATE KEY UPDATE answer = VALUES(answer), updated_at = CURRENT_TIMESTAMP",
			$user_id,
			$event_id,
			$answer
		);

		return false !== $wpdb->query( $sql );
	}

	/** A member's own answer for an event, or null if they have not answered. */
	public static function answer_for( int $user_id, int $event_id ): ?string {
		global $wpdb;
		$table = self::table();

		$value = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT answer FROM {$table} WHERE user_id = %d AND event_id = %d",
				$user_id,
				$event_id
			)
		);

		return null === $value ? null : (string) $value;
	}

	/** Remove every response by a user. Hooked on `deleted_user`. */
	public static function delete_for_user( int $user_id ): void {
		global $wpdb;
		$wpdb->delete( self::table(), array( 'user_id' => $user_id ), array( '%d' ) );
	}

	/**
	 * Remove every response for an event. Hooked on `before_delete_post`, which
	 * fires for every post type, so this ignores anything that is not an event.
	 */
	public static function delete_for_event( int $post_id ): void {
		if ( EventType::POST_TYPE !== get_post_type( $post_id ) ) {
			return;
		}

		global $wpdb;
		$wpdb->delete( self::table(), array( 'event_id' => $post_id ), array( '%d' ) );
	}
}
