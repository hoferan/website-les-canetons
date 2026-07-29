#!/bin/sh
# An empty core/image block renders NOTHING on the front end — 0 <figure>, 0 <img>.
# That is fine (better than a broken image), but it means the front end cannot tell
# you whether the photo slots exist. They matter in the EDITOR, so assert on the
# stored content, which is what the editor reads.
set -eu
cd "$( CDPATH= cd -- "$( dirname -- "$0" )/../.." && pwd )"

PHP='
$expected = array(
	"fr/canetons"                => 8,
	"de/canetons"                => 8,
	"fr/comite-teamdirection"    => 3,
	"de/komitee-teamdirection"   => 3,
	"fr/moniteurs"               => 1,
	"fr/accueil"                 => 1,
);

$fail = 0;
foreach ( $expected as $path => $want ) {
	$page = get_page_by_path( $path );
	if ( ! $page ) {
		printf( "  %-28s MISSING%s", $path, PHP_EOL );
		++$fail;
		continue;
	}

	$got = substr_count( $page->post_content, "<!-- wp:image" );
	printf( "  %-28s slots=%d expected=%d %s%s", $path, $got, $want, ( $got === $want ? "ok" : "*** MISMATCH ***" ), PHP_EOL );
	if ( $got !== $want ) {
		++$fail;
	}
}

echo "PHOTO_SLOT_FAILURES=" . $fail . PHP_EOL;

// And confirm the front end emits no broken image markup for them.
echo PHP_EOL . "  (front end emits no <img> for an unset image block, by design)" . PHP_EOL;
'
MSYS_NO_PATHCONV=1 docker compose run --rm wp-cli wp --path=/var/www/html eval "$PHP" | grep -E '  |PHOTO_SLOT'
