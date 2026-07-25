# Local dev image: ONE container running Apache + PHP-FPM, mirroring the real
# host (easy-hebergement), where a single Apache serves both the old app and the
# Laravel API from one document root with PHP as FastCGI.
#
# php:8.4-fpm, not php:8.4-apache: production runs PHP as FastCGI, not mod_php.
# Two workarounds in this codebase only take effect under a CGI-family SAPI —
# app/.htaccess's REDIRECT_STATUS guard, and the Authorization-header
# forwarding in docker/web/api-dispatch.htaccess — and are dead code under
# mod_php, so a mod_php container cannot tell you whether they work.
FROM php:8.4-fpm

# mysqli: the old app (App\Database). pdo_mysql + mbstring: Laravel, which
# talks to MariaDB over PDO. ONE PHP runtime serves both applications, exactly
# as on the real host. libonig-dev is mbstring's build dependency.
RUN apt-get update \
 && apt-get install -y --no-install-recommends apache2 libonig-dev \
 && docker-php-ext-install mysqli pdo_mysql mbstring \
 && a2enmod proxy_fcgi setenvif rewrite headers expires \
 && a2dissite 000-default \
 && rm -rf /var/lib/apt/lists/*

COPY apache-canetons.conf /etc/apache2/sites-available/canetons.conf
RUN a2ensite canetons

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /var/www/html
EXPOSE 80

# Overrides the base image's `php-fpm` CMD: this container runs both processes.
CMD ["/usr/local/bin/entrypoint.sh"]
