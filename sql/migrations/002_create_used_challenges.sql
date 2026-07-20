-- 002 — replay protection for Altcha proof-of-work solutions.
-- Each solved challenge's signature is consumed once (App\Repositories\
-- ChallengeRepository); rows are pruned after a day. Stores no IP / PII.

CREATE TABLE IF NOT EXISTS `used_challenges` (
  `signature`  char(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`signature`),
  KEY `idx_used_challenges_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
