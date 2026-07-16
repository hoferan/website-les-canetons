# Public Signup Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public, login-free signup form for the one-off "Souper — 25 ans des Canetons", where one contact registers several guests (one menu per person, grouped by table), plus an admin totals view and a once-per-browser welcome popup.

**Architecture:** Buildless PHP 8.1 + MariaDB 10.3, following existing patterns (`contact.php` for public forms, `inscriptions_admin.php` for admin pages, repositories wired via `require` in `bootstrap.php`). A single `signups` table stores each signup with its guests' menus as a JSON list; a reusable `occasion` discriminator column plus PHP class constants avoid a separate events table. All aggregation happens in PHP.

**Tech Stack:** PHP 8.1 (mysqli), vanilla JS + CSS (no build step), MariaDB 10.3, Docker for local dev and Dockerized PHP tooling.

## Global Constraints

- **Buildless:** no framework, no bundler, no runtime dependencies; edit JS/CSS in place. Copied verbatim from the spec/CLAUDE.md.
- **Match prod versions:** PHP 8.1, MariaDB 10.3.
- **`code/` is the exact FTP payload** — never put dev-only files (tests, tooling, migrations) inside `code/`. Tooling/migrations live at the repo root.
- **Language rule:** everything (code, DB columns, enum/stored values, identifiers, slugs, file names) is **English**; **French only for user-visible UI text** (labels, page copy, occasion title/description, error messages shown to the user).
- **Naming:** a **signup** to an **occasion**; discriminator column is `occasion` (never "event"). Menu values are English `meat` / `child` / `vegetarian`, displayed as `Viande` / `Enfant` / `Végétarien`; `meat` is the default, shown as "Viande (standard)".
- **Security:** store raw input, escape at output time (`htmlspecialchars` in PHP, `textContent` in JS); all DB access via prepared statements.
- **Verify before pushing:** `npm run check` must pass (php -l + phpcs PSR-12 + eslint + stylelint + prettier + secret-guard).

## Testing approach (read before starting)

The app stays buildless (no runtime deps), but tests use the **standard PHP test
framework, PHPUnit**, added as a **dev-only** Composer dependency alongside the existing
PHP_CodeSniffer — consistent with how this repo already does dev tooling. Verification uses:
- **`npm run check`** — lint + test gate (php -l, phpcs PSR-12, PHPUnit, eslint, stylelint, prettier, secret-guard), all Dockerized.
- **`npm run test:php`** (added in Task 2) — runs **PHPUnit** inside `php:8.1-cli` (verified to include `mbstring`/`dom`/`xml`/`xmlwriter`/`tokenizer`) via the existing `tools/php-in-docker.mjs` wrapper. Unit tests cover the **pure** logic (menu validation + stats aggregation); this is where genuine TDD (red → green) applies.
- **Manual functional checks** — for DB/HTTP/UI code: `curl` against `http://localhost:8090` with expected JSON, Adminer at `http://localhost:8091`, and the browser. These steps give exact commands and expected output.

Prereq: run `npm run php:install` once (installs `vendor/`, incl. PHPUnit). Docker must be
running for all PHP checks. Local site: `docker compose up -d --build` → http://localhost:8090.

## File Structure

**Created (dev-only, repo root — NOT deployed):**
- `sql/migrations/001_create_signups.sql` — numbered migration (run manually on prod, in order).
- `sql/migrations/README.md` — how to apply migrations on prod.
- `phpunit.xml.dist` — PHPUnit config (bootstrap + testsuite).
- `tests/bootstrap.php` — requires the class under test (repo has no autoloader).
- `tests/SignupRepositoryTest.php` — PHPUnit unit tests for the pure logic.
- `tools/phpunit.mjs` — Node runner that executes PHPUnit in Docker.

**Created (in `code/` — deployed):**
- `code/src/repositories/SignupRepository.php` — constants (occasion/menu), pure logic (`normalizeMenus`, `computeStats`), DB methods (`create`, `distinctTables`, `allForOccasion`).
- `code/api/signups.php` — JSON API: `POST` (public create), `GET` (admin JSON), `GET ?format=csv` (admin CSV).
- `code/signup.php` — public form page.
- `code/signup_thanks.php` — thank-you page.
- `code/signups_admin.php` — admin totals page.
- `code/assets/js/signup.js` — dynamic guest rows + live tally + submit.
- `code/assets/js/signups_admin.js` — renders tiles + grouped table.
- `code/assets/js/supper-popup.js` — once-per-browser popup logic.
- `code/assets/css/signup.css`, `code/assets/css/signups_admin.css` — page styles.

**Modified:**
- `docker-compose.yml` — mount the migration into the DB init dir so fresh dev volumes get it.
- `composer.json` — add `phpunit/phpunit` to `require-dev`.
- `.gitignore` — ignore the PHPUnit cache.
- `code/src/bootstrap.php` — `require` the new repository.
- `code/index.php` + `code/assets/css/accueil.css` — home-page call-to-action.
- `code/partials/footer.php` — popup markup + script include (site-wide).
- `code/assets/css/main.css` — shared `.btn-primary` + popup styles.
- `package.json` — add `test:php` script; include it in `check`.

**Not** modified: `docker/db/init/01-schema.sql` stays the dev baseline; new schema changes
live only in `sql/migrations/` (single source of truth), mounted into the DB init dir for dev.

---

### Task 1: Database migration (`signups` table)

**Files:**
- Create: `sql/migrations/001_create_signups.sql`
- Create: `sql/migrations/README.md`
- Modify: `docker-compose.yml` (mount the migration into the DB init dir for dev)

**Interfaces:**
- Consumes: nothing.
- Produces: table `signups(id, occasion, first_name, last_name, address, phone, table_name, menus, created_at)` used by Task 2's repository. `occasion` has **no DB default** — it is always set by the application.

- [ ] **Step 1: Create the numbered migration**

Create `sql/migrations/001_create_signups.sql`:

```sql
-- 001 — create `signups` table for the public occasion signup form.
-- `occasion` has no default: the application always sets it explicitly.

CREATE TABLE `signups` (
  `id`         int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `occasion`   varchar(64)  NOT NULL,
  `first_name` varchar(255) NOT NULL,
  `last_name`  varchar(255) NOT NULL,
  `address`    varchar(255) NOT NULL,
  `phone`      varchar(64)  NOT NULL,
  `table_name` varchar(255) NOT NULL,
  `menus`      text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_signups_occasion` (`occasion`),
  KEY `idx_signups_table` (`occasion`,`table_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Document the migration workflow**

Create `sql/migrations/README.md`:

```markdown
# Database migrations

Incremental schema changes, applied **manually on production** in ascending numeric
order. `docker/db/init/01-schema.sql` is the dev baseline (existing tables); every
change *after* that baseline lives here as a numbered file — this directory is the
single source of truth for those changes.

## Naming

`NNN_short_description.sql` — zero-padded, monotonically increasing (`001_…`, `002_…`).

## Applying on production (manual)

1. Open the prod DB (Adminer / phpMyAdmin).
2. Run each not-yet-applied migration **in ascending order**, once each.
3. Record which files you ran (they are not idempotent — do not re-run).

## Local dev

Fresh dev volumes apply these automatically: each migration is mounted into the
MariaDB init dir in `docker-compose.yml` (after `01-schema.sql` / `02-seed.sql`).
When you add a new migration, add a matching mount line there too. To re-bootstrap:
`docker compose down -v && docker compose up -d --build`.
```

- [ ] **Step 3: Mount the migration for dev**

In `docker-compose.yml`, under the `db` service `volumes:`, add the migration after the
existing init mount so it runs after the baseline + seed:

```yaml
    volumes:
      - db_data:/var/lib/mysql
      - ./docker/db/init:/docker-entrypoint-initdb.d:ro
      - ./sql/migrations/001_create_signups.sql:/docker-entrypoint-initdb.d/03-001_create_signups.sql:ro
```

- [ ] **Step 4: Recreate the dev DB and verify the table exists**

Init scripts only run on an empty volume, so recreate it:

```bash
docker compose down -v
docker compose up -d --build
```

Wait ~15s for the DB healthcheck, then verify (note: `occasion` has no Default):

```bash
docker compose exec db mysql -ucanetons -pcanetons lescanetons -e "DESCRIBE signups;"
```

Expected: rows for `id, occasion, first_name, last_name, address, phone, table_name, menus, created_at`; the `occasion` row shows an empty `Default` (NULL/none).

- [ ] **Step 5: Commit**

```bash
git add sql/migrations/001_create_signups.sql sql/migrations/README.md docker-compose.yml
git commit -m "feat(db): add signups table via numbered migration"
```

---

### Task 2: SignupRepository (constants + pure logic + DB methods)

**Files:**
- Create: `code/src/repositories/SignupRepository.php`
- Modify: `code/src/bootstrap.php` (add `require`)
- Modify: `composer.json` (add `phpunit/phpunit` to `require-dev`)
- Create: `phpunit.xml.dist`, `tests/bootstrap.php`, `tests/SignupRepositoryTest.php`
- Create: `tools/phpunit.mjs`
- Modify: `.gitignore` (PHPUnit cache), `package.json` (add `test:php`, include in `check`)

**Interfaces:**
- Consumes: `signups` table (Task 1); `mysqli` from `Database::get()`.
- Produces (used by Tasks 3–5):
  - `SignupRepository::MENU_VALUES` = `['meat','child','vegetarian']`
  - `SignupRepository::MENU_LABELS` = `['meat'=>'Viande','child'=>'Enfant','vegetarian'=>'Végétarien']`
  - `SignupRepository::MENU_DEFAULT` = `'meat'`, `MAX_GUESTS` = `30`
  - `SignupRepository::ACTIVE_OCCASION` = `'anniversary-supper'`
  - `SignupRepository::OCCASIONS[<key>]` = `['title'=>string,'subtitle'=>string,'description'=>string]`
  - `static normalizeMenus(mixed $raw): ?array` — clean `string[]` or `null`
  - `static computeStats(array $signups): array` — `['totalPersons'=>int,'totalTables'=>int,'menuTotals'=>['meat'=>int,'child'=>int,'vegetarian'=>int],'tables'=>[['name'=>string,'personCount'=>int,'menuCounts'=>[...],'signups'=>[['first_name'=>...,'last_name'=>...,'address'=>...,'phone'=>...,'personCount'=>int,'menuCounts'=>[...]]]]]]`
  - `create(array $data): void` — keys `occasion, first_name, last_name, address, phone, table_name, menus(string[])`
  - `distinctTables(string $occasion): string[]`
  - `allForOccasion(string $occasion): array` — rows with `menus` decoded to `string[]`

- [ ] **Step 1: Add PHPUnit as a dev dependency**

In `composer.json`, add `phpunit/phpunit` to `require-dev` (PHPUnit 10 is the last line supporting PHP 8.1):

```json
    "require-dev": {
        "phpunit/phpunit": "^10.5",
        "squizlabs/php_codesniffer": "^3.10"
    },
```

Install it (Dockerized Composer):

```bash
npm run php:install
```

Expected: `vendor/bin/phpunit` now exists.

- [ ] **Step 2: Configure PHPUnit**

Create `phpunit.xml.dist` at the repo root:

```xml
<?xml version="1.0"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="tests/bootstrap.php"
         colors="true"
         cacheDirectory=".phpunit.cache">
  <testsuites>
    <testsuite name="unit">
      <directory>tests</directory>
    </testsuite>
  </testsuites>
</phpunit>
```

Create `tests/bootstrap.php` (the app has no autoloader — classes are wired via explicit
`require`, so the test bootstrap requires the class under test directly):

```php
<?php

require_once __DIR__ . '/../code/src/repositories/SignupRepository.php';
```

Add the PHPUnit cache to `.gitignore` (under the "linter / tool caches" section):

```gitignore
.phpcs.cache
.phpunit.cache/
.phpunit.result.cache
```

- [ ] **Step 3: Write the failing test**

Create `tests/SignupRepositoryTest.php`:

```php
<?php

use PHPUnit\Framework\TestCase;

final class SignupRepositoryTest extends TestCase
{
    public function testNormalizeMenusAcceptsValidValues(): void
    {
        $this->assertSame(['meat', 'child'], SignupRepository::normalizeMenus(['meat', 'child']));
    }

    public function testNormalizeMenusRejectsUnknownValue(): void
    {
        $this->assertNull(SignupRepository::normalizeMenus(['meat', 'pizza']));
    }

    public function testNormalizeMenusRejectsEmpty(): void
    {
        $this->assertNull(SignupRepository::normalizeMenus([]));
    }

    public function testNormalizeMenusRejectsNonArray(): void
    {
        $this->assertNull(SignupRepository::normalizeMenus('meat'));
    }

    public function testNormalizeMenusRejectsTooMany(): void
    {
        $this->assertNull(SignupRepository::normalizeMenus(array_fill(0, 31, 'meat')));
    }

    public function testComputeStatsTotals(): void
    {
        $stats = SignupRepository::computeStats($this->sampleSignups());
        $this->assertSame(11, $stats['totalPersons']);
        $this->assertSame(3, $stats['totalTables']);
        $this->assertSame(['meat' => 6, 'child' => 2, 'vegetarian' => 3], $stats['menuTotals']);
    }

    public function testComputeStatsGroupsByTable(): void
    {
        $stats = SignupRepository::computeStats($this->sampleSignups());
        $first = $stats['tables'][0];
        $this->assertSame('Famille Rossier', $first['name']);
        $this->assertSame(6, $first['personCount']);
        $this->assertSame(['meat' => 3, 'child' => 2, 'vegetarian' => 1], $first['menuCounts']);
        $this->assertCount(2, $first['signups']);
        $this->assertSame(
            ['meat' => 2, 'child' => 1, 'vegetarian' => 1],
            $first['signups'][0]['menuCounts']
        );
    }

    /** @return array<int,array> */
    private function sampleSignups(): array
    {
        return [
            ['first_name' => 'Marie', 'last_name' => 'Rossier', 'address' => 'A', 'phone' => 'p',
                'table_name' => 'Famille Rossier', 'menus' => ['meat', 'meat', 'child', 'vegetarian']],
            ['first_name' => 'Luc', 'last_name' => 'Rossier', 'address' => 'A', 'phone' => 'p',
                'table_name' => 'Famille Rossier', 'menus' => ['meat', 'child']],
            ['first_name' => 'Jean', 'last_name' => 'Python', 'address' => 'B', 'phone' => 'p',
                'table_name' => 'Les voisins', 'menus' => ['meat', 'meat']],
            ['first_name' => 'Sophie', 'last_name' => 'Aebischer', 'address' => 'C', 'phone' => 'p',
                'table_name' => 'Copains musique', 'menus' => ['meat', 'vegetarian', 'vegetarian']],
        ];
    }
}
```

- [ ] **Step 4: Add the runner and wire `test:php` into `check`**

Create `tools/phpunit.mjs`:

```javascript
// Runs PHPUnit inside php:8.1-cli (Docker), matching prod PHP. Requires
// `npm run php:install` first (installs vendor/, incl. PHPUnit).
import { runInPhp } from './php-in-docker.mjs';

runInPhp('php vendor/bin/phpunit');
```

In `package.json`, add a `test:php` script and insert it into `check` right after `lint:php`:

```json
    "lint:php": "node tools/php-lint.mjs",
    "test:php": "node tools/phpunit.mjs",
    "lint:js": "eslint code/assets/js",
    "lint:css": "stylelint \"code/assets/css/**/*.css\"",
    "format:check": "prettier --check \"code/assets/**/*.{js,css}\"",
    "guard": "node tools/secret-guard.mjs",
    "check": "npm run lint:php && npm run test:php && npm run lint:js && npm run lint:css && npm run format:check && npm run guard",
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm run test:php`
Expected: FAIL — PHPUnit errors that class `SignupRepository` is not found (not created yet), non-zero exit.

- [ ] **Step 6: Write the repository (minimal to pass)**

Create `code/src/repositories/SignupRepository.php`:

```php
<?php

final class SignupRepository
{
    public const MENU_VALUES = ['meat', 'child', 'vegetarian'];

    public const MENU_LABELS = [
        'meat'       => 'Viande',
        'child'      => 'Enfant',
        'vegetarian' => 'Végétarien',
    ];

    public const MENU_DEFAULT = 'meat';

    public const MAX_GUESTS = 30;

    public const ACTIVE_OCCASION = 'anniversary-supper';

    public const OCCASIONS = [
        'anniversary-supper' => [
            'title'       => 'Souper — 25 ans des Canetons',
            'subtitle'    => 'Sortie du nouveau costume',
            'description' => 'Un grand merci à nos amis et à nos familles ! Pour fêter '
                . 'nos 25 ans et dévoiler notre nouveau costume, nous vous invitons à '
                . 'notre souper. Inscrivez-vous ci-dessous.',
        ],
    ];

    public function __construct(private mysqli $db)
    {
    }

    /**
     * Validate a raw menus value from client input.
     *
     * @param mixed $raw
     * @return string[]|null clean list of menu values, or null if invalid
     */
    public static function normalizeMenus($raw): ?array
    {
        if (!is_array($raw)) {
            return null;
        }
        $menus = [];
        foreach ($raw as $item) {
            if (!is_string($item) || !in_array($item, self::MENU_VALUES, true)) {
                return null;
            }
            $menus[] = $item;
        }
        $count = count($menus);
        if ($count < 1 || $count > self::MAX_GUESTS) {
            return null;
        }
        return $menus;
    }

    /**
     * Aggregate decoded signups into totals + per-table grouping.
     *
     * @param array<int,array> $signups each with table_name + menus(string[]) + contact
     * @return array
     */
    public static function computeStats(array $signups): array
    {
        $menuTotals = self::zeroCounts();
        $totalPersons = 0;
        $index = [];
        $tables = [];

        foreach ($signups as $s) {
            $counts = self::zeroCounts();
            foreach ($s['menus'] as $m) {
                $counts[$m]++;
                $menuTotals[$m]++;
                $totalPersons++;
            }
            $personCount = count($s['menus']);
            $name = $s['table_name'];
            if (!isset($index[$name])) {
                $index[$name] = count($tables);
                $tables[] = [
                    'name'        => $name,
                    'personCount' => 0,
                    'menuCounts'  => self::zeroCounts(),
                    'signups'     => [],
                ];
            }
            $i = $index[$name];
            $tables[$i]['personCount'] += $personCount;
            foreach (self::MENU_VALUES as $v) {
                $tables[$i]['menuCounts'][$v] += $counts[$v];
            }
            $tables[$i]['signups'][] = [
                'first_name'  => $s['first_name'],
                'last_name'   => $s['last_name'],
                'address'     => $s['address'],
                'phone'       => $s['phone'],
                'personCount' => $personCount,
                'menuCounts'  => $counts,
            ];
        }

        return [
            'totalPersons' => $totalPersons,
            'totalTables'  => count($tables),
            'menuTotals'   => $menuTotals,
            'tables'       => $tables,
        ];
    }

    /** @return array{meat:int,child:int,vegetarian:int} */
    private static function zeroCounts(): array
    {
        return ['meat' => 0, 'child' => 0, 'vegetarian' => 0];
    }

    /** Insert one signup. $data['menus'] is a string[]. */
    public function create(array $data): void
    {
        $sql = 'INSERT INTO signups
                (occasion, first_name, last_name, address, phone, table_name, menus)
                VALUES (?, ?, ?, ?, ?, ?, ?)';
        $stmt = $this->db->prepare($sql);
        $menusJson = json_encode(array_values($data['menus']));
        $stmt->bind_param(
            'sssssss',
            $data['occasion'],
            $data['first_name'],
            $data['last_name'],
            $data['address'],
            $data['phone'],
            $data['table_name'],
            $menusJson
        );
        $stmt->execute();
        $stmt->close();
    }

    /** @return string[] distinct table names for the datalist. */
    public function distinctTables(string $occasion): array
    {
        $stmt = $this->db->prepare(
            'SELECT DISTINCT table_name FROM signups WHERE occasion = ? ORDER BY table_name'
        );
        $stmt->bind_param('s', $occasion);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return array_map(static fn(array $r): string => $r['table_name'], $rows);
    }

    /**
     * All signups for an occasion, menus decoded, ordered by table then id.
     *
     * @return array<int,array>
     */
    public function allForOccasion(string $occasion): array
    {
        $stmt = $this->db->prepare(
            'SELECT first_name, last_name, address, phone, table_name, menus
             FROM signups WHERE occasion = ? ORDER BY table_name, id'
        );
        $stmt->bind_param('s', $occasion);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return array_map(static function (array $r): array {
            $r['menus'] = json_decode($r['menus'], true) ?: [];
            return $r;
        }, $rows);
    }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test:php`
Expected: PHPUnit prints `OK (7 tests, ...)`, exit 0.

- [ ] **Step 8: Wire the repository into bootstrap**

In `code/src/bootstrap.php`, add after the `ResponseRepository` require line:

```php
require __DIR__ . '/repositories/ResponseRepository.php';
require __DIR__ . '/repositories/SignupRepository.php';
```

- [ ] **Step 9: Lint and commit**

Run: `npm run lint:php`
Expected: no errors.

```bash
git add code/src/repositories/SignupRepository.php code/src/bootstrap.php composer.json composer.lock phpunit.xml.dist tests/ tools/phpunit.mjs .gitignore package.json
git commit -m "feat(signups): add SignupRepository with PHPUnit tests"
```

---

### Task 3: API endpoint (`api/signups.php`)

**Files:**
- Create: `code/api/signups.php`

**Interfaces:**
- Consumes: `SignupRepository` (Task 2), `Database::get()`, `Auth::requireCanViewSummary()`.
- Produces (used by Tasks 4–5):
  - `POST` JSON body `{first_name,last_name,address,phone,table_name,menus:string[]}` → `201 {"ok":true}` or `400 {"error":...}`.
  - `GET` (admin) → JSON = `computeStats(...)` plus `occasion` labels.
  - `GET ?format=csv` (admin) → CSV download.

- [ ] **Step 1: Write the endpoint**

Create `code/api/signups.php`:

```php
<?php

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];
$occasion = SignupRepository::ACTIVE_OCCASION;
$repo = new SignupRepository(Database::get());

if ($method === 'POST') {
    // Public: one contact registers guests. occasion is fixed server-side.
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $firstName = trim((string) ($data['first_name'] ?? ''));
    $lastName  = trim((string) ($data['last_name'] ?? ''));
    $address   = trim((string) ($data['address'] ?? ''));
    $phone     = trim((string) ($data['phone'] ?? ''));
    $tableName = trim((string) ($data['table_name'] ?? ''));
    $menus     = SignupRepository::normalizeMenus($data['menus'] ?? null);

    if (
        $firstName === '' || $lastName === '' || $address === ''
        || $phone === '' || $tableName === '' || $menus === null
    ) {
        http_response_code(400);
        echo json_encode(['error' => 'Formulaire invalide']);
        exit;
    }

    $repo->create([
        'occasion'   => $occasion,
        'first_name' => $firstName,
        'last_name'  => $lastName,
        'address'    => $address,
        'phone'      => $phone,
        'table_name' => $tableName,
        'menus'      => $menus,
    ]);
    http_response_code(201);
    echo json_encode(['ok' => true]);
    exit;
}

if ($method === 'GET') {
    // Admin only (Team Direction): totals + list, or CSV export.
    Auth::requireCanViewSummary();
    $signups = $repo->allForOccasion($occasion);
    if ((string) ($_GET['format'] ?? '') === 'csv') {
        signups_export_csv($signups);
        exit;
    }
    $stats = SignupRepository::computeStats($signups);
    $stats['occasion'] = SignupRepository::OCCASIONS[$occasion];
    echo json_encode($stats);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Méthode non autorisée']);

/**
 * Stream signups as a semicolon-separated CSV (Excel-FR friendly), one row per
 * signup with per-menu counts. Sends its own headers.
 *
 * @param array<int,array> $signups
 */
function signups_export_csv(array $signups): void
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="inscriptions-souper.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM so Excel shows accents
    fputcsv($out, [
        'Table', 'Nom', 'Prénom', 'Adresse', 'Téléphone',
        'Viande', 'Enfant', 'Végétarien', 'Total',
    ], ';');
    foreach ($signups as $s) {
        $counts = ['meat' => 0, 'child' => 0, 'vegetarian' => 0];
        foreach ($s['menus'] as $m) {
            $counts[$m]++;
        }
        fputcsv($out, [
            $s['table_name'], $s['last_name'], $s['first_name'],
            $s['address'], $s['phone'],
            $counts['meat'], $counts['child'], $counts['vegetarian'],
            count($s['menus']),
        ], ';');
    }
    fclose($out);
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint:php`
Expected: no errors.

- [ ] **Step 3: Verify a valid POST (creates a row)**

Ensure the stack is up (`docker compose up -d`), then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8090/api/signups.php \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Marie","last_name":"Rossier","address":"Rue de Lausanne 12","phone":"079 123 45 67","table_name":"Famille Rossier","menus":["meat","meat","child","vegetarian"]}'
```

Expected: `201`. Confirm the row in Adminer (http://localhost:8091, server `db`, user `canetons`, pw `canetons`, db `lescanetons`, table `signups`) — `menus` should read `["meat","meat","child","vegetarian"]`.

- [ ] **Step 4: Verify an invalid POST is rejected**

```bash
curl -s -w "\n%{http_code}\n" -X POST http://localhost:8090/api/signups.php \
  -H "Content-Type: application/json" \
  -d '{"first_name":"","last_name":"","address":"","phone":"","table_name":"","menus":[]}'
```

Expected: `{"error":"Formulaire invalide"}` then `400`.

- [ ] **Step 5: Verify GET requires admin**

```bash
curl -s -w "\n%{http_code}\n" http://localhost:8090/api/signups.php
```

Expected: `{"error":"Non authentifié"}` then `401` (not logged in).

- [ ] **Step 6: Commit**

```bash
git add code/api/signups.php
git commit -m "feat(signups): add JSON+CSV API endpoint"
```

---

### Task 4: Public signup form + thank-you page

**Files:**
- Create: `code/signup.php`
- Create: `code/signup_thanks.php`
- Create: `code/assets/js/signup.js`
- Create: `code/assets/css/signup.css`
- Modify: `code/assets/css/main.css` (add shared `.btn-primary`)

**Interfaces:**
- Consumes: `SignupRepository::OCCASIONS`, `::ACTIVE_OCCASION`, `distinctTables()` (Task 2); `POST api/signups.php` (Task 3).
- Produces: `signup.php` (public form), `signup_thanks.php` (redirect target). CSS class `.btn-primary` in `main.css` reused by Tasks 6–7.

- [ ] **Step 1: Add shared button style to `main.css`**

Append to `code/assets/css/main.css`:

```css
/* -- SHARED BUTTON (signup, popup, home CTA) ------------------ */

.btn-primary {
  display: inline-block;
  background: #e7a11c;
  color: #241a05;
  border: none;
  border-radius: 8px;
  padding: 13px 26px;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
  text-decoration: none;
}

.btn-primary:hover {
  background: #b9760d;
  color: #fff;
}
```

- [ ] **Step 2: Create the form page**

Create `code/signup.php`:

```php
<?php require 'src/bootstrap.php'; ?>
<?php
$occasion = SignupRepository::OCCASIONS[SignupRepository::ACTIVE_OCCASION];
$repo = new SignupRepository(Database::get());
$tables = $repo->distinctTables(SignupRepository::ACTIVE_OCCASION);
$pageTitle = $occasion['title'];
$pageCss = 'signup.css';
require 'partials/head.php';
?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>

<section class="signup-section">
  <h1 class="signup-title"><?= htmlspecialchars($occasion['title']) ?></h1>
  <p class="signup-subtitle"><?= htmlspecialchars($occasion['subtitle']) ?></p>
  <p class="signup-desc"><?= htmlspecialchars($occasion['description']) ?></p>

  <form id="signup-form" novalidate>
    <fieldset>
      <legend>Vos coordonnées</legend>
      <div class="form-grid">
        <div class="form-group">
          <label for="first_name" class="required">Prénom</label>
          <input type="text" id="first_name" name="first_name" required />
        </div>
        <div class="form-group">
          <label for="last_name" class="required">Nom</label>
          <input type="text" id="last_name" name="last_name" required />
        </div>
        <div class="form-group">
          <label for="address" class="required">Adresse</label>
          <input type="text" id="address" name="address" required />
        </div>
        <div class="form-group">
          <label for="phone" class="required">Téléphone</label>
          <input type="tel" id="phone" name="phone" required />
        </div>
      </div>
      <div class="form-group">
        <label for="table_name" class="required">Table (nom de famille ou nom de table)</label>
        <input type="text" id="table_name" name="table_name" list="tables" required />
        <datalist id="tables">
          <?php foreach ($tables as $t) : ?>
            <option value="<?= htmlspecialchars($t) ?>"></option>
          <?php endforeach; ?>
        </datalist>
        <small class="hint">
          Commencez à taper : les tables déjà créées vous seront proposées.
          Choisissez la même table pour être placés ensemble.
        </small>
      </div>
    </fieldset>

    <fieldset>
      <legend>Convives &amp; menus</legend>
      <div id="guests"></div>
      <button type="button" id="add-guest" class="add-guest">＋ Ajouter une personne</button>
      <p class="tally" id="tally"></p>
    </fieldset>

    <div class="form-actions">
      <button type="submit" class="btn-primary">Envoyer l'inscription</button>
    </div>
  </form>
</section>

<?php require 'partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/js/signup.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create the form JavaScript**

Create `code/assets/js/signup.js`:

```javascript
(function () {
  var MENUS = [
    ["meat", "Viande (standard)"],
    ["child", "Enfant"],
    ["vegetarian", "Végétarien"]
  ];
  var guests = document.getElementById("guests");
  var tally = document.getElementById("tally");
  var form = document.getElementById("signup-form");

  function makeRow() {
    var row = document.createElement("div");
    row.className = "guest-row";

    var num = document.createElement("span");
    num.className = "guest-num";

    var select = document.createElement("select");
    select.className = "guest-menu";
    MENUS.forEach(function (m) {
      var opt = document.createElement("option");
      opt.value = m[0];
      opt.textContent = m[1];
      select.appendChild(opt);
    });
    select.addEventListener("change", renumber);

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "guest-remove";
    remove.setAttribute("aria-label", "Retirer cette personne");
    remove.textContent = "✕";
    remove.addEventListener("click", function () {
      row.remove();
      renumber();
    });

    row.appendChild(num);
    row.appendChild(select);
    row.appendChild(remove);
    return row;
  }

  function renumber() {
    var rows = guests.querySelectorAll(".guest-row");
    var counts = { meat: 0, child: 0, vegetarian: 0 };
    rows.forEach(function (row, i) {
      row.querySelector(".guest-num").textContent = "Personne " + (i + 1);
      row.classList.toggle("solo", rows.length === 1);
      counts[row.querySelector(".guest-menu").value]++;
    });
    tally.textContent =
      rows.length +
      " personne(s) — Viande " +
      counts.meat +
      ", Enfant " +
      counts.child +
      ", Végétarien " +
      counts.vegetarian;
  }

  function addGuest() {
    guests.appendChild(makeRow());
    renumber();
  }

  document.getElementById("add-guest").addEventListener("click", addGuest);
  addGuest(); // start with one row

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var menus = [];
    guests.querySelectorAll(".guest-menu").forEach(function (s) {
      menus.push(s.value);
    });
    var payload = {
      first_name: form.first_name.value.trim(),
      last_name: form.last_name.value.trim(),
      address: form.address.value.trim(),
      phone: form.phone.value.trim(),
      table_name: form.table_name.value.trim(),
      menus: menus
    };
    fetch("api/signups.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        if (!r.ok) {
          throw new Error("signup-failed");
        }
        window.location.href = "signup_thanks.php";
      })
      .catch(function () {
        alert("Échec de l'envoi du formulaire. Veuillez vérifier les champs et réessayer.");
      });
  });
})();
```

- [ ] **Step 4: Create the form CSS**

Create `code/assets/css/signup.css`:

```css
@import "main.css";

