<?php
/**
 * One-off data migration from the old application's database (spec §7).
 *
 * Shipped in the plugin and removed once cutover is complete. Registered only
 * under WP-CLI (see the plugin bootstrap).
 *
 * The old application and WordPress live in SEPARATE databases, each with its
 * own user and no grant on the other (spec §7), so a cross-database query is
 * impossible: this reads from the old database over a second mysqli connection
 * and writes through WordPress. It carries over members and events; responses,
 * signups and contact messages are not migrated (spec §7).
 *
 * Idempotent: every migrated user and post records the old row id in the
 * `_canetons_migrated_from` meta, and a second run skips anything already
 * carried over. Passwords are NOT migrated — each member gets a random password,
 * reset out of band (spec §7, requirement 1.5).
 */

declare( strict_types=1 );

namespace Canetons\Planning\Cli;

use Canetons\Planning\EventDates;
use Canetons\Planning\EventType;
use Canetons\Planning\Instruments;
use Canetons\Planning\Roles;
use WP_CLI;
use mysqli;

final class Migrate {
	/** Meta key linking a migrated user or post back to its old row id. */
	private const MIGRATED_FROM = '_canetons_migrated_from';

	/** Old role enum -> our role slug (spec §3.4, §7). */
	private const ROLE_MAP = array(
		'user'      => Roles::ROLE_MEMBER,
		'moderator' => Roles::ROLE_MODERATOR,
		'admin'     => Roles::ROLE_DIRECTION,
	);

	// --- pure mapping helpers (unit-testable, no WordPress) -----------------

	/** Old role to WP role, defaulting to member for any unknown value. */
	public static function role_for( string $old_role ): string {
		return self::ROLE_MAP[ $old_role ] ?? Roles::ROLE_MEMBER;
	}

	/**
	 * Old French instrument name to our slug, or '' when it does not match a
	 * known section. Instruments::all() is the single source of truth, so the
	 * mapping is just its label => slug inverse.
	 */
	public static function instrument_slug_for( string $name ): string {
		$name = trim( $name );
		if ( '' === $name ) {
			return '';
		}

		$by_label = array_flip( Instruments::all() );
		return $by_label[ $name ] ?? '';
	}

	/**
	 * The synthetic address for a member (spec §7). Members have no email, but
	 * WordPress requires one; `.invalid` (RFC 2606) can never deliver. Pure — the
	 * local part is reduced to a safe, lower-case token without WordPress.
	 */
	public static function email_for( string $username ): string {
		$local = strtolower( (string) preg_replace( '/[^A-Za-z0-9._-]/', '', $username ) );
		if ( '' === $local ) {
			$local = 'membre';
		}

		return $local . '@membres.lescanetons.invalid';
	}

	// --- command -----------------------------------------------------------

	/**
	 * Migrate members and events from the old database.
	 *
	 * ## OPTIONS
	 *
	 * [--old-config=<path>]
	 * : Path to the old application's config.php; its `db` credentials are read
	 * from it. Explicit --old-db-* options override individual values.
	 *
	 * [--old-db-host=<host>]
	 * [--old-db-name=<name>]
	 * [--old-db-user=<user>]
	 * [--old-db-pass=<password>]
	 * : Old-database connection, when not using --old-config.
	 *
	 * [--only=<parts>]
	 * : Comma-separated subset of `members,events`. Default: both.
	 *
	 * [--dry-run]
	 * : Report what would be migrated without writing anything.
	 *
	 * ## EXAMPLES
	 *
	 *     wp canetons migrate --old-config=/path/to/old/config.php --dry-run
	 *     wp canetons migrate --old-db-name=lescanetoqg3 --old-db-user=... --old-db-pass=...
	 *
	 * @param array<int, string>    $args
	 * @param array<string, string> $assoc_args
	 */
	public function __invoke( array $args, array $assoc_args ): void {
		$dry  = isset( $assoc_args['dry-run'] );
		$only = isset( $assoc_args['only'] )
			? array_map( 'trim', explode( ',', $assoc_args['only'] ) )
			: array( 'members', 'events' );

		$old = $this->connect( $assoc_args );

		if ( in_array( 'members', $only, true ) ) {
			$this->migrate_members( $old, $dry );
		}
		if ( in_array( 'events', $only, true ) ) {
			$this->migrate_events( $old, $dry );
		}

		$old->close();

		WP_CLI::success( $dry ? 'Dry run complete — nothing was written.' : 'Migration complete.' );
	}

	// --- members ------------------------------------------------------------

	private function migrate_members( mysqli $old, bool $dry ): void {
		WP_CLI::log( '== Members ==' );

		$instruments = array();
		$result      = $old->query( 'SELECT id, name FROM instruments' );
		while ( $result && ( $row = $result->fetch_assoc() ) ) {
			$instruments[ (int) $row['id'] ] = (string) $row['name'];
		}

		$created = 0;
		$skipped = 0;
		$result  = $old->query( 'SELECT id, username, role, instrument_id FROM users' );
		while ( $result && ( $row = $result->fetch_assoc() ) ) {
			$old_id   = (int) $row['id'];
			$username = (string) $row['username'];

			if ( $this->already_migrated_user( $old_id ) || username_exists( $username ) ) {
				++$skipped;
				continue;
			}

			$role       = self::role_for( (string) $row['role'] );
			$instrument = isset( $instruments[ (int) $row['instrument_id'] ] )
				? self::instrument_slug_for( $instruments[ (int) $row['instrument_id'] ] )
				: '';

			if ( $dry ) {
				WP_CLI::log( "  would create {$username} ({$role})" );
				++$created;
				continue;
			}

			$user_id = wp_insert_user(
				array(
					'user_login' => $username,
					'user_pass'  => wp_generate_password( 24, true, true ),
					'user_email' => self::email_for( $username ),
					'role'       => $role,
				)
			);

			if ( is_wp_error( $user_id ) ) {
				WP_CLI::warning( "  {$username}: " . $user_id->get_error_message() );
				++$skipped;
				continue;
			}

			if ( '' !== $instrument ) {
				update_user_meta( $user_id, Instruments::META_KEY, $instrument );
			}
			update_user_meta( $user_id, self::MIGRATED_FROM, $old_id );
			++$created;
		}

		WP_CLI::log( "  members: {$created} created, {$skipped} skipped" );
	}

