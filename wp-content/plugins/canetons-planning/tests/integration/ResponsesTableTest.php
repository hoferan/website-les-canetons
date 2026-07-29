<?php
/**
 * Integration tests for the responses table (spec §3.2, §1.2, §9).
 *
 * The upsert idempotency of requirement 1.2 is the point: answering again
 * updates the existing row rather than adding a second. Also covers per-member
 * isolation and the delete-cascade hooks.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Integration;

use Canetons\Planning\EventType;
use Canetons\Planning\Responses;
use WP_UnitTestCase;

final class ResponsesTableTest extends WP_UnitTestCase {

	public function set_up(): void {
		parent::set_up();
		EventType::register();
		Responses::create_table();
	}

	private function count_rows(): int {
		global $wpdb;
		$table = Responses::table();
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
	}

	/**
	 * SHOW TABLES cannot answer this question here: the WordPress test harness
	 * filters `query` to rewrite CREATE TABLE into CREATE TEMPORARY TABLE, and
	 * MariaDB omits temporary tables from both SHOW TABLES and information_schema
	 * while still reading and writing them normally. SHOW COLUMNS does see them,
	 * and asserting the column set is the stronger check in any case — it pins the
	 * schema of spec §3.2, not merely the table's existence.
	 */
	public function test_the_table_exists_after_creation(): void {
		global $wpdb;
		$table = Responses::table();

		$this->assertSame(
			array( 'id', 'user_id', 'event_id', 'answer', 'created_at', 'updated_at' ),
			$wpdb->get_col( "SHOW COLUMNS FROM {$table}" )
		);
	}

	public function test_answering_again_updates_rather_than_inserts(): void {
		$user  = self::factory()->user->create();
		$event = self::factory()->post->create( array( 'post_type' => EventType::POST_TYPE ) );

		Responses::upsert( $user, $event, Responses::ANSWER_PARTICIPATE );
		Responses::upsert( $user, $event, Responses::ANSWER_NOT_PARTICIPATE );

		$this->assertSame( 1, $this->count_rows(), 'the unique key must prevent a second row' );
		$this->assertSame(
			Responses::ANSWER_NOT_PARTICIPATE,
			Responses::answer_for( $user, $event )
		);
	}

	public function test_an_invalid_answer_is_never_stored(): void {
		$user  = self::factory()->user->create();
		$event = self::factory()->post->create( array( 'post_type' => EventType::POST_TYPE ) );

		$this->assertFalse( Responses::upsert( $user, $event, 'maybe' ) );
		$this->assertNull( Responses::answer_for( $user, $event ) );
	}

	public function test_answers_are_isolated_per_member(): void {
		$alice = self::factory()->user->create();
		$bob   = self::factory()->user->create();
		$event = self::factory()->post->create( array( 'post_type' => EventType::POST_TYPE ) );

		Responses::upsert( $alice, $event, Responses::ANSWER_PARTICIPATE );

		$this->assertSame( Responses::ANSWER_PARTICIPATE, Responses::answer_for( $alice, $event ) );
		$this->assertNull( Responses::answer_for( $bob, $event ) );
	}

	public function test_deleting_a_user_removes_their_responses(): void {
		require_once ABSPATH . 'wp-admin/includes/user.php';

		$user  = self::factory()->user->create();
		$event = self::factory()->post->create( array( 'post_type' => EventType::POST_TYPE ) );
		Responses::upsert( $user, $event, Responses::ANSWER_PARTICIPATE );

		wp_delete_user( $user );

		$this->assertSame( 0, $this->count_rows() );
	}

	public function test_deleting_an_event_removes_its_responses(): void {
		$user  = self::factory()->user->create();
		$event = self::factory()->post->create( array( 'post_type' => EventType::POST_TYPE ) );
		Responses::upsert( $user, $event, Responses::ANSWER_PARTICIPATE );

		wp_delete_post( $event, true );

		$this->assertSame( 0, $this->count_rows() );
	}
}