.signup-title {
  font-size: 30px;
  margin-bottom: 4px;
}

.signup-subtitle {
  color: #b9760d;
  font-weight: bold;
  margin-bottom: 14px;
}

.signup-desc {
  color: #555;
  max-width: 60ch;
  margin-bottom: 24px;
}

.signup-section fieldset {
  border: 1px solid #e7ded1;
  border-radius: 10px;
  padding: 18px;
  margin-bottom: 20px;
}

.signup-section legend {
  font-weight: bold;
  padding: 0 8px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 12px;
}

.form-group input {
  padding: 10px 12px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 15px;
}

.hint {
  color: #777;
  font-size: 12px;
}

.guest-row {
  display: grid;
  grid-template-columns: 120px 1fr 40px;
  align-items: center;
  gap: 12px;
  background: #faf6ef;
  border: 1px solid #e7ded1;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.guest-num {
  font-weight: bold;
  color: #b9760d;
}

.guest-menu {
  padding: 9px 11px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 15px;
}

.guest-remove {
  width: 34px;
  height: 34px;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
}

.guest-row.solo .guest-remove {
  visibility: hidden;
}

.add-guest {
  width: 100%;
  padding: 11px;
  background: #fbeecb;
  color: #b9760d;
  border: 1px dashed #e7a11c;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  margin-top: 4px;
}

