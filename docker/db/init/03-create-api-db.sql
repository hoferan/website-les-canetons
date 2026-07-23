-- Separate database for the Laravel API (api/), keeping its schema and
-- Laravel migration history independent from the old app's `lescanetons`
-- database — matching the "two independent projects" architecture.
--
-- Runs once, on a FRESH db volume (MariaDB's docker-entrypoint-initdb.d only
-- executes on first init). To pick this up on an existing dev volume, recreate
-- it with `docker compose down -v` (destroys local dev data — synthetic only).
CREATE DATABASE IF NOT EXISTS `lescanetons_api`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- MARIADB_USER (canetons) is created by the image from the compose env; grant
-- it full rights on the new database too (it already has them on lescanetons).
GRANT ALL PRIVILEGES ON `lescanetons_api`.* TO 'canetons'@'%';
FLUSH PRIVILEGES;
