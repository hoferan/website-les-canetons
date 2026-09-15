#!/usr/bin/env bash
# On-demand dev-stack provisioner for Claude Code web sessions.
#
# docker compose (site + MariaDB via Apache/php:8.4-fpm) is how this repo
# normally does local dev, but Claude Code web sessions have no Docker daemon.
# When that's the case, this stands up an equivalent stack natively: MariaDB
# directly, the databases created (empty — Laravel's migrations populate them),
# api/'s Composer dependencies, and api/.env pointing at it.
#
# THIS IS THE FALLBACK, NOT THE INTENDED SETUP. The supported way to provision
# a cloud session is the environment's own setup script, which runs before
# Claude starts and is snapshotted into the environment cache, so it costs
# nothing per session. docs/web-session.md carries that script and the network
# allowlist it needs. This file exists because a session may land in an
# environment nobody has configured yet, and because provisioning on demand is
# recoverable where a failed setup script is not.
#
# Invoked on-demand by `npm run websession:init`, NOT from the SessionStart
# hook — session startup must stay fast and must not block on apt/DB
# provisioning. Idempotent: safe to run repeatedly; a no-op when Docker is
# reachable or outside a web session.
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

# Cloud sessions run as root, which is what this variable is for: without it
# Composer disables plugins and prints two paragraphs about it on every call.
# Package discovery is a script rather than a plugin, but Laravel needs both.
export COMPOSER_ALLOW_SUPERUSER=1

# ------------------------------------------------------------------ MariaDB

if ! command -v mariadbd >/dev/null 2>&1 && ! command -v mysqld >/dev/null 2>&1; then
  # `|| true`: some web-session images ship extra PPA sources (e.g. deadsnakes,
  # ondrej/php) unrelated to this script that may be unreachable under the
  # session's egress policy. apt-get update fails non-zero on ANY repo error
  # even when the repos we actually need (Ubuntu main/universe/security)
  # succeeded, so a hard failure here would abort provisioning over a package
  # source we never use. The subsequent install still fails loudly if
  # mariadb-server itself is genuinely unavailable.
  #
  # VERSION DIVERGENCE, and it is the one thing this stack cannot match:
  # Ubuntu 24.04 ships MariaDB 10.11 where docker-compose.yml and production
  # both pin 10.3. Everything this repo does is well inside both, but a
  # migration that leans on 10.11 syntax would pass here and fail on the host.
  # Anything schema-shaped still wants a run in Docker before it ships.
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

# -------------------------------------------------------- Composer packages
#
# The step this script used to leave to the reader, and the one that actually
# fails here. Everything PHP depends on it: artisan, the Laravel suite, Pint,
# Larastan and the Scramble export behind `npm run openapi`.
#
# It needs the session's egress policy to allow GitHub's ARCHIVE hosts, not
# just packagist. Composer reads metadata from repo.packagist.org and then
# downloads each package's `dist` from api.github.com — so an allowlist with
# packagist but without api.github.com is the worst case: resolution succeeds
# and every download 403s. See docs/web-session.md.

if [ ! -f "$PROJECT_DIR/api/vendor/autoload.php" ]; then
  echo "==> Installing api/ Composer dependencies"

  # --prefer-source is a documented Composer install mode, not a trick: it
  # clones each package from git instead of fetching its dist archive, and git
  # to github.com reaches the session's GitHub proxy rather than the egress
  # allowlist. It is the second attempt rather than the first because source
  # installs are slower and pull each package's test files, which makes the
  # autoloader warn about ambiguous classes.
  if ! composer install --working-dir="$PROJECT_DIR/api" --no-interaction --no-progress; then
    echo "==> dist download failed; retrying from git sources"
    composer install --working-dir="$PROJECT_DIR/api" --no-interaction --no-progress --prefer-source || {
      echo
      echo "  ! Composer could not install api/vendor."
      echo
      echo "    Both attempts failed, so at least one package is reachable"
      echo "    neither as a dist archive nor as a git clone. That is an egress"
      echo "    policy problem, not a repository one: this environment's network"
      echo "    access needs GitHub's archive hosts."
      echo
      echo "    Fix it on the environment rather than here — set Network access"
      echo "    to Trusted, which already lists them, or add to a Custom"
      echo "    allowlist:"
      echo
      echo "        api.github.com"
      echo "        codeload.github.com"
      echo "        objects.githubusercontent.com"
      echo
      echo "    Full instructions, and the setup script that makes this script"
      echo "    unnecessary, are in docs/web-session.md."
      echo
      exit 1
    }
  fi
fi

# ----------------------------------------------------------------- api/.env
#
# Laravel's server-owned configuration. Every environment provisions this file
# by hand exactly once (see staging/README.md); a web session has no hands, so
# it gets one generated from the committed template and pointed at the native
# MariaDB provisioned above. `[ ! -f ]` keeps this idempotent — a real api/.env
# from some other setup is never clobbered.
#
# AFTER the Composer step, because key:generate needs artisan.
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

  ( cd "$PROJECT_DIR/api" && php artisan key:generate --force )
fi

echo "==> Dev stack ready. Run the Laravel suite with: npm run test:api"
