#!/bin/sh
set -e

# Entrypoint of the `php` service. It installs the API's Composer dependencies
# into the api_vendor volume, marks the container ready, then hands over to the
# service's command (`sleep infinity`), so the container stays up for
# tools/php-runner.mjs to exec into.
#
# `web` waits on this container's healthcheck, which looks for READY_MARKER, so
# Apache never starts against a half-installed vendor/. The marker lives in the
# container's own /tmp and is therefore gone on every recreate: a stale one can
# never report a fresh container healthy before its install has run.
#
# Dev dependencies stay installed, because the suite, Pint and Larastan all run
# against this vendor. Scripts run too: Larastan and the suite need
# `artisan package:discover` to have populated api/bootstrap/cache/.
#
# NOTE: this runs as root, so on a native Linux host the files it writes
# through the bind mount (api/bootstrap/cache/*.php) end up root-owned. The web
# entrypoint chowns them for Apache. Docker Desktop's shared filesystem hides
# the problem, but a later host-side `composer install` in api/ on Linux fails
# until you `sudo chown` them back.
READY_MARKER=/tmp/vendor-ready

echo "php: installing Laravel dependencies (dev included)..."
composer install --working-dir=api --no-interaction --no-progress
touch "$READY_MARKER"
echo "php: ready"

exec "$@"