.tally {
  margin-top: 12px;
  font-weight: bold;
}

.form-actions {
  margin-top: 20px;
}

@media screen and (max-width: 560px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .guest-row {
    grid-template-columns: 90px 1fr 40px;
  }
}
```

- [ ] **Step 5: Create the thank-you page**

Create `code/signup_thanks.php`:

```php
<?php $pageTitle = 'Merci';
$pageCss = 'signup.css';
require 'partials/head.php'; ?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>

<section class="signup-section thanks">
  <h1>Merci pour votre inscription !</h1>
  <p>Votre inscription au <strong>Souper des 25 ans</strong> a bien été enregistrée.</p>
  <p>Pour toute question, la Team Direction vous contactera au numéro indiqué.</p>
  <p><a class="btn-primary" href="index.php">Retour à l'accueil</a></p>
</section>

<?php require 'partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
</body>
</html>
```

- [ ] **Step 6: Lint everything**

Run: `npm run check`
Expected: all steps pass (php lint, php tests, eslint, stylelint, prettier, guard).

- [ ] **Step 7: Verify in the browser**

Open http://localhost:8090/signup.php. Confirm: occasion title/description show; "＋ Ajouter une personne" adds rows; the remove button is hidden when only one row remains; the tally updates live; typing in "Table" suggests `Famille Rossier` (from the Task 3 test row). Fill all fields, add 2 guests, submit → lands on `signup_thanks.php`. Verify the new row in Adminer.

- [ ] **Step 8: Commit**

```bash
git add code/signup.php code/signup_thanks.php code/assets/js/signup.js code/assets/css/signup.css code/assets/css/main.css
git commit -m "feat(signups): public form + thank-you page"
```

---

### Task 5: Admin totals view

**Files:**
- Create: `code/signups_admin.php`
- Create: `code/assets/js/signups_admin.js`
- Create: `code/assets/css/signups_admin.css`

**Interfaces:**
- Consumes: `GET api/signups.php` JSON (Task 3), `Auth::requireLoginPage()`, `Auth::canViewSummary()`.
- Produces: admin page reachable at `signups_admin.php` (linked from home in Task 6 is not required; admins navigate directly).

- [ ] **Step 1: Create the admin page**

Create `code/signups_admin.php`:

```php
<?php
require 'src/bootstrap.php';
Auth::requireLoginPage('signups_admin');
if (!Auth::canViewSummary()) {
    http_response_code(403);
    exit('Accès refusé');
}
?>
<?php $pageTitle = 'Inscriptions — Souper 25 ans';
$pageCss = 'signups_admin.css';
require 'partials/head.php'; ?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>

