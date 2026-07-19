-- 001 — create `signups` table for the public occasion signup form.
-- `occasion` has no default: the application always sets it explicitly.

CREATE TABLE IF NOT EXISTS `signups` (
  `id`         int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `occasion`   varchar(64)  NOT NULL,
  `first_name` varchar(255) NOT NULL,
  `last_name`  varchar(255) NOT NULL,
  `address`    varchar(255) NOT NULL,
  `phone`      varchar(64)  NOT NULL,
  `email`      varchar(255) NOT NULL,
  `table_name` varchar(255) NOT NULL,
  `menus`      text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_signups_occasion` (`occasion`),
  KEY `idx_signups_table` (`occasion`,`table_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
