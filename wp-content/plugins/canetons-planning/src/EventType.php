<?php
/**
 * The `canetons_event` custom post type (spec §3.1).
 *
 * WordPress supplies the list screen, create/edit/delete, and per-capability
 * permissions for free; the only custom admin UI is one meta box
 * ({@see EventMetaBox}). The type is `public: false` (nothing browses events by
 * their own URL) but `show_ui: true` (they are managed in wp-admin). Every
 * management capability is mapped onto `canetons_manage_events`, so only the
 * Team Direction and administrators may write events — requirement 1.1.
 *
 * Event fields live in post meta rather than core columns: `date` in meta (not
 * `post_date`) so ordering and querying are explicit and an editor can set it
 * freely, and `weekend` as a boolean rendered as a two-day range rather than a
 * stored end date.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

use WP_Query;

final class EventType {
	public const POST_TYPE = 'canetons_event';

	// Post-meta keys. Underscore-prefixed so they are "protected" meta: hidden
	// from the generic Custom Fields box and not writable through REST without
	// the auth callback below. The plugin's own meta box is the only editor.
	public const META_DATE       = '_canetons_event_date';
	public const META_START_TIME = '_canetons_event_start_time';
	public const META_END_TIME   = '_canetons_event_end_time';
	public const META_LOCATION   = '_canetons_event_location';
	public const META_ATTIRE     = '_canetons_event_attire';
	public const META_WEEKEND    = '_canetons_event_weekend';

	/**
	 * Register the post type, its meta, and the admin list customisations.
	 * Hooked on `init`.
	 */
	public static function register(): void {
		$manage = Roles::CAP_MANAGE_EVENTS;

		register_post_type(
			self::POST_TYPE,
			array(
				'labels'          => array(
					'name'               => 'Événements',
					'singular_name'      => 'Événement',
					'add_new'            => 'Ajouter',
					'add_new_item'       => 'Ajouter un événement',
					'edit_item'          => 'Modifier l’événement',
					'new_item'           => 'Nouvel événement',
					'view_item'          => 'Voir l’événement',
					'search_items'       => 'Rechercher un événement',
					'not_found'          => 'Aucun événement',
					'not_found_in_trash' => 'Aucun événement dans la corbeille',
					'all_items'          => 'Tous les événements',
					'menu_name'          => 'Événements',
				),
				'public'          => false,
				'show_ui'         => true,
				'show_in_menu'    => true,
				'show_in_rest'    => false,
				'has_archive'     => false,
				'rewrite'         => false,
				'query_var'       => false,
				'menu_icon'       => 'dashicons-calendar-alt',
				'supports'        => array( 'title' ),
				'map_meta_cap'    => true,
				// Every management capability funnels to canetons_manage_events
				// (requirement 1.1). `read` is intentionally left at the core
				// default so published events stay readable — the public list is
				// anonymous (spec §1.1) and queries them directly.
				'capabilities'    => array(
					'edit_post'           => $manage,
					'read_post'           => $manage,
					'delete_post'         => $manage,
					'edit_posts'          => $manage,
					'edit_others_posts'   => $manage,
					'delete_posts'        => $manage,
					'delete_others_posts' => $manage,
					'publish_posts'       => $manage,
					'read_private_posts'  => $manage,
					'create_posts'        => $manage,
				),
			)
		);

		self::register_meta();

		add_filter( 'manage_' . self::POST_TYPE . '_posts_columns', array( self::class, 'columns' ) );
		add_action( 'manage_' . self::POST_TYPE . '_posts_custom_column', array( self::class, 'render_column' ), 10, 2 );
		add_filter( 'manage_edit-' . self::POST_TYPE . '_sortable_columns', array( self::class, 'sortable_columns' ) );
		add_action( 'pre_get_posts', array( self::class, 'default_admin_order' ) );
	}

	/**
	 * Register each field as post meta scoped to this post type, with a sanitize
	 * callback and REST disabled. The auth callback gates writes on
	 * canetons_manage_events, since these are protected keys.
	 */
	public static function register_meta(): void {
		$auth = static fn (): bool => current_user_can( Roles::CAP_MANAGE_EVENTS );

		$string_fields = array(
			self::META_DATE       => array( self::class, 'sanitize_date' ),
			self::META_START_TIME => array( self::class, 'sanitize_time' ),
			self::META_END_TIME   => array( self::class, 'sanitize_time' ),
			self::META_LOCATION   => 'sanitize_text_field',
			self::META_ATTIRE     => 'sanitize_text_field',
		);

		foreach ( $string_fields as $key => $sanitize ) {
			register_post_meta(
				self::POST_TYPE,
				$key,
				array(
					'type'              => 'string',
					'single'            => true,
					'default'           => '',
					'show_in_rest'      => false,
					'sanitize_callback' => $sanitize,
					'auth_callback'     => $auth,
				)
			);
		}

		register_post_meta(
			self::POST_TYPE,
			self::META_WEEKEND,
			array(
				'type'              => 'boolean',
				'single'            => true,
				'default'           => false,
				'show_in_rest'      => false,
				'sanitize_callback' => array( self::class, 'sanitize_weekend' ),
				'auth_callback'     => $auth,
			)
		);
	}

	// --- sanitizers ---------------------------------------------------------

	/** A real Y-m-d date, or the empty string. */
	public static function sanitize_date( $value ): string {
		$value = is_string( $value ) ? trim( $value ) : '';
		if ( '' === $value ) {
			return '';
		}

		try {
			EventDates::range( $value, false );
			return $value;
		} catch ( \InvalidArgumentException ) {
			return '';
		}
	}

	/** A valid time normalised to HH:MM, or the empty string. */
	public static function sanitize_time( $value ): string {
		return is_string( $value ) ? EventDates::format_time( trim( $value ) ) : '';
	}

	/** '1' when checked, '0' otherwise — stored as a stable string. */
	public static function sanitize_weekend( $value ): string {
		return ( '1' === (string) $value || 1 === $value || true === $value ) ? '1' : '0';
	}

	// --- admin list ---------------------------------------------------------

	/**
	 * Add a Date column after the title.
	 *
	 * @param array<string, string> $columns
	 * @return array<string, string>
	 */
	public static function columns( array $columns ): array {
		$out = array();
		foreach ( $columns as $key => $label ) {
			$out[ $key ] = $label;
			if ( 'title' === $key ) {
				$out['canetons_event_date'] = 'Date';
			}
		}
		return $out;
	}

	/** Render the Date column for one row. */
	public static function render_column( string $column, int $post_id ): void {
		if ( 'canetons_event_date' !== $column ) {
			return;
		}
		echo esc_html( (string) get_post_meta( $post_id, self::META_DATE, true ) );
	}

	/**
	 * Make the Date column sortable by the date meta.
	 *
	 * @param array<string, string> $columns
	 * @return array<string, string>
	 */
	public static function sortable_columns( array $columns ): array {
		$columns['canetons_event_date'] = 'canetons_event_date';
		return $columns;
	}

	/**
	 * Default the admin list to date ascending (requirement 1.1), and honour a
	 * click on the sortable Date column. Only touches this post type's own admin
	 * query.
	 */
	public static function default_admin_order( WP_Query $query ): void {
		if ( ! is_admin() || ! $query->is_main_query() ) {
			return;
		}
		if ( self::POST_TYPE !== $query->get( 'post_type' ) ) {
			return;
		}

		$orderby = $query->get( 'orderby' );
		if ( '' === $orderby || 'canetons_event_date' === $orderby ) {
			$query->set( 'meta_key', self::META_DATE );
			$query->set( 'orderby', 'meta_value' );
			if ( '' === $query->get( 'order' ) ) {
				$query->set( 'order', 'ASC' );
			}
		}
	}
}
