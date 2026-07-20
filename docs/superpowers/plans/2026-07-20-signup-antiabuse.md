# Public Signup Anti-Abuse (self-hosted Altcha + honeypot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate `POST /api/signups` behind a self-hosted, single-use proof-of-work challenge (Altcha wire-compatible) plus a honeypot, so the mail-sending public endpoint can no longer be driven by a script — with no external service.

**Architecture:** A pure `App\Altcha` issues/verifies a SHA-256 PoW (HMAC-signed, expiry in the salt, signature required). A tiny `App\Repositories\ChallengeRepository` consumes each solved challenge once (replay protection) via a new `used_challenges` table. `GET /api/altcha` hands out challenges; `signup.js` solves them in-browser with `crypto.subtle`. `signups.php` silently drops honeypot hits and rejects unverified/replayed solutions before it inserts or mails.

**Tech Stack:** PHP 8.4, PHPUnit, MariaDB 10.3, vanilla JS (`crypto.subtle`), `nikic/fast-route`.

## Global Constraints

- **PHP 8.4 / MariaDB 10.3** — no newer features.
- **PSR-4** — `app/src/` classes are `App\` and Composer-autoloaded; no manual `require`.
- **PSR-12** — enforced by `phpcs`; keep lines ≤ 100 chars.
- **Language rule** — code, identifiers, config keys, array keys, table/column names in **English**; only on-screen strings in **French**.
- **Migrations idempotent + backward-compatible** (`sql/migrations/README.md`).
- **No external service / account / CDN / vendored blob / Composer dep** for this feature.
- **Fail-closed** — any verification failure blocks the submission.
- **Store no IP.** The only new persisted data is a challenge-signature hash + timestamp, pruned after a day.
- **`app/` is the tracked source**; never hand-edit `public/`; never commit `app/config.php`.
- Verify with the project's commands: `npm run test:php`, `npm run lint:php`, `npm run check`.

---

## File Structure

- **Create** `app/src/Altcha.php` — PoW issue/verify (pure; no DB, no network).
- **Create** `tests/Unit/AltchaTest.php` — deterministic unit tests.
- **Create** `app/src/Repositories/ChallengeRepository.php` — single-use replay store.
- **Create** `sql/migrations/002_create_used_challenges.sql` — replay table.
- **Create** `tests/Integration/ChallengeRepositoryTest.php` — consume-once test.
- **Create** `app/api/altcha.php` — `GET /api/altcha` challenge endpoint.
- **Modify** `app/src/routes.php` — register `altcha` under the `souper_signup` gate.
- **Modify** `config/config.example.php` + `config/config.docker.php` — `altcha` block.
- **Modify** `app/api/signups.php` — honeypot drop + PoW verify + replay consume.
- **Modify** `app/pages/signup.php` — hidden honeypot input.
- **Modify** `app/assets/js/signup.js` — fetch + solve PoW, send `hp` + `altcha`.
- **Modify** `app/assets/css/signup.css` — off-screen honeypot rule.

---

## Task 1: `App\Altcha` proof-of-work verifier

**Files:**
- Create: `app/src/Altcha.php`
- Test: `tests/Unit/AltchaTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `App\Altcha::__construct(string $secret)`
  - `createChallenge(int $maxNumber, int $ttlSeconds, ?int $now = null, ?int $number = null, ?string $saltHex = null): array` → `['algorithm','challenge','maxnumber','salt','signature']`.
  - `verifySolution(string $payloadBase64, ?int $now = null): ?string` → the challenge signature (replay key) on success, else `null`.
  Task 3 calls `new Altcha((string) $config['altcha']['hmac_secret'])`, `createChallenge(100000, 600)`, and `verifySolution($altcha)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/Unit/AltchaTest.php`:

```php
<?php

use App\Altcha;
use PHPUnit\Framework\TestCase;

final class AltchaTest extends TestCase
{
    private const SECRET = 'unit-test-secret';

    /** Build the base64 solution payload a browser would send for a challenge. */
    private static function solve(array $challenge, int $number): string
    {
        return base64_encode((string) json_encode([
            'algorithm' => $challenge['algorithm'],
            'challenge' => $challenge['challenge'],
            'number'    => $number,
            'salt'      => $challenge['salt'],
            'signature' => $challenge['signature'],
        ]));
    }

    public function testSolvedPayloadVerifiesAndReturnsSignature(): void
    {
        $a = new Altcha(self::SECRET);
        $ch = $a->createChallenge(1000, 600, now: 1_000_000, number: 42, saltHex: 'abcd');
        $sig = $a->verifySolution(self::solve($ch, 42), now: 1_000_000);

        $this->assertSame($ch['signature'], $sig);
    }

    public function testWrongNumberFails(): void
    {
        $a = new Altcha(self::SECRET);
        $ch = $a->createChallenge(1000, 600, now: 1_000_000, number: 42, saltHex: 'abcd');
        $this->assertNull($a->verifySolution(self::solve($ch, 43), now: 1_000_000));
    }

    public function testMissingSignatureFails(): void
    {
        $a = new Altcha(self::SECRET);
        $ch = $a->createChallenge(1000, 600, now: 1_000_000, number: 42, saltHex: 'abcd');
        $payload = base64_encode((string) json_encode([
            'algorithm' => $ch['algorithm'],
            'challenge' => $ch['challenge'],
            'number'    => 42,
            'salt'      => $ch['salt'],
            // signature intentionally omitted (advisory)
        ]));
        $this->assertNull($a->verifySolution($payload, now: 1_000_000));
    }

    public function testExpiredChallengeFails(): void
    {
        $a = new Altcha(self::SECRET);
        $ch = $a->createChallenge(1000, 600, now: 1_000_000, number: 42, saltHex: 'abcd');
        // 601s later — past the 600s ttl.
        $this->assertNull($a->verifySolution(self::solve($ch, 42), now: 1_000_601));
    }

    public function testWrongSecretFails(): void
    {
        $issuer = new Altcha(self::SECRET);
        $ch = $issuer->createChallenge(1000, 600, now: 1_000_000, number: 42, saltHex: 'abcd');
        $attacker = new Altcha('different-secret');
        $this->assertNull($attacker->verifySolution(self::solve($ch, 42), now: 1_000_000));
    }

    public function testMalformedPayloadFails(): void
    {
        $a = new Altcha(self::SECRET);
        $this->assertNull($a->verifySolution('not base64 %%%', now: 1_000_000));
        $this->assertNull($a->verifySolution(base64_encode('not json'), now: 1_000_000));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:php -- --filter AltchaTest`
Expected: FAIL — `Class "App\Altcha" not found`.

- [ ] **Step 3: Write the implementation**

Create `app/src/Altcha.php`:

```php
<?php

namespace App;

/**
 * Self-hosted, Altcha-wire-compatible proof-of-work challenge.
 *
 * challenge = sha256(salt . number); signature = HMAC-SHA256(challenge, secret).
 * The salt carries "?expires=<unixts>"; because the salt feeds the challenge
 * hash, a tampered expiry breaks the signature (no separate signing needed).
 * verifySolution is fail-closed and REQUIRES a signature by construction
 * (mitigating altcha-lib-php advisory GHSA-82w8-65qw-gch6).
 */
final class Altcha
{
    private const ALGORITHM = 'SHA-256';

    public function __construct(private string $secret)
    {
    }

    /**
     * @return array{algorithm:string,challenge:string,maxnumber:int,salt:string,signature:string}
     *
     * $now/$number/$saltHex are for deterministic tests only; production passes
     * just $maxNumber and $ttlSeconds.
     */
    public function createChallenge(
        int $maxNumber,
        int $ttlSeconds,
        ?int $now = null,
        ?int $number = null,
        ?string $saltHex = null
    ): array {
        $now ??= time();
        $number ??= random_int(0, $maxNumber);
        $saltHex ??= bin2hex(random_bytes(12));

        $salt = $saltHex . '?expires=' . ($now + $ttlSeconds);
        $challenge = hash('sha256', $salt . $number);
        $signature = hash_hmac('sha256', $challenge, $this->secret);

        return [
            'algorithm' => self::ALGORITHM,
            'challenge' => $challenge,
            'maxnumber' => $maxNumber,
            'salt'      => $salt,
            'signature' => $signature,
        ];
    }

    /** @return string|null the challenge signature (replay key) on success, else null. */
    public function verifySolution(string $payloadBase64, ?int $now = null): ?string
    {
        $now ??= time();

        $json = base64_decode($payloadBase64, true);
        if ($json === false) {
            return null;
        }
        $p = json_decode($json, true);
        if (!is_array($p)) {
            return null;
        }
        foreach (['algorithm', 'challenge', 'number', 'salt', 'signature'] as $key) {
            if (!isset($p[$key]) || !is_scalar($p[$key])) {
                return null; // a missing signature is a hard reject (advisory)
            }
        }
        if ((string) $p['algorithm'] !== self::ALGORITHM) {
            return null;
        }

        $expires = self::parseExpires((string) $p['salt']);
        if ($expires === null || $expires < $now) {
            return null;
        }

        $expectedChallenge = hash('sha256', (string) $p['salt'] . (string) $p['number']);
        if (!hash_equals($expectedChallenge, (string) $p['challenge'])) {
            return null;
        }

        $expectedSignature = hash_hmac('sha256', (string) $p['challenge'], $this->secret);
        if (!hash_equals($expectedSignature, (string) $p['signature'])) {
            return null;
        }

        return (string) $p['signature'];
    }

    private static function parseExpires(string $salt): ?int
    {
        $pos = strpos($salt, '?');
        if ($pos === false) {
            return null;
        }
        parse_str(substr($salt, $pos + 1), $params);

        return isset($params['expires']) && ctype_digit((string) $params['expires'])
            ? (int) $params['expires']
            : null;
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:php -- --filter AltchaTest`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint**

