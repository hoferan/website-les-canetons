#!/usr/bin/env bash
# On-demand dev-stack provisioner for Claude Code web sessions.
#
# docker compose (site + MariaDB via Apache/php:8.4-fpm) is how this repo
# normally does local dev, but a Claude Code web session starts with no Docker
# daemon running. When that's the case, this stands up an equivalent stack
# natively: MariaDB directly, the databases created (empty — Laravel's
# migrations populate them), api/'s Composer dependencies, and api/.env
# pointing at it.
#
# The daemon's absence is not the same as Docker being unavailable — the binary
# ships in the session image and `dockerd` can be started by hand. It does not
# get the compose stack up, because the `web` image cannot be built here; see
# docs/web-session.md §4 for what it does buy (10.3 parity, chiefly) and what
# it does not.
#
# THIS IS THE FALLBACK, NOT THE INTENDED SETUP. The supported way to provision
# a cloud session is the environment's own setup script, which runs before
# Claude starts and is snapshotted into the environment cache, so it costs
# nothing per session. docs/web-session.md carries that script. This file
# exists because a session may land in an environment nobody has configured
# yet, and because provisioning on demand is recoverable where a failed setup
# script is not.
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

# Composer kills any child process after 300s by default, and the git install
# below trips it. phpstan/phpstan carries a built phar across its whole history
# (857 tags), so cloning it is slow even from the local VCS mirror — and slower
# still here, because all 121 packages clone at once and contend for the disk.
# MEASURED: it times out at 300s on a cold cache and succeeds on a warm one,
# which is exactly the shape of bug that passes when you test it and fails for
# the next person. 0 disables the timeout rather than picking a bigger number
# to be wrong about later.
export COMPOSER_PROCESS_TIMEOUT=0

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
# The step everything PHP depends on: artisan, the Laravel suite, Pint,
# Larastan and the Scramble export behind `npm run openapi`.
#
# THIS USED TO TELL YOU TO FIX THE NETWORK ALLOWLIST. That advice was wrong and
# cost two sessions; the allowlist is not involved. GitHub traffic takes the
# session's GitHub proxy, which scopes the API to the repositories ATTACHED to
# the session — every other repository answers 403. Measured 2026-09-15:
#
#   api.github.com/repos/hoferan/website-les-canetons   200
#   api.github.com/repos/symfony/var-dumper             403
#     {"message":"GitHub access to this repository is not enabled for this
#      session. Use add_repo to request access."}
#
# Every dist URL in api/composer.lock is an api.github.com zipball of a
# third-party repository, so plain `composer install` cannot fetch a single
# package, and reports the 403 as "Could not authenticate against github.com" —
# which sends you hunting for a credential that was never the problem.
#
# Git is NOT scoped that way, so the whole install goes over git instead. Two
# things are needed, and missing either one puts you back on the 403:
#
#   1. use-github-api=false. Left true, Composer turns a GitHub source back
#      into an API zipball download, so --prefer-source silently does not.
#   2. A `source` for the one package that publishes none (phpstan/phpstan),
#      derived from its own dist URL — see tools/composer-lock-git-sources.mjs.
#
# The cost is that source installs are slower and carry each package's test
# files, so the autoloader prints "Ambiguous class resolution" warnings. Those
# are harmless. See docs/web-session.md.

# ONE INSTALL AT A TIME, ACROSS PROCESSES. This script is not the only thing
# that installs api/vendor: pint, phpstan and openapi each self-heal a missing
# one, and pint is reached by every `git commit` through Husky. Two installs
# running together write the same vendor tree and the same Composer VCS mirror.
# MEASURED 2026-09-16: that took the mirror to 15 GB against a documented 3 GB
# and finished with no autoload.php at all.
#
# The protocol is shared with tools/api-vendor.mjs, which the three Node tools
# use — same lock directory, same pid file, same takeover rule — so a Node tool
# and this script serialise against each other, not just among themselves.
# mkdir is the atomic step; "test then create" is not.
VENDOR_LOCK_DIR="$PROJECT_DIR/.api-vendor-install.lock"
VENDOR_LOCK_HELD=0

release_vendor_lock() {
  [ "$VENDOR_LOCK_HELD" = 1 ] || return 0
  rm -rf "$VENDOR_LOCK_DIR"
  VENDOR_LOCK_HELD=0
}

