-- Databases beyond the one the image creates from MYSQL_DATABASE (lescanetons).
--
-- Runs before 01-schema.sql (the entrypoint applies *.sql in filename order).
-- Each file is fed with --database=$MYSQL_DATABASE, so a USE here does not leak
-- into the later files: they still populate lescanetons as intended.
--
-- laravel_api_test backs the Laravel API's PHPUnit suite (api/phpunit.xml).
-- It MUST stay a dedicated database: those tests use RefreshDatabase, which
-- drops every table, so pointing them at the shared lescanetons database would
-- wipe local dev data on every run.
CREATE DATABASE IF NOT EXISTS `laravel_api_test`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- The same synthetic local-dev account the rest of the stack uses. The image
-- grants it on lescanetons only, so the test database needs its own grant.
GRANT ALL PRIVILEGES ON `laravel_api_test`.* TO 'canetons'@'%';

FLUSH PRIVILEGES;
