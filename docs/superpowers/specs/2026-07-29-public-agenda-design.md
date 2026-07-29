# Design — public agenda and Event structured data

**Date:** 2026-07-29
**Amends:** `docs/superpowers/specs/2026-07-28-wordpress-migration-design.md`
§1.7 (the informational pages become ten, not nine) and §5 (the theme gains three
small filter implementations).
**Composes with:** `2026-07-28-bilingual-public-content-design.md` — the agenda is
an ordinary page in each of the two trees.

## Context

The band plays concerts and carnival appearances; visitors have no way to see
when. The events themselves already exist as first-class data — the
`canetons_event` post type with start and end dates, times, location and attire
(§3.1) — and are already rendered publicly. What is missing is a place to put
that list, and a machine-readable form of it.

This design deliberately adds very little. Most of the work was done by earlier
plans and is simply unplaced.

## What already exists

`[canetons_planning]` (`src/Planning.php`) already:

- queries `publish` events ordered by start date ascending;
- keeps an event listed until its **end** date has passed, so an in-progress
  multi-day event stays visible;
- excludes past events;
- renders an empty state when nothing is upcoming;
- is **readable by anonymous visitors** — requirement 1.1;
- renders RSVP controls only for holders of `canetons_respond`, so Direction and
  administrators see none.

All of it is covered by `tests/integration/PlanningListTest.php` and
`RsvpControlsTest.php`. This design therefore does **not** introduce a second
rendering path, a read-only variant, or a new shortcode.

## Decisions

| Decision | Chosen | Rejected |
| --- | --- | --- |
| Where the agenda lives | **A new page pair, `/fr/agenda/` and `/de/termine/`** | On `accueil`/`aktuell`; both |
| Which shortcode renders it | **The existing `[canetons_planning]`** | A separate read-only `[canetons_agenda]` |
| German labels | **Three filters; the theme supplies German on `/de/*`** | Accepting French; gettext-ing the plugin; language-neutral formats only |
| Structured data emitter | **The shortcode itself** | A separate `wp_head` hook that has to rediscover the page |
| `Event.url` | **The agenda page's permalink** | Making events publicly addressable |
| Code location | **`canetons-planning`, pure builder in `src/`** | The theme |

### 1. Placement

A dedicated URL is what gets linked, bookmarked and indexed. Folding the list
into `accueil` gives it no address of its own and makes the event markup share a
page whose subject is the band. §1.7 grows from nine informational pages to ten;
`docs/cutover.md` and `docs/desktop-bringup.md` both say "nine pages" and must be
updated with it.

Accepted consequence: a logged-in member visiting the public agenda sees RSVP
controls there too, because the shortcode decides by capability rather than by
page. That is coherent — a member may answer from wherever they see the event —
but it does mean two surfaces can accept an answer. The write path is the same
`admin-post.php` handler with the same per-event nonce, so this adds no new
attack surface.

### 2. Bilingual labels

Only three French strings reach public output. Everything else on the page is
data (event title, location, attire value, times):

| String | Source |
| --- | --- |
| `Aucun événement à venir.` | the empty state |
| `Tenue : ` | the attire prefix |
| French weekday and month names | `wp_date()` under the `fr_FR` site locale |

Three filters are added, defaulting to today's French behaviour:

- `canetons_planning_empty_text`
- `canetons_planning_attire_label`
- `canetons_planning_date_format`

The **theme** implements them for `/de/*`, using `canetons_current_language()`,
which it already has. This keeps the plugin monolingual — no gettext, no `.po`
files, no translation layer — so §2's "no translation layer" principle and the
bilingual design's "the plugin and members' area stay French" both hold. The
bilingual-ness stays where that design put it: in the theme and the content.

German dates come from a numeric format supplied by the filter rather than from
switching locale mid-request, which would be a far heavier mechanism for three
strings.

### 3. Structured data

`Planning::render()` appends one `<script type="application/ld+json">` holding an
array of `Event` nodes, one per event already rendered. Emitting from the
shortcode means the markup is correct wherever the shortcode is placed and can
never describe a different set of events than the visible list.

Per event:

| Field | Source | Notes |
| --- | --- | --- |
| `@type` | `Event` | |
| `name` | post title | |
| `startDate` | start date + start time | ISO 8601 with the Europe/Zurich offset; **date-only** when no time is set |
| `endDate` | end date + end time | omitted when it would equal `startDate` |
| `location` | location meta | a `Place` with `name` only |
| `organizer` | fixed | `Organization`, the band, `url` = `home_url()` |
| `url` | the current page's permalink | see the constraint below |
| `eventStatus` | fixed | `EventScheduled` |
| `eventAttendanceMode` | fixed | `OfflineEventAttendanceMode` |

