# Dev-only image for running the Laravel API (api/) under docker compose via
# `php artisan serve`. Never deployed — production installs api/'s vendor at
# build time (tools/build.mjs) and runs under the host's Apache/FastCGI.
#
# php:8.4-cli matches prod's PHP 8.4. Laravel needs pdo_mysql (it talks to
# MariaDB over PDO, not the old app's mysqli) and mbstring (not compiled into
# the base image); mbstring's build needs libonig-dev.
FROM php:8.4-cli

RUN apt-get update \
 && apt-get install -y --no-install-recommends libonig-dev \
 && docker-php-ext-install pdo_mysql mbstring \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/api