<section class="signups-admin">
  <div class="admin-head">
    <h1 id="admin-title">Inscriptions</h1>
    <a class="csv-btn" href="api/signups.php?format=csv">⬇ Exporter en CSV</a>
  </div>
  <div class="tiles" id="tiles"></div>
  <div class="table-wrap">
    <table id="signups-table">
      <thead>
        <tr>
          <th>Table / Contact</th>
          <th>Tél.</th>
          <th class="num"><span class="dot dot-meat"></span>Viande</th>
          <th class="num"><span class="dot dot-child"></span>Enfant</th>
          <th class="num"><span class="dot dot-veg"></span>Végét.</th>
          <th class="num total">Total</th>
        </tr>
      </thead>
      <tbody id="signups-body"></tbody>
      <tfoot id="signups-foot"></tfoot>
    </table>
  </div>
</section>

<?php require 'partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/js/signups_admin.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the admin JavaScript**

Create `code/assets/js/signups_admin.js`:

```javascript
document.addEventListener("DOMContentLoaded", function () {
  fetch("api/signups.php", { method: "GET" })
    .then(function (r) {
      if (!r.ok) {
        throw new Error("load-failed");
      }
      return r.json();
    })
    .then(render)
    .catch(function () {
      document.getElementById("admin-title").textContent =
        "Erreur de chargement des inscriptions";
    });
});

function tile(label, value, cls) {
  var d = document.createElement("div");
  d.className = "tile" + (cls ? " " + cls : "");
  var k = document.createElement("div");
  k.className = "tile-k";
  k.textContent = label;
  var v = document.createElement("div");
  v.className = "tile-v";
  v.textContent = value;
  d.appendChild(k);
  d.appendChild(v);
  return d;
}

function numCell(value, isTotal) {
  var td = document.createElement("td");
  td.className = "num" + (isTotal ? " total" : "");
  if (value === 0) {
    td.classList.add("zero");
    td.textContent = "–";
  } else {
    td.textContent = value;
  }
  return td;
}

function contactCell(signup) {
  var td = document.createElement("td");
  var strong = document.createElement("strong");
  strong.textContent = signup.first_name + " " + signup.last_name;
  var sub = document.createElement("div");
  sub.className = "contact-sub";
  sub.textContent = signup.address;
  td.appendChild(strong);
  td.appendChild(sub);
  return td;
}

function menuRow(cells) {
  var tr = document.createElement("tr");
  cells.forEach(function (c) {
    tr.appendChild(c);
  });
  return tr;
}

function textCell(text) {
  var td = document.createElement("td");
  td.textContent = text;
  return td;
}

function render(data) {
  document.getElementById("admin-title").textContent =
    "Inscriptions — " + data.occasion.title;

  var tiles = document.getElementById("tiles");
  tiles.appendChild(tile("Total personnes", data.totalPersons, "accent"));
  tiles.appendChild(tile("Total tables", data.totalTables, "accent"));
  tiles.appendChild(tile("Viande", data.menuTotals.meat, "menu-meat"));
  tiles.appendChild(tile("Enfant", data.menuTotals.child, "menu-child"));
  tiles.appendChild(tile("Végétarien", data.menuTotals.vegetarian, "menu-veg"));

  var body = document.getElementById("signups-body");
  data.tables.forEach(function (t) {
    var group = menuRow([
      textCell(t.name),
      textCell(""),
      numCell(t.menuCounts.meat),
      numCell(t.menuCounts.child),
      numCell(t.menuCounts.vegetarian),
      numCell(t.personCount, true)
    ]);
    group.className = "group-row";
    body.appendChild(group);

    t.signups.forEach(function (s) {
      body.appendChild(
        menuRow([
          contactCell(s),
          textCell(s.phone),
          numCell(s.menuCounts.meat),
          numCell(s.menuCounts.child),
          numCell(s.menuCounts.vegetarian),
          numCell(s.personCount, true)
        ])
      );
    });
  });

  var foot = menuRow([
    textCell("Total général"),
    textCell(""),
    numCell(data.menuTotals.meat),
    numCell(data.menuTotals.child),
    numCell(data.menuTotals.vegetarian),
    numCell(data.totalPersons, true)
  ]);
  foot.className = "group-row";
  document.getElementById("signups-foot").appendChild(foot);
}
```

