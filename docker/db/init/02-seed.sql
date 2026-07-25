SET NAMES utf8mb4;

-- Instrument names are not personal data; kept for realism.
INSERT INTO `instruments` (`id`, `name`) VALUES
(1, 'Trompette'),
(2, 'Trombone'),
(3, 'Sousaphone'),
(4, 'Cloches'),
(5, 'Batterie'),
(6, 'Lyre'),
(7, 'Grosses-Caisse'),
(8, 'Comite'),
(9, 'Maquillage');

-- Synthetic users. Every password is a bcrypt hash of the literal string "demo".
-- NO real member names or passwords.
--
-- These were plain text until the Laravel API cutover. The old
-- Auth::attemptLogin() accepted a plaintext row once and upgraded it to a
-- password_hash() on first login; that legacy path is deliberately NOT ported
-- to Laravel, whose Auth::attempt() bcrypt-verifies and would reject a
-- plaintext row outright ("This password does not use the Bcrypt algorithm").
-- Seeding hashes keeps every demo login working through both apps.
--
-- To change the demo password, regenerate with:
--   docker compose exec web php -r "echo password_hash('demo', PASSWORD_BCRYPT);"
-- The same hash is reused for every row on purpose: it is synthetic local-only
-- data, and one value is easier to recognise and replace than eight.
INSERT INTO `users` (`id`, `username`, `password`, `role`, `instrument_id`) VALUES
(1, 'demo.user',      '$2y$12$jtoJNlhLIkkgKj4R6MwQ9uLBp35BdlZ4/AGmtrC/arti.n8mqOfPS', 'user',      1),
(2, 'demo.user2',     '$2y$12$jtoJNlhLIkkgKj4R6MwQ9uLBp35BdlZ4/AGmtrC/arti.n8mqOfPS', 'user',      2),
(3, 'demo.user3',     '$2y$12$jtoJNlhLIkkgKj4R6MwQ9uLBp35BdlZ4/AGmtrC/arti.n8mqOfPS', 'user',      5),
(4, 'demo.moderator', '$2y$12$jtoJNlhLIkkgKj4R6MwQ9uLBp35BdlZ4/AGmtrC/arti.n8mqOfPS', 'moderator', 8),
(5, 'demo.admin',     '$2y$12$jtoJNlhLIkkgKj4R6MwQ9uLBp35BdlZ4/AGmtrC/arti.n8mqOfPS', 'admin',     8),
(6, 'alex.muster',    '$2y$12$jtoJNlhLIkkgKj4R6MwQ9uLBp35BdlZ4/AGmtrC/arti.n8mqOfPS', 'user',      4),
(7, 'sam.beispiel',   '$2y$12$jtoJNlhLIkkgKj4R6MwQ9uLBp35BdlZ4/AGmtrC/arti.n8mqOfPS', 'user',      7),
(8, 'chris.exemple',  'demo', 'moderator', 8);

INSERT INTO `events`
  (`id`, `date`, `title`, `start_time`, `end_time`, `location`, `attire`, `weekend`) VALUES
(1, '2026-08-22', 'Répétition',                              '10:00:00', '12:00:00', 'Werkhof',      'Libre',            0),
(2, '2026-08-29', 'Fête du Poulet',                          '10:00:00', '20:00:00', 'Sierre',       'T-shirt canetons', 0),
(3, '2026-10-03', 'Weekend musical',                         '09:00:00', '16:00:00', 'Lac Noir',     'Libre',            1),
(4, '2026-11-14', '20ème anniversaire des Gouilles Agasses', '10:00:00', '17:00:00', 'À confirmer',  'À confirmer',      0);

INSERT INTO `responses` (`user_id`, `event_id`, `answer`) VALUES
(1, 1, 'participate'),
(1, 2, 'participate'),
(2, 1, 'notparticipate'),
(3, 2, 'participate'),
(4, 1, 'participate'),
(6, 1, 'participate'),
(6, 4, 'participate'),
(7, 3, 'participate');
