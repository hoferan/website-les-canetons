#!/bin/sh
# Deploy the two artifact directories to an environment over FTP (spec §10).
#
#   tools/wp-deploy.sh <test|prod> [--dry-run]
#
# The deploy artifact is exactly two directories — wp-content/themes/canetons and
# wp-content/plugins/canetons-planning — mirrored to the environment's document
# root. WordPress core, third-party plugins, uploads and wp-config.php are
# server-owned and never touched. This is deliberately a small mirror, with none
# of the retired stack's sync-state manifest, mass-delete brake or connection
# pool: at two directories that contain no server-owned files, that machinery has
# nothing to protect against (spec §10).
#
# Credentials come from the git-ignored .env.<env>, which must define:
#   FTP_HOST         the FTP hostname
#   FTP_USER         the FTP username
#   FTP_PASSWORD     the FTP password (FTP_PASS also accepted — the kept old-stack
#                    env files use that name, and renaming it inside them would
#                    break rollback via archive/php-laravel-stack)
#   FTP_DIR          the document root (e.g. /public_html/staging/test.lescanetons.org)
# Optional:
#   FTP_TLS          "true" (default) forces FTPS; set "false" for plain FTP
#   FTP_SSL_VERIFY   "yes" (default) verifies the certificate; set "no" only if
#                    the host presents a self-signed or mismatched FTPS cert
#
# FTP_DIR is read from here on purpose (Plan 1, Task 0): nothing else hardcodes a
# document-root path, so relocating the site is a one-value change per env.
set -eu

ENV="${1:-}"
DRY=""
if [ "${2:-}" = "--dry-run" ]; then
	DRY="--dry-run"
fi

case "$ENV" in
	test | prod ) ;;
	* )
		echo "Usage: tools/wp-deploy.sh <test|prod> [--dry-run]" >&2
		exit 2
		;;
esac

THEME_LOCAL="wp-content/themes/canetons"
PLUGIN_LOCAL="wp-content/plugins/canetons-planning"
if [ ! -d "$THEME_LOCAL" ] || [ ! -d "$PLUGIN_LOCAL" ]; then
	echo "Run this from the repository root." >&2
	exit 1
fi

ENV_FILE=".env.$ENV"
if [ ! -f "$ENV_FILE" ]; then
	echo "Missing $ENV_FILE (git-ignored; holds the FTP credentials)." >&2
	exit 1
fi
# shellcheck disable=SC1090
. "./$ENV_FILE"

: "${FTP_HOST:?set FTP_HOST in $ENV_FILE}"
: "${FTP_USER:?set FTP_USER in $ENV_FILE}"
FTP_PASSWORD="${FTP_PASSWORD:-${FTP_PASS:-}}"
: "${FTP_PASSWORD:?set FTP_PASSWORD (or FTP_PASS) in $ENV_FILE}"
: "${FTP_DIR:?set FTP_DIR in $ENV_FILE (the document root)}"
FTP_TLS="${FTP_TLS:-true}"
FTP_SSL_VERIFY="${FTP_SSL_VERIFY:-yes}"

if ! command -v lftp >/dev/null 2>&1; then
	echo "lftp not found. Install it (apt-get install lftp / brew install lftp)." >&2
	exit 1
fi

REMOTE_THEME="$FTP_DIR/wp-content/themes/canetons"
REMOTE_PLUGIN="$FTP_DIR/wp-content/plugins/canetons-planning"

echo "Deploying to $ENV — $FTP_HOST:$FTP_DIR${DRY:+  [dry run]}"

# A PROD deploy must be preceded by a manual backup (spec §11); confirm it.
if [ "$ENV" = "prod" ] && [ -z "$DRY" ]; then
	printf 'PROD deploy. Backup taken first (spec §11)? Type "yes" to continue: '
	read -r answer
	if [ "$answer" != "yes" ]; then
		echo "Aborted."
		exit 1
	fi
fi

# The plugin is deployed as SOURCE ONLY — never its dev-only files (Plan 1 note):
# vendor/, tests/, composer.*, phpunit-*.xml.dist, .gitignore, .phpunit.cache/.
# The theme has no such files and is mirrored whole.
lftp -u "$FTP_USER,$FTP_PASSWORD" "ftp://$FTP_HOST" <<LFTP
set ftp:ssl-force $FTP_TLS
set ftp:ssl-protect-data $FTP_TLS
set ssl:verify-certificate $FTP_SSL_VERIFY
set net:max-retries 3
set net:timeout 20
set cmd:fail-exit yes
mirror --reverse --delete --verbose --no-perms $DRY "$THEME_LOCAL/" "$REMOTE_THEME/"
mirror --reverse --delete --verbose --no-perms $DRY --exclude 'vendor/' --exclude 'tests/' --exclude '.phpunit.cache/' --exclude-glob 'composer.json' --exclude-glob 'composer.lock' --exclude-glob '*.xml.dist' --exclude-glob '.gitignore' "$PLUGIN_LOCAL/" "$REMOTE_PLUGIN/"
bye
LFTP

echo "Done."
