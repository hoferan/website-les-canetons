# Souper signup — round-2 admin feedback

**Date:** 2026-07-17
**Branch:** `feature/reservation-souper-form` (not yet merged / not yet on production)
**Status:** design approved, pending spec review

## Context

The "Souper — 25 ans des Canetons" signup feature already exists on this branch:
a site-wide popup, a home-page call-to-action, a public signup form, an admin
overview, and a CSV export. The admin ("Team Direction") reviewed it and asked
for a second round of changes. This spec covers those changes plus two supporting
improvements the admin requested (Excel export via a vendored library, and a
local migration runner).

Because the branch is **not yet on production**, the `signups` table does not
exist there yet. We therefore edit the existing migration `001` in place instead
of adding a new one.

## Goals

1. **Messaging** — convey the full occasion (25th anniversary + new-costume
   reveal + guggen evening with guest bands) while keeping the souper reservation
   front and centre. Single source of copy, shown on popup, home page, form, and
   in the confirmation email. Event date: **13 November 2027**.
2. **Popup** — show once per **browser session** (not once forever).
3. **Home page** — move the souper block **above** the "Bienvenue" section and
   restyle it to match the popup.
4. **Form** — add a required **email** field, send a **confirmation email**
   (authenticated SMTP via vendored PHPMailer), reusing the popup copy.
5. **Export** — replace the CSV export with a real **`.xlsx`** file (vendored
   SimpleXLSXGen).
6. **Local dev** — auto-apply migrations on `docker compose up` via a small
   idempotent runner; capture outgoing mail locally with **Mailpit**.

## Non-goals

- No new production migration (edit `001` in place; branch not deployed).
- No Composer runtime dependency and no build step on production — third-party
  PHP libraries are vendored as committed files under `code/` and uploaded as-is.
- No change to the production deployment process (manual FTP) or to how
  migrations are applied on production (still manual, in order).

---

## 1. Copy (French), centralized

All user-facing copy lives in `SignupRepository::OCCASIONS['anniversary-supper']`
so the popup, home page, form, and confirmation email share one source.

Add a `date` entry (machine value + French display string).

```php
'anniversary-supper' => [
    'title'        => 'Souper des 25 ans des Canetons',
    'subtitle'     => 'Sortie du nouveau costume · Soirée guggen',
    'date'         => '2027-11-13',            // machine-readable
    'date_display' => '13 novembre 2027',      // UI text (French)
    'teaser'       => 'Le 13 novembre 2027, fêtez avec nous les 25 ans des '
        . 'Canetons ! Au programme : le dévoilement de notre nouveau costume, '
        . 'un souper d\'anniversaire et une soirée guggen avec des cliques '
        . 'invitées. Amis et familles, réservez votre place et votre menu.',
    'description'  => 'Un grand merci à nos amis et à nos familles ! Le '
        . '13 novembre 2027, nous fêtons nos 25 ans : dévoilement du nouveau '
        . 'costume, souper d\'anniversaire et soirée guggen. Inscrivez-vous '
        . 'ci-dessous pour réserver votre place et votre menu.',
],
```

- `teaser` — short copy for popup + home page.
- `description` — longer intro on the form page.
- The button label stays "S'inscrire au souper".

**Language note:** English everywhere (code, keys, DB, this spec); French only for
the on-screen values above.

## 2. Popup — once per browser session

`code/assets/js/supper-popup.js`:

- Change the "seen this session" flag from `localStorage` to **`sessionStorage`**
  (key `canetons_supper_popup_session`). The popup shows once per new browser
  session and does not reappear on a plain reload within the same session.
- Keep a **permanent opt-out**: the "Non merci, ne plus afficher" link sets a
  `localStorage` key (`canetons_supper_popup_optout`). On load, the popup is
  suppressed if the opt-out key is set OR the session key is set.
- The close button (✕), backdrop click, Escape, and the CTA set only the
  **session** key (reappears next session). Only the "ne plus afficher" link sets
  the permanent opt-out.

`code/partials/footer.php`: popup markup pulls title/subtitle/teaser/date from the
occasion data instead of hardcoded strings. Add the date line. Still hidden for
admins (`Auth::canViewSummary()`).

## 3. Home page — souper block first, richer styling

`code/index.php`:

- Move the `souper-cta` `<section>` **above** the `accueil` ("Bienvenue")
  section so "Bienvenue" appears after it.
