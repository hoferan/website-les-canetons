# Public Agenda and Event Structured Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the existing public event list a home at `/fr/agenda/` and `/de/termine/`, with schema.org `Event` JSON-LD and German labels on the German tree.

**Architecture:** No new rendering path. `[canetons_planning]` already renders upcoming events for anonymous visitors; this adds a pure JSON-LD builder in `src/EventSchema.php`, three filters on the strings that would otherwise be French on a German page, theme-side German implementations of those filters, and the two pages themselves. The plugin stays monolingual — the bilingual layer lives in the theme, as the bilingual design requires.

**Tech Stack:** WordPress 6.9, PHP 8.4, PHPUnit 9.6 (`wp-phpunit` for integration), WP-CLI for content. No build step.

Spec: `docs/superpowers/specs/2026-07-29-public-agenda-design.md`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `wp-content/plugins/canetons-planning/src/EventSchema.php` | **Create.** Pure builder: plain event values → JSON-LD array. No WordPress calls, so ISO composition and the omission rules are unit-testable. |
| `wp-content/plugins/canetons-planning/tests/unit/EventSchemaTest.php` | **Create.** Unit tests for the builder. |
| `wp-content/plugins/canetons-planning/src/Planning.php` | **Modify.** Three filters, collect event values while rendering, emit one `<script>`. Stays the only WordPress-facing part. |
| `wp-content/plugins/canetons-planning/tests/integration/PlanningListTest.php` | **Modify.** JSON-LD presence, exclusion of past events, valid JSON, and the `</script>` escaping property. |
| `wp-content/themes/canetons/functions.php` | **Modify.** German implementations of the three filters, keyed on `canetons_current_language()`. |
| `docs/superpowers/specs/2026-07-28-wordpress-migration-design.md` | **Modify.** §1.7 gains the agenda page. |
| `docs/cutover.md`, `docs/desktop-bringup.md` | **Modify.** "nine pages" → ten. |

Note: `npm run wp:test:unit` and `wp:test:integration` do **not** forward `--filter`, so every test command below runs a whole suite.

---

### Task 1: The pure JSON-LD builder

**Files:**
- Create: `wp-content/plugins/canetons-planning/src/EventSchema.php`
- Test: `wp-content/plugins/canetons-planning/tests/unit/EventSchemaTest.php`

- [x] **Step 1: Write the failing test**

Create `wp-content/plugins/canetons-planning/tests/unit/EventSchemaTest.php`:

