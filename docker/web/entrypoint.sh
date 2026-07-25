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

# The old app's SQL migrations, FIRST. Laravel's migrations adopt these tables
# in place (add updated_at, convert the used_challenges PK); if they run
# against a fresh database where signups/used_challenges do not exist yet,
# Laravel takes its create branch instead, and the adopt branches — the ones
# that actually run on TEST/QA/PROD — are never exercised here. The old
# compose ran its `migrate` service before `api-migrate` for exactly this
# reason. tools/ is mounted outside the document root (/srv/tools, not
# /var/www/html/...) because dist/build/ does not ship it; sql/migrations/ IS
# shipped there (tools/build.mjs copies it in, and App\AutoMigrator resolves
# it as dirname(__DIR__).'/sql/migrations', i.e. under the document root), so
# it's mounted at /var/www/html/sql/migrations instead, matching production.
#
# NOT wrapped in `retry`, deliberately: tools/migrate.php (see its own header
# comment) already retries its DB connection internally for exactly this
# cold-MariaDB case, over the same TCP path this false positive affects — that
# is the right layer for it, and wrapping it here would compound to up to
# max_attempts^2 attempts. Don't "fix" this by making the two calls symmetric.
#
# DB_HOST/DB_USER/DB_PASS/DB_NAME are scoped to this command only, not
# exported into the shell (and so not inherited by `artisan migrate` below).
# Laravel's Dotenv::createImmutable never overwrites a variable already
# present in the process environment, so an exported DB_HOST here would
# silently win over api-laravel/.env's DB_HOST for every artisan/php-fpm
# process this script spawns afterward — quietly defeating the whole point
# of mounting a real .env for Laravel to read.
DB_HOST=db DB_USER=root DB_PASS=root DB_NAME=lescanetons \
    php /srv/tools/migrate.php /var/www/html/sql/migrations

# Laravel's own migrations. On a real server the deploy triggers these over HTTP
# (POST /api/migrate); there is no deploy step locally, so run them before
# Apache accepts its first request. Laravel has no equivalent internal
# connection retry, so this one genuinely needs the wrapper above.
#
# The old app needs no equivalent for ITS OWN migrations beyond the command
# above: config.docker.php sets auto_migrate => true, so App\AutoMigrator
# re-applies sql/migrations/*.sql on the first request under a GET_LOCK — a
# no-op here since that command already applied them, but left on so that
# mechanism stays exercised exactly as production runs it. That is why the
# former one-shot `migrate`/`api-migrate` compose services are gone rather
# than folded in here unchanged.
retry php api-laravel/artisan migrate --force

# Both artisan calls above ran as root (this entrypoint's own user); php-fpm
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
