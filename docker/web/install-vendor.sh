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
cd /app
cp /repo/composer.json /repo/composer.lock ./
sed -i 's#"app/src/"#"src/"#' composer.json
composer install --no-dev --no-interaction --no-progress

# --- Laravel API -------------------------------------------------------------
# No autoload rewrite needed here: api/ is mounted whole into the web container,
# so vendor/ sits beside app/ exactly as api/composer.json's App\ -> app/ map
# expects. Dev dependencies stay installed, unlike the old app above — the
# Laravel test suite runs against this vendor.
cd /api
composer install --no-interaction --no-progress