```php
<?php
/**
 * Unit tests for the JSON-LD builder (agenda design §3, §4).
 *
 * Pure: no WordPress. The builder does use the timezone database, unlike
 * EventDates, because an ISO 8601 offset cannot be produced without it.
 */

declare( strict_types=1 );

namespace Canetons\Planning\Tests\Unit;

use Canetons\Planning\EventSchema;
use PHPUnit\Framework\TestCase;

final class EventSchemaTest extends TestCase {

	private const ORGANIZER = array(
		'name' => 'Guggenmusik Les Canetons de Fribourg',
		'url'  => 'https://lescanetons.org',
	);

	private const PAGE = 'https://lescanetons.org/fr/agenda/';
	private const TZ   = 'Europe/Zurich';

	/**
	 * @param array<string, string> $overrides
	 * @return array<string, string>
	 */
	private function event( array $overrides = array() ): array {
		return array_merge(
			array(
				'title'      => 'Concert de gala',
				'start_date' => '2026-08-22',
				'start_time' => '20:00',
				'end_date'   => '2026-08-22',
				'end_time'   => '23:00',
				'location'   => 'Fribourg',
			),
			$overrides
		);
	}

	public function test_a_node_carries_the_required_fields(): void {
		$node = EventSchema::event_node( $this->event(), self::PAGE, self::ORGANIZER, self::TZ );

		$this->assertSame( 'Event', $node['@type'] );
		$this->assertSame( 'Concert de gala', $node['name'] );
		$this->assertSame( self::PAGE, $node['url'] );
		$this->assertSame( 'https://schema.org/EventScheduled', $node['eventStatus'] );
		$this->assertSame( 'https://schema.org/OfflineEventAttendanceMode', $node['eventAttendanceMode'] );
		$this->assertSame( 'Organization', $node['organizer']['@type'] );
	}

	/** August is CEST, so the offset must be +02:00 — not UTC, and not naive. */
	public function test_a_time_produces_an_iso_value_with_the_zurich_offset(): void {
		$node = EventSchema::event_node( $this->event(), self::PAGE, self::ORGANIZER, self::TZ );

		$this->assertSame( '2026-08-22T20:00:00+02:00', $node['startDate'] );
		$this->assertSame( '2026-08-22T23:00:00+02:00', $node['endDate'] );
	}

	/** January is CET. The offset is not a constant. */
	public function test_a_winter_date_uses_the_winter_offset(): void {
		$node = EventSchema::event_node(
			$this->event( array( 'start_date' => '2027-01-23', 'end_date' => '2027-01-23' ) ),
			self::PAGE,
			self::ORGANIZER,
			self::TZ
		);

		$this->assertSame( '2027-01-23T20:00:00+01:00', $node['startDate'] );
	}

	public function test_a_missing_time_yields_a_date_only_value(): void {
		$node = EventSchema::event_node(
			$this->event( array( 'start_time' => '', 'end_time' => '' ) ),
			self::PAGE,
			self::ORGANIZER,
			self::TZ
		);

		$this->assertSame( '2026-08-22', $node['startDate'] );
		$this->assertArrayNotHasKey( 'endDate', $node, 'a same-day event with no times has no distinct end' );
	}

	public function test_a_multi_day_event_keeps_its_end_date(): void {
		$node = EventSchema::event_node(
			$this->event( array( 'end_date' => '2026-08-23', 'end_time' => '02:00' ) ),
			self::PAGE,
			self::ORGANIZER,
			self::TZ
		);

		$this->assertSame( '2026-08-23T02:00:00+02:00', $node['endDate'] );
	}

	public function test_an_absent_end_date_falls_back_to_the_start(): void {
		$node = EventSchema::event_node(
			$this->event( array( 'end_date' => '', 'end_time' => '' ) ),
			self::PAGE,
			self::ORGANIZER,
			self::TZ
		);

		$this->assertSame( '2026-08-22', $node['startDate'] );
		$this->assertArrayNotHasKey( 'endDate', $node );
	}

	public function test_a_missing_location_omits_the_place(): void {
		$node = EventSchema::event_node(
			$this->event( array( 'location' => '' ) ),
			self::PAGE,
			self::ORGANIZER,
			self::TZ
		);

		$this->assertArrayNotHasKey( 'location', $node, 'an empty Place is worse than no Place' );
	}

	public function test_a_location_becomes_a_named_place(): void {
		$node = EventSchema::event_node( $this->event(), self::PAGE, self::ORGANIZER, self::TZ );

		$this->assertSame( 'Place', $node['location']['@type'] );
		$this->assertSame( 'Fribourg', $node['location']['name'] );
	}

	public function test_an_event_without_a_title_or_date_is_dropped(): void {
		$this->assertNull(
			EventSchema::event_node( $this->event( array( 'title' => '' ) ), self::PAGE, self::ORGANIZER, self::TZ )
		);
		$this->assertNull(
			EventSchema::event_node( $this->event( array( 'start_date' => '' ) ), self::PAGE, self::ORGANIZER, self::TZ )
		);
	}

	public function test_an_impossible_date_is_dropped_rather_than_rolled_forward(): void {
		$this->assertNull(
			EventSchema::event_node(
				$this->event( array( 'start_date' => '2026-13-40' ) ),
				self::PAGE,
				self::ORGANIZER,
				self::TZ
			)
		);
	}

	public function test_build_wraps_the_nodes_in_one_graph(): void {
		$document = EventSchema::build(
			array( $this->event(), $this->event( array( 'title' => 'Cortège' ) ) ),
			self::PAGE,
			self::ORGANIZER,
			self::TZ
		);

		$this->assertSame( 'https://schema.org', $document['@context'] );
		$this->assertCount( 2, $document['@graph'] );
		$this->assertSame( 'Cortège', $document['@graph'][1]['name'] );
	}

	public function test_build_returns_nothing_when_no_event_survives(): void {
		$this->assertSame(
			array(),
			EventSchema::build( array( $this->event( array( 'title' => '' ) ) ), self::PAGE, self::ORGANIZER, self::TZ ),
			'an empty document must be distinguishable, so the caller can emit no script at all'
		);
	}
}
```

