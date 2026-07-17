# Souper signup — round-2 admin feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the admin's round-2 feedback to the souper signup feature: session-based popup, home block reorder + restyle, richer copy with the event date, an email field with an SMTP confirmation mail (vendored PHPMailer), a real `.xlsx` export (vendored SimpleXLSXGen), plus a local migration runner and Mailpit.

**Architecture:** Buildless PHP 8.1 site. Copy is centralized in `SignupRepository::OCCASIONS`. Pure, DB-free functions (`exportRows`, confirmation-message building) are unit-tested with PHPUnit; IO/markup/config changes are verified with `npm run check` + manual local checks. Third-party PHP libraries are vendored as committed files under `code/vendor/` (no Composer at runtime, no build step). Mail is sent via authenticated SMTP through PHPMailer; local dev captures it with Mailpit. Migrations auto-apply locally via a small idempotent runner tracked in `schema_migrations`.

**Tech Stack:** PHP 8.1 (mysqli), MariaDB 10.3, vanilla JS + CSS, PHPUnit (dev), Docker Compose, PHPMailer (vendored), SimpleXLSXGen (vendored), Mailpit (local SMTP sink).

## Global Constraints

- **PHP 8.1**, **MariaDB 10.3**, **buildless** — no bundler/build step, no Composer install on production. `code/` is the exact FTP payload.
- **Vendored third-party PHP libs live under `code/vendor/`** (committed, uploaded as-is). This path is already excluded from phpcs (`code/vendor/*`) and prettier (`vendor`).
- **English everywhere** — code, comments, DB table/column names, keys, identifiers, filenames, and this plan. **French only for on-screen UI text and email copy shown to the user.**
- **Never commit `code/config.php`** or real data. Real SMTP credentials go only in the git-ignored `code/config.php`.
- **No new production migration** — the branch is not on prod; edit `001_create_signups.sql` in place.
- **Run `npm run check` before pushing.** PHP tools run in Docker (`npm run lint:php`); PHPUnit runs via `npm run test:php` (Dockerized). Docker must be running.
- **Frequent commits** — one commit per task.

---

### Task 1: Centralize occasion copy + event date

**Files:**
- Modify: `code/src/repositories/SignupRepository.php:19-27` (the `OCCASIONS` constant)
- Test: `tests/SignupRepositoryTest.php`

**Interfaces:**
- Produces: `SignupRepository::OCCASIONS['anniversary-supper']` gains keys `date` (`'2027-11-13'`), `date_display` (`'13 novembre 2027'`), `teaser` (short French copy). `title` and `subtitle` values change; `description` value changes. All consumers read these keys.

- [ ] **Step 1: Write the failing test**

Add to `tests/SignupRepositoryTest.php`:

```php
public function testActiveOccasionHasCopyAndDate(): void
{
    $o = SignupRepository::OCCASIONS[SignupRepository::ACTIVE_OCCASION];
    $this->assertSame('Souper des 25 ans des Canetons', $o['title']);
    $this->assertSame('Sortie du nouveau costume · Soirée guggen', $o['subtitle']);
    $this->assertSame('2027-11-13', $o['date']);
    $this->assertSame('13 novembre 2027', $o['date_display']);
    $this->assertArrayHasKey('teaser', $o);
    $this->assertArrayHasKey('description', $o);
    $this->assertStringContainsString('13 novembre 2027', $o['teaser']);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:php`
Expected: FAIL — `testActiveOccasionHasCopyAndDate` fails (title mismatch / missing `date` key).

- [ ] **Step 3: Update the OCCASIONS constant**

Replace `code/src/repositories/SignupRepository.php:19-27` with:

```php
    public const OCCASIONS = [
        'anniversary-supper' => [
            'title'        => 'Souper des 25 ans des Canetons',
            'subtitle'     => 'Sortie du nouveau costume · Soirée guggen',
            'date'         => '2027-11-13',
            'date_display' => '13 novembre 2027',
            'teaser'       => 'Le 13 novembre 2027, fêtez avec nous les 25 ans '
                . 'des Canetons ! Au programme : le dévoilement de notre nouveau '
                . 'costume, un souper d\'anniversaire et une soirée guggen avec '
                . 'des cliques invitées. Amis et familles, réservez votre place '
                . 'et votre menu.',
            'description'  => 'Un grand merci à nos amis et à nos familles ! Le '
                . '13 novembre 2027, nous fêtons nos 25 ans : dévoilement du '
                . 'nouveau costume, souper d\'anniversaire et soirée guggen. '
                . 'Inscrivez-vous ci-dessous pour réserver votre place et votre '
                . 'menu.',
        ],
    ];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:php`
Expected: PASS — all `SignupRepositoryTest` tests pass.

- [ ] **Step 5: Commit**

```bash
git add code/src/repositories/SignupRepository.php tests/SignupRepositoryTest.php
git commit -m "feat(signups): centralize occasion copy + event date"
```

---

### Task 2: Add `email` to schema, repository, stats, and export rows

**Files:**
- Modify: `sql/migrations/001_create_signups.sql:11-12` (add `email` column)
- Modify: `code/src/repositories/SignupRepository.php` (`create`, `allForOccasion`, `computeStats`, new `exportRows`)
- Test: `tests/SignupRepositoryTest.php`

**Interfaces:**
- Consumes: `SignupRepository::MENU_VALUES`, `SignupRepository::MENU_LABELS` (existing).
- Produces:
  - `create(array $data)` now also reads `$data['email']`.
  - `allForOccasion()` rows now include `email`.
  - `computeStats()` per-signup rows now include `email`.
  - New `public static function exportRows(array $signups): array` — returns a header row followed by one row per signup: `['Table','Nom','Prénom','Email','Adresse','Téléphone','Viande','Enfant','Végétarien','Total']` then values. String fields are formula-injection-safe (leading `= + - @` prefixed with `'`).

- [ ] **Step 1: Write the failing tests**

