#!/usr/bin/env bash
# On-demand dev-stack provisioner for Claude Code web sessions.
#
# docker compose (site + MariaDB via Apache/php:8.4-fpm) is how this repo
# normally does local dev, but Claude Code web sessions have no Docker daemon.
# When that's the case, this stands up an equivalent stack natively: MariaDB
# directly, the databases created (empty — Laravel's migrations populate
# them), and api/.env pointing at it.
#
# Invoked on-demand by the DB-dependent npm scripts (via ensure-dev-stack.mjs),
# NOT from the SessionStart hook — session startup must stay fast and must not
# block on apt/DB provisioning. Idempotent and best-effort: safe to run
# repeatedly; a no-op when Docker is reachable or outside a web session.
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# Only meaningful on a Docker-less Claude Code web session. Local Docker dev
# and CI provision the DB via docker compose / service containers instead.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
if docker info >/dev/null 2>&1; then
  exit 0
fi

if ! command -v mariadbd >/dev/null 2>&1 && ! command -v mysqld >/dev/null 2>&1; then
  # `|| true`: some web-session images ship extra PPA sources (e.g. deadsnakes,
  # ondrej/php) unrelated to this script that may be unreachable under the
  # session's egress policy. apt-get update fails non-zero on ANY repo error
  # even when the repos we actually need (Ubuntu main/universe/security)
  # succeeded, so a hard failure here would abort provisioning over a package
  # source we never use. The subsequent install still fails loudly if
  # mariadb-server itself is genuinely unavailable.
  DEBIAN_FRONTEND=noninteractive sudo apt-get update -y || true
  DEBIAN_FRONTEND=noninteractive sudo apt-get install -y mariadb-server
fi

if ! sudo mysqladmin ping >/dev/null 2>&1; then
  sudo mkdir -p /run/mysqld
  sudo chown mysql:mysql /run/mysqld
  sudo -u mysql /usr/sbin/mariadbd --datadir=/var/lib/mysql \
    --skip-networking=0 --bind-address=127.0.0.1 \
    >/tmp/mariadbd.log 2>&1 &
  disown
  for _ in $(seq 1 30); do
    sudo mysqladmin ping >/dev/null 2>&1 && break
    sleep 1
  done
fi

sudo mysql -e "
  CREATE DATABASE IF NOT EXISTS lescanetons CHARACTER SET utf8mb4;
  CREATE DATABASE IF NOT EXISTS lescanetons_test CHARACTER SET utf8mb4;
  CREATE DATABASE IF NOT EXISTS laravel_api_test CHARACTER SET utf8mb4;
  CREATE USER IF NOT EXISTS 'canetons'@'127.0.0.1' IDENTIFIED BY 'canetons';
  CREATE USER IF NOT EXISTS 'canetons'@'localhost' IDENTIFIED BY 'canetons';
  GRANT ALL PRIVILEGES ON lescanetons.* TO 'canetons'@'127.0.0.1';
  GRANT ALL PRIVILEGES ON lescanetons.* TO 'canetons'@'localhost';
  GRANT ALL PRIVILEGES ON lescanetons_test.* TO 'canetons'@'127.0.0.1';
  GRANT ALL PRIVILEGES ON lescanetons_test.* TO 'canetons'@'localhost';
  GRANT ALL PRIVILEGES ON laravel_api_test.* TO 'canetons'@'127.0.0.1';
  GRANT ALL PRIVILEGES ON laravel_api_test.* TO 'canetons'@'localhost';
  FLUSH PRIVILEGES;
"

# Laravel owns the schema outright — there is no SQL to seed here. The
# databases created above are left empty; `php artisan migrate` (run by hand,
# or by RunPendingMigrations on the first request) populates them. Nothing
# below needs to branch on whether a database already has tables — `migrate`
# is itself idempotent against a database that already has some or all of its
# tables.
#
# This script deliberately does NOT also run `php artisan db:seed` (unlike
# docker/web/entrypoint.sh, which runs both migrate and seed on every
# container start): this script never runs migrate either, so there would be
# no schema yet for the seeder to insert into. Run both by hand once the
# schema exists: `cd api && php artisan migrate && php artisan db:seed`
# (DevSeeder is idempotent, so re-running it is always safe).

# app/src/bootstrap.php does `require __DIR__ . '/../vendor/autoload.php'`,
# i.e. it expects vendor/ as a sibling of app/src/ — true both under Docker
# Compose (which mounts a vendor volume at app/vendor) and in the built
# public/ deploy artifact (public/vendor sits beside public/src). This
# native session's Composer install instead puts vendor/ at the repo root
# (composer.json's own autoload map: App\ -> app/src/), a sibling of app/
# itself, one level higher than bootstrap.php's require expects — so
# `php -S ... -t app` (npm run serve) 500s on every request without this
# symlink. Only created once root vendor/ actually exists (npm run
# php:install runs separately, before or after this script); left for the
# next run to pick up otherwise. `[ ! -e ]` keeps this idempotent and never
# clobbers a real app/vendor from some other setup.
if [ -f "$PROJECT_DIR/vendor/autoload.php" ] && [ ! -e "$PROJECT_DIR/app/vendor" ]; then
  ln -s ../vendor "$PROJECT_DIR/app/vendor"
fi

# Laravel's server-owned configuration. Every environment provisions this file
# by hand exactly once (see staging/README.md); a web session has no hands, so
# it gets one generated from the committed template and pointed at the native
# MariaDB provisioned above. `[ ! -f ]` keeps this idempotent — a real api/.env
# from some other setup is never clobbered.
if [ ! -f "$PROJECT_DIR/api/.env" ]; then
  cp "$PROJECT_DIR/api/.env.example" "$PROJECT_DIR/api/.env"
  sed -i \
    -e 's/^APP_ENV=.*/APP_ENV=local/' \
    -e 's/^APP_DEBUG=.*/APP_DEBUG=true/' \
    -e 's#^APP_URL=.*#APP_URL=http://127.0.0.1:8090#' \
    -e 's/^DB_HOST=.*/DB_HOST=127.0.0.1/' \
    -e 's/^DB_DATABASE=.*/DB_DATABASE=lescanetons/' \
    -e 's/^DB_USERNAME=.*/DB_USERNAME=canetons/' \
    -e 's/^DB_PASSWORD=.*/DB_PASSWORD=canetons/' \
    "$PROJECT_DIR/api/.env"

  # APP_KEY needs artisan, which needs api/vendor. A web session may not have
  # installed api/'s Composer dependencies yet, so this stays best-effort like
  # the rest of this script: without a key Laravel refuses to boot, and the
  # message below says exactly which command fixes it.
  if [ -f "$PROJECT_DIR/api/vendor/autoload.php" ]; then
    ( cd "$PROJECT_DIR/api" && php artisan key:generate --force )
  else
    echo "  ! api/vendor is not installed, so api/.env has an empty APP_KEY."
    echo "    Run: (cd api && composer install && php artisan key:generate)"
  fi
fi