- [x] **Step 2: Run the unit suite to verify it fails**

Run: `npm run wp:test:unit`
Expected: FAIL — `Error: Class "Canetons\Planning\EventSchema" not found`.

- [x] **Step 3: Write the implementation**

Create `wp-content/plugins/canetons-planning/src/EventSchema.php`:

```php
<?php
/**
 * schema.org Event JSON-LD for the public agenda (agenda design §3).
 *
 * Pure by design — no WordPress — so ISO composition and the omission rules are
 * unit-testable (spec §9). It does use the timezone database, unlike
 * {@see EventDates}: an ISO 8601 value without an offset is ambiguous, and a
 * concert at 20:00 in Fribourg is not 20:00 UTC.
 *
 * Events deliberately have no public URL of their own (spec §3.1 registers the
 * post type `public: false`, `rewrite: false`), so every node points at the page
 * that lists it. That is why the page URL is a parameter rather than something
 * this class could derive.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;

final class EventSchema {
	/**
	 * One Event node, or null when the event cannot be described honestly.
	 *
	 * A node is dropped rather than patched: structured data is a machine-readable
	 * claim, and a node with an invented date is worse than no node.
	 *
	 * @param array<string, string> $event    title, start_date, start_time, end_date, end_time, location.
	 * @param array<string, string> $organizer name and url.
	 * @return array<string, mixed>|null
	 */
	public static function event_node( array $event, string $page_url, array $organizer, string $timezone ): ?array {
		$title      = trim( (string) ( $event['title'] ?? '' ) );
		$start_date = trim( (string) ( $event['start_date'] ?? '' ) );

		if ( '' === $title || '' === $start_date || ! self::is_date( $start_date ) ) {
			return null;
		}

		$start = self::iso( $start_date, (string) ( $event['start_time'] ?? '' ), $timezone );

		$node = array(
			'@type'               => 'Event',
			'name'                => $title,
			'startDate'           => $start,
			'eventStatus'         => 'https://schema.org/EventScheduled',
			'eventAttendanceMode' => 'https://schema.org/OfflineEventAttendanceMode',
			'url'                 => $page_url,
			'organizer'           => array(
				'@type' => 'Organization',
				'name'  => (string) ( $organizer['name'] ?? '' ),
				'url'   => (string) ( $organizer['url'] ?? '' ),
			),
		);

		// An end date equal to the start carries no information, so it is omitted
		// rather than repeated.
		$end_date = trim( (string) ( $event['end_date'] ?? '' ) );
		if ( '' === $end_date || ! self::is_date( $end_date ) ) {
			$end_date = $start_date;
		}
		$end = self::iso( $end_date, (string) ( $event['end_time'] ?? '' ), $timezone );
		if ( $end !== $start ) {
			$node['endDate'] = $end;
		}

		// A Place with no name is noise, so an absent location omits the property.
		$location = trim( (string) ( $event['location'] ?? '' ) );
		if ( '' !== $location ) {
			$node['location'] = array(
				'@type' => 'Place',
				'name'  => $location,
			);
		}

		return $node;
	}

	/**
	 * The whole document: one @context, every surviving node in an @graph. Returns
	 * an empty array when nothing survives, so the caller can emit no script tag
	 * rather than an empty one.
	 *
	 * @param array<int, array<string, string>> $events
	 * @param array<string, string>             $organizer
	 * @return array<string, mixed>
	 */
	public static function build( array $events, string $page_url, array $organizer, string $timezone ): array {
		$nodes = array();
		foreach ( $events as $event ) {
			$node = self::event_node( $event, $page_url, $organizer, $timezone );
			if ( null !== $node ) {
				$nodes[] = $node;
			}
		}

		if ( empty( $nodes ) ) {
			return array();
		}

		return array(
			'@context' => 'https://schema.org',
			'@graph'   => $nodes,
		);
	}

	/** Y-m-d, and a real calendar date. */
	private static function is_date( string $date ): bool {
		try {
			EventDates::parse_date( $date );
			return true;
		} catch ( InvalidArgumentException ) {
			return false;
		}
	}

	/**
	 * `Y-m-d` when there is no usable time, else a full ISO 8601 value carrying the
	 * zone's offset for that date — which differs between CET and CEST, so it
	 * cannot be hardcoded.
	 */
	private static function iso( string $date, string $time, string $timezone ): string {
		$normalised = EventDates::format_time( $time );
		if ( '' === $normalised ) {
			return $date;
		}

		$moment = new DateTimeImmutable( $date . ' ' . $normalised, new DateTimeZone( $timezone ) );

		return $moment->format( 'Y-m-d\TH:i:sP' );
	}
}
```