- [ ] **Step 3: Create the admin CSS**

Create `code/assets/css/signups_admin.css`:

```css
@import "main.css";

.admin-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}

.csv-btn {
  text-decoration: none;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px 16px;
  color: #333;
  font-weight: bold;
}

.csv-btn:hover {
  border-color: #e7a11c;
  color: #b9760d;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-bottom: 22px;
}

.tile {
  border: 1px solid #e7ded1;
  border-radius: 10px;
  padding: 16px;
  background: #faf6ef;
}

.tile-k {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #777;
}

.tile-v {
  font-size: 28px;
  font-weight: bold;
}

.tile.accent {
  border-color: #e7a11c;
  background: #fbeecb;
}

.tile.menu-meat {
  border-color: #9c3c17;
  background: #f6ddd0;
}

.tile.menu-child {
  border-color: #23577f;
  background: #d8e6f4;
}

.tile.menu-veg {
  border-color: #2f6b3c;
  background: #d8ebd9;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid #e7ded1;
  border-radius: 10px;
}

#signups-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 620px;
}

#signups-table th,
#signups-table td {
  padding: 11px 14px;
  border-bottom: 1px solid #eee;
  text-align: left;
}

#signups-table th {
  background: #faf6ef;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #777;
  white-space: nowrap;
}

#signups-table th.num,
#signups-table td.num {
  text-align: right;
}

#signups-table td.total {
  font-weight: bold;
}

#signups-table td.zero {
  color: #aaa;
}

.group-row td {
  background: #fbeecb;
  font-weight: bold;
}

#signups-table tfoot td {
  border-top: 2px solid #ddd;
}

.contact-sub {
  color: #777;
  font-size: 12px;
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 5px;
}

.dot-meat {
  background: #9c3c17;
}

.dot-child {
  background: #23577f;
}

.dot-veg {
  background: #2f6b3c;
}

@media screen and (max-width: 760px) {
  .tiles {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

- [ ] **Step 4: Lint**

Run: `npm run check`
Expected: all pass.

- [ ] **Step 5: Verify in the browser (as admin)**

Log in at http://localhost:8090 as `demo.admin` / `demo`. Open http://localhost:8090/signups_admin.php. Confirm: tiles show totals; the Viande/Enfant/Végétarien tiles use the meat/child/veg colors matching the table header dots; rows are grouped by table with a highlighted group row and a "Total général" footer; zeros show as "–". Click "Exporter en CSV" → a `.csv` downloads and opens in Excel with correct accents and `;` columns.

- [ ] **Step 6: Verify a non-admin is refused**

Log out, log in as `demo.user` / `demo`, open `signups_admin.php`.
Expected: "Accès refusé" (403).

- [ ] **Step 7: Commit**

```bash
git add code/signups_admin.php code/assets/js/signups_admin.js code/assets/css/signups_admin.css
git commit -m "feat(signups): admin totals view + CSV export"
```

---

### Task 6: Home-page call-to-action

**Files:**
- Modify: `code/index.php`
- Modify: `code/assets/css/accueil.css`

**Interfaces:**
- Consumes: `.btn-primary` from `main.css` (Task 4); links to `signup.php` (Task 4).
- Produces: a visible entry point on the home page. No navigation menu entry (per spec).

- [ ] **Step 1: Add the CTA section to the home page**

In `code/index.php`, add a new section after the existing `.accueil` section (before `partials/footer.php`):

```php
<section class="souper-cta">
  <h2>Souper — 25 ans des Canetons</h2>
  <p>Amis et familles, fêtez nos 25 ans et la sortie du nouveau costume avec nous !</p>
  <a class="btn-primary" href="signup.php">S'inscrire au souper</a>
