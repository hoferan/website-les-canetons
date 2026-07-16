# Design: Public Reservation Form (Souper – Canetons 25th Anniversary)

- **Date:** 2026-07-16
- **Status:** Design approved (spec under review)
- **Product language:** French (UI + DB columns), consistent with the rest of the site.
  This design document is in English; only the shipped product strings are French.

## 1. Context & goal

The Guggenmusik is hosting a one-off **Souper**: unveiling of the new costume and the
**25th anniversary of the Canetons**. It is a **thank-you event for friends and family**
of the band — it is **not** an event for the members themselves, so it is fully separate
from the members' attendance system (`events` / `responses`, `sinscrire.php`,
`inscriptions_*`).

Goal: a public page (no login) where one person can register **several guests** in a
single form, choosing **one menu per person** and giving a **table** (family name or
table name) so that separate reservations can group at the same table. The Team
Direction (admin) reviews reservations and, above all, the **totals** needed by the
caterer and for the seating plan.

The event is **one-off**, but the implementation stays **reusable** for future events via
a discriminator column `event_key`.

## 2. Key decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Access | Public, no login (like `contact.php`). |
| Data model | **A single table** `reservations`. Guests/menus are stored as a **list of menus** in one column. |
| Reusability | `event_key` discriminator column; per-key title/description in a PHP constant. No events table, no admin event CRUD. |
| Per-person fields | The **guests' names do not matter** — only the **menu per person** counts. |
| Contact | `nom` + `prenom` **kept** = contact details of the person who registers (needed for follow-up questions), plus `address` and `phone`. |
| Table (Tisch) | Free-text field, **shared** at reservation level. Existing tables suggested via `<datalist>`. |
| Menu | 3 fixed choices: `viande` (standard), `enfant`, `vegetarien`. |
| Confirmation | Store in DB + dedicated thank-you page. **No e-mail.** |
| Navigation | **No** menu entry. A link from the home page (`index.php`). |
| Popup | Modal shown **once per browser** (localStorage) on first load of any page, linking to the form. |
| Admin | View reservations + **totals** (menus, tables, persons) + **CSV export**. |
| Out of scope (YAGNI) | Registration deadline, max capacity, e-mails, user editing, payment, multi-event admin UI. |

## 3. Data model

A single table, MariaDB 10.3 compatible, added to `docker/db/init/01-schema.sql` (dev)
**and** provided as a prod migration.

```sql
CREATE TABLE `reservations` (
  `id`         int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_key`  varchar(64)  NOT NULL DEFAULT 'souper-25ans', -- reusable discriminator
  `nom`        varchar(255) NOT NULL,   -- contact: last name
  `prenom`     varchar(255) NOT NULL,   -- contact: first name
  `address`    varchar(255) NOT NULL,   -- contact: address
  `phone`      varchar(64)  NOT NULL,   -- contact: phone (for follow-up questions)
  `table_name` varchar(255) NOT NULL,   -- table / family name (grouping)
  `menus`      text NOT NULL,           -- JSON list, e.g. ["viande","viande","enfant"]
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_reservations_event` (`event_key`),
  KEY `idx_reservations_table` (`event_key`,`table_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Notes:
- **Number of persons in a reservation** = length of the `menus` list.
- `menus` contains only values from `{viande, enfant, vegetarien}` (validated
  server-side before write). Stored as JSON text; aggregates are computed **in PHP**
  (low volume), so no SQL JSON functions are needed — portable to MariaDB 10.3.
- Store raw data and escape **at output time** (same rule as `contact.php`).

### Events constant (PHP)

A small associative array (in the repository or a light config file) mapping
`event_key` → labels, to drive title/description without a dedicated table:

```php
const RESERVATION_EVENTS = [
    'souper-25ans' => [
        'title'       => 'Souper – 25 ans des Canetons',
        'subtitle'    => 'Sortie du nouveau costume',
        'description' => "Un grand merci à nos amis et à nos familles : ...",
    ],
];
```

The form and the admin page use one active `event_key` (constant
`ACTIVE_EVENT_KEY = 'souper-25ans'`).

## 4. Components

### 4.1 Public form — `code/reservation.php`
- No login. Renders the active event's title/description.
- **Contact block** (once): Nom, Prénom, Adresse, Téléphone.
- **Table**: `<input list="tables">` + `<datalist id="tables">` filled server-side via
  `SELECT DISTINCT table_name FROM reservations WHERE event_key = ? ORDER BY table_name`.
- **Guests**: dynamic "+ Ajouter une personne" rows, each row = one menu `<select>`
  (Viande / Enfant / Végétarien). Minimum 1 row. Row removal supported. Vanilla JS
  (buildless), a single `assets/js/reservation.js` file.
- Submit via `fetch` POST → `api/reservations.php`, then redirect to
  `reservation_merci.php` (same pattern as the `contact.php` handler).
- Dedicated CSS: `assets/css/reservation.css`.

### 4.2 Thank-you page — `code/reservation_merci.php`
- Static "Merci pour votre réservation !" page **without** any e-mail promise
  (do not reuse `confirmation.php`, which announces an e-mail).