Add to `tests/SignupRepositoryTest.php`:

```php
public function testComputeStatsCarriesEmail(): void
{
    $signups = [[
        'first_name' => 'Marie', 'last_name' => 'Rossier', 'address' => 'A',
        'phone' => 'p', 'email' => 'marie@example.com',
        'table_name' => 'Famille Rossier', 'menus' => ['meat', 'child'],
    ]];
    $stats = SignupRepository::computeStats($signups);
    $this->assertSame('marie@example.com', $stats['tables'][0]['signups'][0]['email']);
}

public function testExportRowsHeaderAndValues(): void
{
    $signups = [[
        'first_name' => 'Marie', 'last_name' => 'Rossier',
        'address' => '1 rue A', 'phone' => '079', 'email' => 'marie@example.com',
        'table_name' => 'Famille Rossier', 'menus' => ['meat', 'meat', 'child'],
    ]];
    $rows = SignupRepository::exportRows($signups);
    $this->assertSame(
        ['Table', 'Nom', 'Prénom', 'Email', 'Adresse', 'Téléphone',
            'Viande', 'Enfant', 'Végétarien', 'Total'],
        $rows[0]
    );
    $this->assertSame(
        ['Famille Rossier', 'Rossier', 'Marie', 'marie@example.com',
            '1 rue A', '079', 2, 1, 0, 3],
        $rows[1]
    );
}

public function testExportRowsNeutralizesFormulaInjection(): void
{
    $signups = [[
        'first_name' => '=cmd', 'last_name' => 'X', 'address' => 'A',
        'phone' => 'p', 'email' => 'e@e.ch',
        'table_name' => 'T', 'menus' => ['meat'],
    ]];
    $rows = SignupRepository::exportRows($signups);
    $this->assertSame("'=cmd", $rows[1][2]); // Prénom column, quoted
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:php`
Expected: FAIL — `testComputeStatsCarriesEmail` (no `email` in signup rows) and `testExportRows*` (`exportRows` not defined / Error).

- [ ] **Step 3: Add the `email` column to the migration**

Edit `sql/migrations/001_create_signups.sql` — insert the `email` line after `phone` (line 11):

```sql
  `phone`      varchar(64)  NOT NULL,
  `email`      varchar(255) NOT NULL,
  `table_name` varchar(255) NOT NULL,
```

- [ ] **Step 4: Thread `email` through the repository**

In `code/src/repositories/SignupRepository.php`:

4a. `create()` — update SQL, bind, and params to include `email` after `phone`:

```php
    public function create(array $data): void
    {
        $sql = 'INSERT INTO signups
                (occasion, first_name, last_name, address, phone, email, table_name, menus)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $this->db->prepare($sql);
        $menusJson = json_encode(array_values($data['menus']));
        $stmt->bind_param(
            'ssssssss',
            $data['occasion'],
            $data['first_name'],
            $data['last_name'],
            $data['address'],
            $data['phone'],
            $data['email'],
            $data['table_name'],
            $menusJson
        );
        $stmt->execute();
        $stmt->close();
    }
```

4b. `allForOccasion()` — add `email` to the SELECT column list:

```php
            'SELECT first_name, last_name, address, phone, email, table_name, menus
             FROM signups WHERE occasion = ? ORDER BY table_name, id'
```

4c. `computeStats()` — add `email` to the per-signup array pushed into `$tables[$i]['signups']`:

```php
            $tables[$i]['signups'][] = [
                'first_name'  => $s['first_name'],
                'last_name'   => $s['last_name'],
                'address'     => $s['address'],
                'phone'       => $s['phone'],
                'email'       => $s['email'] ?? '',
                'personCount' => $personCount,
                'menuCounts'  => $counts,
            ];
```

4d. Add the new `exportRows()` method and a private CSV-safety helper (below `allForOccasion()`):

```php
    /**
     * Flat rows for the spreadsheet export: a header row followed by one row
     * per signup with per-menu counts. String fields are neutralized against
     * spreadsheet formula injection.
     *
     * @param array<int,array> $signups each with contact + menus(string[])
     * @return array<int,array>
     */
    public static function exportRows(array $signups): array
    {
        $rows = [[
            'Table', 'Nom', 'Prénom', 'Email', 'Adresse', 'Téléphone',
            'Viande', 'Enfant', 'Végétarien', 'Total',
        ]];
        foreach ($signups as $s) {
            $counts = self::zeroCounts();
            foreach ($s['menus'] as $m) {
                $counts[$m]++;
            }
            $rows[] = [
                self::cellSafe($s['table_name']),
                self::cellSafe($s['last_name']),
                self::cellSafe($s['first_name']),
                self::cellSafe($s['email'] ?? ''),
                self::cellSafe($s['address']),
                self::cellSafe($s['phone']),
                $counts['meat'],
                $counts['child'],
                $counts['vegetarian'],
                count($s['menus']),
            ];
        }
        return $rows;
    }

    /**
     * Neutralize spreadsheet formula injection: prefix a leading =, +, -, @
     * (or control chars) with a quote so the cell is treated as text.
     */
    private static function cellSafe(string $value): string
    {
        if ($value !== '' && preg_match('/^[=+\-@\t\r]/', $value) === 1) {
            return "'" . $value;
        }
        return $value;
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:php`
Expected: PASS — all `SignupRepositoryTest` tests pass (including the three new ones).

- [ ] **Step 6: Commit**

```bash
git add sql/migrations/001_create_signups.sql code/src/repositories/SignupRepository.php tests/SignupRepositoryTest.php
git commit -m "feat(signups): add email column + spreadsheet export rows"
```

---

### Task 3: Add `mail` config section (example + docker/Mailpit)

**Files:**
- Modify: `config/config.example.php`
- Modify: `config/config.docker.php`

**Interfaces:**
- Produces: `$config['mail']` with keys `host`, `port`, `secure` (`'ssl'|'tls'|''`), `username`, `password`, `from_email`, `from_name`. `Mailer` (Task 4) and `api/signups.php` (Task 5) consume it.