Run: `npm run lint:php`
Expected: no errors for `app/src/Altcha.php`.

- [ ] **Step 6: Commit**

```bash
git add app/src/Altcha.php tests/Unit/AltchaTest.php
git commit -m "feat(signups): add App\\Altcha self-hosted proof-of-work verifier"
```

---

## Task 2: Replay store — migration + `ChallengeRepository`

**Files:**
- Create: `sql/migrations/002_create_used_challenges.sql`
- Create: `app/src/Repositories/ChallengeRepository.php`
- Test: `tests/Integration/ChallengeRepositoryTest.php`

**Interfaces:**
- Consumes: a `mysqli` connection.
- Produces: `App\Repositories\ChallengeRepository::__construct(mysqli $db)` and `consume(string $signature): bool` (`true` = newly consumed, `false` = replay). Task 3 calls `consume($sig)` after a successful `verifySolution`.

- [ ] **Step 1: Write the migration**

Create `sql/migrations/002_create_used_challenges.sql`:

```sql
-- 002 — replay protection for Altcha proof-of-work solutions.
-- Each solved challenge's signature is consumed once (App\Repositories\
-- ChallengeRepository); rows are pruned after a day. Stores no IP / PII.

CREATE TABLE IF NOT EXISTS `used_challenges` (
  `signature`  char(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`signature`),
  KEY `idx_used_challenges_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Write the failing integration test**

Create `tests/Integration/ChallengeRepositoryTest.php`:

```php
<?php

use App\Repositories\ChallengeRepository;

/**
 * used_challenges is not in the test DB's base schema (it ships via migration
 * 002), and DDL implicitly commits — escaping IntegrationTestCase's rollback.
 * So, like MigratorTest, this test creates the table if needed and cleans its
 * own 'test-%' rows explicitly.
 */
final class ChallengeRepositoryTest extends IntegrationTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->db->query(
            'CREATE TABLE IF NOT EXISTS used_challenges ('
            . '`signature` char(64) NOT NULL, '
            . '`created_at` timestamp NOT NULL DEFAULT current_timestamp(), '
            . 'PRIMARY KEY (`signature`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;'
        );
        $this->cleanup();
    }

    protected function tearDown(): void
    {
        $this->cleanup();
        parent::tearDown();
    }

    private function cleanup(): void
    {
        $this->db->query("DELETE FROM used_challenges WHERE signature LIKE 'test-%'");
    }

    public function testFirstConsumeSucceedsSecondIsReplay(): void
    {
        $repo = new ChallengeRepository($this->db);
        $sig = 'test-' . str_repeat('a', 59); // 64 chars

        $this->assertTrue($repo->consume($sig), 'first use should be accepted');
        $this->assertFalse($repo->consume($sig), 'second use is a replay');
    }
}
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:php -- --filter ChallengeRepositoryTest`
Expected: FAIL — `Class "App\Repositories\ChallengeRepository" not found`.

- [ ] **Step 4: Write the implementation**

Create `app/src/Repositories/ChallengeRepository.php`:

```php
<?php

namespace App\Repositories;

use mysqli;

/**
 * Single-use store for solved Altcha challenge signatures (replay protection).
 * INSERT IGNORE + affected_rows avoids any dependency on mysqli error mode.
 */
final class ChallengeRepository
{
    public function __construct(private mysqli $db)
    {
    }

    /** @return bool true if newly consumed; false if the signature was already used (replay). */
    public function consume(string $signature): bool
    {
        // Opportunistic prune — solved challenges expire well within a day.
        $this->db->query(
            'DELETE FROM used_challenges WHERE created_at < (NOW() - INTERVAL 1 DAY)'
        );

        $stmt = $this->db->prepare('INSERT IGNORE INTO used_challenges (signature) VALUES (?)');
        $stmt->bind_param('s', $signature);
        $stmt->execute();
        $inserted = $this->db->affected_rows === 1;
        $stmt->close();

        return $inserted;
    }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:php -- --filter ChallengeRepositoryTest`
Expected: PASS.

- [ ] **Step 6: Lint + verify the migration is idempotent**

Run: `npm run lint:php`
Expected: no errors.

The migration uses `CREATE TABLE IF NOT EXISTS`, so re-running is a no-op (matches `sql/migrations/README.md`). No command needed beyond confirming the `IF NOT EXISTS`.

- [ ] **Step 7: Commit**

```bash
git add sql/migrations/002_create_used_challenges.sql \
        app/src/Repositories/ChallengeRepository.php \
        tests/Integration/ChallengeRepositoryTest.php
git commit -m "feat(signups): used_challenges table + ChallengeRepository (replay guard)"
```

---

## Task 3: Backend wiring — config, `/api/altcha`, and `signups.php`

**Files:**
- Modify: `config/config.example.php`, `config/config.docker.php`
- Create: `app/api/altcha.php`
- Modify: `app/src/routes.php`
- Modify: `app/api/signups.php`

**Interfaces:**
- Consumes: `App\Altcha` (Task 1), `App\Repositories\ChallengeRepository` (Task 2), `$config['altcha']['hmac_secret']`.
- Produces: the POST contract — request JSON now carries `hp` + `altcha`; responses add `201 {ok:true}` on a honeypot hit and `403 {error:'…'}` on a failed/replayed challenge. `GET /api/altcha` returns the challenge JSON. Task 4's `signup.js` consumes both.

- [ ] **Step 1: Add the `altcha` block to `config/config.example.php`**

Insert immediately after the `'features' => [ ... ],` block:

```php
    // Self-hosted proof-of-work secret for the public signup challenge
    // (App\Altcha). ANY long random string — generate one per server, no
    // external service. Empty/placeholder fails verification CLOSED (signups
    // blocked), so a server needs a real value before souper_signup is enabled.
    'altcha' => [
        'hmac_secret' => 'CHANGE_ME',
    ],
```

- [ ] **Step 2: Add the `altcha` block to `config/config.docker.php`**

Insert immediately after the `'features' => [ ... ],` block:

```php
    // Throwaway PoW secret so local dev/CI just work. Real per-server secrets
    // live in each server's config.php.
    'altcha' => [
        'hmac_secret' => 'dev-local-altcha-secret',
    ],
```

- [ ] **Step 3: Create the challenge endpoint `app/api/altcha.php`**

```php
<?php

use App\Altcha;

global $config;

header('Content-Type: application/json');

$altcha = new Altcha((string) ($config['altcha']['hmac_secret'] ?? ''));
// 100k max iterations solves in well under a second; 10-minute expiry.
echo json_encode($altcha->createChallenge(100000, 600));
```

- [ ] **Step 4: Register the route in `app/src/routes.php`**

In the `if (Features::enabled('souper_signup')) { $apis[] = 'signups'; }` block, add `altcha`:

```php
    if (Features::enabled('souper_signup')) {
        $apis[] = 'signups';
        $apis[] = 'altcha';
    }
```

- [ ] **Step 5: Add imports in `app/api/signups.php`**

After `use App\Mailer;` add:

```php
use App\Altcha;
use App\Repositories\ChallengeRepository;
```

- [ ] **Step 6: Read the new fields + honeypot silent-drop**

In the POST branch, right after the `$menus = SignupRepository::normalizeMenus($data['menus'] ?? null);` line, add:

```php
    $honeypot = trim((string) ($data['hp'] ?? ''));
    $altchaPayload = (string) ($data['altcha'] ?? '');

    // Honeypot: a real form never fills this. Silently accept (201) without
    // storing or mailing, so a bot never learns it was trapped.
    if ($honeypot !== '') {
        http_response_code(201);
        echo json_encode(['ok' => true]);
        exit;
    }
```