- [x] **Step 4: Run the unit suite to verify it passes**

Run: `npm run wp:test:unit`
Expected: PASS — the previous 45 tests plus 12 new ones, all green.

- [x] **Step 5: Commit**

```bash
git add wp-content/plugins/canetons-planning/src/EventSchema.php wp-content/plugins/canetons-planning/tests/unit/EventSchemaTest.php
git commit -m "feat(wp): add the pure Event JSON-LD builder"
```

---

### Task 2: Emit the JSON-LD from the shortcode

**Files:**
- Modify: `wp-content/plugins/canetons-planning/src/Planning.php`
- Test: `wp-content/plugins/canetons-planning/tests/integration/PlanningListTest.php`

- [x] **Step 1: Write the failing tests**

Append these methods inside the existing `PlanningListTest` class, before its closing brace:

```php
	/** Decode the JSON-LD block, or fail loudly. */
	private function schema_from( string $html ): array {
		$this->assertMatchesRegularExpression(
			'#<script type="application/ld\+json">.*</script>#s',
			$html,
			'the planning list should emit a JSON-LD block'
		);

		preg_match( '#<script type="application/ld\+json">(.*?)</script>#s', $html, $m );
		$decoded = json_decode( (string) $m[1], true );

		$this->assertIsArray( $decoded, 'the JSON-LD block must be valid JSON: ' . json_last_error_msg() );

		return $decoded;
	}

	public function test_each_upcoming_event_gets_a_schema_node(): void {
		$this->make_event( 'Concert', $this->days_from_now( 7 ) );
		$this->make_event( 'Cortège', $this->days_from_now( 14 ) );

		$schema = $this->schema_from( do_shortcode( '[canetons_planning]' ) );

		$this->assertSame( 'https://schema.org', $schema['@context'] );
		$this->assertCount( 2, $schema['@graph'] );
		$this->assertSame( 'Event', $schema['@graph'][0]['@type'] );
		$this->assertSame( 'Concert', $schema['@graph'][0]['name'] );
	}

	public function test_past_events_contribute_no_schema_node(): void {
		$this->make_event( 'Passé', $this->days_from_now( -30 ) );
		$this->make_event( 'À venir', $this->days_from_now( 7 ) );

		$schema = $this->schema_from( do_shortcode( '[canetons_planning]' ) );

		$this->assertCount( 1, $schema['@graph'] );
		$this->assertSame( 'À venir', $schema['@graph'][0]['name'] );
	}

	public function test_no_schema_block_when_nothing_is_upcoming(): void {
		$this->assertStringNotContainsString(
			'application/ld+json',
			do_shortcode( '[canetons_planning]' ),
			'an empty graph must produce no script tag at all'
		);
	}

	/**
	 * Event titles are authored by the Team Direction — semi-trusted, which is
	 * exactly why a title must not be able to close the script block and have the
	 * rest of the document parsed as HTML.
	 */
	public function test_a_title_cannot_break_out_of_the_script_block(): void {
		$title = 'Bal </script><script>alert(1)</script>';
		$this->make_event( $title, $this->days_from_now( 7 ) );

		$html = do_shortcode( '[canetons_planning]' );

		preg_match( '#<script type="application/ld\+json">(.*?)</script>#s', $html, $m );
		$this->assertStringNotContainsString( '</script>', (string) $m[1], 'the payload must not contain a literal closing tag' );

		$decoded = json_decode( (string) $m[1], true );
		$this->assertSame( $title, $decoded['@graph'][0]['name'], 'escaping must not corrupt the value' );
	}
```

