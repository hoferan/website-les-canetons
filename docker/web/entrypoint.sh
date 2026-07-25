#!/bin/sh
set -e

cd /var/www/html

# The `db` service's healthcheck (mysqladmin ping) can report healthy against
# MariaDB's temporary --skip-networking init server, over the unix socket,
# before TCP is actually reachable and the schema is loaded — a reproducible
# false positive. tools/migrate.php already retries its own DB connection
# internally, but `artisan migrate` does not, and a premature failure under
# `set -e` would otherwise exit this container outright (worse than the old
# one-shot `api-migrate` service, which left `web` running). Retry each
# migration command here as a second line of defense. A persistent failure
# still exits non-zero (via `set -e`, since this function's own return is
# checked) rather than falling through to Apache with an unmigrated database.
retry() {
    attempt=1
    max_attempts=30
    while [ "$attempt" -le "$max_attempts" ]; do
        if "$@"; then
            return 0
        fi
        echo "entrypoint: '$*' failed (attempt $attempt/$max_attempts); retrying in 2s..." >&2
        attempt=$((attempt + 1))
        sleep 2
    done
    echo "entrypoint: '$*' failed after $max_attempts attempts, giving up" >&2
    return 1
}

# The old app's SQL migrations, FIRST. Laravel's migrations adopt these tables
# in place (add updated_at, convert the used_challenges PK); if they run
# against a fresh database where signups/used_challenges do not exist yet,
# Laravel takes its create branch instead, and the adopt branches — the ones
# that actually run on TEST/QA/PROD — are never exercised here. The old
# compose ran its `migrate` service before `api-migrate` for exactly this
# reason. tools/ and sql/migrations/ are mounted outside the document root
# (/srv/..., not /var/www/html/...) so the docroot keeps matching dist/build/,
# which ships neither directory.
retry php /srv/tools/migrate.php /srv/sql/migrations

# Laravel's own migrations. On a real server the deploy triggers these over HTTP
# (POST /api/migrate); there is no deploy step locally, so run them before
# Apache accepts its first request.
#
# The old app needs no equivalent for ITS OWN migrations beyond the retry
# above: config.docker.php sets auto_migrate => true, so App\AutoMigrator
# re-applies sql/migrations/*.sql on the first request under a GET_LOCK — a
# no-op here since the retry above already applied them, but left on so that
# mechanism stays exercised exactly as production runs it. That is why the
# former one-shot `migrate`/`api-migrate` compose services are gone rather
# than folded in here unchanged.
retry php api-laravel/artisan migrate --force

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
