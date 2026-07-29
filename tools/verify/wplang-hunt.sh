#!/bin/sh
# Bisect the WPLANG reset, with a calibrated tracer (see wplang-control.sh).
#
# Usage: wplang-hunt.sh <label> <command...>
set -eu
cd "$( CDPATH= cd -- "$( dirname -- "$0" )/../.." && pwd )"

TRACE=/var/www/html/wp-content/wplang-trace.log
LABEL="$1"
shift

# --- arrange: known-good locale, then a fresh trace file -------------------
# rm rather than truncate: a root-created file cannot be appended to by the
# wp-cli container (uid 33), and file_put_contents would fail silently.
MSYS_NO_PATHCONV=1 docker compose run --rm wp-cli \
	wp --path=/var/www/html option update WPLANG fr_FR >/dev/null 2>&1
MSYS_NO_PATHCONV=1 docker compose exec -T wp sh -c "rm -f $TRACE" 2>/dev/null || true

BEFORE=$(MSYS_NO_PATHCONV=1 docker compose run --rm wp-cli \
	wp --path=/var/www/html option get WPLANG 2>/dev/null | tr -d '\r\n')

# --- act ------------------------------------------------------------------
echo "=== $LABEL ==="
echo "  before: WPLANG='$BEFORE'"
"$@" >/dev/null 2>&1 || echo "  (command exited non-zero)"

# --- assert ---------------------------------------------------------------
AFTER=$(MSYS_NO_PATHCONV=1 docker compose run --rm wp-cli \
	wp --path=/var/www/html option get WPLANG 2>/dev/null | tr -d '\r\n')
echo "  after:  WPLANG='$AFTER'"
[ "$BEFORE" = "$AFTER" ] && echo '  unchanged' || echo '  *** CHANGED ***'

echo '  --- tracer ---'
MSYS_NO_PATHCONV=1 docker compose exec -T wp sh -c "cat $TRACE 2>/dev/null || true" \
	| cut -c1-300 | head -12 | sed 's/^/    /'
echo