### 4.3 API — `code/api/reservations.php`
- `POST` (public): reads fields, validates, writes **one** row.
  - Validation: `nom`, `prenom`, `address`, `phone`, `table_name` non-empty;
    `menus` = array of 1..N values ∈ `{viande, enfant, vegetarien}` (N bounded,
    e.g. ≤ 30, to prevent abuse); `event_key` set server-side (not driven by the
    client beyond an allowed value).
  - Prepared `mysqli` statement, `menus` JSON-encoded. JSON responses `{ok:true}` /
    errors `400`/`405` like the existing endpoints.
- `GET` (guard `Auth::requireCanViewSummary`): returns aggregated data + the admin list
  (JSON).
- `GET ?format=csv` (guard `view_summary`): returns CSV (`Content-Type: text/csv`,
  `Content-Disposition: attachment`).

### 4.4 Repository — `code/src/repositories/ReservationRepository.php`
- Wired via `require` in `bootstrap.php` (no autoloader).
- Methods:
  - `create(array $data): void` — insert (menus → JSON).
  - `distinctTables(string $eventKey): array` — for the `<datalist>`.
  - `allForEvent(string $eventKey): array` — decoded reservations (menus → array).
  - `stats(string $eventKey): array` — aggregates computed in PHP (see §5).

### 4.5 Admin — `code/reservations_admin.php`
- Page guard: `Auth::requireLoginPage(...)` + `Auth::canViewSummary()` (like
  `inscriptions_admin.php`).
- Displays (via `assets/js/reservations_admin.js` consuming the `GET` API):
  - **Menu totals** per type (Viande / Enfant / Végétarien).
  - **Number of tables** and **persons per table**.
  - **Total persons** (= total menus) and **total tables**.
  - Reservation list **grouped by table** (contact + menu breakdown).
  - **CSV export** button (link to `api/reservations.php?format=csv`).
- Dedicated CSS: `assets/css/reservations_admin.css`.

### 4.6 Home-page link — `code/index.php`
- Add a banner/button "Souper 25 ans – Réservez votre place" pointing to
  `reservation.php`. No entry in `partials/navigation.php`.

### 4.7 Site-wide popup (once per browser)
- Shared HTML + JS snippet, included globally (via `partials/footer.php` so it appears
  on every page).
- On load: if `localStorage.getItem('canetons_souper_popup_v1')` is absent, show the
  modal (event title + "Réserver" button → `reservation.php` + close). On close **or**
  on click, set the flag → never shown again on this browser.
- Accessible: closable via keyboard (Escape), basic focus trap, `aria-modal`.
- Files: `assets/js/souper-popup.js` + styles (in `main.css` or a small
  `souper-popup.css`).

## 5. Statistics computation (PHP)

From `allForEvent(eventKey)` (each reservation has `menus` = array):

- `menuTotals`: count per type over all flattened `menus`.
- `totalPersons` = sum of `menus` lengths = sum of `menuTotals`.
- `tables`: group by `table_name` → for each table, `personCount` (sum of menus of that
  table's reservations) and per-menu breakdown.
- `totalTables` = number of distinct tables.

## 6. Data flow

**Reservation (public)**
```
reservation.php (form) --fetch POST--> api/reservations.php
  -> validation -> ReservationRepository::create (menus JSON)
  -> {ok:true} -> redirect reservation_merci.php
```

**Review (admin)**
```
reservations_admin.php --fetch GET--> api/reservations.php (guard view_summary)
  -> ReservationRepository::allForEvent + stats -> JSON -> render tables
Export: link api/reservations.php?format=csv -> CSV downloaded
```

**Popup**: global footer -> souper-popup.js -> localStorage (1×/browser).

## 7. Error handling

- Invalid API `POST` → `400` + `{error:...}`; wrong method → `405`.
- Front-end: on `fetch` failure, `alert(...)` + keep entered data (same behavior as
  `contact.php`).
- Unauthorized admin → `403` (page) / `view_summary` guard (API).
- DB writes via prepared statements; `menus` always re-validated server-side before insert.

## 8. Testing / verification

- `npm run check` (php -l, phpcs PSR-12, eslint, stylelint, prettier, secret-guard) green.
- Manual (Docker):
  1. Submit a reservation with 3 guests (mixed menus) → row created, `menus` JSON
     correct, redirect to thank-you page.
  2. Second reservation with the same `table_name` → `<datalist>` suggests the table;
     admin groups the two.
  3. Admin: menu/table/person totals consistent with entered data; CSV opens in Excel.
  4. Popup: appears once, does not reappear after close (localStorage); tested on ≥ 2 pages.
  5. Validation: submission with no guest / invalid menu → `400`.

## 9. Files touched / created

**Created**
- `code/reservation.php`
- `code/reservation_merci.php`
- `code/reservations_admin.php`
- `code/api/reservations.php`
- `code/src/repositories/ReservationRepository.php`
- `code/assets/js/reservation.js`
- `code/assets/js/reservations_admin.js`
- `code/assets/js/souper-popup.js`
- `code/assets/css/reservation.css`
- `code/assets/css/reservations_admin.css`
- prod SQL migration for the `reservations` table

**Modified**
- `docker/db/init/01-schema.sql` (`reservations` table)
- `code/src/bootstrap.php` (require the new repository)
- `code/index.php` (link banner)
- `code/partials/footer.php` (include the popup snippet)
- `code/assets/css/main.css` (popup styles, if not externalized)

## 10. Out of scope (recap)

Registration deadline/closing, maximum capacity, e-mails (to registrant or admin),
user account/editing, payment, multi-event admin UI (reuse happens only via `event_key`
+ PHP constant).