- [ ] **Step 1: Add the mail block to the example config**

Replace `config/config.example.php` with:

```php
<?php
// Copy to config.php and fill in real values. config.php is git-ignored.
return [
    'db' => [
        'host' => 'localhost',
        'user' => 'CHANGE_ME',
        'pass' => 'CHANGE_ME',
        'name' => 'CHANGE_ME',
        'charset' => 'utf8mb4',
    ],
    // Authenticated SMTP (easy-hebergement). Create a real mailbox and use it
    // here. secure: 'ssl' (port 465) or 'tls' (port 587).
    'mail' => [
        'host'       => 'mail-b.easy-hebergement.net',
        'port'       => 465,
        'secure'     => 'ssl',
        'username'   => 'CHANGE_ME',
        'password'   => 'CHANGE_ME',
        'from_email' => 'CHANGE_ME',
        'from_name'  => 'Les Canetons de Fribourg',
    ],
];
```

- [ ] **Step 2: Point the docker config at Mailpit**

Replace `config/config.docker.php` with:

```php
<?php
// Local Docker development config. Committed on purpose: it holds only
// throwaway credentials for the docker-compose `db` service — never real
// secrets. docker-compose mounts it into the web container at
// /var/www/html/config.php, so it never lives inside code/ on the host.
return [
    'db' => [
        'host' => 'db',
        'user' => 'canetons',
        'pass' => 'canetons',
        'name' => 'lescanetons',
        'charset' => 'utf8mb4',
    ],
    // Local mail goes to Mailpit (no auth, no TLS). View it at localhost:8025.
    'mail' => [
        'host'       => 'mailpit',
        'port'       => 1025,
        'secure'     => '',
        'username'   => '',
        'password'   => '',
        'from_email' => 'noreply@les-canetons.localhost',
        'from_name'  => 'Les Canetons de Fribourg',
    ],
];
```

- [ ] **Step 3: Verify PHP lint passes**

Run: `npm run lint:php`
Expected: PASS — no `php -l` or phpcs errors (config.php files are phpcs-excluded via `*/config.php`, but example/docker configs are linted for syntax).

- [ ] **Step 4: Commit**

```bash
git add config/config.example.php config/config.docker.php
git commit -m "feat(mail): add SMTP config section (example + Mailpit for docker)"
```

---

### Task 4: Vendor PHPMailer + `Mailer` class

**Files:**
- Create: `code/vendor/PHPMailer/PHPMailer.php`, `code/vendor/PHPMailer/SMTP.php`, `code/vendor/PHPMailer/Exception.php` (vendored, unmodified)
- Create: `code/src/Mailer.php`
- Modify: `code/src/bootstrap.php:11-12` (require vendored files + Mailer)
- Test: `tests/MailerTest.php`

**Interfaces:**
- Consumes: `$config['mail']` (Task 3); occasion array from `SignupRepository::OCCASIONS`.
- Produces:
  - `Mailer::buildConfirmation(array $occasion, array $signup): array` — pure; returns `['subject' => string, 'body' => string]`. `$signup` has `first_name`, `last_name`, `table_name`, `email`, and `menus` (string[]). Subject and body are French; body includes the occasion teaser, the date, and a per-menu summary.
  - `Mailer::__construct(array $mailConfig)`.
  - `Mailer::sendConfirmation(array $occasion, array $signup): bool` — sends via PHPMailer/SMTP; returns success. Throws nothing to callers that wrap it (caller handles fail-safe).

- [ ] **Step 1: Vendor the PHPMailer source files**

PHPMailer is MIT and dependency-free. Fetch v6.9.x `src/` files and place them under `code/vendor/PHPMailer/` **unmodified**:

```bash
mkdir -p code/vendor/PHPMailer
BASE="https://raw.githubusercontent.com/PHPMailer/PHPMailer/v6.9.3/src"
curl -fsSL "$BASE/PHPMailer.php"  -o code/vendor/PHPMailer/PHPMailer.php
curl -fsSL "$BASE/SMTP.php"       -o code/vendor/PHPMailer/SMTP.php
curl -fsSL "$BASE/Exception.php"  -o code/vendor/PHPMailer/Exception.php
```

Verify the three files exist and are non-empty. They declare classes in namespace `PHPMailer\PHPMailer`.

- [ ] **Step 2: Write the failing test**

Create `tests/MailerTest.php`:

```php
<?php

use PHPUnit\Framework\TestCase;

final class MailerTest extends TestCase
{
    public function testBuildConfirmationSubjectAndBody(): void
    {
        $occasion = SignupRepository::OCCASIONS[SignupRepository::ACTIVE_OCCASION];
        $signup = [
            'first_name' => 'Marie',
            'last_name'  => 'Rossier',
            'email'      => 'marie@example.com',
            'table_name' => 'Famille Rossier',
            'menus'      => ['meat', 'meat', 'child'],
        ];
        $msg = Mailer::buildConfirmation($occasion, $signup);

        $this->assertStringContainsString('Souper des 25 ans des Canetons', $msg['subject']);
        $this->assertStringContainsString('Marie', $msg['body']);
        $this->assertStringContainsString('Famille Rossier', $msg['body']);
        $this->assertStringContainsString('13 novembre 2027', $msg['body']);
        // menu summary: 2 viande, 1 enfant, 0 végétarien
        $this->assertStringContainsString('Viande : 2', $msg['body']);
        $this->assertStringContainsString('Enfant : 1', $msg['body']);
    }
}
```

- [ ] **Step 3: Register the test's dependency in the test bootstrap**

`Mailer::buildConfirmation` is pure and must load without PHPMailer or a DB. Append to `tests/bootstrap.php`:

```php
require_once __DIR__ . '/../code/src/Mailer.php';
```