- [x] **Step 2: Run the integration suite to verify it fails**

Run: `npm run wp:test:integration`
Expected: FAIL — four failures, each on "the planning list should emit a JSON-LD block" or the `assertStringNotContainsString` for the empty case passing trivially. The first three fail because no block exists yet.

- [x] **Step 3: Write the implementation**

In `wp-content/plugins/canetons-planning/src/Planning.php`, replace the whole `render()` method with:

```php
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
	 * default, so an event title containing `</script>` would close this block and
	 * everything after it would be parsed as HTML.
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
```

- [x] **Step 4: Run the integration suite to verify it passes**

Run: `npm run wp:test:integration`
Expected: PASS — the previous 42 tests plus 4 new ones.

- [x] **Step 5: Commit**

```bash
git add wp-content/plugins/canetons-planning/src/Planning.php wp-content/plugins/canetons-planning/tests/integration/PlanningListTest.php
git commit -m "feat(wp): emit Event JSON-LD from the planning shortcode"
```

---

### Task 3: The two remaining label filters

**Files:**
- Modify: `wp-content/plugins/canetons-planning/src/Planning.php`
- Test: `wp-content/plugins/canetons-planning/tests/integration/PlanningListTest.php`

The empty-state filter landed in Task 2 because that code path was rewritten there. This task adds the attire label and the date formats.

- [x] **Step 1: Write the failing tests**

Append inside `PlanningListTest`, before its closing brace:

```php
	public function test_the_empty_state_text_is_filterable(): void {
		add_filter( 'canetons_planning_empty_text', static fn (): string => 'Keine bevorstehenden Termine.' );

		$this->assertStringContainsString( 'Keine bevorstehenden Termine.', do_shortcode( '[canetons_planning]' ) );
	}

	public function test_the_attire_label_is_filterable(): void {
		$id = $this->make_event( 'Concert', $this->days_from_now( 7 ) );
		update_post_meta( $id, EventType::META_ATTIRE, 'Costume' );

		add_filter( 'canetons_planning_attire_label', static fn (): string => 'Kleidung: ' );

		$html = do_shortcode( '[canetons_planning]' );

		$this->assertStringContainsString( 'Kleidung: Costume', $html );
		$this->assertStringNotContainsString( 'Tenue', $html );
	}

	public function test_the_attire_label_defaults_to_french(): void {
		$id = $this->make_event( 'Concert', $this->days_from_now( 7 ) );
		update_post_meta( $id, EventType::META_ATTIRE, 'Costume' );

		$this->assertStringContainsString( 'Tenue : Costume', do_shortcode( '[canetons_planning]' ) );
	}

	public function test_the_date_format_is_filterable(): void {
		$this->make_event( 'Concert', '2026-08-22', '2026-08-22' );

		add_filter(
			'canetons_planning_date_format',
			static fn (): array => array(
				'single'      => 'd.m.Y',
				'range_start' => 'd.m.',
				'range_end'   => 'd.m.Y',
			)
		);

		$this->assertStringContainsString( '22.08.2026', do_shortcode( '[canetons_planning]' ) );
	}
```

Note: the date-format test pins a fixed date in 2026 rather than a relative one, so the assertion is about formatting and not about today. That date is in the future relative to the project's timeline; if it ever falls into the past, change both the event date and the expected string together.

- [x] **Step 2: Run the integration suite to verify it fails**

Run: `npm run wp:test:integration`
Expected: FAIL — `test_the_attire_label_is_filterable` finds "Tenue" still present, and `test_the_date_format_is_filterable` does not find `22.08.2026`.

- [x] **Step 3: Write the implementation**

In `src/Planning.php`, replace the attire block inside `render_event()`. Find:

```php
		$attire = (string) get_post_meta( $post->ID, EventType::META_ATTIRE, true );
		if ( '' !== $attire ) {
			$parts[] = '<span class="canetons-planning__attire">' . esc_html( 'Tenue : ' . $attire ) . '</span>';
		}
```

Replace with:

```php
		$attire = (string) get_post_meta( $post->ID, EventType::META_ATTIRE, true );
		if ( '' !== $attire ) {
			// Filterable so the theme can supply German on /de/*; the plugin itself
			// stays French, per the bilingual design.
			$label   = (string) apply_filters( 'canetons_planning_attire_label', 'Tenue : ' );
			$parts[] = '<span class="canetons-planning__attire">' . esc_html( $label . $attire ) . '</span>';
		}
```

Then replace the whole `format_date()` method with:

```php
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
```

- [x] **Step 4: Run both suites to verify they pass**

Run: `npm run wp:test`
Expected: PASS — unit 57, integration 50.

- [x] **Step 5: Commit**

```bash
git add wp-content/plugins/canetons-planning/src/Planning.php wp-content/plugins/canetons-planning/tests/integration/PlanningListTest.php
git commit -m "feat(wp): make the planning list's three French strings filterable"
```

---

### Task 4: German labels from the theme

**Files:**
- Modify: `wp-content/themes/canetons/functions.php`

- [x] **Step 1: Write the implementation**

