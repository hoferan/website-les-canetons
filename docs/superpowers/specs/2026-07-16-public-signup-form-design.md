# Design: Public Signup Form (Souper – Canetons 25th Anniversary)

- **Date:** 2026-07-16
- **Status:** Design approved (spec under review)
- **Language rule:** Everything (this spec, code, DB columns, enum values, identifiers,
  slugs, file names) is in **English**. **French is used only for user-visible UI text**
  (HTML labels, page copy, on-screen occasion title/description).
- **Naming:** consistent vocabulary — a **signup** (one contact registering guests) to an
  **occasion** (the event people sign up for). The `occasion` column deliberately avoids
  the word "event" to prevent confusion with the members' `events` table.

## 1. Context & goal

The Guggenmusik is hosting a one-off **supper**: unveiling of the new costume and the
**25th anniversary of the Canetons**. It is a **thank-you occasion for friends and family**
of the band — it is **not** an event for the members themselves, so it is fully separate
from the members' attendance system (`events` / `responses`, `sinscrire.php`,
`inscriptions_*`).

Goal: a public page (no login) where one person can sign up **several guests** in a single
form, choosing **one menu per person** and giving a **table** (family name or table name)
so that separate signups can group at the same table. The Team Direction (admin) reviews
signups and, above all, the **totals** needed by the caterer and for the seating plan.

The occasion is **one-off**, but the implementation stays **reusable** for future
occasions via a discriminator column `occasion`.

## 2. Key decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Access | Public, no login (like `contact.php`). |
| Data model | **A single table** `signups`. Guests/menus are stored as a **list of menus** in one column. |
| Reusability | `occasion` discriminator column; per-occasion title/description in a PHP constant. No occasions table, no admin occasion CRUD. |
| Per-person fields | The **guests' names do not matter** — only the **menu per person** counts. |
| Contact | `first_name` + `last_name` **kept** = contact details of the person who signs up (needed for follow-up questions), plus `address` and `phone`. |
| Table | Free-text field, **shared** at signup level. Existing tables suggested via `<datalist>`. |
| Menu | 3 fixed choices, stored as English values `meat` (standard), `child`, `vegetarian`; shown in French (Viande / Enfant / Végétarien). |
| Confirmation | Store in DB + dedicated thank-you page. **No e-mail.** |
| Navigation | **No** menu entry. A link from the home page (`index.php`). |
| Popup | Modal shown **once per browser** (localStorage) on first load of any page, linking to the form. |
| Admin | View signups + **totals** (menus, tables, persons) + **CSV export**. |
| Out of scope (YAGNI) | Signup deadline, max capacity, e-mails, user editing, payment, multi-occasion admin UI. |

## 3. Data model

A single table, MariaDB 10.3 compatible, added to `docker/db/init/01-schema.sql` (dev)
**and** provided as a prod migration. Column naming follows the existing
`contact_messages` table (`first_name` / `last_name`).

