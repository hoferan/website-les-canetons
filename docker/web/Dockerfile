FROM php:8.1-apache

# mysqli is required by code/src/Database.php and is NOT bundled in the base image.
# Also enable the Apache modules the .htaccess relies on and allow .htaccess overrides.
RUN docker-php-ext-install mysqli \
 && a2enmod headers expires rewrite \
 && sed -ri 's!AllowOverride None!AllowOverride All!g' /etc/apache2/apache2.conf
