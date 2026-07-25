#!/bin/sh
set -e

# Runs in the one-shot `deps` service (composer image) to populate BOTH vendor
# volumes the web container mounts. It replaces the former separate `vendor` and
# `api-vendor` services: one container, one place to look when an install fails.
# `web` waits for it via service_completed_successfully, which is why
# `docker compose up` needs no host-side vendor/ and no manual composer step
# for either application.

# --- Old app -----------------------------------------------------------------
# The web container serves app/'s contents flat at /var/www/html, so the App\*
# classes live at /var/www/html/src. Composer's autoload map is stored relative
# to vendor/'s parent, so it must read App\ -> src/. The repo composer.json maps
# App\ -> app/src/ (correct for the repo-root tree that host tooling and CI
# use), so reuse it and rewrite just that one path. The lock's content-hash
# ignores autoload, so `composer install` stays happy against the repo lock.
# tools/build.mjs performs the same rewrite when it assembles dist/build/, so
# this is parity-preserving, not a divergence.
echo "deps: installing old-app dependencies (App\\ -> src/, --no-dev)..."
cd /app
cp /repo/composer.json /repo/composer.lock ./
sed -i 's#"app/src/"#"src/"#' composer.json
composer install --no-dev --no-interaction --no-progress

# --- Laravel API -------------------------------------------------------------
# No autoload rewrite needed here: api/ is mounted whole into the web container,
# so vendor/ sits beside app/ exactly as api/composer.json's App\ -> app/ map
# expects. Dev dependencies stay installed, unlike the old app above — the
# Laravel test suite runs against this vendor.
#
# NOTE: this writes root-owned files into the host api/ tree. Composer's
# post-autoload-dump runs `artisan package:discover`, which regenerates
# api/bootstrap/cache/{packages,services}.php through the read-write ./api:/api
# bind, as root (this container has no user-mapping). The web entrypoint's
# chown cleans this up for the running stack, and it's invisible on Docker
# Desktop's shared filesystem, but on a native Linux host it leaves files the
# host user can't overwrite, so a later host-side `composer install` in api/
# fails until you `sudo chown` them back. Not introduced here — the old
# api-vendor service had the same bind and the same effect.
echo "deps: installing Laravel dependencies (dev included)..."
cd /api
composer install --no-interaction --no-progress