`Mailer.php` (next step) must NOT `require` PHPMailer at file scope — it references the PHPMailer classes only inside `sendConfirmation()` via fully-qualified names, so the pure method is testable in isolation.

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test:php`
Expected: FAIL — `Mailer` class not found (`tests/bootstrap.php` require fails) / `buildConfirmation` undefined.

- [ ] **Step 5: Implement `Mailer`**

Create `code/src/Mailer.php`:

```php
<?php

/**
 * Thin wrapper over the vendored PHPMailer for the signup confirmation email.
 * Message assembly (buildConfirmation) is pure and unit-tested; sending is
 * isolated in sendConfirmation so callers can wrap it fail-safe.
 */
final class Mailer
{
    /** @param array<string,mixed> $config the $config['mail'] section */
    public function __construct(private array $config)
    {
    }

    /**
     * Build the French confirmation subject + plain-text body.
     *
     * @param array<string,mixed> $occasion an OCCASIONS entry
     * @param array<string,mixed> $signup   first_name,last_name,table_name,menus[]
     * @return array{subject:string,body:string}
     */
    public static function buildConfirmation(array $occasion, array $signup): array
    {
        $counts = ['meat' => 0, 'child' => 0, 'vegetarian' => 0];
        foreach ($signup['menus'] as $m) {
            if (isset($counts[$m])) {
                $counts[$m]++;
            }
        }
        $total = count($signup['menus']);

        $subject = 'Confirmation de votre inscription — ' . $occasion['title'];

        $body = 'Bonjour ' . $signup['first_name'] . " " . $signup['last_name'] . ",\n\n"
            . $occasion['teaser'] . "\n\n"
            . 'Date : ' . $occasion['date_display'] . "\n\n"
            . "Votre réservation a bien été enregistrée :\n"
            . '- Table : ' . $signup['table_name'] . "\n"
            . '- Viande : ' . $counts['meat'] . "\n"
            . '- Enfant : ' . $counts['child'] . "\n"
            . '- Végétarien : ' . $counts['vegetarian'] . "\n"
            . '- Total : ' . $total . " personne(s)\n\n"
            . "Merci et à bientôt !\n"
            . "Les Canetons de Fribourg";

        return ['subject' => $subject, 'body' => $body];
    }