- [ ] **Step 7: Add the PoW gate after field validation, before insert**

Immediately **after** the existing validation `if ( … ) { http_response_code(400); … exit; }` block closes and **before** `$repo->create([`, insert:

```php
    // Proof-of-work gate (fail-closed) + single-use replay guard, before insert/mail.
    $altcha = new Altcha((string) ($config['altcha']['hmac_secret'] ?? ''));
    $signature = $altcha->verifySolution($altchaPayload);
    $challenges = new ChallengeRepository(Database::get());
    if ($signature === null || !$challenges->consume($signature)) {
        http_response_code(403);
        echo json_encode(['error' => 'Vérification anti-robot échouée, veuillez réessayer.']);
        exit;
    }
```

(`Database` is already imported in `signups.php`.)

- [ ] **Step 8: Lint + confirm no regression**

Run: `npm run lint:php`
Expected: no errors.

Run: `npm run test:php`
Expected: PASS (AltchaTest + ChallengeRepositoryTest included; nothing else broken).

- [ ] **Step 9: Manually verify the endpoints locally**

Bring up the stack (`docker compose up -d --build`, or `npm run serve`). Then:

```bash
# Challenge endpoint returns the five fields:
curl -s http://localhost:8090/api/altcha
# Expected: {"algorithm":"SHA-256","challenge":"…","maxnumber":100000,"salt":"…?expires=…","signature":"…"}

# Honeypot filled -> 201, and NO new row / NO mail (Mailpit at localhost:8025):
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8090/api/signups \
  -H "Content-Type: application/json" \
  -d '{"first_name":"A","last_name":"B","address":"x","phone":"1","email":"a@b.co","table_name":"T","menus":["meat"],"hp":"bot"}'
# Expected: 201

# Valid fields but no PoW solution -> 403:
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8090/api/signups \
  -H "Content-Type: application/json" \
  -d '{"first_name":"A","last_name":"B","address":"x","phone":"1","email":"a@b.co","table_name":"T","menus":["meat"],"altcha":""}'
# Expected: 403
```

- [ ] **Step 10: Commit**

```bash
git add config/config.example.php config/config.docker.php \
        app/api/altcha.php app/src/routes.php app/api/signups.php
git commit -m "feat(signups): /api/altcha challenge + honeypot & PoW gate on POST /api/signups"
```

---

## Task 4: Frontend — honeypot + in-browser solver

**Files:**
- Modify: `app/pages/signup.php`
- Modify: `app/assets/js/signup.js`
- Modify: `app/assets/css/signup.css`

**Interfaces:**
- Consumes: `GET /api/altcha` and the POST contract from Task 3 (`hp` + `altcha`).
- Produces: nothing downstream.

- [ ] **Step 1: Add the hidden honeypot right after the form opens**

In `app/pages/signup.php`, immediately after `<form id="signup-form">` add:

```php
    <!-- Honeypot: hidden from real users; bots that autofill it are dropped server-side. -->
    <div class="hp-field" aria-hidden="true">
      <label for="website">Ne pas remplir ce champ</label>
      <input type="text" id="website" name="website" tabindex="-1" autocomplete="off" />
    </div>
```

- [ ] **Step 2: Add the honeypot CSS to `app/assets/css/signup.css`**

Append:

```css
/* Honeypot: kept out of the visual + tab flow; only bots fill it. */
.hp-field {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
```

- [ ] **Step 3: Add the PoW solver + rewrite the submit handler in `app/assets/js/signup.js`**

Replace the entire `form.addEventListener("submit", …)` block (currently the last statement before the closing `})();`) with:

