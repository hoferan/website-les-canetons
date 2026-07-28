<?php
/**
 * Integration tests for the derived roster (spec §3.6).
 *
 * "Convoqués" is every canetons_respond holder — so members and moderators are
 * in, and Direction and administrators are out, without any stored list. Also
 * checks that each member carries their instrument and their answer for the
 * event.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Integration;

use Canetons\Planning\EventType;
use Canetons\Planning\Instruments;
use Canetons\Planning\Responses;
use Canetons\Planning\Roles;
use Canetons\Planning\Roster;
use WP_UnitTestCase;

final class RosterTest extends WP_UnitTestCase {

	private int $event;

	public function set_up(): void {
		parent::set_up();
		Roles::register();
		EventType::register();
		Responses::create_table();
		$this->event = self::factory()->post->create( array( 'post_type' => EventType::POST_TYPE ) );
	}

	/** @return list<string> the usernames in the roster */
	private function usernames(): array {
		return array_column( Roster::members( $this->event ), 'username' );
	}

	public function test_members_and_moderators_are_on_the_roster(): void {
		$member = self::factory()->user->create_and_get(
			array(
				'role'       => Roles::ROLE_MEMBER,
				'user_login' => 'roster_member',
			)
		);
		self::factory()->user->create(
			array(
				'role'       => Roles::ROLE_MODERATOR,
				'user_login' => 'roster_moderator',
			)
		);

		$usernames = $this->usernames();
		$this->assertContains( 'roster_member', $usernames );
		$this->assertContains( 'roster_moderator', $usernames );
		$this->assertContains( $member->user_login, $usernames );
	}

	public function test_direction_and_administrators_are_excluded(): void {
		self::factory()->user->create(
			array(
				'role'       => Roles::ROLE_DIRECTION,
				'user_login' => 'roster_direction',
			)
		);
		self::factory()->user->create(
			array(
				'role'       => 'administrator',
				'user_login' => 'roster_admin',
			)
		);

		$usernames = $this->usernames();
		$this->assertNotContains( 'roster_direction', $usernames );
		$this->assertNotContains( 'roster_admin', $usernames );
	}

	public function test_a_member_carries_their_instrument_and_answer(): void {
		$member = self::factory()->user->create( array( 'role' => Roles::ROLE_MEMBER ) );
		update_user_meta( $member, Instruments::META_KEY, 'trumpet' );
		Responses::upsert( $member, $this->event, Responses::ANSWER_PARTICIPATE );

		$row = null;
		foreach ( Roster::members( $this->event ) as $candidate ) {
			if ( $candidate['id'] === $member ) {
				$row = $candidate;
				break;
			}
		}

		$this->assertNotNull( $row );
		$this->assertSame( 'trumpet', $row['instrument'] );
		$this->assertSame( Responses::ANSWER_PARTICIPATE, $row['answer'] );
	}

	public function test_a_member_who_has_not_answered_has_a_null_answer(): void {
		$member = self::factory()->user->create( array( 'role' => Roles::ROLE_MEMBER ) );

		$row = null;
		foreach ( Roster::members( $this->event ) as $candidate ) {
			if ( $candidate['id'] === $member ) {
				$row = $candidate;
				break;
			}
		}

		$this->assertNotNull( $row );
		$this->assertNull( $row['answer'] );
	}
}
