#!/bin/sh
set -e

# Runs in the one-shot `deps` service (composer image) to populate the vendor
# volume the web container mounts. `web` waits for it via
# service_completed_successfully, which is why `docker compose up` needs no
# host-side vendor/ and no manual composer step.
#
# It used to install two projects: the old front end had its own Composer
# project at the repo root, whose autoload map needed rewriting for the flat
# document root. That application is gone, and Laravel is the only PHP left.

# No autoload rewrite is needed here: api/ is mounted whole into the web
# container, so vendor/ sits beside app/ exactly as api/composer.json's
# App\ -> app/ map expects. Dev dependencies stay installed — the Laravel test
# suite runs against this vendor.
#
# NOTE: this writes root-owned files into the host api/ tree. Composer's
# post-autoload-dump runs `artisan package:discover`, which regenerates
# api/bootstrap/cache/{packages,services}.php through the read-write ./api:/api
# bind, as root (this container has no user-mapping). The web entrypoint's
# chown cleans this up for the running stack, and it's invisible on Docker
# Desktop's shared filesystem, but on a native Linux host it leaves files the
# host user can't overwrite, so a later host-side `composer install` in api/
# fails until you `sudo chown` them back.
echo "deps: installing Laravel dependencies (dev included)..."
cd /api
composer install --no-interaction --no-progress
