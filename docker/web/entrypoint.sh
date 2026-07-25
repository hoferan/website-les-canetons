#!/bin/sh
set -e

cd /var/www/html

# Laravel's own migrations. On a real server the deploy triggers these over HTTP
# (POST /api/migrate); there is no deploy step locally, so run them before
# Apache accepts its first request.
#
# The old app needs no equivalent: config.docker.php sets auto_migrate => true,
# so App\AutoMigrator applies sql/migrations/*.sql on the first request under a
# GET_LOCK — which is exactly what production does. That is why the former
# one-shot `migrate` compose service is gone rather than folded in here.
php api-laravel/artisan migrate --force

# php-fpm in the background, Apache in the foreground so the container's
# lifetime tracks Apache. No supervisor: two processes, one of them daemonised
# by its own flag, is not worth the extra moving part.
php-fpm -D
exec apache2ctl -DFOREGROUND