- Restyle to match the popup (banner with duck emoji, gradient, title +
  subtitle + teaser + date + CTA). Pull copy from occasion data.
- Admin variant ("Voir les inscriptions") keeps its text but adopts the same
  styling.

`code/assets/css/accueil.css` (and/or `main.css`): add the richer souper-block
styles, reusing popup styling where practical.

## 4. Form + confirmation email

### 4a. Email field

`code/signup.php`: add a required email input to the "Vos coordonnées" fieldset
(`type="email"`, `required`).

`code/assets/js/signup.js`: include `email` in the POST payload.

`code/api/signups.php` (POST): read + `trim` email, validate with
`FILTER_VALIDATE_EMAIL` (mirror `api/contact.php`), enforce max length (255).
Reject with 400 on invalid input, consistent with existing validation.

### 4b. Database

Edit `sql/migrations/001_create_signups.sql` to add an `email` column
(`varchar(255) NOT NULL`) after `phone`. No new migration file (branch not on
prod). Update `docker/db/init` baseline only if it duplicates the signups schema
(it does not today — signups lives solely in migration `001`).

`SignupRepository`:
- `create()` — include `email` in the INSERT.
- `allForOccasion()` — select `email`.
- `computeStats()` / per-signup rows — carry `email` through for the export.

### 4c. Mailer (vendored PHPMailer, authenticated SMTP)

- Vendor PHPMailer source files under `code/src/vendor/PHPMailer/`
  (`PHPMailer.php`, `SMTP.php`, `Exception.php`). No Composer at runtime; files
  are committed and uploaded via FTP.
- New `code/src/Mailer.php` — a thin wrapper around PHPMailer configured from the
  `mail` config section. Exposes something like
  `sendSignupConfirmation(string $toEmail, string $toName, array $summary): bool`.
- `code/src/bootstrap.php` — `require` the vendored PHPMailer files and
  `Mailer.php`.
- After a successful insert in `api/signups.php`, build the confirmation and send
  it. `$config` is in scope after requiring bootstrap, so the endpoint can do
  `new Mailer($config['mail'])`.

**Email content:** subject "Confirmation de votre inscription — Souper des 25 ans
des Canetons"; body reuses the occasion `teaser` + date + a summary of the
reservation (name, table, chosen menus with counts). Plain-text is sufficient; a
simple HTML body is acceptable if kept inline.

**Fail-safe:** a mail failure must NOT block the reservation. The insert is
committed first; the send is attempted after and wrapped so any exception is
caught and logged (`error_log`), then the endpoint still returns 201 and the
client still redirects to the thank-you page.

### 4d. Config

Add a `mail` section to the config array shape:

```php
'mail' => [
    'host'       => 'mail-X.easy-hebergement.net', // real value on prod
    'port'       => 465,                            // 465 SSL (or 587)
    'secure'     => 'ssl',                          // 'ssl' | 'tls' | ''
    'username'   => 'noreply@<domain>',             // a real mailbox
    'password'   => 'CHANGE_ME',
    'from_email' => 'noreply@<domain>',
    'from_name'  => 'Les Canetons de Fribourg',
],
```

- `config/config.example.php` — add the `mail` block with placeholders.
- `config/config.docker.php` — point at **Mailpit**: host `mailpit`, port `1025`,
  `secure` empty, no real credentials (Mailpit accepts anything).
- Real production values go only in the git-ignored `code/config.php`.

## 5. Export — real `.xlsx`

- Vendor **SimpleXLSXGen** as a single file `code/src/vendor/SimpleXLSXGen.php`
  (MIT, dependency-free). `require` it where needed (export path in
  `api/signups.php`, or a small helper).
- Replace the CSV branch in `api/signups.php` GET (`format=csv`) with an `.xlsx`
  export (make `.xlsx` the default admin export; drop CSV — one format, KISS).
  Filename `inscriptions-souper.xlsx`, correct content-type + disposition.
- Columns: Table, Nom, Prénom, **Email**, Adresse, Téléphone, Viande, Enfant,
  Végétarien, Total (one row per signup).
- Keep the intent of the existing CSV formula-injection guard: since values go
  into real cells, ensure fields that begin with `= + - @` are not evaluated as
  formulas (SimpleXLSXGen writes strings as inline strings; confirm behavior and
  prefix defensively if needed).
- `signups_admin` UI: relabel the export button to Excel / `.xlsx`; update any
  JS/href that pointed at `format=csv`.

## 6. Local migration runner + Mailpit

