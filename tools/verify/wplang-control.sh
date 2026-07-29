#!/bin/sh
# Positive control: does the tracer actually fire and get collected? Without this,
# every "no output" result is worthless.
set -eu
cd "$( CDPATH= cd -- "$( dirname -- "$0" )/../.." && pwd )"

TRACE=/var/www/html/wp-content/wplang-trace.log

MSYS_NO_PATHCONV=1 docker compose run --rm wp-cli wp --path=/var/www/html option update WPLANG fr_FR >/dev/null 2>&1
# rm, not truncate: `: >` creates the file owned by root (this exec runs as root),
# and the wp-cli container writes as uid 33, so appending would be denied and
# file_put_contents would fail silently with WP_DEBUG_DISPLAY off.
MSYS_NO_PATHCONV=1 docker compose exec -T wp sh -c "rm -f $TRACE" 2>/dev/null || true

echo '--- forcing WPLANG to an empty value, the exact symptom ---'
MSYS_NO_PATHCONV=1 docker compose run --rm wp-cli wp --path=/var/www/html \
	eval 'update_option( "WPLANG", "" ); echo "now=" . var_export( get_option( "WPLANG" ), true ) . PHP_EOL;' 2>/dev/null | grep -E 'now='

echo '--- tracer output (must be non-empty, or the instrument is not trusted) ---'
MSYS_NO_PATHCONV=1 docker compose exec -T wp sh -c "cat $TRACE 2>/dev/null || echo '(NOTHING LOGGED - tracer still broken)'" | head -4 | cut -c1-260 | sed 's/^/  /'

echo '--- restoring ---'
MSYS_NO_PATHCONV=1 docker compose run --rm wp-cli wp --path=/var/www/html option update WPLANG fr_FR >/dev/null 2>&1
MSYS_NO_PATHCONV=1 docker compose run --rm wp-cli wp --path=/var/www/html option get WPLANG 2>/dev/null | sed 's/^/  WPLANG=/'