```js
  function toHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  }

  // Fetch a fresh challenge and brute-force the proof-of-work. Returns the
  // base64 solution payload, or null if it can't be solved.
  function solveAltcha() {
    return fetch("/api/altcha", { headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.json();
      })
      .then(function (ch) {
        var enc = new TextEncoder();

        function tryNumber(n) {
          if (n > ch.maxnumber) {
            return null;
          }
          return crypto.subtle
            .digest("SHA-256", enc.encode(ch.salt + n))
            .then(function (digest) {
              if (toHex(digest) === ch.challenge) {
                return btoa(
                  JSON.stringify({
                    algorithm: ch.algorithm,
                    challenge: ch.challenge,
                    number: n,
                    salt: ch.salt,
                    signature: ch.signature,
                  }),
                );
              }
              return tryNumber(n + 1);
            });
        }

        return tryNumber(0);
      });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var menus = [];
    guests.querySelectorAll(".guest-menu").forEach(function (s) {
      menus.push(s.value);
    });

    var submitBtn = form.querySelector('button[type="submit"]');
    var submitLabel = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Vérification…";
    }

    function restoreButton() {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
      }
    }

    solveAltcha()
      .then(function (altcha) {
        if (!altcha) {
          throw new Error("altcha-failed");
        }
        var payload = {
          first_name: form.first_name.value.trim(),
          last_name: form.last_name.value.trim(),
          address: form.address.value.trim(),
          phone: form.phone.value.trim(),
          email: form.email.value.trim(),
          table_name: form.table_name.value.trim(),
          menus: menus,
          hp: form.website.value,
          altcha: altcha,
        };
        return fetch("/api/signups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      })
      .then(function (r) {
        if (!r.ok) {
          throw new Error("signup-failed");
        }
        window.location.href = "/signup_thanks";
      })
      .catch(function () {
        restoreButton();
        alert("Échec de l'envoi du formulaire. Veuillez vérifier les champs et réessayer.");
      });
  });
```

- [ ] **Step 4: Lint front-end**

Run: `npm run check`
Expected: eslint, stylelint, prettier all pass (run `npm run fix` first if prettier reformats).

- [ ] **Step 5: Manual browser check**

Run the stack, open the signup form (`/signup`). Confirm: the honeypot input is invisible and not tab-reachable; submitting a completed form briefly shows "Vérification…", solves the PoW, redirects to `/signup_thanks`, and a confirmation lands in Mailpit; submitting twice quickly does not double-book (the second uses a fresh challenge). Load `/api/altcha` directly and confirm JSON with the five fields.

- [ ] **Step 6: Commit**

```bash
git add app/pages/signup.php app/assets/js/signup.js app/assets/css/signup.css
git commit -m "feat(signups): honeypot + in-browser Altcha PoW solver on the signup form"
```

---

## Rollout (post-implementation, operational — not a coding task)

Before enabling `souper_signup` in PROD (and on TEST/QA before the deploy that ships this code):
1. Generate a long random string and add the `altcha` block with it as `hmac_secret` to each server's `config.php` **before** deploying — otherwise the config-shape drift gate refuses that server's deploy.
2. The migration pipeline applies `002_create_used_challenges.sql` automatically after deploy.
3. `crypto.subtle` needs a secure context (HTTPS/localhost) — satisfied on all envs.

---

## Self-Review

**Spec coverage:**
- Goal 1 (verify before insert/mail) → Task 3 Step 7. ✅
- Goal 2 (fail-closed) → Task 1 (`verifySolution` returns null on every failure; tests cover bad number/signature/expiry/secret/malformed). ✅
- Goal 3 (replay-safe, single-use) → Task 2 (`consume` + `used_challenges`) wired in Task 3 Step 7. ✅
- Goal 4 (honeypot) → Task 3 Step 6 (silent 201) + Task 4 Steps 1–2. ✅
- Goal 5 (no IP; only a pruned signature hash) → Task 2 table has no IP column; prune in `consume`. ✅
- Goal 6 (no external service/dep/CDN/widget; vanilla JS) → Task 4 solver uses `crypto.subtle`; no new dependency anywhere. ✅
- Goal 7 (small injectable unit-testable crypto) → Task 1. ✅
- Goal 8 (dev/CI with a throwaway secret) → Task 3 Step 2. ✅
- Migration + route + config-drift note → Task 2 Step 1, Task 3 Steps 1–4, Rollout. ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✅

**Type consistency:** `Altcha::createChallenge(int,int,?int,?int,?string): array` and `verifySolution(string,?int): ?string` are used identically in Task 1 (def + tests) and Task 3 Step 7. `ChallengeRepository::consume(string): bool` defined in Task 2, called in Task 3 Step 7. Payload keys `hp`/`altcha` match between Task 3 (read) and Task 4 (send). Challenge JSON keys `algorithm/challenge/maxnumber/salt/signature` match between Task 1 (`createChallenge`), Task 3 (`/api/altcha`), and Task 4 (solver). ✅
