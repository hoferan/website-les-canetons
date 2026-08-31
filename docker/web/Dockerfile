# Local dev image: ONE container running Apache + PHP-FPM, mirroring the real
# host (easy-hebergement), where a single Apache serves the built SPA and the
# Laravel API from one document root with PHP as FastCGI.
#
# php:8.4-fpm, not php:8.4-apache: production runs PHP as FastCGI, not mod_php.
# Two workarounds in this codebase only take effect under a CGI-family SAPI —
# the REDIRECT_STATUS guard on the SPA fallback, and the Authorization-header
# forwarding in the /api/* dispatch block (both in
# config/htaccess/site.htaccess) — and are dead code under mod_php, so a
# mod_php container cannot tell you whether they work.
FROM php:8.4-fpm

# pdo_mysql + mbstring: Laravel, which talks to MariaDB over PDO. mysqli is
# gone with the old front end's App\Database, the only thing that used it.
# libonig-dev is mbstring's build dependency.
#
# php.ini-production, not -development: log_errors=1 sends PHP errors to the
# FPM log (and so to `docker compose logs web`), and display_errors=0 matches
# production. Development's display_errors=1 would prepend HTML warnings to
# JSON API responses, corrupting them mid-stream, which would make the Task 8
# smoke checks fail in confusing ways.
#
# rm -f .../index.html: the apache2 package ships a "It works!" default page
# at the default DocumentRoot; harmless once a real docroot is bind-mounted
# over it, but there is no reason to ship it in the image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends apache2 libonig-dev \
 && docker-php-ext-install -j"$(nproc)" pdo_mysql mbstring \
 && mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
 && a2enmod proxy_fcgi setenvif rewrite headers expires \
 && a2dissite 000-default \
 && rm -f /var/www/html/index.html \
 && rm -rf /var/lib/apt/lists/*

# apache2ctl normally creates these (its APACHE_RUN_DIR/socks and
# APACHE_LOCK_DIR mkdir_chown calls) before invoking httpd; the entrypoint
# execs the httpd binary directly instead (see entrypoint.sh for why), which
# skips that step and fails at startup with "DefaultRuntimeDir must be a
# valid directory" — reproduced empirically. Baking the directories into the
# image at build time (they are ephemeral/container-local, never volumes)
# means the entrypoint needs no equivalent runtime logic.
RUN mkdir -p /var/run/apache2/socks /var/lock/apache2 \
 && chown www-data:www-data /var/run/apache2/socks /var/lock/apache2

# Global ErrorLog, not the vhost's: Apache's ap_replace_stderr_log() dups the
# *main* error log onto fd 2 at startup, so by the time a per-vhost ErrorLog
# opens, "/dev/stderr" resolves back to the default /var/log/apache2/error.log
# instead of actually reaching fd 2 — verified by A/B testing a vhost-scoped
# ErrorLog against this global one. Setting it here, before any vhost, is what
# actually surfaces .htaccess syntax errors and FastCGI backend failures
# (AH00957/AH01079) in `docker compose logs web`. ServerName here also
# silences the AH00558 "could not reliably determine the FQDN" startup notice.
RUN printf 'ServerName localhost\nErrorLog /dev/stderr\n' > /etc/apache2/conf-available/docker-logs.conf \
 && a2enconf docker-logs

# Silence php-fpm's own per-request access log: the base image's
# php-fpm.d/docker.conf points the [www] pool's access.log at
# /proc/self/fd/2, which would otherwise double-log every request alongside
# Apache's CustomLog. A conf file sorting after "docker.conf" overrides it.
RUN printf '[www]\naccess.log = /dev/null\n' > /usr/local/etc/php-fpm.d/zz-canetons-log.conf

COPY apache-canetons.conf /etc/apache2/sites-available/canetons.conf
RUN a2ensite canetons

COPY --chmod=0755 entrypoint.sh /usr/local/bin/entrypoint.sh

WORKDIR /var/www/html
EXPOSE 80

# php-fpm listens on 127.0.0.1:9000 (the base image's default pool). Without
# this, a dead FPM process leaves the container reporting "healthy" — Apache
# (PID 1) stays up — while every request 503s, invisibly. Probe FPM's
# listening socket directly instead of relying on Apache's liveness alone.
#
# --start-period=120s: worst case before php-fpm starts is up to 65s, spent in
# the entrypoint's retry around `artisan migrate` (30 attempts, 2s apart) — 120s
# leaves headroom so the container cannot flip to unhealthy while still
# legitimately migrating.
HEALTHCHECK --interval=15s --timeout=3s --start-period=120s \
  CMD php -r 'exit(@fsockopen("127.0.0.1",9000)?0:1);' || exit 1

# Overrides the base image's `php-fpm` CMD: this container runs both processes.
CMD ["/usr/local/bin/entrypoint.sh"]