	private function already_migrated_user( int $old_id ): bool {
		$existing = get_users(
			array(
				'meta_key'   => self::MIGRATED_FROM,
				'meta_value' => (string) $old_id,
				'number'     => 1,
				'fields'     => 'ID',
			)
		);
		return ! empty( $existing );
	}

	// --- events -------------------------------------------------------------

	private function migrate_events( mysqli $old, bool $dry ): void {
		WP_CLI::log( '== Events ==' );

		$created = 0;
		$skipped = 0;
		$result  = $old->query(
			'SELECT id, date, title, start_time, end_time, location, attire, weekend FROM events'
		);
		while ( $result && ( $row = $result->fetch_assoc() ) ) {
			$old_id = (int) $row['id'];

			if ( $this->already_migrated_event( $old_id ) ) {
				++$skipped;
				continue;
			}

			if ( $dry ) {
				WP_CLI::log( '  would create ' . (string) $row['title'] );
				++$created;
				continue;
			}

			$post_id = wp_insert_post(
				array(
					'post_type'   => EventType::POST_TYPE,
					'post_status' => 'publish',
					'post_title'  => (string) $row['title'],
				),
				true
			);

			if ( is_wp_error( $post_id ) ) {
				WP_CLI::warning( '  ' . (string) $row['title'] . ': ' . $post_id->get_error_message() );
				++$skipped;
				continue;
			}

			update_post_meta( $post_id, EventType::META_DATE, EventType::sanitize_date( (string) $row['date'] ) );
			update_post_meta( $post_id, EventType::META_START_TIME, EventType::sanitize_time( (string) $row['start_time'] ) );
			update_post_meta( $post_id, EventType::META_END_TIME, EventType::sanitize_time( (string) $row['end_time'] ) );
			update_post_meta( $post_id, EventType::META_LOCATION, sanitize_text_field( (string) $row['location'] ) );
			update_post_meta( $post_id, EventType::META_ATTIRE, sanitize_text_field( (string) ( $row['attire'] ?? '' ) ) );
			update_post_meta( $post_id, EventType::META_WEEKEND, EventType::sanitize_weekend( $row['weekend'] ) );
			update_post_meta( $post_id, self::MIGRATED_FROM, $old_id );
			++$created;
		}

		WP_CLI::log( "  events: {$created} created, {$skipped} skipped" );
	}

	private function already_migrated_event( int $old_id ): bool {
		$existing = get_posts(
			array(
				'post_type'      => EventType::POST_TYPE,
				'post_status'    => 'any',
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'meta_key'       => self::MIGRATED_FROM,
				'meta_value'     => (string) $old_id,
			)
		);
		return ! empty( $existing );
	}

	// --- connection ---------------------------------------------------------

	private function connect( array $assoc_args ): mysqli {
		$creds = $this->credentials( $assoc_args );

		mysqli_report( MYSQLI_REPORT_OFF );
		$old = @mysqli_connect( $creds['host'], $creds['user'], $creds['password'], $creds['name'] );

		if ( ! $old instanceof mysqli ) {
			WP_CLI::error( 'Cannot connect to the old database: ' . mysqli_connect_error() );
		}

		$old->set_charset( 'utf8mb4' );
		return $old;
	}

	/**
	 * Resolve the old-database credentials from --old-config (if given) and then
	 * from explicit --old-db-* options, which take precedence.
	 *
	 * @param array<string, string> $assoc_args
	 * @return array{host: string, name: string, user: string, password: string}
	 */
	private function credentials( array $assoc_args ): array {
		$creds = array(
			'host'     => 'localhost',
			'name'     => '',
			'user'     => '',
			'password' => '',
		);

		if ( ! empty( $assoc_args['old-config'] ) ) {
			$path = $assoc_args['old-config'];
			if ( ! is_readable( $path ) ) {
				WP_CLI::error( "old-config not readable: {$path}" );
			}

			$config = require $path;
			$db      = ( is_array( $config ) && isset( $config['db'] ) && is_array( $config['db'] ) ) ? $config['db'] : array();

			$creds['host']     = (string) ( $db['host'] ?? $db['hostname'] ?? $creds['host'] );
			$creds['name']     = (string) ( $db['name'] ?? $db['database'] ?? '' );
			$creds['user']     = (string) ( $db['user'] ?? $db['username'] ?? '' );
			$creds['password'] = (string) ( $db['password'] ?? $db['pass'] ?? '' );
		}

		$creds['host']     = (string) ( $assoc_args['old-db-host'] ?? $creds['host'] );
		$creds['name']     = (string) ( $assoc_args['old-db-name'] ?? $creds['name'] );
		$creds['user']     = (string) ( $assoc_args['old-db-user'] ?? $creds['user'] );
		$creds['password'] = (string) ( $assoc_args['old-db-pass'] ?? $creds['password'] );

		if ( '' === $creds['name'] || '' === $creds['user'] ) {
			WP_CLI::error(
				'Old-database credentials missing. Provide --old-config, or '
					. '--old-db-name / --old-db-user / --old-db-pass (and --old-db-host).'
			);
		}

		return $creds;
	}
}
