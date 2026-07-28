#!/usr/bin/env bash
# Reports what a Claude Code web session can actually do, so decisions about
# Docker-free development are based on facts rather than assumptions.
#
#   bash tools/check-web-session.sh
#
# Linux-only, and intended for a web session. Running it locally is harmless —
# it reports and changes nothing when Docker already works.
#
# Background: anthropics/claude-code#29515. `dockerd` ships in the web-session
# image but is not started, and the sandbox has no iptables and an old kernel, so
# it needs --storage-driver=vfs --iptables=false and offers NO BRIDGE NETWORKING.
# That last part is why `docker compose up` cannot work there as-is: our stack
# resolves services by name (wp-db, wp-mailpit) and maps ports, both of which
# need a user-defined bridge.
#
# The one side effect: in a web session with a stopped daemon, this ATTEMPTS TO
# START dockerd, because "does it start" is the question worth answering. It
# never touches an already-working Docker.

set -uo pipefail

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$*"; }
info() { printf '  ....  %s\n' "$*"; }
head_() { printf '\n\033[1m%s\033[0m\n' "$*"; }

DOCKER_OK=no
BRIDGE_OK=no
PHP_OK=no
COMPOSER_OK=no

head_ "Environment"
info "CLAUDE_CODE_REMOTE=${CLAUDE_CODE_REMOTE:-<unset>}"
info "kernel $(uname -r)  ($(uname -m))"
info "user $(id -un) (uid $(id -u))"
if [ "$(id -u)" -eq 0 ]; then
  pass "running as root — dockerd can bind and configure networking"
else
  command -v sudo >/dev/null 2>&1 && info "not root, but sudo is present" \
    || warn "not root and no sudo — starting dockerd will likely fail"
fi
# Kernel >= 4.11 can use overlay2; older needs vfs (slow, copies whole layers).
KREL=$(uname -r | cut -d. -f1,2)
case "$KREL" in
  4.4|4.[0-9]|3.*) warn "kernel $KREL is old — Docker needs --storage-driver=vfs" ;;
  *)               info "kernel $KREL should support overlay2" ;;
esac

head_ "Docker"
if command -v docker >/dev/null 2>&1; then
  pass "docker CLI present ($(docker --version 2>/dev/null))"
else
  fail "no docker CLI"
fi

if docker info >/dev/null 2>&1; then
  pass "docker daemon already running"
  DOCKER_OK=yes
elif command -v dockerd >/dev/null 2>&1; then
  info "dockerd binary present but daemon not running"
  if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
    info "web session detected — attempting to start dockerd (see #29515)"
    ip link delete docker0 2>/dev/null || true
    dockerd --iptables=false --ip6tables=false --storage-driver=vfs \
      >/tmp/dockerd-check.log 2>&1 &
    for _ in $(seq 1 30); do
      docker info >/dev/null 2>&1 && break
      sleep 1
    done
    if docker info >/dev/null 2>&1; then
      pass "dockerd STARTED with the #29515 flags"
      DOCKER_OK=yes
    else
      fail "dockerd would not start — see /tmp/dockerd-check.log"
      tail -5 /tmp/dockerd-check.log 2>/dev/null | sed 's/^/        /'
    fi
  else
    info "not a web session — not starting dockerd (start your local Docker instead)"
  fi
else
  fail "no dockerd binary — the #29515 workaround does not apply here"
fi

if [ "$DOCKER_OK" = yes ]; then
  if docker network ls 2>/dev/null | grep -qw bridge; then
    # Listed is not the same as usable: with --iptables=false it often is not.
    if docker run --rm --network bridge alpine:latest true >/dev/null 2>&1; then
      pass "bridge networking WORKS — plain \`docker compose up\` is viable"
      BRIDGE_OK=yes
    else
      warn "a bridge network is listed but unusable — host networking only"
    fi
  else
    warn "no bridge network — containers need --network host"
  fi
  info "storage driver: $(docker info --format '{{.Driver}}' 2>/dev/null)"
  info "images cached: $(docker images -q 2>/dev/null | wc -l)"
fi

head_ "Native PHP and Composer (the unit suite needs only these)"
if command -v php >/dev/null 2>&1; then
  PHPV=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null)
  # The plugin's composer.json requires php >= 8.4; below that `composer install`
  # refuses on the platform check.
  if [ -n "$PHPV" ] && [ "$(printf '%s\n8.4\n' "$PHPV" | sort -V | head -1)" = "8.4" ]; then
    pass "php $PHPV (>= 8.4, satisfies the plugin's requirement)"
    PHP_OK=yes
  else
    warn "php ${PHPV:-unknown} is below 8.4 — composer install will refuse"
  fi
  php -m 2>/dev/null | grep -qw mysqli && info "mysqli present (needed only for integration)" \
    || info "no mysqli (fine for the unit suite)"
else
  fail "no native php"
fi

if command -v composer >/dev/null 2>&1; then
  pass "composer present ($(composer --version 2>/dev/null | head -1))"
  COMPOSER_OK=yes
else
  warn "no native composer — Docker or a downloaded composer.phar is needed"
fi

head_ "Network egress"
curl -sS -m 10 -o /dev/null -w '' https://registry-1.docker.io/v2/ 2>/dev/null \
  && pass "can reach the Docker registry" \
  || warn "cannot reach registry-1.docker.io — image pulls will fail"
curl -sS -m 10 -o /dev/null -w '' https://api.wordpress.org/ 2>/dev/null \
  && pass "can reach api.wordpress.org (plugin installs)" \
  || warn "cannot reach api.wordpress.org"

head_ "Disk"
df -h /var/tmp 2>/dev/null | tail -1 | sed 's/^/  /'
warn "vfs storage copies whole layers — our 4 images need well over 1 GB there"

head_ "Verdict"
if [ "$DOCKER_OK" = yes ] && [ "$BRIDGE_OK" = yes ]; then
  echo "  Full Docker with bridge networking: \`npm run wp:dev\` should work as-is."
elif [ "$DOCKER_OK" = yes ]; then
  echo "  Docker works but WITHOUT bridge networking, so \`docker compose up\`"
  echo "  cannot work: our services resolve each other by name and map ports."
  echo "  Viable path — run the pieces with --network host:"
  echo "    docker run -d --network host mariadb:10.3"
  echo "    docker run --network host -v \"\$PWD\":/plugin wordpress:6.9-php8.4-apache ..."
  echo "  The integration suite needs no web server, so that is enough for it."
elif [ "$PHP_OK" = yes ]; then
  echo "  No Docker, but native PHP is good enough for the UNIT suite:"
  echo "    npm run wp:test:unit"
  echo "  Integration tests and the site itself need a Docker session."
else
  echo "  Neither Docker nor a suitable native PHP. This session can edit code,"
  echo "  docs and plans, and run git — but cannot run any test."
fi
echo