Fields deliberately absent: `image`, `offers`, `performer`, `description`. None
exists as event data today, and inventing them would put unverifiable claims in
machine-readable form.

#### Two constraints, recorded rather than discovered later

- **Events have no canonical URL.** `canetons_event` is registered `public: false`
  with `rewrite: false` and `query_var: false` (§3.1, deliberately — nothing
  browses an event by its own URL). So `Event.url` must be the agenda page.
  Giving each event an address would mean reversing that decision and adding
  rewrite rules and a single template; out of scope here.
- **`location` is free text** ("Fribourg"), with no street address. Google's Event
  rich results generally expect a `PostalAddress`. This design therefore promises
  *valid, machine-readable* markup — not a rich-result carousel. Adding a
  structured address would mean new event meta and is a separate requirement.

Duplicate `Event` nodes will exist at `/fr/agenda/` and `/de/termine/`. The
`hreflang` alternates already emitted by the theme are what tell a crawler those
are translations of one page rather than two competing events.

### 4. Code layout

- **`src/EventSchema.php`** — a pure builder: takes an array of plain event values
  (title, dates, times, location) plus the page URL, returns the JSON-LD array.
  No WordPress calls, so the interesting logic — ISO composition, the date-only
  fallback, omitting a redundant `endDate` — is unit-testable, per the project's
  rule that pure logic lives in `src/`.
- **`src/Planning.php`** — gains the three filters and a thin call that maps each
  rendered post's meta into the builder and prints the encoded result. It stays
  the only WordPress-facing part.

Encoding is `wp_json_encode( $data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT )`.
The flags are load-bearing, not decoration: PHP does **not** escape `<` and `>` by
default, so an event title containing `</script>` would otherwise close the block
and everything after it would be parsed as HTML. Event titles are authored by the
Team Direction — semi-trusted, but "semi" is the point, and a stray `<` in a title
should never be able to change the shape of the page. `JSON_HEX_TAG` renders it
`<`, which is still valid JSON-LD.

### 5. Testing

**Unit** (`tests/unit/EventSchemaTest.php`), no WordPress:

- date plus time composes an ISO 8601 value carrying the `+02:00`/`+01:00` offset;
- a missing time yields a date-only `startDate`;
- `endDate` is omitted when the event is single-day with no end time, and present
  for a multi-day event;
- a missing location omits `location` rather than emitting an empty `Place`;
- the node always carries `@context`, `@type`, `name`, `startDate`.

**Integration** (extending `PlanningListTest.php`):

- the rendered output contains exactly one `Event` per upcoming event;
- a past event contributes no node;
- the emitted block is valid JSON (decoded and asserted, not pattern-matched);
- nothing is emitted when there are no upcoming events;
- **an event titled `Bal </script><script>alert(1)</script>` does not close the
  block** — the encoded output contains no literal `</script>`, and the JSON still
  decodes to a node whose `name` is the original title. This is the escaping
  property above, asserted rather than assumed.

**HTTP**, after implementation: both `/fr/agenda/` and `/de/termine/` return 200,
the JSON parses, and the German page shows the German labels while the French one
is unchanged.

## What is given up

- No rich-result guarantee, for the address reason above.
- No per-event permalinks, so no per-event sharing or per-event structured data
  page.
- The agenda is upcoming-only. A past-events archive would need its own query and
  a decision about how far back to go.
- German dates are numeric rather than "Samstag 22. August 2026". Full German
  date names would need a locale switch, which is disproportionate here.

## Non-goals

- Making `canetons_event` public.
- An ICS/iCalendar feed or Google Calendar subscription.
- Any change to the RSVP write path, its nonce or its capability checks.
- Translating the members' area or any other plugin string.

## Risks

| Risk | Mitigation |
| --- | --- |
| The two agenda pages look like duplicate events to a crawler | `hreflang` alternates are already emitted for every page pair |
| A member is confused by RSVP buttons on a public page | Same handler, same nonce, same capability; if it proves confusing, a shortcode attribute can suppress the controls without touching the write path |
| Structured data drifts from the visible list | Impossible by construction: it is built from the same posts in the same render pass |
| The theme's German filters are forgotten on a new string | Only three strings exist and each has a filter; a fourth would need a fourth filter, which is a visible code change |
| `docs/cutover.md` and `desktop-bringup.md` still say "nine pages" | Updated in the same change as §1.7 |
