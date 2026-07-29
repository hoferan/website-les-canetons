<?php
/**
 * The public planning list (spec §1.1, §3.5).
 *
 * Renders upcoming events, sorted by start date ascending, readable by anonymous
 * visitors — the events list is public (requirement 1.1). An event stays listed
 * until its END date has passed, so a multi-day event remains visible while it is
 * in progress. Plan 4 extends the same surface with a member's own answer and
 * RSVP buttons.
 *
 * Exposed as the `[canetons_planning]` shortcode. The spec names this surface a
 * "block"; it is a server-rendered shortcode here to avoid a JavaScript build
 * the plugin otherwise has no need for. Promoting it to a block or block pattern
 * belongs with the theme work (spec §5), where an editor build context exists.
 *
 * Rendering is the one place event dates become French text: {@see EventDates}
 * validates them purely, and wp_date() applies the fr_FR locale.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

use WP_Post;
use WP_Query;

final class Planning {
	/** Register the shortcode. Hooked on `init`. */
	public static function register(): void {
		add_shortcode( 'canetons_planning', array( self::class, 'render' ) );
	}

	/** Query upcoming events and render the list, plus its structured data. */
	public static function render(): string {
		// Captured before the loop: wp_reset_postdata() below restores the global
		// post, and the page URL must be the page carrying the shortcode, not the
		// last event rendered.
		$page_url = self::current_page_url();

		$query = new WP_Query(
			array(
				'post_type'      => EventType::POST_TYPE,
				'post_status'    => 'publish',
				'posts_per_page' => -1,
				'no_found_rows'  => true,
				'meta_key'       => EventType::META_START_DATE,
				'orderby'        => 'meta_value',
				'order'          => 'ASC',
				// Keep an event until its end date has passed, so an in-progress
				// multi-day event stays listed on its later days.
				'meta_query'     => array(
					array(
						'key'     => EventType::META_END_DATE,
						'value'   => current_time( 'Y-m-d' ),
						'compare' => '>=',
						'type'    => 'DATE',
					),
				),
			)
		);

		if ( ! $query->have_posts() ) {
			$empty = (string) apply_filters( 'canetons_planning_empty_text', 'Aucun événement à venir.' );
			return '<p class="canetons-planning__empty">' . esc_html( $empty ) . '</p>';
		}

		$items  = '';
		$events = array();
		foreach ( $query->posts as $post ) {
			$items   .= self::render_event( $post );
			$events[] = self::event_values( $post );
		}
		wp_reset_postdata();

		return '<ul class="canetons-planning">' . $items . '</ul>' . self::schema_script( $events, $page_url );
	}

	/**
	 * The plain values one event contributes to the structured data. Kept separate
	 * from render_event() so the builder receives data, never markup.
	 *
	 * @return array<string, string>
	 */
	private static function event_values( WP_Post $post ): array {
		return array(
			'title'      => (string) get_the_title( $post ),
			'start_date' => (string) get_post_meta( $post->ID, EventType::META_START_DATE, true ),
			'start_time' => (string) get_post_meta( $post->ID, EventType::META_START_TIME, true ),
			'end_date'   => (string) get_post_meta( $post->ID, EventType::META_END_DATE, true ),
			'end_time'   => (string) get_post_meta( $post->ID, EventType::META_END_TIME, true ),
			'location'   => (string) get_post_meta( $post->ID, EventType::META_LOCATION, true ),
		);
	}

	/**
	 * The JSON-LD block, or '' when no event could be described.
	 *
	 * The JSON_HEX_* flags are load-bearing. PHP does not escape `<` or `>` by
	 * default, so a title containing `</script>` would close this block and
	 * everything after it would be parsed as HTML. Only `unfiltered_html` holders
	 * can store such a title — WordPress kses-filters titles for everyone else, so
	 * the Team Direction cannot — but an administrator can, and that is enough.
	 *
	 * @param array<int, array<string, string>> $events
	 */
	private static function schema_script( array $events, string $page_url ): string {
		$document = EventSchema::build(
			$events,
			$page_url,
			array(
				'name' => (string) get_bloginfo( 'name' ),
				'url'  => home_url( '/' ),
			),
			(string) wp_timezone_string()
		);

		if ( empty( $document ) ) {
			return '';
		}

		$json = wp_json_encode(
			$document,
			JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
		);

		if ( false === $json ) {
			return '';
		}

		return '<script type="application/ld+json">' . $json . '</script>';
	}

	/**
	 * The permalink of the page being viewed, for Event.url. Events have no URL of
	 * their own (spec §3.1 makes the post type non-public), so the listing page is
	 * the only honest answer.
	 */
	private static function current_page_url(): string {
		$queried = get_queried_object();
		if ( $queried instanceof WP_Post ) {
			return (string) get_permalink( $queried );
		}

		return home_url( '/' );
	}

	/** Render one event as a list item. All output is escaped. */
	private static function render_event( WP_Post $post ): string {
		$start_date = (string) get_post_meta( $post->ID, EventType::META_START_DATE, true );
		$end_date   = (string) get_post_meta( $post->ID, EventType::META_END_DATE, true );

		$parts = array(
			'<span class="canetons-planning__title">' . esc_html( get_the_title( $post ) ) . '</span>',
			'<span class="canetons-planning__date">' . esc_html( self::format_date( $start_date, $end_date ) ) . '</span>',
		);

		$time = self::format_time_range(
			(string) get_post_meta( $post->ID, EventType::META_START_TIME, true ),
			(string) get_post_meta( $post->ID, EventType::META_END_TIME, true )
		);
		if ( '' !== $time ) {
			$parts[] = '<span class="canetons-planning__time">' . esc_html( $time ) . '</span>';
		}

		$location = (string) get_post_meta( $post->ID, EventType::META_LOCATION, true );
		if ( '' !== $location ) {
			$parts[] = '<span class="canetons-planning__location">' . esc_html( $location ) . '</span>';
		}

		$attire = (string) get_post_meta( $post->ID, EventType::META_ATTIRE, true );
		if ( '' !== $attire ) {
			// Filterable so the theme can supply German on /de/*; the plugin itself
			// stays French, per the bilingual design.
			$label   = (string) apply_filters( 'canetons_planning_attire_label', 'Tenue : ' );
			$parts[] = '<span class="canetons-planning__attire">' . esc_html( $label . $attire ) . '</span>';
		}

		// RSVP controls for a member who may respond; empty for everyone else
		// (anonymous visitors, Direction, administrators). Already escaped.
		$rsvp = Rsvp::controls( $post->ID );

		return '<li class="canetons-planning__event">' . implode( ' ', $parts ) . $rsvp . '</li>';
	}

	/**
	 * The event's date as display text, single day or a range. Anchored at noon so
	 * the site timezone can never shift a date-only value onto the wrong calendar
	 * day. Returns the raw string; the caller escapes it.
	 *
	 * The formats are filterable so the German tree can use numeric dates without
	 * switching locale mid-request — three strings do not justify that machinery.
	 */
	private static function format_date( string $start_date, string $end_date ): string {
		$formats = (array) apply_filters(
			'canetons_planning_date_format',
			array(
				'single'      => 'l j F Y',
				'range_start' => 'l j F',
				'range_end'   => 'l j F Y',
			)
		);

		try {
			$multi_day = EventDates::is_multi_day( $start_date, $end_date );
			$start     = EventDates::parse_date( $start_date );
		} catch ( \InvalidArgumentException ) {
			return '';
		}

		$start_ts = $start->getTimestamp() + 12 * HOUR_IN_SECONDS;

		if ( ! $multi_day ) {
			return (string) wp_date( (string) ( $formats['single'] ?? 'l j F Y' ), $start_ts );
		}

		$end_ts = EventDates::parse_date( $end_date )->getTimestamp() + 12 * HOUR_IN_SECONDS;

		return wp_date( (string) ( $formats['range_start'] ?? 'l j F' ), $start_ts )
			. ' – '
			. wp_date( (string) ( $formats['range_end'] ?? 'l j F Y' ), $end_ts );
	}

	/** "HH:MM – HH:MM", or just the start, or "" when neither is set. */
	private static function format_time_range( string $start, string $end ): string {
		$start = EventDates::format_time( $start );
		$end   = EventDates::format_time( $end );

		if ( '' === $start ) {
			return '';
		}

		return '' === $end ? $start : $start . ' – ' . $end;
	}
}
