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

	/** Query upcoming events and render the list. */
	public static function render(): string {
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
			return '<p class="canetons-planning__empty">Aucun événement à venir.</p>';
		}

		$items = '';
		foreach ( $query->posts as $post ) {
			$items .= self::render_event( $post );
		}
		wp_reset_postdata();

		return '<ul class="canetons-planning">' . $items . '</ul>';
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
			$parts[] = '<span class="canetons-planning__attire">' . esc_html( 'Tenue : ' . $attire ) . '</span>';
		}

		// RSVP controls for a member who may respond; empty for everyone else
		// (anonymous visitors, Direction, administrators). Already escaped.
		$rsvp = Rsvp::controls( $post->ID );

		return '<li class="canetons-planning__event">' . implode( ' ', $parts ) . $rsvp . '</li>';
	}

	/**
	 * French date, single day or a range. Anchored at noon so the site timezone
	 * can never shift a date-only value onto the wrong calendar day. Returns the
	 * raw string; the caller escapes it.
	 */
	private static function format_date( string $start_date, string $end_date ): string {
		try {
			$multi_day = EventDates::is_multi_day( $start_date, $end_date );
			$start     = EventDates::parse_date( $start_date );
		} catch ( \InvalidArgumentException ) {
			return '';
		}

		$start_ts = $start->getTimestamp() + 12 * HOUR_IN_SECONDS;

		if ( ! $multi_day ) {
			return (string) wp_date( 'l j F Y', $start_ts );
		}

		$end_ts = EventDates::parse_date( $end_date )->getTimestamp() + 12 * HOUR_IN_SECONDS;
		return wp_date( 'l j F', $start_ts ) . ' – ' . wp_date( 'l j F Y', $end_ts );
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