</section>
```

- [ ] **Step 2: Style the CTA**

Append to `code/assets/css/accueil.css`:

```css
.souper-cta {
  text-align: center;
}

.souper-cta h2 {
  color: #b9760d;
  margin-bottom: 10px;
}

.souper-cta p {
  margin-bottom: 18px;
}
```

- [ ] **Step 3: Lint**

Run: `npm run check`
Expected: all pass.

- [ ] **Step 4: Verify**

Open http://localhost:8090/index.php. Confirm the CTA section shows and "S'inscrire au souper" links to `signup.php`. Confirm there is **no** new item in the navigation bar.

- [ ] **Step 5: Commit**

```bash
git add code/index.php code/assets/css/accueil.css
git commit -m "feat(signups): home-page call-to-action"
```

---

### Task 7: Site-wide once-per-browser popup

**Files:**
- Create: `code/assets/js/supper-popup.js`
- Modify: `code/partials/footer.php` (popup markup + script include)
- Modify: `code/assets/css/main.css` (popup styles)

**Interfaces:**
- Consumes: `.btn-primary` from `main.css` (Task 4); links to `signup.php` (Task 4).
- Produces: a modal shown once per browser on any page (footer is included site-wide).

- [ ] **Step 1: Add the popup markup + script to the footer**

Replace the contents of `code/partials/footer.php` with:

```php
<footer>
  <p1>&copy; 2023 Guggenmusik les canetons de Fribourg Tous droits réservés.</p1>
