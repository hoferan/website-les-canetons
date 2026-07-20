# Code Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 23 confirmed findings from the 2026-07-20 full-codebase review (4 security, 8 correctness/reliability, 2 JS bugs, 1 convention, plus 3 cleanup items), split across 5 independently-shippable PRs.

**Architecture:** No new subsystems. Each task is a targeted fix inside an existing file/class, following the patterns that already exist elsewhere in the codebase (see each task's "Interfaces" section for the exact existing pattern being mirrored).

**Tech Stack:** PHP 8.4, PHPUnit (`tests/Unit`, `tests/Integration`), MariaDB 10.3 (mysqli), vanilla JS (no bundler, no JS test runner).

## Global Constraints

- **PHP 8.4 / MariaDB 10.3** — no newer language features.
- **PSR-4** — `app/src/` classes are `App\`-namespaced and Composer-autoloaded; no manual `require`.
- **PSR-12** — enforced by `phpcs`; run `npm run lint:php`.
- **Language rule** — code, identifiers, DB column/enum names in **English**; only user-visible UI text in **French**.
- **`Database::connect()`** sets `mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT)` (`app/src/Database.php:17`) — any unvalidated mysqli error is an uncaught fatal. Validate before you query, don't rely on try/catch as the primary control.
- **No JS test runner exists.** JS-only tasks are verified manually via `npm run serve` + browser, not via a fabricated test step.
- **Test conventions:** pure-logic tests extend `PHPUnit\Framework\TestCase` (see `tests/Unit/AuthTest.php`); DB-touching tests extend `IntegrationTestCase` (`tests/Integration/IntegrationTestCase.php`), which wraps each test in a rolled-back transaction — never manually clean up inserted rows in those, except in `MigratorTest`-style DDL tests.
- **Verify before every commit:** `npm run check` (PHP lint + PHPUnit + ESLint + Stylelint + Prettier + secret guard).
- Never commit `app/config.php`, `public/`, or production data.

---

## PR 1 — Security (branch `fix/security-auth-xss-admin-exposure`)

Covers findings S1 (plaintext passwords), S2 (stored XSS), S3 (public admin
form markup), S4 (CSRF logout). No dependency on other PRs. **PR 2 depends on
Task 1 of this PR** (adds `id` to `UserRepository::findByUsername`), so land
this PR first if working PRs in parallel.

### File Structure

- **Modify** `app/src/Repositories/UserRepository.php` — add `id` to the `findByUsername` result, add `updatePassword()`.
- **Modify** `app/src/Auth.php` — `attemptLogin()` verifies hashes, auto-upgrades legacy plaintext rows.
- **Create** `tests/Integration/AuthLoginTest.php` — covers the hash/legacy/upgrade/failure paths.
- **Modify** `docker/db/init/02-seed.sql` — update the stale comment (seed values stay plaintext on purpose — see Task 2).
- **Modify** `app/assets/js/planning_repet.js` — replace unescaped `innerHTML` event rendering with safe DOM construction.
- **Modify** `app/pages/planning_repet.php` — gate the `#admin-interface` block server-side.
- **Modify** `app/api/logout.php` — add the `REQUEST_METHOD !== 'POST'` guard every sibling endpoint already has.

---

### Task 1: `UserRepository` — expose `id`, add `updatePassword()`

**Files:**
- Modify: `app/src/Repositories/UserRepository.php`

**Interfaces:**
- Consumes: nothing new.
- Produces: `findByUsername(string $username): ?array` now returns `['id' => int, 'username' => string, 'password' => string, 'role' => string]` (was missing `id`). New method `updatePassword(int $id, string $hash): void`. Task 2 (`Auth::attemptLogin`) and PR 2 Task 10 (`responses.php`) both call `findByUsername` and rely on the `id` key being present.

- [ ] **Step 1: Write the failing test**