# Returns with the lock held, or with api/vendor already installed by whoever
# held it. A lock whose holder is gone is taken over rather than waited on:
# this session killed a Composer mid-clone, and without takeover every later
# run would wait for a process that will never finish.
acquire_vendor_lock() {
  local waited=0 holder
  while ! mkdir "$VENDOR_LOCK_DIR" 2>/dev/null; do
    [ -f "$PROJECT_DIR/api/vendor/autoload.php" ] && return 0

    holder="$(cat "$VENDOR_LOCK_DIR/pid" 2>/dev/null || true)"
    if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
      echo "    process $holder left an install lock behind and is gone - taking it over"
      rm -rf "$VENDOR_LOCK_DIR"
      continue
    fi

    if [ "$waited" -ge 1200 ]; then
      echo
      echo "  ! Waited 20 minutes for another process to finish installing api/vendor."
      echo "    If nothing is installing, delete $VENDOR_LOCK_DIR and try again."
      echo
      exit 1
    fi

    [ "$waited" -eq 0 ] && echo "    another process is installing api/vendor - waiting for it"
    sleep 5
    waited=$((waited + 5))
  done

  printf '%s' "$$" > "$VENDOR_LOCK_DIR/pid"
  VENDOR_LOCK_HELD=1
}

if [ ! -f "$PROJECT_DIR/api/vendor/autoload.php" ]; then
  echo "==> Installing api/ Composer dependencies (from git sources)"

  acquire_vendor_lock
  trap release_vendor_lock EXIT INT TERM
fi

# Re-tested, because acquire_vendor_lock may have spent minutes waiting for
# another process that installed it for us.
if [ ! -f "$PROJECT_DIR/api/vendor/autoload.php" ]; then

  composer config --global use-github-api false

  # The lock is patched IN PLACE because Composer has no flag for "use this
  # other lock file", and restored unconditionally by the trap — including when
  # composer fails or the session interrupts it. The committed lock must never
  # carry these entries: they exist only to work around one environment's
  # GitHub proxy, and would follow everyone else to machines that have no such
  # problem.
  COMPOSER_LOCK="$PROJECT_DIR/api/composer.lock"
  COMPOSER_LOCK_BACKUP="$(mktemp)"
  cp "$COMPOSER_LOCK" "$COMPOSER_LOCK_BACKUP"
  restore_composer_lock() {
    [ -f "$COMPOSER_LOCK_BACKUP" ] || return 0
    cp "$COMPOSER_LOCK_BACKUP" "$COMPOSER_LOCK"
    rm -f "$COMPOSER_LOCK_BACKUP"
  }
  trap 'restore_composer_lock; release_vendor_lock' EXIT INT TERM

  node "$PROJECT_DIR/tools/composer-lock-git-sources.mjs" "$COMPOSER_LOCK"

  if ! composer install --working-dir="$PROJECT_DIR/api" \
    --no-interaction --no-progress --prefer-source; then
    echo
    echo "  ! Composer could not install api/vendor."
    echo
    echo "    The install runs over git precisely because this session cannot"
    echo "    reach GitHub's archive hosts for third-party repositories, so a"
    echo "    network allowlist change will NOT fix this — see the comment"
    echo "    above and docs/web-session.md."
    echo
    echo "    Check instead that git itself reaches github.com:"
    echo
    echo "        git ls-remote https://github.com/symfony/var-dumper.git"
    echo
    echo "    and that a package has not been added whose dist is somewhere"
    echo "    other than api.github.com, which this script cannot derive a git"
    echo "    source for."
    echo
    exit 1
  fi

  restore_composer_lock
  trap - EXIT INT TERM

  # A source install is EXPENSIVE ON DISK, and a web session's writable space is
  # a fixed per-session allowance rather than a real filesystem. MEASURED here:
  # api/vendor 19 GB, because --prefer-source leaves a full-history .git in every
  # one of the 121 packages, plus an 18 GB VCS mirror cache underneath it. That
  # is enough to exhaust the allowance outright — this script hit
  # "fatal: ... write error. Out of diskspace" mid-clone and left no
  # vendor/autoload.php behind.
  #
  # Neither copy is needed once the files are on disk: nothing here runs
  # `composer update`, and `git status` inside a vendored package answers a
  # question nobody is asking. Dropping both takes api/vendor to roughly its
  # dist-install size and hands the allowance back.
  #
  # The trade is that a later `composer install` can no longer reuse the mirrors
  # and re-clones from github.com. That costs minutes once, against a failure
  # mode that costs the whole session.
  echo "==> Reclaiming disk (vendor .git dirs and the Composer VCS cache)"
  find "$PROJECT_DIR/api/vendor" -type d -name .git -prune -exec rm -rf {} + 2>/dev/null || true
  composer clear-cache --quiet || true

  release_vendor_lock
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
