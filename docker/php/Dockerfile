# The long-running PHP tools container: the `php` service in
# docker-compose.yml, which tools/php-runner.mjs execs Pint, Larastan, the
# OpenAPI export, the Laravel suite and `npm run artisan|composer|php` into.
# tools/php-image.mjs builds it too, for every Composer run started from
# tools/, the deploy artifact's included: its PHP is production's.
#
# The CLI build of the same PHP as `web`, with the same three extensions on top
# of the official image's default set, so a command run here sees what the
# Apache container serves with. The `web` image itself would not do: it has no
# Composer, and its entrypoint migrates and starts Apache.
FROM php:8.4-cli

# pdo_mysql, mbstring and zip, with their build dependencies, exactly as
# docker/web/Dockerfile installs them; that file says what each is for. git
# and unzip are for Composer, which falls back to a source clone whenever a
# dist archive is unavailable.
#
# php.ini-production, as in `web`: the suite used to run there, and the same
# ini keeps its behaviour from depending on which container ran it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git unzip libonig-dev libzip-dev \
 && docker-php-ext-install -j"$(nproc)" pdo_mysql mbstring zip \
 && mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
 && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Composer runs as root in here. Without this, a non-interactive root run
# disables every plugin "for safety", and api/composer.json allows two. The
# official composer:2 image sets the same, and tools/build.mjs installs the
# deploy artifact's vendor/ in this image (tools/php-image.mjs), so the
# artifact keeps installing exactly as it did there.
ENV COMPOSER_ALLOW_SUPERUSER=1

WORKDIR /repo