```sql
CREATE TABLE `signups` (
  `id`         int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `occasion`   varchar(64)  NOT NULL DEFAULT 'anniversary-supper', -- reusable discriminator
  `first_name` varchar(255) NOT NULL,   -- contact: first name
  `last_name`  varchar(255) NOT NULL,   -- contact: last name
  `address`    varchar(255) NOT NULL,   -- contact: address
  `phone`      varchar(64)  NOT NULL,   -- contact: phone (for follow-up questions)
  `table_name` varchar(255) NOT NULL,   -- table / family name (grouping)
  `menus`      text NOT NULL,           -- JSON list, e.g. ["meat","meat","child"]
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_signups_occasion` (`occasion`),
  KEY `idx_signups_table` (`occasion`,`table_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Notes:
- **Number of persons in a signup** = length of the `menus` list.
- `menus` contains only values from `{meat, child, vegetarian}` (validated server-side
  before write). Stored as JSON text; aggregates are computed **in PHP** (low volume), so
  no SQL JSON functions are needed — portable to MariaDB 10.3.
- Store raw data and escape **at output time** (same rule as `contact.php`).
- English stored values follow the existing convention (`responses.answer` uses
  `participate` / `notparticipate`).

### Occasions constant (PHP)

A small associative array (in the repository or a light config file) mapping `occasion`
→ labels. The **values here are the French UI strings** shown on screen; the **key is an
English identifier**:

```php
const OCCASIONS = [
    'anniversary-supper' => [
        'title'       => 'Souper – 25 ans des Canetons',   // UI text (French)
        'subtitle'    => 'Sortie du nouveau costume',       // UI text (French)
        'description' => "Un grand merci à nos amis et à nos familles : ...",
    ],
];
const ACTIVE_OCCASION = 'anniversary-supper';
```

Menu value → French label mapping (used everywhere the menu is displayed). `meat` is the
default/standard choice; the form shows it as "Viande (standard)", while compact contexts
(admin counts, chips) use the short "Viande":

```php
const MENU_LABELS = ['meat' => 'Viande', 'child' => 'Enfant', 'vegetarian' => 'Végétarien'];
const MENU_DEFAULT = 'meat'; // pre-selected in the form, labelled "Viande (standard)"
```

## 4. Components

### 4.1 Public form — `code/signup.php`
- No login. Renders the active occasion's title/description (French UI text).
- **Contact block** (once): Nom, Prénom, Adresse, Téléphone (French labels;
  `name` attributes and posted keys are English: `first_name`, `last_name`, `address`,
  `phone`).
- **Table**: `<input list="tables">` + `<datalist id="tables">` filled server-side via
  `SELECT DISTINCT table_name FROM signups WHERE occasion = ? ORDER BY table_name`.
  A hint below the field tells the user that existing tables are suggested as they type.
- **Guests**: dynamic "+ Ajouter une personne" rows, each row = one menu `<select>`.
  Options: value=`meat` label **"Viande (standard)"** (default-selected), value=`child`
  label "Enfant", value=`vegetarian` label "Végétarien". Minimum 1 row. Row removal
  supported. A live tally (persons + count per menu type) updates as rows change.
  Vanilla JS (buildless), a single `assets/js/signup.js` file.
- Submit via `fetch` POST → `api/signups.php`, then redirect to `signup_thanks.php`
  (same pattern as the `contact.php` handler).
- Dedicated CSS: `assets/css/signup.css`.

### 4.2 Thank-you page — `code/signup_thanks.php`
- Static "Merci pour votre inscription !" page (French UI) **without** any e-mail promise
  (do not reuse `confirmation.php`, which announces an e-mail).

### 4.3 API — `code/api/signups.php`
- `POST` (public): reads fields, validates, writes **one** row.
  - Validation: `first_name`, `last_name`, `address`, `phone`, `table_name` non-empty;
    `menus` = array of 1..N values ∈ `{meat, child, vegetarian}` (N bounded, e.g. ≤ 30,
    to prevent abuse); `occasion` set server-side (not driven by the client beyond an
    allowed value).
  - Prepared `mysqli` statement, `menus` JSON-encoded. JSON responses `{ok:true}` /
    errors `400`/`405` like the existing endpoints. Error messages returned to the client
    are French (UI-facing).
- `GET` (guard `Auth::requireCanViewSummary`): returns aggregated data + the admin list
  (JSON).
- `GET ?format=csv` (guard `view_summary`): returns CSV (`Content-Type: text/csv`,
  `Content-Disposition: attachment`).

### 4.4 Repository — `code/src/repositories/SignupRepository.php`
- Wired via `require` in `bootstrap.php` (no autoloader).
- Methods:
  - `create(array $data): void` — insert (menus → JSON).
  - `distinctTables(string $occasion): array` — for the `<datalist>`.
  - `allForOccasion(string $occasion): array` — decoded signups (menus → array).
  - `stats(string $occasion): array` — aggregates computed in PHP (see §5).

### 4.5 Admin — `code/signups_admin.php`
- Page guard: `Auth::requireLoginPage(...)` + `Auth::canViewSummary()` (like
  `inscriptions_admin.php`).
- Displays (via `assets/js/signups_admin.js` consuming the `GET` API; French UI):
  - Summary tiles: **Total persons**, **Total tables**, then one **menu-total tile per
    type** (Viande / Enfant / Végétarien). The three menu tiles are **color-coded with the
    same per-menu colors** used for the dots in the table column headers (meat / child /
    vegetarian), so the palette is consistent across tiles and table.
  - Signup list as a **simple table with one column per menu** holding the **count**
    (columns: `Table / Contact` | `Tél.` | `Viande` | `Enfant` | `Végét.` | `Total`).
    Numbers are right-aligned (`tabular-nums`); zero is shown as a muted "–". No chips
    per guest — order of guests does not matter; admins only need which menus go to which
    table.
  - Rows are **grouped by table**: a highlighted group row per table with its per-menu
    counts + total, then one row per signup (contact name, address, phone + counts). A
    `<tfoot>` "Total général" row repeats the grand totals.
  - **CSV export** button (link to `api/signups.php?format=csv`); the CSV mirrors these
    columns (one row per signup, plus counts).
- Dedicated CSS: `assets/css/signups_admin.css`.

### 4.6 Home-page link — `code/index.php`
- Add a banner/button "Souper 25 ans – Inscrivez-vous" (French UI) pointing to
  `signup.php`. No entry in `partials/navigation.php`.

### 4.7 Site-wide popup (once per browser)
- Shared HTML + JS snippet, included globally (via `partials/footer.php` so it appears on
  every page).
- On load: if `localStorage.getItem('canetons_supper_popup_v1')` is absent, show the
  modal (occasion title + "S'inscrire" button → `signup.php` + close). On close **or** on
  click, set the flag → never shown again on this browser.
- Accessible: closable via keyboard (Escape), basic focus trap, `aria-modal`.
- Files: `assets/js/supper-popup.js` + styles (in `main.css` or a small
  `supper-popup.css`).

## 5. Statistics computation (PHP)

From `allForOccasion(occasion)` (each signup has `menus` = array):

- `menuTotals`: count per type over all flattened `menus`.
- `totalPersons` = sum of `menus` lengths = sum of `menuTotals`.
- `tables`: group by `table_name` → for each table, `personCount` (sum of menus of that
  table's signups) and per-menu breakdown.
- `totalTables` = number of distinct tables.

## 6. Data flow

**Signup (public)**
```
signup.php (form) --fetch POST--> api/signups.php
  -> validation -> SignupRepository::create (menus JSON)
  -> {ok:true} -> redirect signup_thanks.php
```

**Review (admin)**
```
signups_admin.php --fetch GET--> api/signups.php (guard view_summary)
  -> SignupRepository::allForOccasion + stats -> JSON -> render tables
Export: link api/signups.php?format=csv -> CSV downloaded
```

**Popup**: global footer -> supper-popup.js -> localStorage (1×/browser).

## 7. Error handling

- Invalid API `POST` → `400` + `{error:...}` (French message); wrong method → `405`.
- Front-end: on `fetch` failure, `alert(...)` + keep entered data (same behavior as
  `contact.php`).
- Unauthorized admin → `403` (page) / `view_summary` guard (API).
- DB writes via prepared statements; `menus` always re-validated server-side before insert.

## 8. Testing / verification

- `npm run check` (php -l, phpcs PSR-12, eslint, stylelint, prettier, secret-guard) green.
- Manual (Docker):
  1. Submit a signup with 3 guests (mixed menus) → row created, `menus` JSON correct,
     redirect to thank-you page.
  2. Second signup with the same `table_name` → `<datalist>` suggests the table; admin
     groups the two.
  3. Admin: menu/table/person totals consistent with entered data; CSV opens in Excel.
  4. Popup: appears once, does not reappear after close (localStorage); tested on ≥ 2 pages.
  5. Validation: submission with no guest / invalid menu → `400`.

## 9. Files touched / created

**Created**
- `code/signup.php`
- `code/signup_thanks.php`
- `code/signups_admin.php`
- `code/api/signups.php`
- `code/src/repositories/SignupRepository.php`
- `code/assets/js/signup.js`
- `code/assets/js/signups_admin.js`
- `code/assets/js/supper-popup.js`
- `code/assets/css/signup.css`
- `code/assets/css/signups_admin.css`
- prod SQL migration for the `signups` table

**Modified**
- `docker/db/init/01-schema.sql` (`signups` table)
- `code/src/bootstrap.php` (require the new repository)
- `code/index.php` (link banner)
- `code/partials/footer.php` (include the popup snippet)
- `code/assets/css/main.css` (popup styles, if not externalized)

## 10. Out of scope (recap)

Signup deadline/closing, maximum capacity, e-mails (to registrant or admin),
user account/editing, payment, multi-occasion admin UI (reuse happens only via `occasion`
+ PHP constant).
