#!/bin/sh
set -e

# Runs in the one-shot `vendor` service (composer image) to populate the shared
# `vendor` volume the web container mounts at /var/www/html/vendor.
#
# The web container serves app/'s contents flat at /var/www/html, so the App\*
# classes live at /var/www/html/src. Composer's autoload map is stored relative
# to vendor/'s parent, so it must read App\ -> src/. The repo composer.json maps
# App\ -> app/src/ (correct for the repo-root tree that host tooling/CI use), so
# here we reuse it but rewrite just that one path. The lock's content-hash
# ignores autoload, so `composer install` stays happy against the repo lock.
cd /app
cp /repo/composer.json /repo/composer.lock ./
sed -i 's#"app/src/"#"src/"#' composer.json
composer install --no-dev --no-interaction --no-progress
