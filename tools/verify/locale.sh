#!/bin/sh
set -eu
cd "$( CDPATH= cd -- "$( dirname -- "$0" )/../.." && pwd )"

PHP='
echo "WPLANG_option=" . var_export( get_option( "WPLANG" ), true ) . PHP_EOL;
echo "get_locale=" . get_locale() . PHP_EOL;
echo "WPLANG_constant=" . ( defined( "WPLANG" ) ? WPLANG : "(undefined)" ) . PHP_EOL;
echo "admin1_locale=" . var_export( get_user_meta( 1, "locale", true ), true ) . PHP_EOL;
echo "available=" . implode( ",", get_available_languages() ) . PHP_EOL;
'

MSYS_NO_PATHCONV=1 docker compose run --rm wp-cli wp --path=/var/www/html eval "$PHP" | grep -E '='