    /**
     * Send the confirmation to the signer via authenticated SMTP.
     * Returns true on success; throws PHPMailer\PHPMailer\Exception on failure.
     */
    public function sendConfirmation(array $occasion, array $signup): bool
    {
        $msg = self::buildConfirmation($occasion, $signup);

        $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = (string) $this->config['host'];
        $mail->Port = (int) $this->config['port'];
        $mail->CharSet = 'UTF-8';
        if (($this->config['username'] ?? '') !== '') {
            $mail->SMTPAuth = true;
            $mail->Username = (string) $this->config['username'];
            $mail->Password = (string) $this->config['password'];
        } else {
            $mail->SMTPAuth = false;
        }
        $secure = (string) ($this->config['secure'] ?? '');
        if ($secure === 'ssl') {
            $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($secure === 'tls') {
            $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        } else {
            $mail->SMTPSecure = '';
            $mail->SMTPAutoTLS = false;
        }

        $mail->setFrom(
            (string) $this->config['from_email'],
            (string) $this->config['from_name']
        );
        $mail->addAddress(
            (string) $signup['email'],
            trim($signup['first_name'] . ' ' . $signup['last_name'])
        );
        $mail->Subject = $msg['subject'];
        $mail->Body = $msg['body'];

        return $mail->send();
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test:php`
Expected: PASS — `MailerTest::testBuildConfirmationSubjectAndBody` and all prior tests pass.

- [ ] **Step 7: Wire vendored PHPMailer + Mailer into bootstrap**

In `code/src/bootstrap.php`, after the repository requires (line 11) and before `Database::connect(...)`, add:

```php
require __DIR__ . '/../vendor/PHPMailer/Exception.php';
require __DIR__ . '/../vendor/PHPMailer/PHPMailer.php';
require __DIR__ . '/../vendor/PHPMailer/SMTP.php';
require __DIR__ . '/Mailer.php';
```

- [ ] **Step 8: Verify PHP lint passes (vendored files excluded from phpcs)**

Run: `npm run lint:php`
Expected: PASS — `php -l` accepts the vendored files; phpcs skips `code/vendor/*`; `Mailer.php` and `bootstrap.php` are PSR-12 clean.

- [ ] **Step 9: Commit**

```bash
git add code/vendor/PHPMailer code/src/Mailer.php code/src/bootstrap.php tests/MailerTest.php tests/bootstrap.php
git commit -m "feat(mail): vendor PHPMailer + Mailer with SMTP confirmation"
```

---

### Task 5: API POST — email validation + fail-safe confirmation send

**Files:**
- Modify: `code/api/signups.php:10-44` (POST branch)

**Interfaces:**
- Consumes: `SignupRepository::create()` (now with `email`), `Mailer` (Task 4), `$config['mail']` (in scope after bootstrap require).
- Produces: POST accepts a required `email` field; validates it; stores it; then attempts the confirmation send without ever blocking the 201 response.

- [ ] **Step 1: Read `email` and validate it in the POST branch**

In `code/api/signups.php`, after the `$phone` line (currently line 16) add:

```php
    $email     = trim((string) ($data['email'] ?? ''));
```

Extend the validation block so an empty/invalid/over-long email is a 400 (mirrors `api/contact.php`). Replace the existing `if (...) { 400 }` condition with:

```php
    if (
        $firstName === '' || $lastName === '' || $address === ''
        || $phone === '' || $tableName === '' || $menus === null
        || !filter_var($email, FILTER_VALIDATE_EMAIL)
        || mb_strlen($firstName) > 255 || mb_strlen($lastName) > 255
        || mb_strlen($address) > 255 || mb_strlen($tableName) > 255
        || mb_strlen($email) > 255 || mb_strlen($phone) > 64
    ) {
        http_response_code(400);
        echo json_encode(['error' => 'Formulaire invalide']);
        exit;
    }
```

- [ ] **Step 2: Include `email` in the insert payload**

In the `$repo->create([...])` array, add `'email' => $email,` after `'phone' => $phone,`.

- [ ] **Step 3: Send the confirmation, fail-safe, before responding**

Replace the success response (currently `http_response_code(201); echo json_encode(['ok' => true]); exit;`) with:

```php
    // Fail-safe: the reservation is already stored. A mail error must not
    // block the response — log it and still return 201.
    try {
        $mailer = new Mailer($config['mail']);
        $mailer->sendConfirmation(
            SignupRepository::OCCASIONS[$occasion],
            [
                'first_name' => $firstName,
                'last_name'  => $lastName,
                'email'      => $email,
                'table_name' => $tableName,
                'menus'      => $menus,
            ]
        );
    } catch (\Throwable $e) {
        error_log('Signup confirmation mail failed: ' . $e->getMessage());
    }

    http_response_code(201);
    echo json_encode(['ok' => true]);
    exit;
```

- [ ] **Step 4: Verify PHP lint passes**

Run: `npm run lint:php`
Expected: PASS — `api/signups.php` is `php -l` clean and PSR-12 compliant.

- [ ] **Step 5: Commit**

```bash
git add code/api/signups.php
git commit -m "feat(signups): require + validate email, send fail-safe confirmation"
```

---

### Task 6: Vendor SimpleXLSXGen + replace CSV export with `.xlsx`

**Files:**
- Create: `code/vendor/SimpleXLSXGen.php` (vendored, unmodified)
- Modify: `code/api/signups.php` (GET branch — replace the CSV path; remove the CSV helpers)

**Interfaces:**
- Consumes: `SignupRepository::exportRows()` (Task 2), `SignupRepository::allForOccasion()`.
- Produces: `GET api/signups.php?format=xlsx` streams `inscriptions-souper.xlsx`. The former `format=csv` path and the `signups_export_csv` / `csv_safe` functions are removed.

- [ ] **Step 1: Vendor SimpleXLSXGen (single file, MIT)**

```bash
curl -fsSL "https://raw.githubusercontent.com/shuchkin/simplexlsxgen/master/src/SimpleXLSXGen.php" \
  -o code/vendor/SimpleXLSXGen.php
```

Verify the file exists and declares `class SimpleXLSXGen` in namespace `Shuchkin`.

- [ ] **Step 2: Replace the CSV branch with an `.xlsx` export**

In `code/api/signups.php` GET branch, replace the CSV block:

```php
    if ((string) ($_GET['format'] ?? '') === 'csv') {
        signups_export_csv($signups);
        exit;
    }
```

with:

```php
    if ((string) ($_GET['format'] ?? '') === 'xlsx') {
        require __DIR__ . '/../vendor/SimpleXLSXGen.php';
        $rows = SignupRepository::exportRows($signups);
        \Shuchkin\SimpleXLSXGen::fromArray($rows)
            ->downloadAs('inscriptions-souper.xlsx');
        exit;
    }
```

- [ ] **Step 3: Remove the obsolete CSV helper functions**

Delete the `signups_export_csv()` and `csv_safe()` functions at the bottom of `code/api/signups.php` (they are replaced by `SignupRepository::exportRows()` + SimpleXLSXGen). Leave the `http_response_code(405)` fallback intact.

- [ ] **Step 4: Verify PHP lint passes**

Run: `npm run lint:php`
Expected: PASS — `api/signups.php` clean; `code/vendor/*` skipped by phpcs.

- [ ] **Step 5: Manually verify the export end-to-end**

```bash
docker compose up -d --build
```

Log in at `http://localhost:8090` as `demo.admin` (password `demo`), submit at least one signup as a guest (or via the form), then open `http://localhost:8090/api/signups.php?format=xlsx`. Expected: a `.xlsx` downloads and opens in Excel/LibreOffice with the header row `Table, Nom, Prénom, Email, Adresse, Téléphone, Viande, Enfant, Végétarien, Total` and one row per signup.

- [ ] **Step 6: Commit**

```bash
git add code/vendor/SimpleXLSXGen.php code/api/signups.php
git commit -m "feat(signups): replace CSV export with real .xlsx (SimpleXLSXGen)"
```

---

### Task 7: Form — add the email field + include it in the POST

**Files:**
- Modify: `code/signup.php:30-37` (Vos coordonnées grid)
- Modify: `code/assets/js/signup.js:76-83` (payload)

**Interfaces:**
- Consumes: the POST contract from Task 5 (server expects `email`).
- Produces: a required `email` input whose value is sent as `email` in the JSON payload.

- [ ] **Step 1: Add the email input**

In `code/signup.php`, inside the `.form-grid`, add an email field (place it after the phone group so the grid stays balanced):

```php
        <div class="form-group">
          <label for="email" class="required">E-mail</label>
          <input type="email" id="email" name="email" required />
        </div>
```

- [ ] **Step 2: Include `email` in the JS payload**

In `code/assets/js/signup.js`, add `email` to the `payload` object:

```js
    var payload = {
      first_name: form.first_name.value.trim(),
      last_name: form.last_name.value.trim(),
      address: form.address.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      table_name: form.table_name.value.trim(),
      menus: menus,
    };
```

- [ ] **Step 3: Verify lint passes**

Run: `npm run check`
Expected: PASS — eslint (signup.js), stylelint, prettier, and php -l/phpcs all clean.

- [ ] **Step 4: Manually verify submission**

With the stack up (`docker compose up -d`), open `http://localhost:8090/signup.php`, fill the form including a valid email, submit. Expected: redirect to the thank-you page; the reservation appears in the admin overview; the confirmation email appears in Mailpit (`http://localhost:8025`) after Task 11 adds Mailpit (before that, the send fails fail-safe and the reservation still saves).

- [ ] **Step 5: Commit**

```bash
git add code/signup.php code/assets/js/signup.js
git commit -m "feat(signups): add required email field to the signup form"
```

---

### Task 8: Popup — once per browser session + permanent opt-out + occasion copy

**Files:**
- Modify: `code/partials/footer.php:14-27` (popup markup)
- Modify: `code/assets/js/supper-popup.js` (full rewrite of the gating logic)

**Interfaces:**
- Consumes: `SignupRepository::OCCASIONS` (footer runs after bootstrap; `SignupRepository` is loaded). The footer is included by pages that already `require 'src/bootstrap.php'`.
- Produces: popup shows once per browser session unless permanently opted out; copy + date come from occasion data.

- [ ] **Step 1: Drive popup copy from occasion data + add the date line**

In `code/partials/footer.php`, replace the hardcoded popup banner/body (lines 16-25) with occasion-driven copy. Add this near the top of the popup `if` block (after line 6) to fetch the data:

```php
<?php $popupOccasion = SignupRepository::OCCASIONS[SignupRepository::ACTIVE_OCCASION]; ?>
```

Then the banner + body become:

```php
    <div class="popup-banner">
      <div class="popup-duck">🦆🎉</div>
      <h3><?= htmlspecialchars($popupOccasion['title']) ?></h3>
      <p><?= htmlspecialchars($popupOccasion['subtitle']) ?></p>
      <p class="popup-date"><?= htmlspecialchars($popupOccasion['date_display']) ?></p>
    </div>
    <div class="popup-body">
      <p><?= htmlspecialchars($popupOccasion['teaser']) ?></p>
      <a class="btn-primary popup-cta" href="signup.php">S'inscrire au souper</a>
      <button type="button" class="popup-dismiss">Non merci, ne plus afficher</button>
    </div>
```

Also update the dialog `aria-label` to `<?= htmlspecialchars($popupOccasion['title']) ?>`.

- [ ] **Step 2: Rewrite the gating logic (session + permanent opt-out)**

Replace `code/assets/js/supper-popup.js` with:

```js
(function () {
  var SESSION_KEY = "canetons_supper_popup_session";
  var OPTOUT_KEY = "canetons_supper_popup_optout";

  // Permanent opt-out (localStorage) or already seen this session -> stay hidden.
  if (localStorage.getItem(OPTOUT_KEY) || sessionStorage.getItem(SESSION_KEY)) {
    return;
  }
  var popup = document.getElementById("supper-popup");
  if (!popup) {
    return;
  }

  function closeForSession() {
    sessionStorage.setItem(SESSION_KEY, "1");
    popup.classList.remove("show");
  }

  function optOutForever() {
    localStorage.setItem(OPTOUT_KEY, "1");
    popup.classList.remove("show");
  }

  popup.classList.add("show");
  popup.querySelector(".popup-close").addEventListener("click", closeForSession);
  popup.querySelector(".popup-cta").addEventListener("click", closeForSession);
  popup.querySelector(".popup-dismiss").addEventListener("click", optOutForever);
  popup.addEventListener("click", function (e) {
    if (e.target === popup) {
      closeForSession();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeForSession();
    }
  });
})();
```

- [ ] **Step 3: Add minimal styling for the date line**

In `code/assets/css/main.css`, after the `.popup-banner h3` rule (around line 366), add:

```css
.popup-date {
  margin-top: 4px;
  font-weight: bold;
}
```

- [ ] **Step 4: Verify lint passes**

Run: `npm run check`
Expected: PASS — eslint (supper-popup.js), stylelint (main.css), prettier, php -l/phpcs clean.

- [ ] **Step 5: Manually verify popup behavior**

With the stack up, open `http://localhost:8090` in a fresh browser session (or a new private window). Expected: popup shows once, with the new title/subtitle/date/teaser. Reload the page → popup does NOT reappear (session flag). Close the browser / open a new private window → popup reappears (new session). Click "Non merci, ne plus afficher", reload / reopen → popup stays hidden (permanent opt-out). Clear `localStorage`/`sessionStorage` to reset.

- [ ] **Step 6: Commit**

```bash
git add code/partials/footer.php code/assets/js/supper-popup.js code/assets/css/main.css
git commit -m "feat(signups): popup once per session + opt-out, copy from occasion"
```

---

### Task 9: Home page — souper block first + popup-like styling

**Files:**
- Modify: `code/index.php:7-21` (section order + content)
- Modify: `code/assets/css/accueil.css:76-87` (souper block styling)

**Interfaces:**
- Consumes: `SignupRepository::OCCASIONS`, `Auth::canViewSummary()` (index.php already requires bootstrap via head.php).
- Produces: the souper block renders above "Bienvenue", styled like the popup, with copy + date from occasion data.

- [ ] **Step 1: Load occasion data + reorder the sections**

In `code/index.php`, replace lines 7-21 (the `accueil` section followed by the `souper-cta` section) with the souper block FIRST, then "Bienvenue". Add the occasion fetch after the head/banner/nav includes:

```php
<?php $home = SignupRepository::OCCASIONS[SignupRepository::ACTIVE_OCCASION]; ?>

<section class="souper-cta">
  <div class="souper-card">
    <div class="souper-duck">🦆🎉</div>
    <h2><?= htmlspecialchars($home['title']) ?></h2>
    <p class="souper-subtitle"><?= htmlspecialchars($home['subtitle']) ?></p>
    <p class="souper-date"><?= htmlspecialchars($home['date_display']) ?></p>
    <?php if (Auth::canViewSummary()) : ?>
      <p>Consultez les inscriptions : totaux par menu et par table.</p>
      <a class="btn-primary" href="signups_admin.php">Voir les inscriptions</a>
    <?php else : ?>
      <p><?= htmlspecialchars($home['teaser']) ?></p>
      <a class="btn-primary" href="signup.php">S'inscrire au souper</a>
    <?php endif; ?>
  </div>
</section>

<section class="accueil">
  <h2>Bienvenue sur notre site</h2>
  <img src="assets/img/Cindyphotography-128.jpg" alt="Image d'accueil" id="imgaccueil" />
</section>
```

- [ ] **Step 2: Restyle the souper block to match the popup**

In `code/assets/css/accueil.css`, replace the existing `.souper-cta` rules (lines 76-87) with a popup-like card:

```css
.souper-cta {
  padding: 20px;
  display: flex;
  justify-content: center;
}

.souper-card {
  max-width: 720px;
  width: 100%;
  text-align: center;
  padding: 28px 24px;
  border-radius: 15px;
  background: linear-gradient(135deg, #fbe7c6, #f7c873);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.souper-duck {
  font-size: 40px;
  line-height: 1;
  margin-bottom: 8px;
}

.souper-card h2 {
  color: #b9760d;
  margin-bottom: 6px;
}

.souper-subtitle {
  color: #7a4e08;
  margin-bottom: 4px;
}

.souper-date {
  font-weight: bold;
  margin-bottom: 14px;
}

.souper-card p {
  margin-bottom: 16px;
}
```

- [ ] **Step 3: Verify lint passes**

Run: `npm run check`
Expected: PASS — stylelint (accueil.css), prettier, php -l/phpcs clean.

- [ ] **Step 4: Manually verify the home page**

With the stack up, open `http://localhost:8090`. Expected: the souper card appears ABOVE "Bienvenue sur notre site", styled like the popup (duck, gradient, title/subtitle/date/teaser + CTA). As `demo.admin`, the card shows "Voir les inscriptions" instead.

- [ ] **Step 5: Commit**

```bash
git add code/index.php code/assets/css/accueil.css
git commit -m "feat(signups): move souper block above welcome + popup-like styling"
```

---

### Task 10: Admin overview — relabel export button to Excel/`.xlsx`

**Files:**
- Modify: `code/signups_admin.php:20-24` (export link)

**Interfaces:**
- Consumes: the `format=xlsx` endpoint (Task 6).
- Produces: the admin export button points at `?format=xlsx` and reads "Exporter en Excel".

- [ ] **Step 1: Update the export link**

In `code/signups_admin.php`, replace the export anchor (lines 21-23) with:

```php
      <a class="button is-primary is-light" href="api/signups.php?format=xlsx">
        ⬇ Exporter en Excel
      </a>
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint:php`
Expected: PASS — `signups_admin.php` clean.

- [ ] **Step 3: Manually verify**

As `demo.admin`, open `http://localhost:8090/signups_admin.php`, click "Exporter en Excel". Expected: `inscriptions-souper.xlsx` downloads.

- [ ] **Step 4: Commit**

```bash
git add code/signups_admin.php
git commit -m "feat(signups): admin export button downloads .xlsx"
```

---

### Task 11: Local dev — migration runner + Mailpit + drop per-migration mounts

**Files:**
- Create: `tools/migrate.php`
- Modify: `docker-compose.yml`
- Modify: `sql/migrations/README.md`

**Interfaces:**
- Consumes: `sql/migrations/NNN_*.sql`.
- Produces: a `migrate` one-shot service that applies pending migrations (tracked in `schema_migrations`) on every `up`; a `mailpit` service (SMTP `1025`, UI `8025`); `web` waits for `migrate` to complete.

- [ ] **Step 1: Write the migration runner**

Create `tools/migrate.php`:

```php
<?php

// Dev-only migration runner (never deployed). Applies sql/migrations/NNN_*.sql
// once each, tracked in schema_migrations. Idempotent: safe to run on every
// `docker compose up`. Production migrations are still applied manually.

$dir  = $argv[1] ?? (__DIR__ . '/../sql/migrations');
$host = getenv('DB_HOST') ?: 'db';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASS') ?: 'root';
$name = getenv('DB_NAME') ?: 'lescanetons';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$db = new mysqli($host, $user, $pass, $name);
$db->set_charset('utf8mb4');

$db->query(
    'CREATE TABLE IF NOT EXISTS schema_migrations ('
    . 'version VARCHAR(255) NOT NULL PRIMARY KEY, '
    . 'applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
);

$applied = [];
$res = $db->query('SELECT version FROM schema_migrations');
while ($row = $res->fetch_assoc()) {
    $applied[$row['version']] = true;
}

$files = glob(rtrim($dir, '/') . '/[0-9]*.sql');
sort($files, SORT_STRING);

$ran = 0;
foreach ($files as $file) {
    $version = basename($file);
    if (isset($applied[$version])) {
        continue;
    }
    echo "Applying {$version} ...\n";
    $sql = file_get_contents($file);
    if ($db->multi_query($sql)) {
        do {
            if ($result = $db->store_result()) {
                $result->free();
            }
        } while ($db->more_results() && $db->next_result());
    }
    if ($db->errno) {
        fwrite(STDERR, "Migration {$version} failed: {$db->error}\n");
        exit(1);
    }
    $stmt = $db->prepare('INSERT INTO schema_migrations (version) VALUES (?)');
    $stmt->bind_param('s', $version);
    $stmt->execute();
    $stmt->close();
    $ran++;
}

echo "Migrations up to date ({$ran} applied this run).\n";
```

- [ ] **Step 2: Rewrite docker-compose (migrate + mailpit, drop per-migration mounts)**

Replace `docker-compose.yml` with:

```yaml
services:
  web:
    build: ./docker/web
    ports:
      - "8090:80"
    volumes:
      - ./code:/var/www/html
      - ./config/config.docker.php:/var/www/html/config.php:ro
    depends_on:
      db:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully

  db:
    image: mariadb:10.3
    environment:
      MARIADB_DATABASE: lescanetons
      MARIADB_USER: canetons
      MARIADB_PASSWORD: canetons
      MARIADB_ROOT_PASSWORD: root
    ports:
      - "3307:3306"
    volumes:
      - db_data:/var/lib/mysql
      - ./docker/db/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h localhost -u root -proot || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 20

  migrate:
    build: ./docker/web
    working_dir: /repo
    volumes:
      - ./tools:/repo/tools:ro
      - ./sql/migrations:/repo/sql/migrations:ro
    environment:
      DB_HOST: db
      DB_USER: root
      DB_PASS: root
      DB_NAME: lescanetons
    depends_on:
      db:
        condition: service_healthy
    command: ["php", "tools/migrate.php", "sql/migrations"]
    restart: "no"

  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "8025:8025"

  adminer:
    image: adminer:latest
    ports:
      - "8091:8080"
    depends_on:
      - db

volumes:
  db_data:
```

Note: the init mount is now read-only again (`:ro`) because no nested per-migration mountpoint is created there anymore.

- [ ] **Step 3: Update the migrations README (local dev section)**

Replace the "## Local dev" section of `sql/migrations/README.md` with:

```markdown
## Local dev

`docker compose up` runs a one-shot `migrate` service that applies every
not-yet-applied migration in this directory, in ascending order, and records
each in a `schema_migrations` table. It is **idempotent** — re-running applies
nothing new — and runs on every `up`, so a plain `docker compose up` picks up
new migrations without needing `docker compose down -v`. The `web` service waits
for `migrate` to finish before serving.

`docker/db/init/01-schema.sql` / `02-seed.sql` remain the fresh-volume baseline
(existing tables + synthetic seed); the runner applies the numbered migrations
on top.
```

- [ ] **Step 4: Verify the runner end-to-end from a clean volume**

```bash
docker compose down -v
docker compose up -d --build
docker compose logs migrate
```

Expected: the `migrate` service log shows `Applying 001_create_signups.sql ...` then `Migrations up to date (1 applied this run).` and exits 0. In Adminer (`http://localhost:8091`, server `db`, user `root`/`root`, db `lescanetons`) the `signups` table exists **with the `email` column**, and a `schema_migrations` row for `001_create_signups.sql` is present.

- [ ] **Step 5: Verify idempotency**

```bash
docker compose up -d
docker compose logs migrate
```

Expected: `Migrations up to date (0 applied this run).` — nothing re-applied.

- [ ] **Step 6: Verify Mailpit captures the confirmation mail**

Submit a signup at `http://localhost:8090/signup.php` with a valid email. Open `http://localhost:8025`. Expected: a message "Confirmation de votre inscription — Souper des 25 ans des Canetons" appears, addressed to the entered email, with the reservation summary in the body.

- [ ] **Step 7: Commit**

```bash
git add tools/migrate.php docker-compose.yml sql/migrations/README.md
git commit -m "chore(dev): auto-apply migrations + Mailpit for local docker"
```

---

### Task 12: Update CLAUDE.md — vendored PHP libraries

**Files:**
- Modify: `CLAUDE.md` (Tech Stack + Don'ts)

**Interfaces:**
- Produces: documented allowance for vendored, dependency-free PHP libs under `code/vendor/`.

- [ ] **Step 1: Amend the Tech Stack bullet**

In `CLAUDE.md`, in the **Tech Stack** section, extend the buildless bullet so it reads (append to the existing sentence about vendored CSS):

> Third-party code may be **vendored** as static files under `code/assets/vendor/` (CSS) or `code/vendor/` (dependency-free, single-purpose PHP libraries, e.g. PHPMailer, SimpleXLSXGen) — no CDN, no Composer install and no build step on production. Files are edited/committed and deployed as-is.

- [ ] **Step 2: Amend the Don'ts bullet**

Update the Don't that forbids build steps so it explicitly permits vendored PHP libs:

> - Never introduce a build step or bundler for the deployed site, and never require a Composer install on production. (Third-party libraries may be used only as **vendored static files** — CSS under `code/assets/vendor/`, dependency-free PHP under `code/vendor/` — no CDN, no build.)

- [ ] **Step 3: Verify nothing else broke**

Run: `npm run check`
Expected: PASS — full check suite green (docs change only; confirms the whole feature still lints/tests clean).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE): allow vendored dependency-free PHP libs under code/vendor"
```

---

## Self-Review

**Spec coverage:**
- §1 Copy centralized + date → Task 1 ✓
- §2 Popup once per session + opt-out → Task 8 ✓
- §3 Home block first + restyle → Task 9 ✓
- §4a email field → Task 7 ✓; §4b DB → Task 2 ✓; §4c Mailer/PHPMailer/SMTP → Task 4 + Task 5 (send) ✓; §4d config → Task 3 ✓
- §5 `.xlsx` export replacing CSV → Task 6 + admin button Task 10 ✓
- §6 migration runner + Mailpit → Task 11 ✓
- §7 CLAUDE.md → Task 12 ✓
- Testing (PHPUnit for pure units; manual local) → Tasks 1, 2, 4 (unit) + manual steps in 6, 7, 8, 9, 11 ✓

**Placeholder scan:** No TBD/TODO. `CHANGE_ME` appears only as intended config placeholders the operator fills in `code/config.php`. All code steps show complete code.

**Type consistency:** `exportRows()` header/row shape is identical in the Task 2 test, its implementation, and its Task 6 consumer. `buildConfirmation()` return shape (`subject`/`body`) matches between Task 4 test, implementation, and the `sendConfirmation` caller. Occasion keys (`title`, `subtitle`, `date`, `date_display`, `teaser`, `description`) defined in Task 1 are used consistently in Tasks 4, 8, 9. Config keys (`host`, `port`, `secure`, `username`, `password`, `from_email`, `from_name`) match between Task 3 and Task 4.

**Note on vendored-lib paths:** Chose `code/vendor/` (not the spec's `code/src/vendor/`) because `code/vendor/*` is already excluded by phpcs and `vendor` by prettier, and `/vendor/` in `.gitignore` is root-anchored so `code/vendor/` is tracked — no new ignore rules needed.