### 6a. Runner

- New `tools/migrate.php` (dev tooling, repo root — never deployed):
  - Connects using DB env/config for the docker `db` service.
  - Ensures `schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at
    TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`.
  - Reads `sql/migrations/NNN_*.sql` in ascending order; for each version not in
    `schema_migrations`, executes its statements and records the version.
  - Idempotent: re-running applies nothing new. Runs on every `up`, so no more
    `docker compose down -v` just to pick up a migration.
- Note: MariaDB DDL is not transactional; apply per-file and record the version
  only after the file's statements succeed. A failed migration stops the run with
  a clear error.

### 6b. docker-compose changes

- Add a one-shot **`migrate`** service (reuses the web image so PHP + mysqli are
  available; mounts `code/`, `sql/migrations/`, and a docker config for DB
  creds). `depends_on: db (service_healthy)`; runs `php tools/migrate.php` and
  exits. `web` gains `depends_on: migrate (service_completed_successfully)`.
- **Remove** the per-migration init mounts (the nested
  `...:/docker-entrypoint-initdb.d/03-001_create_signups.sql` line) and the
  comment explaining the non-read-only init mount. Keep `01-schema.sql` (baseline)
  and `02-seed.sql` as the fresh-volume baseline; the runner applies
  `sql/migrations/*` on top and tracks them.
- Add a **`mailpit`** service (`axllent/mailpit`): SMTP on `1025` (internal),
  web UI mapped to host `8025`. The web container's docker config points SMTP at
  `mailpit:1025`.
- `sql/migrations/README.md` — update the "Local dev" section to describe the
  runner (auto-applied, tracked, idempotent) instead of manual mount lines.

### Ports (local)

| Service  | Host port |
|----------|-----------|
| web      | 8090      |
| adminer  | 8091      |
| db       | 3307      |
| mailpit  | 8025 (UI) |

## 7. CLAUDE.md update

Refine the "buildless / no runtime dependencies" rule to allow **vendored,
dependency-free single-purpose PHP libraries** committed under `code/`
(e.g. `code/src/vendor/`) and uploaded as-is. Still: no Composer install and no
build step on production; the deployed `code/` remains the exact FTP payload.

## Files touched (summary)

- `code/src/repositories/SignupRepository.php` — occasion copy + date, `email`
  in create/select/stats.
- `code/partials/footer.php` — popup copy from occasion data + date.
- `code/assets/js/supper-popup.js` — session-based display + permanent opt-out.
- `code/index.php` — souper block first + restyle.
- `code/assets/css/accueil.css` (+ `main.css`) — souper block / popup-like styles.
- `code/signup.php`, `code/assets/js/signup.js` — email field.
- `code/api/signups.php` — email validation, send confirmation, `.xlsx` export.
- `code/src/Mailer.php` (new) + `code/src/vendor/PHPMailer/*` (vendored).
- `code/src/vendor/SimpleXLSXGen.php` (vendored).
- `code/src/bootstrap.php` — require vendored libs + Mailer.
- `code/signups_admin.php` / `signups_admin.js` — export button relabel.
- `sql/migrations/001_create_signups.sql` — add `email` column.
- `sql/migrations/README.md` — document the runner.
- `tools/migrate.php` (new).
- `docker-compose.yml` — `migrate` + `mailpit` services; drop per-migration mounts.
- `config/config.example.php`, `config/config.docker.php` — `mail` section.
- `CLAUDE.md` — vendored-lib clarification.

## Testing

- **PHPUnit (existing):** extend `SignupRepositoryTest` for the `email` field in
  create/select and in the stats/export row shape. Consider a focused unit test
  for the `.xlsx` column mapping (pure data → rows) without hitting the file
  writer, and for `Mailer` message assembly (build-only, no network).
- **Manual (local):** submit the form → confirm the reservation is stored and a
  confirmation mail appears in the Mailpit UI (`localhost:8025`); verify the mail
  failure path still stores the reservation; download the `.xlsx` and open it in
  Excel; verify the popup shows once per session and the opt-out link works;
  verify the home page order (souper block before "Bienvenue"); run
  `docker compose down && up` and confirm migrations auto-apply once.
- `npm run check` (php -l, phpcs PSR-12, eslint, stylelint, prettier, secret
  guard) must pass. Note: PHPMailer/SimpleXLSXGen vendored files may need to be
  excluded from phpcs/prettier (add to ignore lists) since they are third-party.
