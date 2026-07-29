#!/bin/sh
# Task 6: end-to-end verification of the agenda on both trees, with one real
# event. Creates the event, checks, then deletes it — the Phase 5 export must
# carry pages and media, never events.
set -eu
cd "$( CDPATH= cd -- "$( dirname -- "$0" )/../.." && pwd )"

FR="http://localhost:8100/fr/agenda/"
DE="http://localhost:8100/de/termine/"

CREATE='
$id = wp_insert_post( array(
	"post_type"   => "canetons_event",
	"post_title"  => "Concert de gala",
	"post_status" => "publish",
) );
update_post_meta( $id, "_canetons_event_start_date", "2026-12-05" );
update_post_meta( $id, "_canetons_event_end_date", "2026-12-05" );
update_post_meta( $id, "_canetons_event_start_time", "20:00" );
update_post_meta( $id, "_canetons_event_end_time", "23:00" );
update_post_meta( $id, "_canetons_event_location", "Fribourg" );
update_post_meta( $id, "_canetons_event_attire", "Costume" );
echo "EVENT_ID=" . $id . PHP_EOL;
'

EVENT_ID=$(MSYS_NO_PATHCONV=1 docker compose run --rm wp-cli wp --path=/var/www/html eval "$CREATE" 2>/dev/null | sed -n 's/^EVENT_ID=//p' | tr -d '\r')
echo "created event $EVENT_ID"
echo

FR_HTML=$(curl -s "$FR")
DE_HTML=$(curl -s "$DE")

check() {
	if [ "$2" = "yes" ]; then
		printf '  %-46s %s\n' "$1" "PASS"
	else
		printf '  %-46s %s\n' "$1" "*** FAIL ***"
	fi
}

has()  { case "$2" in *"$1"*) echo yes;; *) echo no;; esac; }
lacks() { case "$2" in *"$1"*) echo no;; *) echo yes;; esac; }

echo "--- French tree ---"
check "French attire label"          "$(has 'Tenue : Costume' "$FR_HTML")"
check "French month name"            "$(has 'décembre 2026' "$FR_HTML")"
check "event title listed"           "$(has 'Concert de gala' "$FR_HTML")"
check "location shown"               "$(has 'Fribourg' "$FR_HTML")"
check "JSON-LD block present"        "$(has 'application/ld+json' "$FR_HTML")"

echo "--- German tree ---"
check "German attire label"          "$(has 'Kleidung: Costume' "$DE_HTML")"
check "numeric German date"          "$(has '05.12.2026' "$DE_HTML")"
check "no French attire label"       "$(lacks 'Tenue' "$DE_HTML")"
check "no French month name"         "$(lacks 'décembre' "$DE_HTML")"
check "JSON-LD block present"        "$(has 'application/ld+json' "$DE_HTML")"

echo "--- structured data (French tree) ---"
PAYLOAD=$(printf '%s' "$FR_HTML" | sed -n 's#.*<script type="application/ld+json">\(.*\)</script>.*#\1#p')
printf '%s' "$PAYLOAD" | python -m json.tool > /tmp/agenda-schema.json 2>/dev/null \
	&& echo "  valid JSON                                     PASS" \
	|| echo "  valid JSON                                     *** FAIL ***"
check "url is the agenda page"       "$(has '"url": "http://localhost:8100/fr/agenda/"' "$(cat /tmp/agenda-schema.json 2>/dev/null || echo '')")"
check "startDate carries CET offset" "$(has '2026-12-05T20:00:00+01:00' "$PAYLOAD")"
check "endDate present"              "$(has '2026-12-05T23:00:00+01:00' "$PAYLOAD")"
check "Place named Fribourg"         "$(has '"name": "Fribourg"' "$(cat /tmp/agenda-schema.json 2>/dev/null || echo '')")"

echo
echo "--- German tree points at the German page ---"
DE_PAYLOAD=$(printf '%s' "$DE_HTML" | sed -n 's#.*<script type="application/ld+json">\(.*\)</script>.*#\1#p')
check "url is /de/termine/"          "$(has 'de\/termine' "$DE_PAYLOAD")"

echo
DELETE='
$id = (int) getenv( "EVENT_ID" );
if ( $id > 0 ) {
	wp_delete_post( $id, true );
}
echo "events_left=" . count( get_posts( array( "post_type" => "canetons_event", "post_status" => "any", "posts_per_page" => -1, "fields" => "ids" ) ) ) . PHP_EOL;
'
MSYS_NO_PATHCONV=1 docker compose run --rm -e "EVENT_ID=$EVENT_ID" wp-cli wp --path=/var/www/html eval "$DELETE" 2>/dev/null | grep -E 'events_left='