</footer>

<div
  id="supper-popup"
  class="popup-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="Souper 25 ans des Canetons"
>
  <div class="popup-box">
    <button type="button" class="popup-close" aria-label="Fermer">✕</button>
    <div class="popup-banner">
      <div class="popup-duck">🦆🎉</div>
      <h3>Souper — 25 ans des Canetons</h3>
      <p>Sortie du nouveau costume</p>
    </div>
    <div class="popup-body">
      <p>Amis et familles, fêtez nos 25 ans avec nous ! Réservez votre place et votre menu.</p>
      <a class="btn-primary popup-cta" href="signup.php">S'inscrire au souper</a>
      <button type="button" class="popup-dismiss">Non merci, ne plus afficher</button>
    </div>
  </div>
</div>
<script src="assets/js/supper-popup.js"></script>
```

- [ ] **Step 2: Create the popup JavaScript**

Create `code/assets/js/supper-popup.js`:

```javascript
(function () {
  var KEY = "canetons_supper_popup_v1";
  if (localStorage.getItem(KEY)) {
    return;
  }
  var popup = document.getElementById("supper-popup");
  if (!popup) {
    return;
  }

  function dismiss() {
    localStorage.setItem(KEY, "1");
    popup.classList.remove("show");
  }

  popup.classList.add("show");
  popup.querySelector(".popup-close").addEventListener("click", dismiss);
  popup.querySelector(".popup-dismiss").addEventListener("click", dismiss);
  popup.querySelector(".popup-cta").addEventListener("click", dismiss);
  popup.addEventListener("click", function (e) {
    if (e.target === popup) {
      dismiss();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      dismiss();
    }
  });
})();
```

- [ ] **Step 3: Add popup styles to `main.css`**

Append to `code/assets/css/main.css`:

```css
/* -- SITE-WIDE POPUP ------------------ */

.popup-overlay {
  display: none;
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(20, 15, 5, 0.55);
  z-index: 1000;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.popup-overlay.show {
  display: flex;
}

.popup-box {
  background: #fff;
  border-radius: 14px;
  max-width: 420px;
  width: 100%;
  overflow: hidden;
  position: relative;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.popup-close {
  position: absolute;
  top: 8px;
  right: 10px;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.12);
  cursor: pointer;
  font-size: 16px;
}

.popup-banner {
  background: #e7a11c;
  color: #241a05;
  text-align: center;
  padding: 24px 20px 18px;
}

.popup-duck {
  font-size: 38px;
}

.popup-banner h3 {
  margin: 6px 0 2px;
  font-size: 20px;
}

.popup-body {
  padding: 20px;
  text-align: center;
}

.popup-body p {
  color: #555;
  margin-bottom: 16px;
}

.popup-cta {
  display: block;
  margin-bottom: 12px;
}

.popup-dismiss {
  background: none;
  border: none;
  color: #777;
  text-decoration: underline;
  cursor: pointer;
  font-size: 13px;
}
```

- [ ] **Step 4: Lint**

Run: `npm run check`
Expected: all pass.

- [ ] **Step 5: Verify once-per-browser behavior**

In a fresh browser profile (or after `localStorage.removeItem("canetons_supper_popup_v1")` in devtools), open any page, e.g. http://localhost:8090/index.php. The popup appears. Close it (✕, "Non merci", Escape, or click the backdrop), then navigate to another page (e.g. `contact.php`) — the popup does **not** reappear. Clicking "S'inscrire au souper" goes to `signup.php` and also suppresses future showings.

- [ ] **Step 6: Commit**

```bash
git add code/partials/footer.php code/assets/js/supper-popup.js code/assets/css/main.css
git commit -m "feat(signups): site-wide once-per-browser popup"
```

---

## Final verification

- [ ] `npm run php:install` has been run (installs `vendor/`, incl. PHPUnit).
- [ ] Run `npm run check` — all green (includes `test:php` → PHPUnit).
- [ ] Full manual pass: home CTA → form (add/remove guests, table suggestion, submit) → thank-you → row in Adminer → admin totals + CSV → popup once-per-browser.
- [ ] Confirm no dev-only files landed in `code/` (tests, migrations, PHPUnit config are at repo root).

## Self-Review (completed during authoring)

- **Spec coverage:** single `signups` table with `occasion` discriminator (Task 1) ✓; contact + menus-as-list, names-not-required per guest (Tasks 2–4) ✓; table datalist + type-ahead hint (Task 4) ✓; menu `meat/child/vegetarian` stored, "Viande (standard)" default (Tasks 2,4) ✓; DB-store + thank-you page, no e-mail (Tasks 3,4) ✓; admin totals as one-column-per-menu count table grouped by table + tfoot + color-coded tiles (Task 5) ✓; CSV export (Tasks 3,5) ✓; home-page link, no nav entry (Task 6) ✓; once-per-browser popup site-wide (Task 7) ✓; English code/French UI + prepared statements + escape-on-output (all tasks) ✓.
- **Best-practice setup:** standard PHPUnit test framework (dev-only Composer dep) with `phpunit.xml.dist` + `tests/` (Task 2); numbered `sql/migrations/` with a README for manual prod application (Task 1); repository + thin JSON API following the codebase's existing patterns. `occasion` carries no DB default — set by the app.
- **Placeholder scan:** no TBD/TODO; every code step has complete content.
- **Type consistency:** `normalizeMenus`/`computeStats`/`create`/`distinctTables`/`allForOccasion` signatures and the `menuCounts`/`personCount`/`tables` shapes match across the repository (Task 2), API (Task 3), and admin JS (Task 5).