There is no test step here: the theme is not covered by either suite (the plugin's integration suite loads the plugin, not the theme), and this is verified over HTTP in Task 6. Append to `wp-content/themes/canetons/functions.php`:

```php
/**
 * German labels for the planning list on the /de/ tree.
 *
 * The plugin is French-only by design and stays that way: it exposes these three
 * filters with French defaults, and the bilingual layer — this theme — supplies
 * German where the tree is German. That keeps the "no translation layer"
 * principle intact, with no gettext and no .po files for three strings.
 *
 * Dates are numeric on the German side rather than "Samstag 22. August 2026",
 * because full German month names would need switch_to_locale() around the
 * render, which changes every translated string in that scope.
 */
add_filter(
	'canetons_planning_empty_text',
	static function ( string $text ): string {
		return 'de' === canetons_current_language() ? 'Keine bevorstehenden Termine.' : $text;
	}
);

add_filter(
	'canetons_planning_attire_label',
	static function ( string $label ): string {
		return 'de' === canetons_current_language() ? 'Kleidung: ' : $label;
	}
);

add_filter(
	'canetons_planning_date_format',
	static function ( array $formats ): array {
		if ( 'de' !== canetons_current_language() ) {
			return $formats;
		}

		return array(
			'single'      => 'd.m.Y',
			'range_start' => 'd.m.',
			'range_end'   => 'd.m.Y',
		);
	}
);
```

- [x] **Step 2: Commit**

```bash
git add wp-content/themes/canetons/functions.php
git commit -m "feat(theme): German planning labels on the /de/ tree"
```

---

### Task 5: The two agenda pages

**Files:**
- No repository files. This is content, and content lives in the database (spec §10).

The pages must exist in every environment. Locally, run the command below; on TEST and PROD they arrive with the one-time seed import, per the content-propagation design.

- [x] **Step 1: Create both pages, linked as twins, and add them to the menus**

Create the file below with your editor at
`wp-content/plugins/canetons-planning/agenda-pages.php`. That location is not
arbitrary: only `wp-content/themes/canetons`, `wp-content/plugins/canetons-planning`
and `docker/wp/mu-plugins` are bind-mounted into the `wp-cli` container, so a file
anywhere else is invisible to it. `docker compose cp` is not an option — `wp-cli`
runs as `run --rm` and has no long-lived container to copy into. **Step 3 deletes
the file**; left in place it would be deployed.

Do not paste this as a shell heredoc — write it as a file.

```php
<?php
$pages = array(
	'fr' => array( 'slug' => 'agenda',  'title' => 'Agenda',  'todo' => 'TODO — introduire l’agenda en une phrase.' ),
	'de' => array( 'slug' => 'termine', 'title' => 'Termine', 'todo' => 'TODO — den Terminkalender in einem Satz einleiten.' ),
);

$ids = array();
foreach ( $pages as $lang => $page ) {
	$root = get_page_by_path( $lang );
	if ( ! $root ) {
		WP_CLI::error( "Missing tree root: {$lang}" );
	}

	$path     = $lang . '/' . $page['slug'];
	$existing = get_page_by_path( $path );

	$data = array(
		'post_type'    => 'page',
		'post_status'  => 'publish',
		'post_title'   => $page['title'],
		'post_name'    => $page['slug'],
		'post_parent'  => $root->ID,
		'menu_order'   => 5,
		'post_content' => "<!-- wp:shortcode -->[canetons_language_switcher]<!-- /wp:shortcode -->"
			. "\n\n<!-- wp:heading --><h2 class=\"wp-block-heading\">" . $page['title'] . "</h2><!-- /wp:heading -->"
			. "\n\n<!-- wp:paragraph --><p>" . $page['todo'] . "</p><!-- /wp:paragraph -->"
			. "\n\n<!-- wp:shortcode -->[canetons_planning]<!-- /wp:shortcode -->",
	);

	if ( $existing ) {
		$data['ID'] = $existing->ID;
		wp_update_post( $data );
		$ids[ $lang ] = (int) $existing->ID;
	} else {
		$ids[ $lang ] = (int) wp_insert_post( $data, true );
	}
	WP_CLI::log( "page {$path} => {$ids[$lang]}" );
}

update_post_meta( $ids['fr'], '_canetons_lang_alt', get_permalink( $ids['de'] ) );
update_post_meta( $ids['de'], '_canetons_lang_alt', get_permalink( $ids['fr'] ) );
WP_CLI::log( 'twin links set' );

// Add each page to its own language menu, after the landing page.
$menus = array( 'fr' => 'Menu FR', 'de' => 'Menu DE' );
foreach ( $menus as $lang => $title ) {
	$found = get_posts( array( 'post_type' => 'wp_navigation', 'post_status' => 'any', 'title' => $title, 'posts_per_page' => 1 ) );
	if ( empty( $found ) ) {
		WP_CLI::warning( "no menu named {$title}" );
		continue;
	}

	$menu = $found[0];
	if ( false !== strpos( $menu->post_content, '"id":' . $ids[ $lang ] . ',' ) ) {
		WP_CLI::log( "{$title} already links the agenda" );
		continue;
	}

	$link = '<!-- wp:navigation-link {"label":"' . get_the_title( $ids[ $lang ] )
		. '","type":"page","id":' . $ids[ $lang ]
		. ',"url":"' . get_permalink( $ids[ $lang ] ) . '","kind":"post-type"} /-->' . "\n";

	wp_update_post( array( 'ID' => $menu->ID, 'post_content' => $menu->post_content . $link ) );
	WP_CLI::log( "{$title} updated" );
}
```

- [x] **Step 2: Run it**

```bash
npm run wp:cli eval-file /var/www/html/wp-content/plugins/canetons-planning/agenda-pages.php
```

Expected output: `page fr/agenda => N`, `page de/termine => N`, `twin links set`, then `Menu FR updated` and `Menu DE updated`. Re-running is safe — pages are matched by path and each menu is skipped if it already links its agenda.

- [x] **Step 3: Delete the scratch file**

```bash
rm wp-content/plugins/canetons-planning/agenda-pages.php
git status --porcelain
```

Expected: `git status` shows nothing — the file is gone and nothing else changed, because pages are database content.

- [x] **Step 4: Verify both pages serve**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8100/fr/agenda/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8100/de/termine/
```

Expected: `200` from each. The JSON-LD block is checked in Task 6, once an event exists — with no upcoming events there is correctly no block at all.

- [x] **Step 5: Take a snapshot, since this is content**

```bash
npm run wp:snapshot
```

The two pages exist only in the database. A `npm run wp:reset` would destroy them.

---

### Task 6: Verify over HTTP, both trees

**Files:**
- None. Verification only.

- [x] **Step 1: Create one upcoming event to have something to render**

```bash
npm run wp:cli post create -- --post_type=canetons_event --post_title="Concert de gala" --post_status=publish --porcelain
```

Note the returned id, then set its meta (replace `<ID>`):

```bash
npm run wp:cli post meta update -- <ID> _canetons_event_start_date 2026-12-05
npm run wp:cli post meta update -- <ID> _canetons_event_end_date 2026-12-05
npm run wp:cli post meta update -- <ID> _canetons_event_start_time 20:00
npm run wp:cli post meta update -- <ID> _canetons_event_end_time 23:00
npm run wp:cli post meta update -- <ID> _canetons_event_location Fribourg
npm run wp:cli post meta update -- <ID> _canetons_event_attire Costume
```

- [x] **Step 2: Check the French agenda**

```bash
curl -s http://localhost:8100/fr/agenda/ | grep -o 'Tenue : Costume'
curl -s http://localhost:8100/fr/agenda/ | grep -o 'samedi 5 décembre 2026'
```

Expected: both strings found — French label, French date.

- [x] **Step 3: Check the German agenda**

```bash
curl -s http://localhost:8100/de/termine/ | grep -o 'Kleidung: Costume'
curl -s http://localhost:8100/de/termine/ | grep -o '05.12.2026'
curl -s http://localhost:8100/de/termine/ | grep -c 'Tenue'
```

Expected: the German label and the numeric date found; the `Tenue` count is `0`.

- [x] **Step 4: Check the structured data is valid and points at the right page**

```bash
curl -s http://localhost:8100/fr/agenda/ \
  | sed -n 's#.*<script type="application/ld+json">\(.*\)</script>.*#\1#p' \
  | python -m json.tool
```

Expected: valid JSON printing, `"url": "http://localhost:8100/fr/agenda/"`, `"startDate": "2026-12-05T20:00:00+01:00"` (December is CET, so `+01:00`), and a `Place` named `Fribourg`.

- [x] **Step 5: Delete the test event**

```bash
npm run wp:cli post delete -- <ID> --force
```

The Phase 5 export must carry pages and media, never events.

- [x] **Step 6: Run both suites once more**

Run: `npm run wp:test`
Expected: PASS, unit 57 and integration 50.

---

### Task 7: Update the documents that say "nine pages"

**Files:**
- Modify: `docs/superpowers/specs/2026-07-28-wordpress-migration-design.md` (§1.7)
- Modify: `docs/cutover.md:66`
- Modify: `docs/desktop-bringup.md:82`

- [x] **Step 1: Amend §1.7**

In `docs/superpowers/specs/2026-07-28-wordpress-migration-design.md`, find:

```markdown
Nine informational pages: accueil, canetons, historique, commencement,
moniteurs, comité / team direction, cd, multimedia, sponsors. Plus the contact
page and a login entry point.
```

Replace with:

```markdown
Ten informational pages: accueil, agenda, canetons, historique, commencement,
moniteurs, comité / team direction, cd, multimedia, sponsors. Plus the contact
page and a login entry point. The agenda was added by
`2026-07-29-public-agenda-design.md`; it renders the public event list, which
requirement 1.1 already made readable without logging in.
```

- [x] **Step 2: Amend the two checklists**

In `docs/cutover.md`, change `Verify the **nine pages** (accueil, canetons,` to `Verify the **ten pages** (accueil, agenda, canetons,`.

In `docs/desktop-bringup.md`, change `Author the **nine pages** as children of `fr` (accueil, canetons,` to `Author the **ten pages** as children of `fr` (accueil, agenda, canetons,`.

- [x] **Step 3: Confirm nothing still says nine**

```bash
grep -rn "nine pages\|nine informational" docs/ CLAUDE.md
```

Expected: no output.

- [x] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: record the agenda as the tenth informational page"
```

---

## Done when

- `npm run wp:test` passes: unit 57, integration 50.
- `/fr/agenda/` shows French labels and a French date; `/de/termine/` shows German labels and a numeric date, with no `Tenue` anywhere.
- Both pages emit one valid JSON-LD block whose `url` is that page and whose `startDate` carries the correct seasonal offset.
- No test event or member remains in the database.
- No document claims nine informational pages.