Add to `tests/Integration/UserRepositoryTest.php` (read the existing file first to match its style — if it doesn't exist yet, create it following the pattern of `tests/Integration/EventRepositoryTest.php`):

```php
public function testFindByUsernameIncludesId(): void
{
    $repo = new UserRepository($this->db);

    $user = $repo->findByUsername('demo.user');

    $this->assertSame(1, $user['id']);
}

public function testUpdatePasswordChangesStoredHash(): void
{
    $repo = new UserRepository($this->db);
    $hash = password_hash('new-secret', PASSWORD_DEFAULT);

    $repo->updatePassword(1, $hash);

    $this->assertSame($hash, $repo->findByUsername('demo.user')['password']);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:php -- --filter UserRepositoryTest`
Expected: FAIL — `testFindByUsernameIncludesId` fails on an undefined array key `id`; `testUpdatePasswordChangesStoredHash` fails with "Call to undefined method ... updatePassword()".

- [ ] **Step 3: Implement**

Edit `app/src/Repositories/UserRepository.php`:

```php
<?php

namespace App\Repositories;

use mysqli;

final class UserRepository
{
    public function __construct(private mysqli $db)
    {
    }

    /**
     * Look up a user by username.
     * Returns ['id' => ..., 'username' => ..., 'password' => ..., 'role' => ...] or null.
     */
    public function findByUsername(string $username): ?array
    {
        $sql = "SELECT id, username, password, role FROM users WHERE username = ? LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** Overwrite a user's stored password value (already hashed by the caller). */
    public function updatePassword(int $id, string $hash): void
    {
        $stmt = $this->db->prepare('UPDATE users SET password = ? WHERE id = ?');
        $stmt->bind_param('si', $hash, $id);
        $stmt->execute();
        $stmt->close();
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:php -- --filter UserRepositoryTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/Repositories/UserRepository.php tests/Integration/UserRepositoryTest.php
git commit -m "feat(auth): expose user id and add updatePassword to UserRepository"
```

---

### Task 2: `Auth::attemptLogin` — verify hashes, auto-upgrade legacy plaintext

**Files:**
- Modify: `app/src/Auth.php:68-84`
- Modify: `docker/db/init/02-seed.sql` (comment only — seed values intentionally stay plaintext, see below)
- Test: `tests/Integration/AuthLoginTest.php`

**Interfaces:**
- Consumes: `UserRepository::findByUsername` (now returns `id`), `UserRepository::updatePassword` (Task 1).
- Produces: `Auth::attemptLogin(string $username, string $password): ?string` — same signature and return contract as before (role string or `null`), so no caller elsewhere in the codebase changes.

Design: on a successful login, if the stored value is a modern hash
(`password_verify` succeeds), nothing else happens. If it's **not** a hash
(the codebase's existing plaintext seed rows) and matches via a timing-safe
comparison, log the user in **and** immediately persist a hashed replacement
— every legacy row self-heals the first time that user logs in, with no
big-bang migration and no forced password reset. The seed data intentionally
stays plaintext (`docker/db/init/02-seed.sql` already seeds `'demo'` for every
account) so this legacy path is exercised by both the test suite and local
dev logins — only its explanatory comment needs updating.

- [ ] **Step 1: Write the failing tests**

Create `tests/Integration/AuthLoginTest.php`:

```php
<?php

use App\Auth;
use App\Repositories\UserRepository;

final class AuthLoginTest extends IntegrationTestCase
{
    protected function tearDown(): void
    {
        parent::tearDown();
        $_SESSION = [];
    }

    public function testLegacyPlaintextPasswordLogsInAndUpgradesStoredHash(): void
    {
        // Seed data stores 'demo' as plaintext for every synthetic account.
        $role = Auth::attemptLogin('demo.user', 'demo');

        $this->assertSame('user', $role);

        $repo = new UserRepository($this->db);
        $stored = $repo->findByUsername('demo.user')['password'];
        $this->assertTrue(password_verify('demo', $stored));
        $this->assertNotSame('demo', $stored);
    }

    public function testAlreadyHashedPasswordVerifiesDirectly(): void
    {
        $repo = new UserRepository($this->db);
        $repo->updatePassword(1, password_hash('s3cr3t-pass', PASSWORD_DEFAULT));

        $role = Auth::attemptLogin('demo.user', 's3cr3t-pass');

        $this->assertSame('user', $role);
    }

    public function testWrongPasswordFails(): void
    {
        $this->assertNull(Auth::attemptLogin('demo.user', 'not-the-password'));
    }

    public function testUnknownUsernameFails(): void
    {
        $this->assertNull(Auth::attemptLogin('nobody.here', 'demo'));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:php -- --filter AuthLoginTest`
Expected: FAIL — `testLegacyPlaintextPasswordLogsInAndUpgradesStoredHash` fails because the current code never rehashes (`$stored` still equals `'demo'`); the other three currently pass by coincidence (plaintext `!==` compare already returns the right role/`null`) but will be exercised again after Step 3 to confirm no regression.

- [ ] **Step 3: Implement**

Edit `app/src/Auth.php`, replacing `attemptLogin` (lines 64-84):

```php
    /**
     * Verify credentials server-side. On success, store identity in the session
     * and return the role. Returns null on failure.
     */
    public static function attemptLogin(string $username, string $password): ?string
    {
        $repo = new UserRepository(Database::get());
        $user = $repo->findByUsername($username);
        if ($user === null) {
            return null;
        }

        if (password_verify($password, $user['password'])) {
            self::completeLogin($username, $user['role']);
            return $user['role'];
        }

        // Legacy rows created before hashing was added store the password as
        // plain text (never a hash — hashes always start with '$'). Accept once
        // via a timing-safe compare, then upgrade the stored value so this
        // branch is never taken again for that user.
        if (!str_starts_with($user['password'], '$') && hash_equals($user['password'], $password)) {
            $repo->updatePassword((int) $user['id'], password_hash($password, PASSWORD_DEFAULT));
            self::completeLogin($username, $user['role']);
            return $user['role'];
        }

        return null;
    }

    private static function completeLogin(string $username, string $role): void
    {
        self::startSession();
        session_regenerate_id(true);
        $_SESSION['user'] = ['username' => $username, 'role' => $role];
    }
```

Edit `docker/db/init/02-seed.sql`, updating the comment above the `users` insert:

```sql
-- Synthetic users. All passwords are the literal string "demo". Auth::attemptLogin
-- verifies these via a one-time legacy-plaintext compare and immediately upgrades
-- the stored value to a password_hash() on first successful login (see Auth.php).
-- NO real member names or passwords.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:php -- --filter AuthLoginTest`
Expected: PASS (all 4 tests)

Then run the full suite once to confirm no other test relied on the old plaintext-only behavior:

Run: `npm run test:php`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/Auth.php docker/db/init/02-seed.sql tests/Integration/AuthLoginTest.php
git commit -m "fix(auth): hash-verify passwords, auto-upgrade legacy plaintext on login"
```

---

### Task 3: Fix stored XSS in `planning_repet.js` event rendering

**Files:**
- Modify: `app/assets/js/planning_repet.js:41-92`

**Interfaces:**
- Consumes: the `/api/events` JSON shape (`id, date, title, startTime, endTime, location, attire, weekend, response`) — unchanged.
- Produces: same visual output, but built via `textContent`/`createElement` instead of template-literal `innerHTML`, so no later caller needs to change.

No JS test runner exists for this project (see Global Constraints), so this
task is verified manually in Step 3 instead of an automated test.

- [ ] **Step 1: Implement**

Replace the `forEach` body in `loadEvents()` (currently lines 41-92 of `app/assets/js/planning_repet.js`) with DOM-construction helpers that never interpolate untrusted strings into HTML:

```javascript
      // Parcourir les événements et les ajouter à la liste
      storedEvents.forEach(function (event, _) {
        var li = document.createElement("li");
        var eventDate = new Date(event.date);

        var endDate = new Date(eventDate);
        endDate.setDate(endDate.getDate() + 1);

        var eventInfo = document.createElement("div");
        var dateLine;
        if (event.weekend) {
          dateLine = formatDateRangeText(eventDate, endDate);
        } else {
          dateLine = formatDate(eventDate);
        }

        appendInfoLine(eventInfo, null, dateLine, true);
        appendInfoLine(eventInfo, "Titre :", event.title);
        appendInfoLine(eventInfo, "Heure de début :", event.startTime.slice(0, 5));
        appendInfoLine(eventInfo, "Heure de fin :", event.endTime.slice(0, 5));
        appendInfoLine(eventInfo, "Lieu :", event.location);
        if (event.attire) {
          appendInfoLine(eventInfo, "Tenue :", event.attire);
        }

        li.appendChild(eventInfo);

        if (isAdmin) {
          li.appendChild(createDeleteElement(event));
          li.appendChild(createEditElement(event));
        }

        eventsList.appendChild(li);
      });
```

Add these two helpers near the top of the file (after `sortEventsByDate`, before `loadEvents`):

```javascript
// Appends a <p><strong>label</strong> value</p> line, or just <p><strong>value</strong></p>
// when boldValue is true and there is no label. All text goes through textContent,
// never innerHTML, so event data from the API can never inject markup.
function appendInfoLine(container, label, value, boldValue) {
  var p = document.createElement("p");
  if (label) {
    var strongLabel = document.createElement("strong");
    strongLabel.textContent = label + " ";
    p.appendChild(strongLabel);
    p.appendChild(document.createTextNode(value));
  } else if (boldValue) {
    var strongValue = document.createElement("strong");
    strongValue.textContent = value;
    p.appendChild(strongValue);
  } else {
    p.textContent = value;
  }
  container.appendChild(p);
}
```

Update `formatDate` and `formatDateRangeText` (currently lines 259-291) to
return plain strings instead of HTML — they no longer need to embed
`<strong>` tags themselves, since `appendInfoLine` now handles the bolding:

```javascript
// Fonction pour formater la date en "jour mois année"
function formatDate(date) {
  var options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return date.toLocaleDateString("fr-FR", options);
}

// Fonction pour formater la plage de dates en "du jour mois année au jour mois année"
function formatDateRangeText(startDate, endDate) {
  var options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  var formattedStartDate = startDate.toLocaleDateString("fr-FR", options);
  var formattedEndDate = endDate.toLocaleDateString("fr-FR", options);

  if (startDate.getFullYear() === endDate.getFullYear()) {
    formattedStartDate = startDate.toLocaleDateString("fr-FR", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  return `du ${formattedStartDate} au ${formattedEndDate}`;
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint:js`
Expected: no errors.

- [ ] **Step 3: Manual verification (no JS test runner in this project)**

```bash
npm run serve
```

In a browser: log in as `demo.admin` / `demo`, go to `/planning_repet`, and:
1. Confirm the existing seeded events still render with the same visible text (date, title, times, location, attire) as before the change.
2. Create a test event with title `<img src=x onerror=alert(1)>` via the admin form, save it, and confirm the title renders as **literal text** in the list (no alert box, no broken layout) — this is the regression check for the XSS fix.
3. Delete the test event afterward.

- [ ] **Step 4: Commit**

```bash
git add app/assets/js/planning_repet.js
git commit -m "fix(security): stop building event list via unescaped innerHTML (stored XSS)"
```

---

### Task 4: Gate the admin event-management form server-side in `planning_repet.php`

**Files:**
- Modify: `app/pages/planning_repet.php:1-14`

**Interfaces:**
- Consumes: `App\Auth::canManageEvents(): bool` (existing, `app/src/Auth.php:36`).
- Produces: no interface change — same page, same route, same client-side JS toggle stays as a secondary (now redundant but harmless) guard.

- [ ] **Step 1: Implement**

Edit `app/pages/planning_repet.php`, adding a `use` statement and wrapping the
`#admin-interface` block in a PHP condition instead of always emitting it:

```php
<?php

use App\Auth;

$pageTitle = 'Planning et répétitions';
$pageCss = 'planning_repet.css';
require __DIR__ . '/../partials/head.php'; ?>
<?php require __DIR__ . '/../partials/banner.php'; ?>
<?php require __DIR__ . '/../partials/navigation.php'; ?>

<section class="planning-repet-section">
  <h2>Planning des prestations et des répétitions</h2>
  <h3>sous réserve de modifications</h3>
  <h4>Saison 2023-2024</h4>
  <ul id="events-list"></ul>

  <?php if (Auth::canManageEvents()): ?>
  <!-- Interface de l'administrateur (rendue uniquement côté serveur pour les admins) -->
  <div id="admin-interface">
    <form id="event-form">
      <input type="number" id="event-id" name="event-id" hidden/>
      <label class="required" for="event-date">Date :</label>
      <input type="date" id="event-date" name="event-date" required /><br />
      <label class="required" for="event-title">Titre :</label>
      <input type="text" id="event-title" name="event-title" required /><br />
      <label class="required" for="event-time-start">Heure de début :</label>
      <input type="time" id="event-time-start" name="event-time-start" required /><br />
      <label class="required" for="event-time-end">Heure de fin :</label>
      <input type="time" id="event-time-end" name="event-time-end" required /><br />
      <label class="required" for="event-location">Lieu :</label>
      <input type="text" id="event-location" name="event-location" required />
      <label for="event-attire">Tenue :</label>
      <input type="text" id="event-attire" name="event-attire" /><br />
      <label for="event-weekend">
        <span style="float: left">Weekend</span>
        <input type="checkbox" id="event-weekend" name="event-weekend" />
      </label><br />
      <input type="submit" value="Ajouter" />
    </form>
  </div>
  <?php endif; ?>

  <!-- Résultat de l'ajout d'événement pour l'administrateur -->
  <div id="event-result" style="display: none">
    <h3>Événement ajouté :</h3>
    <div id="result-info">
      <p><strong>Date :</strong> <span id="result-date"></span></p>
      <p><strong>Titre :</strong> <span id="result-title"></span></p>
      <p><strong>Heure de début :</strong> <span id="result-time-start"></span></p>
      <p><strong>Heure de fin :</strong> <span id="result-time-end"></span></p>
      <p><strong>Lieu :</strong> <span id="result-location"></span></p>
      <p id="result-attire-label"><strong>Tenue :</strong> <span id="result-attire"></span></p>
      <p id="result-dates-label"><strong>Dates :</strong> <span id="result-dates"></span></p>
    </div>
  </div>
</section>

<?php require __DIR__ . '/../partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/js/planning_repet.js"></script>
</body>
</html>
```

Note `planning_repet.js`'s existing `if (isAdmin) { document.getElementById("admin-interface").style.display = "block"; }`
(line 11-13) now runs against an element that may not exist in the DOM for
non-admins — `getElementById` returns `null` in that case and the line would
throw. Guard it:

Edit `app/assets/js/planning_repet.js`, the `window.addEventListener("load", ...)` block (lines 6-14):

```javascript
window.addEventListener("load", function () {
  // Charger les événements
  loadEvents();

  // Le formulaire n'existe dans le DOM que pour les admins (rendu côté serveur).
  var adminInterface = document.getElementById("admin-interface");
  if (isAdmin && adminInterface) {
    adminInterface.style.display = "block";
  }
});
```

- [ ] **Step 2: Lint**

Run: `npm run lint:php && npm run lint:js`
Expected: no errors.

- [ ] **Step 3: Manual verification**

```bash
npm run serve
```

1. Log out (or use a private/incognito window) and visit `/planning_repet` — view page source and confirm no `#admin-interface` / `#event-form` markup is present anywhere in the HTML.
2. Log in as `demo.user` (a non-admin) and repeat — same check, form absent.
3. Log in as `demo.admin` and visit `/planning_repet` — confirm the event form still appears and still works (create/edit/delete an event).

- [ ] **Step 4: Commit**

```bash
git add app/pages/planning_repet.php app/assets/js/planning_repet.js
git commit -m "fix(security): render admin event form only for admins server-side"
```

---

### Task 5: Add method guard to `logout.php`

**Files:**
- Modify: `app/api/logout.php`

**Interfaces:**
- Consumes: nothing new.
- Produces: `POST /api/logout` behaves exactly as before; any other method now returns 405 instead of logging the visitor out.

- [ ] **Step 1: Write the failing test**

There is no existing PHPUnit coverage of any `app/api/*.php` file directly
(they're thin route handlers, not autoloaded classes) — matching that
existing convention, this task is verified manually rather than inventing a
new HTTP-testing harness for a one-line guard.

- [ ] **Step 2: Implement**

Edit `app/api/logout.php`:

```php
<?php

use App\Auth;

header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
    exit;
}

Auth::logout();
echo json_encode(['ok' => true]);
```

- [ ] **Step 3: Manual verification**

```bash
npm run serve
```

```bash
# Logged out already, but confirm GET is now rejected instead of silently "succeeding":
curl -i http://127.0.0.1:8090/api/logout
# Expected: HTTP/1.1 405 Method Not Allowed, body {"error":"Méthode non autorisée"}

curl -i -X POST http://127.0.0.1:8090/api/logout
# Expected: HTTP/1.1 200 OK, body {"ok":true}
```

Then log in via the browser and confirm the nav "Déconnexion" link (which
does `fetch("/api/logout", { method: "POST" })` in `main.js`) still logs you
out normally.

- [ ] **Step 4: Commit**

```bash
git add app/api/logout.php
git commit -m "fix(security): reject non-POST requests to /api/logout (CSRF logout)"
```

---

## PR 2 — API validation & reliability (branch `fix/api-validation-reliability`)

Covers C1 (silent weekend-flag reset), C2 (events.php validation gaps → uncaught
500s), C3 (contact.php missing length validation → uncaught 500, + V1 French
variable names in the same file), C4 (responses.php missing-event → uncaught
500), C5 (stale-session crash in `ResponseRepository::record`). **Depends on
PR 1 Task 1** (`UserRepository::findByUsername` returning `id`).

### File Structure

- **Modify** `app/src/Repositories/EventRepository.php` — preserve `weekend` on partial update; add `exists()`.
- **Modify** `app/api/events.php` — validate all required fields (scalar, non-empty) on both POST and PUT.
- **Modify** `app/api/contact.php` — length validation + English variable names.
- **Modify** `app/api/responses.php` — check event existence, resolve session user via `UserRepository`.
- **Modify** `app/src/Repositories/ResponseRepository.php` — `record()` takes `int $userId` instead of `string $username`.
- **Modify/Create** integration tests for each repository change.

---

### Task 6: `EventRepository::update` — preserve `weekend` when omitted, add `exists()`

**Files:**
- Modify: `app/src/Repositories/EventRepository.php`
- Modify: `tests/Integration/EventRepositoryTest.php`

**Interfaces:**
- Consumes: nothing new.
- Produces: `update(array $e): void` — same signature; when `$e` has no `'weekend'` key, the existing DB value is preserved instead of being reset to `0`. New method `exists(int $id): bool`. PR 2 Task 9 (`responses.php`) calls `exists()`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/Integration/EventRepositoryTest.php`:

```php
public function testUpdateWithoutWeekendKeyPreservesExistingWeekendFlag(): void
{
    $repo = new EventRepository($this->db);
    $repo->update([
        'id'        => 1,
        'date'      => '2026-08-23',
        'title'     => 'Répétition modifiée',
        'startTime' => '11:00:00',
        'endTime'   => '13:00:00',
        'location'  => 'Werkhof',
        'attire'    => 'Libre',
        'weekend'   => 1,
    ]);

    // Second update omits 'weekend' entirely — it must stay 1, not reset to 0.
    $repo->update([
        'id'        => 1,
        'date'      => '2026-08-23',
        'title'     => 'Répétition modifiée à nouveau',
        'startTime' => '11:00:00',
        'endTime'   => '13:00:00',
        'location'  => 'Werkhof',
        'attire'    => 'Libre',
    ]);

    $event = $this->eventById($repo->all(), 1);
    $this->assertSame(1, $event['weekend']);
}

public function testExistsReturnsTrueForKnownEvent(): void
{
    $repo = new EventRepository($this->db);
    $this->assertTrue($repo->exists(1));
}

public function testExistsReturnsFalseForUnknownEvent(): void
{
    $repo = new EventRepository($this->db);
    $this->assertFalse($repo->exists(999999));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:php -- --filter EventRepositoryTest`
Expected: FAIL — the weekend test fails because the second `update()` resets `weekend` to `0`; the `exists` tests fail with "Call to undefined method".

- [ ] **Step 3: Implement**

Edit `app/src/Repositories/EventRepository.php`, replacing `update()` (lines 76-96) and adding `exists()`:

```php
    public function update(array $e): void
    {
        $id = (int) $e['id'];
        $weekend = array_key_exists('weekend', $e) ? (int) $e['weekend'] : $this->currentWeekend($id);
        $sql = "UPDATE events SET date=?, title=?, start_time=?, end_time=?,
                location=?, attire=?, weekend=? WHERE id=?";
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param(
            'ssssssii',
            $e['date'],
            $e['title'],
            $e['startTime'],
            $e['endTime'],
            $e['location'],
            $e['attire'],
            $weekend,
            $id
        );
        $stmt->execute();
        $stmt->close();
    }

    /** The event's current 'weekend' flag, or 0 if the event doesn't exist. */
    private function currentWeekend(int $id): int
    {
        $stmt = $this->db->prepare('SELECT weekend FROM events WHERE id = ?');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ? (int) $row['weekend'] : 0;
    }

    public function exists(int $id): bool
    {
        $stmt = $this->db->prepare('SELECT 1 FROM events WHERE id = ? LIMIT 1');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $found = $stmt->get_result()->num_rows > 0;
        $stmt->close();
        return $found;
    }

    /** Delete an event; its responses go via the FK ON DELETE CASCADE. */
    public function delete(int $id): void
    {
        $stmt = $this->db->prepare('DELETE FROM events WHERE id = ?');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $stmt->close();
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:php -- --filter EventRepositoryTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/Repositories/EventRepository.php tests/Integration/EventRepositoryTest.php
git commit -m "fix(events): preserve weekend flag on partial update, add exists()"
```

---

### Task 7: `events.php` — require full field set and reject non-scalar values on POST and PUT

**Files:**
- Modify: `app/api/events.php`

**Interfaces:**
- Consumes: `EventRepository::update()` (Task 6, unchanged signature).
- Produces: no interface change — same JSON request/response shape. PUT now returns 400 for a payload missing any of `date/title/startTime/endTime/location/attire`, matching POST's existing requirement; both now reject non-scalar values for those fields with 400 instead of crashing.

- [ ] **Step 1: Implement**

There's no PHPUnit coverage of `app/api/*.php` files directly (see Task 5's
note) — this task is verified manually via `curl` in Step 2.

Edit `app/api/events.php`:

```php
<?php

use App\Auth;
use App\Database;
use App\Repositories\EventRepository;

header('Content-Type: application/json');
$repo = new EventRepository(Database::get());
$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true) ?? [];
if ($method === 'GET') {
    // Reading events is public. Logged-in users additionally see each event
    // annotated with THEIR OWN response; anonymous visitors get null responses.
    // (No ?username= param exists, so the old IDOR stays closed.)
    if (Auth::check()) {
        echo json_encode($repo->allForUser(Auth::user()['username']));
    } else {
        echo json_encode($repo->all());
    }
    exit;
}

// All writes (create/update/delete events) require the manage_events capability (admin).
Auth::requireCanManageEvents();

if ($method === 'POST' || $method === 'PUT') {
    foreach (['date', 'title', 'startTime', 'endTime', 'location', 'attire'] as $k) {
        if (!isset($data[$k]) || !is_string($data[$k]) || trim($data[$k]) === '') {
            http_response_code(400);
            echo json_encode(['error' => "Champ manquant ou invalide: {$k}"]);
            exit;
        }
    }

    if ($method === 'POST') {
        $repo->create($data);
        http_response_code(201);
        echo json_encode(['ok' => true]);
        exit;
    }

    // PUT also needs a valid id.
    $id = (int) ($data['id'] ?? 0);
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'id manquant ou invalide']);
        exit;
    }
    $repo->update($data);
    echo json_encode(['ok' => true]);
    exit;
}

if ($method === 'DELETE') {
    $id = (int) ($_GET['id'] ?? 0);
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'id invalide']);
        exit;
    }
    $repo->delete($id);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Méthode non autorisée']);
```

Note: `attire` is nullable in the DB schema (`varchar(255) DEFAULT NULL`) but
the frontend form always submits it as a string (possibly empty for "no
attire specified"); requiring a non-empty string here matches the existing
POST behavior exactly (POST already required all six fields via `empty()`,
which already rejected an empty-string `attire`) — this task only extends
that same rule to PUT and tightens the check from `empty()` (which allows
non-empty arrays through) to an explicit `is_string` + non-empty-after-trim
check.

- [ ] **Step 2: Manual verification**

```bash
npm run serve
```

Log in as `demo.admin` in a browser first to get a valid session cookie, then
copy that cookie for `curl -b`:

```bash
# Missing field on PUT now 400s instead of crashing:
curl -i -b "PHPSESSID=<paste-from-browser-devtools>" -X PUT http://127.0.0.1:8090/api/events \
  -H 'Content-Type: application/json' -d '{"id":1}'
# Expected: HTTP/1.1 400, {"error":"Champ manquant ou invalide: date"} (or similar)

# Non-scalar field on POST now 400s instead of a TypeError/500:
curl -i -b "PHPSESSID=<paste-from-browser-devtools>" -X POST http://127.0.0.1:8090/api/events \
  -H 'Content-Type: application/json' \
  -d '{"date":{"a":1},"title":"x","startTime":"10:00:00","endTime":"11:00:00","location":"x","attire":"x"}'
# Expected: HTTP/1.1 400, {"error":"Champ manquant ou invalide: date"}
```

Then confirm the normal admin flow (create/edit event via the `/planning_repet`
form) still works end to end.

- [ ] **Step 3: Commit**

```bash
git add app/api/events.php
git commit -m "fix(events): validate required fields on PUT, reject non-scalar values"
```

---

### Task 8: `contact.php` — add length validation, rename to English identifiers

**Files:**
- Modify: `app/api/contact.php`

**Interfaces:**
- Consumes: nothing new.
- Produces: no wire-format change — same `$_POST` keys (`nom`, `prenom`, `email`, `sujet`, `message`; those are form-field names the frontend already sends and are out of scope for the English-identifiers rule, which covers *code* identifiers, not the wire format) and same response shape. Internal PHP variable names change from French to English per `CLAUDE.md`'s Language rule; oversized fields now 400 instead of crashing.

- [ ] **Step 1: Implement**

No PHPUnit coverage of `app/api/*.php` exists (see Task 5's note) — verified
manually in Step 2.

Edit `app/api/contact.php`:

```php
<?php

use App\Database;

header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
    exit;
}

$lastName  = trim((string) ($_POST['nom'] ?? ''));
$firstName = trim((string) ($_POST['prenom'] ?? ''));
$email     = filter_var((string) ($_POST['email'] ?? ''), FILTER_SANITIZE_EMAIL);
$subject   = trim((string) ($_POST['sujet'] ?? ''));
$message   = trim((string) ($_POST['message'] ?? ''));

if (
    $lastName === '' || $firstName === '' || $subject === '' || $message === ''
    || !filter_var($email, FILTER_VALIDATE_EMAIL)
    || mb_strlen($lastName) > 255 || mb_strlen($firstName) > 255
    || mb_strlen($email) > 255 || mb_strlen($subject) > 255
) {
    http_response_code(400);
    echo json_encode(['error' => 'Formulaire invalide']);
    exit;
}

// Store raw input; escape at output time (not at storage time).
$db = Database::get();
$stmt = $db->prepare('INSERT INTO contact_messages (last_name, first_name, email, subject, message)
     VALUES (?, ?, ?, ?, ?)');
$stmt->bind_param('sssss', $lastName, $firstName, $email, $subject, $message);
$stmt->execute();
$stmt->close();
echo json_encode(['ok' => true]);
```

(`message` maps to a `text` column with no length cap, so it intentionally
has no `mb_strlen` check, matching the schema.)

- [ ] **Step 2: Manual verification**

```bash
npm run serve
```

```bash
# Oversized subject now 400s instead of an uncaught mysqli_sql_exception:
curl -i -X POST http://127.0.0.1:8090/api/contact \
  -d "nom=Dupont&prenom=Jean&email=jean@example.com&sujet=$(printf 'a%.0s' {1..300})&message=hi"
# Expected: HTTP/1.1 400, {"error":"Formulaire invalide"}

# Valid submission still works:
curl -i -X POST http://127.0.0.1:8090/api/contact \
  -d "nom=Dupont&prenom=Jean&email=jean@example.com&sujet=Bonjour&message=Un message de test"
# Expected: HTTP/1.1 200, {"ok":true}
```

Then submit the real `/contact` page form in a browser once to confirm the
end-to-end flow (including the email notification, if configured) is unaffected.

- [ ] **Step 3: Commit**

```bash
git add app/api/contact.php
git commit -m "fix(contact): validate field length, use English identifiers"
```

---

### Task 9: `responses.php` — 404 on a nonexistent event instead of crashing

**Files:**
- Modify: `app/api/responses.php`

**Interfaces:**
- Consumes: `EventRepository::exists()` (Task 6).
- Produces: no wire-format change. `POST /api/responses` with a nonexistent `eventId` now returns `404 {"error":"Événement introuvable"}` instead of an uncaught 500.

- [ ] **Step 1: Implement**

Edit `app/api/responses.php`, adding the `EventRepository` import and the
existence check right after the existing shape validation:

```php
<?php

use App\Auth;
use App\Database;
use App\Repositories\EventRepository;
use App\Repositories\ResponseRepository;

header('Content-Type: application/json');
$repo = new ResponseRepository(Database::get());
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST') {
    // A logged-in user records THEIR OWN answer (username from session).
    // Only user/moderator may respond — admin (Team Direction) must not vote.
    Auth::requireCanRespond();
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $eventId = (int) ($data['eventId'] ?? 0);
    $participation = (string) ($data['participation'] ?? '');
    if ($eventId <= 0 || !in_array($participation, ['participate', 'notparticipate'], true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Données manquantes']);
        exit;
    }
    $eventRepo = new EventRepository(Database::get());
    if (!$eventRepo->exists($eventId)) {
        http_response_code(404);
        echo json_encode(['error' => 'Événement introuvable']);
        exit;
    }
    $repo->record(Auth::user()['username'], $eventId, $participation);
    http_response_code(201);
    echo json_encode(['ok' => true]);
    exit;
}

if ($method === 'GET') {
    // Admin-only summary of all users' answers for an event.
    Auth::requireCanViewSummary();
    $eventId = (int) ($_GET['eventId'] ?? 0);
    if ($eventId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'eventId manquant']);
        exit;
    }
    // Only list users whose role may respond; non-voting roles (admin) are excluded.
    echo json_encode($repo->allForEvent($eventId, Auth::rolesWithCapability('respond')));
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Méthode non autorisée']);
```

(This task deliberately leaves `$repo->record(Auth::user()['username'], ...)`
as-is — Task 10 changes that call to take a resolved user id instead, in the
same PR but its own commit, since it's a distinct fix for a distinct finding.)

- [ ] **Step 2: Manual verification**

```bash
npm run serve
```

Log in as `demo.user` in a browser, copy the session cookie:

```bash
curl -i -b "PHPSESSID=<paste>" -X POST http://127.0.0.1:8090/api/responses \
  -H 'Content-Type: application/json' -d '{"eventId":999999,"participation":"participate"}'
# Expected: HTTP/1.1 404, {"error":"Événement introuvable"}

curl -i -b "PHPSESSID=<paste>" -X POST http://127.0.0.1:8090/api/responses \
  -H 'Content-Type: application/json' -d '{"eventId":1,"participation":"participate"}'
# Expected: HTTP/1.1 201, {"ok":true}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/responses.php
git commit -m "fix(responses): return 404 for a nonexistent event instead of crashing"
```

---

### Task 10: `ResponseRepository::record` — take a resolved `userId`, fixing the stale-session crash

**Files:**
- Modify: `app/src/Repositories/ResponseRepository.php`
- Modify: `app/api/responses.php`
- Modify: `tests/Integration/ResponseRepositoryTest.php`

**Interfaces:**
- Consumes: `UserRepository::findByUsername()` (PR 1 Task 1 — **hard dependency**, must be merged first).
- Produces: `ResponseRepository::record(int $userId, int $eventId, string $answer): void` — signature changes from `(string $username, int $eventId, string $answer)`. No other caller in the codebase besides `app/api/responses.php` (grep confirms this — verify again before merging in case another PR added one).

Design: resolving the user id in `responses.php` (which already has `Auth::user()['username']`
and can call `UserRepository::findByUsername`) removes the fragile
`(SELECT id FROM users WHERE username = ?)` subquery from the INSERT
entirely — a session for a deleted/renamed user now surfaces as a clean 401
at the API layer instead of an uncaught NOT-NULL constraint violation deep in
the repository.

- [ ] **Step 1: Write the failing test**

Edit `tests/Integration/ResponseRepositoryTest.php`, updating every call site
(the existing tests pass a username string — update them to pass the numeric
id) and note the signature no longer accepts a nonexistent user gracefully by
design (that's now `responses.php`'s job, tested manually per Task 5's
convention note):

```php
<?php

use App\Repositories\ResponseRepository;

final class ResponseRepositoryTest extends IntegrationTestCase
{
    private function responseFor(array $summary, string $username): ?array
    {
        foreach ($summary as $row) {
            if ($row['username'] === $username) {
                return $row;
            }
        }
        return null;
    }

    public function testRecordInsertsNewResponse(): void
    {
        $repo = new ResponseRepository($this->db);
        $repo->record(7, 1, 'participate'); // id 7 = sam.beispiel (see 02-seed.sql)

        $entry = $this->responseFor($repo->allForEvent(1, ['user', 'moderator']), 'sam.beispiel');

        $this->assertSame('participate', $entry['response']);
    }

    public function testRecordUpsertsExistingResponse(): void
    {
        // demo.user (id 1) already has 'participate' for event 1 in the seed data.
        $repo = new ResponseRepository($this->db);
        $repo->record(1, 1, 'notparticipate');

        $entry = $this->responseFor($repo->allForEvent(1, ['user', 'moderator']), 'demo.user');

        $this->assertSame('notparticipate', $entry['response']);
    }

    public function testAllForEventExcludesNonRespondingRoles(): void
    {
        $repo = new ResponseRepository($this->db);

        $usernames = array_column($repo->allForEvent(1, ['user', 'moderator']), 'username');

        $this->assertNotContains('demo.admin', $usernames);
    }

    public function testAllForEventReturnsEmptyForNoRespondingRoles(): void
    {
        $repo = new ResponseRepository($this->db);

        $this->assertSame([], $repo->allForEvent(1, []));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:php -- --filter ResponseRepositoryTest`
Expected: FAIL — `record(7, 1, 'participate')` currently binds `7` (an int) into the `'sis'` bind-param string type slot meant for a username, so either a type-coercion mismatch or (since `record`'s SQL still does the subquery on a string param) a wrong/empty match. Confirms the old signature doesn't accept an id.

- [ ] **Step 3: Implement**

Edit `app/src/Repositories/ResponseRepository.php`:

```php
<?php

namespace App\Repositories;

use mysqli;

final class ResponseRepository
{
    public function __construct(private mysqli $db)
    {
    }

    /** Record (or change) a user's answer for an event. Upsert on (user, event). */
    public function record(int $userId, int $eventId, string $answer): void
    {
        $sql = "INSERT INTO responses (user_id, event_id, answer)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE answer = VALUES(answer)";
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('iis', $userId, $eventId, $answer);
        $stmt->execute();
        $stmt->close();
    }

    /**
     * Every eligible user + instrument + their answer for one event (summary).
     * Only users whose role may respond are listed — non-voting roles (e.g. the
     * admin / Team Direction) are excluded so "Pas de réponse" stays meaningful.
     * $respondingRoles comes from Auth::rolesWithCapability('respond').
     */
    public function allForEvent(int $eventId, array $respondingRoles): array
    {
        if ($respondingRoles === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($respondingRoles), '?'));
        $sql = "SELECT u.username AS username, i.name AS instrument,
                   (SELECT r.answer FROM responses r
                    WHERE r.user_id = u.id AND r.event_id = ? LIMIT 1) AS response
                FROM users u
                LEFT JOIN instruments i ON u.instrument_id = i.id
                WHERE u.role IN ($placeholders)
                ORDER BY COALESCE(
                    (SELECT r.answer FROM responses r
                     WHERE r.user_id = u.id AND r.event_id = ? LIMIT 1), ''
                ) DESC, u.username";
        $stmt = $this->db->prepare($sql);
        // Bind order follows placeholder order: eventId (SELECT), roles (WHERE), eventId (ORDER BY).
        $types = 'i' . str_repeat('s', count($respondingRoles)) . 'i';
        $params = array_merge([$eventId], $respondingRoles, [$eventId]);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }
}
```

(`allForEvent` is untouched here — its double-subquery cleanup is PR 5 Task 16, a separate non-behavioral change.)

Edit `app/api/responses.php`'s POST branch (from Task 9's version), resolving
the user id and returning 401 if the session's user no longer exists:

```php
    $eventRepo = new EventRepository(Database::get());
    if (!$eventRepo->exists($eventId)) {
        http_response_code(404);
        echo json_encode(['error' => 'Événement introuvable']);
        exit;
    }
    $userRepo = new \App\Repositories\UserRepository(Database::get());
    $sessionUser = $userRepo->findByUsername(Auth::user()['username']);
    if ($sessionUser === null) {
        http_response_code(401);
        echo json_encode(['error' => 'Session invalide']);
        exit;
    }
    $repo->record((int) $sessionUser['id'], $eventId, $participation);
    http_response_code(201);
    echo json_encode(['ok' => true]);
    exit;
```

Add `use App\Repositories\UserRepository;` to the top `use` block instead of
the inline FQCN, matching the file's existing style:

```php
use App\Auth;
use App\Database;
use App\Repositories\EventRepository;
use App\Repositories\ResponseRepository;
use App\Repositories\UserRepository;
```

and change the inline `\App\Repositories\UserRepository` reference above to
just `UserRepository`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:php -- --filter ResponseRepositoryTest`
Expected: PASS

Then the full suite (this touches a shared repository method):

Run: `npm run test:php`
Expected: PASS

- [ ] **Step 5: Manual verification**

```bash
npm run serve
```

Log in as `demo.user`, submit a response via the `/inscriptions_utilisateurs`
page UI, and confirm it still records correctly (check `/inscriptions_admin`
as `demo.admin` to see the summary update).

- [ ] **Step 6: Commit**

```bash
git add app/src/Repositories/ResponseRepository.php app/api/responses.php tests/Integration/ResponseRepositoryTest.php
git commit -m "fix(responses): resolve session user to an id before recording (fixes stale-session crash)"
```

---

## PR 3 — Admin JS reliability (branch `fix/admin-js-reliability`)

Covers J1 (missing `response.ok` checks on save/delete) and J2 (no
double-submit guard). Folded into a single refactor of the event-form submit
handler and the delete handler in `planning_repet.js`, since fixing J1
properly means restructuring the same code J2 touches — this also happens to
resolve the "duplicated create/update fetch block" cleanup finding as a side
effect, noted in the design spec. No dependency on other PRs (works against
whatever `planning_repet.js` looks like after PR 1 Task 3/4's XSS and
admin-gating changes — rebase this branch on top of PR 1 before starting, or
resolve the merge conflict when combining).

### File Structure

- **Modify** `app/assets/js/planning_repet.js` — `saveEvent()` helper, `response.ok` checks, submit-button disable/re-enable, delete-response check.

---

### Task 11: Refactor save/delete to check `response.ok` and guard double-submit

**Files:**
- Modify: `app/assets/js/planning_repet.js`

**Interfaces:**
- Consumes: `/api/events` (unchanged wire format; PR 2 Task 7 makes the server 400 more often on bad input, which this task now surfaces to the admin instead of silently ignoring).
- Produces: no interface change for other files — this is the last consumer-facing change to this file's submit/delete handlers.

No JS test runner exists (see Global Constraints) — verified manually in Step 2.

- [ ] **Step 1: Implement**

Replace the event-form submit handler (the `document.getElementById("event-form").addEventListener("submit", ...)` block) and `createDeleteElement`'s fetch call in `app/assets/js/planning_repet.js`:

```javascript
// Gérer la soumission du formulaire
var eventForm = document.getElementById("event-form");
if (eventForm) {
  eventForm.addEventListener("submit", function (e) {
    e.preventDefault();

    var eventId = document.getElementById("event-id").value;
    var newEvent = {
      id: eventId,
      date: document.getElementById("event-date").value,
      title: document.getElementById("event-title").value,
      startTime: document.getElementById("event-time-start").value,
      endTime: document.getElementById("event-time-end").value,
      location: document.getElementById("event-location").value,
      attire: document.getElementById("event-attire").value,
      weekend: document.getElementById("event-weekend").checked,
    };

    var submitButton = eventForm.querySelector('input[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
    }

    saveEvent(eventId ? "PUT" : "POST", newEvent)
      .then(function () {
        displayResult(newEvent);
        eventForm.reset();
        loadEvents();
      })
      .catch(function (error) {
        console.error("Erreur lors de l'enregistrement de l'événement : ", error);
        alert("L'enregistrement de l'événement a échoué. Veuillez réessayer.");
      })
      .finally(function () {
        if (submitButton) {
          submitButton.disabled = false;
        }
      });
  });
}

// Envoie l'événement au serveur (création ou modification) et rejette si la
// réponse n'est pas OK, pour que l'appelant sache distinguer succès et échec.
function saveEvent(method, event) {
  return fetch("/api/events", {
    method: method,
    body: JSON.stringify(event),
    headers: {
      "Content-Type": "application/json",
    },
  }).then(function (response) {
    if (!response.ok) {
      throw new Error("Échec de l'enregistrement (HTTP " + response.status + ")");
    }
    return response.json();
  });
}
```

And `createDeleteElement`'s click handler:

```javascript
  deleteElement.addEventListener("click", function () {
    if (confirm("Êtes-vous sûr de vouloir supprimer cet événement?")) {
      fetch("/api/events?id=" + event.id, {
        method: "DELETE",
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error("Échec de la suppression (HTTP " + response.status + ")");
          }
          loadEvents();
        })
        .catch(function (error) {
          console.error("Failed to delete event: ", error);
          alert("La suppression de l'événement a échoué. Veuillez réessayer.");
        });
    }
  });
```

- [ ] **Step 2: Manual verification**

```bash
npm run lint:js
npm run serve
```

Log in as `demo.admin`, go to `/planning_repet`:
1. Create a valid event — confirm it still saves, shows the result panel, and appears in the list (happy path unchanged).
2. Rapidly double-click the "Ajouter" submit button — confirm only one event is created (the button should visibly disable on click).
3. Simulate a failure: open devtools → Network tab → set "Offline", then try to save an event — confirm an alert appears instead of the form silently resetting as if it succeeded; go back online afterward.
4. Delete an event normally — confirm the list refreshes and the event is gone.
5. Edit an existing event and save — confirm the update is reflected in the list.

- [ ] **Step 3: Commit**

```bash
git add app/assets/js/planning_repet.js
git commit -m "fix(admin-js): check response.ok before reporting success, guard double-submit"
```

---

## PR 4 — Auth UX & migration ordering (branch `fix/auth-ux-migration-order`)

Covers C6 (`Migrator` lexicographic sort), C7 (lost post-login redirect
target), C8 (RSVP page missing capability check). No dependency on other PRs.

### File Structure

- **Modify** `app/src/Migrator.php` — natural sort instead of `SORT_STRING`.
- **Modify** `tests/Integration/MigratorTest.php` — regression test for digit-width ordering.
- **Modify** `app/pages/admin.php`, `app/pages/inscriptions_admin.php` — pass the page's own route name to `requireLoginPage`.
- **Modify** `app/pages/inscriptions_utilisateurs.php` — add a server-side `respond` capability check.

---

### Task 12: `Migrator` — natural sort instead of lexicographic

**Files:**
- Modify: `app/src/Migrator.php:27-33`
- Modify: `tests/Integration/MigratorTest.php`

**Interfaces:**
- Consumes: nothing new.
- Produces: `files(string $dir): array` (private) now returns files in natural numeric order; `pending()` and `migrate()` (both public, unchanged signatures) inherit the corrected order.

- [ ] **Step 1: Write the failing test**

Add to `tests/Integration/MigratorTest.php`. Because this file already manages
its own fixture files/cleanup (DDL escapes the transaction rollback — see the
class docblock), follow its existing `setUp`/`tearDown` pattern rather than
adding a second temp directory:

```php
    public function testPendingOrdersFilesNaturallyAcrossDigitWidths(): void
    {
        // Same directory as setUp's 900/901 fixtures, plus an out-of-width one:
        // lexicographic (SORT_STRING) would sort '9000_...' before '901_...'
        // because '9' < '9' but then '0' < '0'... actually the clearer minimal
        // case is a two-digit vs three-digit prefix within the same test run.
        file_put_contents($this->dir . '/1000_migrator_test_late.sql', 'SELECT 1;');
        $this->versions[] = '1000_migrator_test_late.sql';

        $pending = (new Migrator($this->db))->pending($this->dir);

        // Natural order: 900, 901, 1000 — not lexicographic (which would put
        // '1000_...' before '900_...' since '1' < '9' as the first character).
        $this->assertSame(
            ['900_migrator_test_create.sql', '901_migrator_test_seed.sql', '1000_migrator_test_late.sql'],
            $pending
        );
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:php -- --filter testPendingOrdersFilesNaturallyAcrossDigitWidths`
Expected: FAIL — current `sort($files, SORT_STRING)` puts `1000_migrator_test_late.sql` first (`'1' < '9'` lexicographically), so the assertion order doesn't match.

- [ ] **Step 3: Implement**

Edit `app/src/Migrator.php`, replacing the `files()` method:

```php
    /** Migration files in ascending numeric order (not plain lexicographic —
     * '10_x.sql' must sort after '2_y.sql', and '1000_x.sql' after '999_y.sql'). */
    private function files(string $dir): array
    {
        $files = glob(rtrim($dir, '/') . '/[0-9]*.sql') ?: [];
        usort($files, static fn(string $a, string $b): int => strnatcmp(basename($a), basename($b)));
        return $files;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:php -- --filter MigratorTest`
Expected: PASS (all `MigratorTest` tests, including the new one)

- [ ] **Step 5: Commit**

```bash
git add app/src/Migrator.php tests/Integration/MigratorTest.php
git commit -m "fix(migrator): use natural sort so digit-width changes can't misorder migrations"
```

---

### Task 13: Fix lost post-login redirect target on `admin.php` and `inscriptions_admin.php`

**Files:**
- Modify: `app/pages/admin.php:5`
- Modify: `app/pages/inscriptions_admin.php:5`

**Interfaces:**
- Consumes: `Auth::requireLoginPage(string $returnTo): void` (existing, unchanged) — this task only changes the argument passed, mirroring the pattern already used correctly in `app/pages/signups_admin.php:6` (`Auth::requireLoginPage('signups_admin')`).
- Produces: no interface change.

- [ ] **Step 1: Implement**

Edit `app/pages/admin.php`, line 5:

```php
Auth::requireLoginPage('admin');
```

Edit `app/pages/inscriptions_admin.php`, line 5:

```php
Auth::requireLoginPage('inscriptions_admin');
```

- [ ] **Step 2: Manual verification**

```bash
npm run serve
```

In a private/incognito browser window (logged out):
1. Visit `/admin` directly — confirm you're redirected to
   `/authentification_inscription?returnTo=admin`, log in as `demo.admin`, and
   confirm you land back on `/admin` (not `/`).
2. Repeat for `/inscriptions_admin` (log in as `demo.admin` again).

- [ ] **Step 3: Commit**

```bash
git add app/pages/admin.php app/pages/inscriptions_admin.php
git commit -m "fix(auth): preserve post-login redirect target for admin pages"
```

---

### Task 14: Add server-side `respond` capability check to `inscriptions_utilisateurs.php`

**Files:**
- Modify: `app/pages/inscriptions_utilisateurs.php:1-5`

**Interfaces:**
- Consumes: `Auth::canRespond(): bool` (existing, `app/src/Auth.php:46`) — mirrors the exact pattern already used in `app/pages/admin.php:6-9` and `app/pages/inscriptions_admin.php:6-9` (`requireLoginPage` then a manual capability check + 403 exit).
- Produces: no interface change. An admin visiting this page now gets an
  immediate 403 instead of a fully-rendered form that fails confusingly at
  submit time.

- [ ] **Step 1: Implement**

Edit `app/pages/inscriptions_utilisateurs.php`, lines 1-5:

```php
<?php

use App\Auth;

Auth::requireLoginPage('sinscrire');
if (!Auth::canRespond()) {
    http_response_code(403);
    exit('Accès refusé');
}
?>
```

- [ ] **Step 2: Manual verification**

```bash
npm run serve
```

1. Log in as `demo.admin` and visit `/inscriptions_utilisateurs` directly —
   confirm you now get a plain "Accès refusé" 403 page instead of the RSVP form.
2. Log in as `demo.user` (or `demo.moderator`) and visit the same page —
   confirm the RSVP form still renders and submitting it still works.

- [ ] **Step 3: Commit**

```bash
git add app/pages/inscriptions_utilisateurs.php
git commit -m "fix(auth): reject non-responding roles on the RSVP page server-side"
```

---

## PR 5 — Cleanup (branch `chore/dedupe-api-and-date-helpers`)

No bugs here — pure maintainability. Covers the three remaining cleanup
findings not already resolved as a side effect of PR 2/3. No dependency on
other PRs, but touches files PRs 1-4 also touch (`app/api/*.php`,
`ResponseRepository.php`, `planning_repet.js`) — **rebase onto the other 4
PRs' final state before starting**, or expect merge conflicts.

### File Structure

- **Create** `app/src/Http/JsonResponse.php` — tiny shared helper for the repeated `Content-Type` + 405 boilerplate.
- **Modify** `app/api/contact.php`, `app/api/events.php`, `app/api/login.php`, `app/api/logout.php`, `app/api/responses.php` (and `app/api/signups.php`/`app/api/altcha.php` if the `souper_signup` feature files also use the pattern — check before excluding them) — use the helper.
- **Modify** `app/src/Repositories/ResponseRepository.php` — `allForEvent()` single `LEFT JOIN` instead of double subquery.
- **Modify** `app/assets/js/main.js` — add `formatFrenchDate()`.
- **Modify** `app/assets/js/planning_repet.js`, `app/assets/js/sinscrire.js` — use the shared helper.

---

### Task 15: Shared JSON-error helper for `app/api/*.php`

**Files:**
- Create: `app/src/Http/JsonResponse.php`
- Modify: every file under `app/api/` that has the `header('Content-Type: application/json')` + 405 block (grep for `Méthode non autorisée` to find them all — confirmed present in `contact.php`, `events.php`, `login.php`, `responses.php`, `signups.php` as of the 2026-07-20 review; re-grep before starting since PRs 1-2 touch some of these files first)
- Test: `tests/Unit/JsonResponseTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `App\Http\JsonResponse::methodNotAllowed(): never` — sets the header, sets HTTP 405, echoes `{"error":"Méthode non autorisée"}`, and exits.
  - `App\Http\JsonResponse::error(int $status, string $message): never` — sets the header, sets the given status, echoes `{"error": $message}`, and exits. (A generalization so call sites with other error messages, e.g. `contact.php`'s `'Formulaire invalide'`, can use it too, but this task only wires up the `methodNotAllowed()` call sites — broader adoption is a natural follow-up, not required here.)

- [ ] **Step 1: Write the failing test**

Create `tests/Unit/JsonResponseTest.php`. Since the real methods call `exit`,
test the pure string-building indirectly isn't possible without a process
boundary — instead, extract the header/body-building logic into a testable
pure method and have the `exit`-ing public methods call it, matching how
`app/src/Auth.php`'s `requireCapability` already accepts this untestable-exit
tradeoff for its guard methods (no existing test covers `Auth::requireLogin`'s
`exit` path either — this project's convention is to leave `exit`-based guards
manually verified):

```php
<?php

use App\Http\JsonResponse;
use PHPUnit\Framework\TestCase;

final class JsonResponseTest extends TestCase
{
    public function testErrorBodyShape(): void
    {
        $this->assertSame('{"error":"Méthode non autorisée"}', JsonResponse::errorBody('Méthode non autorisée'));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:php -- --filter JsonResponseTest`
Expected: FAIL — class doesn't exist yet.

- [ ] **Step 3: Implement**

Create `app/src/Http/JsonResponse.php`:

```php
<?php

namespace App\Http;

final class JsonResponse
{
    /** The JSON body for a {"error": ...} response — pure, no I/O, unit-testable. */
    public static function errorBody(string $message): string
    {
        return json_encode(['error' => $message]);
    }

    /** Emits a JSON {"error": ...} response with the given status and exits. */
    public static function error(int $status, string $message): never
    {
        header('Content-Type: application/json');
        http_response_code($status);
        echo self::errorBody($message);
        exit;
    }

    /** Emits the standard 405 response every app/api/*.php endpoint uses on an unhandled method. */
    public static function methodNotAllowed(): never
    {
        self::error(405, 'Méthode non autorisée');
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:php -- --filter JsonResponseTest`
Expected: PASS

- [ ] **Step 5: Wire up call sites**

In each of `app/api/contact.php`, `app/api/events.php`, `app/api/login.php`,
`app/api/responses.php` (re-grep `app/api/signups.php` and any other file
under `app/api/` for the same pattern before finalizing this list — PRs 1-2
may have touched line numbers), replace:

```php
http_response_code(405);
echo json_encode(['error' => 'Méthode non autorisée']);
exit; // (or the fallthrough end-of-file, whichever the file currently has)
```

with:

```php
\App\Http\JsonResponse::methodNotAllowed();
```

and add `use App\Http\JsonResponse;` to each file's `use` block, then replace
the call with the unqualified `JsonResponse::methodNotAllowed();`. Also
replace the standalone `header('Content-Type: application/json');` line at
the top of each of these files — it becomes redundant only for the 405 path
(the helper sets it itself); **do not remove the top-of-file header line**,
since it's still needed for every non-405 success/error response in the same
file that doesn't go through `JsonResponse`.

- [ ] **Step 6: Run full PHP suite and lint**

Run: `npm run lint:php && npm run test:php`
Expected: PASS

- [ ] **Step 7: Manual verification**

```bash
npm run serve
curl -i -X PATCH http://127.0.0.1:8090/api/events
# Expected: HTTP/1.1 405, {"error":"Méthode non autorisée"}
```

Repeat for `/api/contact`, `/api/login`, `/api/responses` with an unhandled method.

- [ ] **Step 8: Commit**

```bash
git add app/src/Http/JsonResponse.php app/api/contact.php app/api/events.php app/api/login.php app/api/responses.php tests/Unit/JsonResponseTest.php
git commit -m "refactor(api): extract shared 405 JSON response helper"
```

---

### Task 16: `ResponseRepository::allForEvent` — single `LEFT JOIN` instead of double subquery

**Files:**
- Modify: `app/src/Repositories/ResponseRepository.php`
- Modify: `tests/Integration/ResponseRepositoryTest.php` (no new test needed — existing tests must keep passing unchanged, proving behavior is identical)

**Interfaces:**
- Consumes: nothing new.
- Produces: `allForEvent(int $eventId, array $respondingRoles): array` — same signature, same return shape (`[['username' => ..., 'instrument' => ..., 'response' => ...], ...]`), same ordering (responders before non-responders, then alphabetical). Purely an internal query rewrite.

- [ ] **Step 1: Confirm existing tests cover the behavior being preserved**

`tests/Integration/ResponseRepositoryTest.php`'s `testAllForEventExcludesNonRespondingRoles`
and the two `record`/upsert tests already assert on `allForEvent`'s output
shape and ordering-sensitive lookups (via `responseFor`, which searches by
username regardless of order — add one explicit ordering assertion so the
rewrite can't silently break the "responders first" sort):

Add to `tests/Integration/ResponseRepositoryTest.php`:

```php
    public function testAllForEventOrdersRespondersBeforeNonResponders(): void
    {
        $repo = new ResponseRepository($this->db);
        $repo->record(7, 1, 'participate'); // sam.beispiel — no prior response for event 1

        $usernames = array_column($repo->allForEvent(1, ['user', 'moderator']), 'username');
        $demoUserIndex = array_search('demo.user', $usernames, true); // has a seeded response
        $samIndex = array_search('sam.beispiel', $usernames, true); // just responded above
        $noResponseIndex = array_search('demo.user2', $usernames, true); // never responds in seed data

        $this->assertLessThan($noResponseIndex, $demoUserIndex);
        $this->assertLessThan($noResponseIndex, $samIndex);
    }
```

- [ ] **Step 2: Run test to verify it currently passes (baseline)**

Run: `npm run test:php -- --filter testAllForEventOrdersRespondersBeforeNonResponders`
Expected: PASS (this is a characterization test of existing behavior, not a bugfix — it must pass before *and* after Step 3)

- [ ] **Step 3: Implement**

Edit `app/src/Repositories/ResponseRepository.php`, replacing `allForEvent()`:

```php
    public function allForEvent(int $eventId, array $respondingRoles): array
    {
        if ($respondingRoles === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($respondingRoles), '?'));
        $sql = "SELECT u.username AS username, i.name AS instrument, r.answer AS response
                FROM users u
                LEFT JOIN instruments i ON u.instrument_id = i.id
                LEFT JOIN responses r ON r.user_id = u.id AND r.event_id = ?
                WHERE u.role IN ($placeholders)
                ORDER BY COALESCE(r.answer, '') DESC, u.username";
        $stmt = $this->db->prepare($sql);
        $types = 'i' . str_repeat('s', count($respondingRoles));
        $params = array_merge([$eventId], $respondingRoles);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }
```

- [ ] **Step 4: Run tests to verify nothing broke**

Run: `npm run test:php -- --filter ResponseRepositoryTest`
Expected: PASS (all tests, including the new ordering test and every pre-existing one, unchanged output)

- [ ] **Step 5: Commit**

```bash
git add app/src/Repositories/ResponseRepository.php tests/Integration/ResponseRepositoryTest.php
git commit -m "refactor(responses): compute the per-user answer once via LEFT JOIN, not two subqueries"
```

---

### Task 17: Shared French date-format helper, used by `planning_repet.js` and `sinscrire.js`

**Files:**
- Modify: `app/assets/js/main.js` — add `formatFrenchDate()`.
- Modify: `app/assets/js/planning_repet.js` — use it instead of the inline `toLocaleDateString` calls.
- Modify: `app/assets/js/sinscrire.js` — use it instead of its own inline call.

**Interfaces:**
- Consumes: nothing.
- Produces: global function `formatFrenchDate(date, options)` in `main.js` (already loaded on every page before any other script — confirmed in every page template's script order). `options` is optional; defaults to `{ day: "numeric", month: "long", year: "numeric" }` (the shape every current call site already uses when it doesn't need `weekday`).

No JS test runner exists — verified manually in the final step.

- [ ] **Step 1: Implement**

Add to `app/assets/js/main.js` (after the existing top-of-file comment, before `document.addEventListener`):

```javascript
// Formats a Date as French text ("22 août 2026" by default). Pass options to
// override toLocaleDateString's format, e.g. { weekday: "long", ...defaults }.
function formatFrenchDate(date, options) {
  var defaults = { day: "numeric", month: "long", year: "numeric" };
  return date.toLocaleDateString("fr-FR", options || defaults);
}
```

Edit `app/assets/js/planning_repet.js`:
- `formatDate(date)` (from Task 3's version) becomes:
  ```javascript
  function formatDate(date) {
    return formatFrenchDate(date, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }
  ```
- `formatDateRangeText(startDate, endDate)`'s two `toLocaleDateString` calls become
  `formatFrenchDate(startDate, { weekday: "long", year: "numeric", month: "long", day: "numeric" })` and
  the same for `endDate`; its same-year branch's call becomes
  `formatFrenchDate(startDate, { weekday: "long", month: "long", day: "numeric" })`.
- `displayResult(event)`'s two inline `toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })`
  calls become `formatFrenchDate(eventDate)` and `formatFrenchDate(endDate)` (using the default options, since
  both already pass exactly the default shape).

Edit `app/assets/js/sinscrire.js`'s `dateCell.textContent = new Date(item.date).toLocaleDateString("fr-FR", options);`
line to `dateCell.textContent = formatFrenchDate(new Date(item.date));` and remove the now-unused local `options` variable.

- [ ] **Step 2: Lint**

Run: `npm run lint:js`
Expected: no errors (in particular, no "unused variable" for the removed `options` in `sinscrire.js`).

- [ ] **Step 3: Manual verification**

```bash
npm run serve
```

Visit `/planning_repet` (both a weekday-format date and, if a weekend-flagged
seed event exists, a range) and `/sinscrire` — confirm every date renders
identically to before this change (same French day/month/year text).

- [ ] **Step 4: Commit**

```bash
git add app/assets/js/main.js app/assets/js/planning_repet.js app/assets/js/sinscrire.js
git commit -m "refactor(js): extract shared formatFrenchDate helper"
```

---

## Self-Review Notes (already applied above, kept for the executor's reference)

- **Spec coverage:** every finding in the 5-PR table of the design spec maps
  to exactly one task above (S1→T2, S2→T3, S3→T4, S4→T5, C1→T6, C2→T7,
  C3→T8, V1→T8, C4→T9, C5→T10, J1/J2→T11, C6→T12, C7→T13, C8→T14, plus the
  3 PR 5 cleanup items→T15/T16/T17). The excluded PLAUSIBLE finding
  (hardcoded instrument list) is intentionally absent — see the spec's
  "Deliberately excluded" note.
- **No placeholders:** every step above has literal file paths, complete code
  (no "similar to Task N"), and exact commands. Steps 2/3 of JS-only tasks
  and the `app/api/*.php`-only tasks (5, 7, 8, 9, 15) substitute manual `curl`/browser
  verification for an automated test *only* where the project genuinely has
  no test harness for that layer (documented per-task, not silently skipped).
- **Type/signature consistency:** `ResponseRepository::record`'s new
  `int $userId` parameter (Task 10) is used consistently in its own tests
  (Task 10) and is not referenced anywhere else in the plan. `EventRepository::exists`
  (Task 6) and `UserRepository::updatePassword`/`id` (PR 1 Task 1) are each
  defined once and consumed by name-matching calls in exactly the tasks noted
  in their "Interfaces" section.
