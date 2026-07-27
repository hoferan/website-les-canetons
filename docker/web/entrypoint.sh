#!/bin/sh
set -e

cd /var/www/html

# The `db` service's healthcheck (mysqladmin ping) can report healthy against
# MariaDB's temporary --skip-networking init server, over the unix socket,
# before TCP is actually reachable and the schema is loaded — a reproducible
# false positive. `artisan migrate` has no retry of its own, and a premature
# failure under `set -e` would otherwise exit this container outright (worse
# than the old one-shot `api-migrate` service, which left `web` running).
# Retry it as a second line of defense. A persistent failure still exits
# non-zero (via `set -e`, since this function's own return is checked)
# rather than falling through to Apache with an unmigrated database.
retry() {
    attempt=1
    max_attempts=30
    while [ "$attempt" -le "$max_attempts" ]; do
        if "$@"; then
            return 0
        fi
        if [ "$attempt" -lt "$max_attempts" ]; then
            echo "entrypoint: '$*' failed (attempt $attempt/$max_attempts); retrying in 2s..." >&2
            sleep 2
        fi
        attempt=$((attempt + 1))
    done
    echo "entrypoint: '$*' failed after $max_attempts attempts, giving up" >&2
    return 1
}

# Laravel owns the schema outright — it is the ONLY migration system left. The
# old app's numbered sql/migrations/*.sql runner (tools/migrate.php ->
# App\Migrator, plus App\AutoMigrator on the first request) is gone, so there is
# nothing to apply ahead of this any more.
#
# On a real server the deploy triggers these over HTTP (POST /api/migrate);
# there is no deploy step locally, so run them before Apache accepts its first
# request. Laravel has no internal connection retry of its own, so this
# genuinely needs the wrapper above.
retry php api-laravel/artisan migrate --force

# The artisan call above ran as root (this entrypoint's own user); php-fpm
# serves every subsequent request as www-data. Without this, any log line
# artisan wrote along the way (routine, and guaranteed at least once if the
# retry above ever absorbed a transient failure) leaves storage/logs/*.log —
# and bootstrap/cache/*.php, populated the same way — root-owned, and every
# Laravel request that logs anything then 500s on "could not be opened in
# append mode: Permission denied". Reproduced empirically; re-chowning here
# (rather than running artisan as www-data) also repairs a tree a previous,
# pre-fix run already left broken.
chown -R www-data:www-data api-laravel/storage api-laravel/bootstrap/cache

# php-fpm in the background, Apache in the foreground so the container's
# lifetime tracks Apache. No supervisor: two processes, one of them daemonised
# by its own flag, is not worth the extra moving part.
php-fpm -D

# `. envvars && exec apache2`, not `exec apache2ctl`: apache2ctl is itself a
# shell script that does not exec the httpd binary, so PID 1 would stay a
# shell wrapper and shutdown would not be graceful (SIGTERM would not reach
# Apache directly). Sourcing envvars ourselves and exec'ing apache2 directly
# makes Apache PID 1.
. /etc/apache2/envvars
exec apache2 -DFOREGROUND
