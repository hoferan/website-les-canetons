#!/bin/sh
# Idempotent local WordPress setup. Safe to re-run: every step checks its own
# state first, so this is also the recovery path after `npm run wp:reset`.
#
# Run via `npm run wp:setup`, never directly — the npm script supplies the
# compose service and the run target.
set -eu

WP="wp --path=/var/www/html"

# --- core -------------------------------------------------------------------
if $WP core is-installed 2>/dev/null; then
  echo "core: already installed"
else
  echo "core: installing"
  $WP core install \
    --url="http://localhost:8100" \
    --title="Les Canetons de Fribourg" \
    --admin_user="admin" \
    --admin_password="admin" \
    --admin_email="admin@lescanetons.invalid" \
    --skip-email
fi

# --- locale ----------------------------------------------------------------
# The site is French-only (spec §2). Everything user-visible comes from core and
# plugin translations, so the locale is not cosmetic — it IS the translation
# strategy.
if [ "$($WP option get WPLANG)" = "fr_FR" ]; then
  echo "locale: already fr_FR"
else
  echo "locale: installing fr_FR"
  $WP language core install fr_FR --activate
fi

# --- permalinks ------------------------------------------------------------
# Default WordPress serves ?p=123 URLs. Pretty permalinks are what production
# will use, and they exercise the .htaccess rewrite path, so local must match or
# routing bugs only appear after deploy.
if [ "$($WP option get permalink_structure)" = "/%postname%/" ]; then
  echo "permalinks: already pretty"
else
  echo "permalinks: enabling"
  $WP rewrite structure '/%postname%/' --hard
  $WP rewrite flush --hard
fi

# --- timezone --------------------------------------------------------------
# Event dates and times are meaningless without this (spec §1.1).
$WP option update timezone_string "Europe/Zurich" >/dev/null

# --- hardening (spec §8) ---------------------------------------------------
# Comments and trackbacks closed site-wide: the site has no use for them, and an
# open comment form on shared hosting is a spam liability. Options rather than
# code, so they stay visible and auditable in wp-admin.
$WP option update default_comment_status closed >/dev/null
$WP option update default_ping_status closed >/dev/null
# Local only. PROD sets this to 1 at cutover.
$WP option update blog_public 0 >/dev/null

# --- third-party plugins (spec §4) -----------------------------------------
# Installed here so local development is reproducible after a reset. On TEST and
# PROD these are installed and updated through wp-admin — spec §4 is unchanged;
# local is disposable, servers are not.
#
# Three of the six are deliberately absent locally:
#   FluentSMTP            — docker/wp/mu-plugins/local-mail.php does this job,
#                           and both hook phpmailer_init.
#   UpdraftPlus           — purely operational; backs up nothing worth keeping
#                           here, and adds cron noise.
#   Limit Login Attempts  — would lock you out of your own dev site while
#                           testing the login of spec §1.5.
# WP Dark Mode IS installed locally: it is cosmetic front-end and wants seeing.
for plugin in fluentform members wp-dark-mode; do
  if $WP plugin is-installed "$plugin" 2>/dev/null; then
    echo "plugin: $plugin already installed"
  else
    echo "plugin: installing $plugin"
    $WP plugin install "$plugin" --activate
  fi
done

# --- our own plugin --------------------------------------------------------
# Bind-mounted, so the files are always present — but a reset drops the database
# and with it the active-plugins option, so it needs re-activating. Without this
# `wp:reset` does not fully recover.
if $WP plugin is-active canetons-planning 2>/dev/null; then
  echo "plugin: canetons-planning already active"
else
  echo "plugin: activating canetons-planning"
  $WP plugin activate canetons-planning
fi

echo "setup: done — http://localhost:8100/wp-admin (admin / admin)"
echo "setup: mail at http://localhost:8026"
