# Public Signup Anti-Abuse (Turnstile + Honeypot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate `POST /api/signups` behind a server-verified Cloudflare Turnstile challenge plus a honeypot field, so the mail-sending public endpoint can no longer be driven by a script.

**Architecture:** A new injectable-transport `App\Turnstile` verifier does the server-side `siteverify` call (fail-closed). `app/api/signups.php` silently drops honeypot hits and rejects submissions whose Turnstile token fails to verify, before it ever inserts or mails. The form page renders the Turnstile widget + a hidden honeypot; `signup.js` threads both into the JSON payload. Config gains a `turnstile` block; dev/CI use Cloudflare's always-pass test keys.

**Tech Stack:** PHP 8.4, PHPUnit, vanilla JS, Cloudflare Turnstile (`api.js` + `siteverify` REST endpoint).

## Global Constraints

- **PHP 8.4 / MariaDB 10.3** — no features newer than these.
- **PSR-4** — `app/src/` classes are namespaced `App\` and autoloaded; no manual `require`.
- **PSR-12** — enforced by `phpcs`; keep lines ≤ 100 chars.
- **Language rule** — code, identifiers, config keys, and array keys in **English**; only user-visible strings in **French**.
- **No new DB migration** — this feature stores no IP and adds no table.
- **`app/` is the tracked source**; never hand-edit `public/`. Never commit `app/config.php`.
- **Fail-closed** — any Turnstile verification error blocks the submission.
- **`REMOTE_ADDR` only** — never trust `X-Forwarded-For`.
- Verify with the project's own commands: `npm run test:php`, `npm run lint:php`, `npm run check`.

---

## File Structure

- **Create** `app/src/Turnstile.php` — the verifier (pure logic + injectable HTTP transport).
- **Create** `tests/Unit/TurnstileTest.php` — unit tests using a fake transport.
- **Modify** `config/config.example.php` — add the `turnstile` key block (real keys placeholder).
- **Modify** `config/config.docker.php` — add the `turnstile` block with Cloudflare test keys.
- **Modify** `app/api/signups.php` — honeypot silent-drop + Turnstile verify before insert/mail.
- **Modify** `app/pages/signup.php` — Turnstile widget, hidden honeypot input, `api.js` script.
- **Modify** `app/assets/js/signup.js` — send `hp` + `turnstile_token`; block if no token; reset widget on failure.
- **Modify** `app/assets/css/signup.css` — visually-hidden honeypot style.

---

## Task 1: `App\Turnstile` verifier

**Files:**
- Create: `app/src/Turnstile.php`
- Test: `tests/Unit/TurnstileTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `App\Turnstile::__construct(string $secret, ?\Closure $transport = null)` and `Turnstile::verify(string $token, ?string $remoteIp = null): bool`. The `$transport` is `fn(string $url, array $fields): ?string` (returns response body, or `null`/throws on failure); when omitted, a real short-timeout HTTPS POST is used. Task 2 constructs `new Turnstile((string) $config['turnstile']['secret_key'])` and calls `verify($token, $_SERVER['REMOTE_ADDR'] ?? null)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/Unit/TurnstileTest.php`:

```php
<?php

use App\Turnstile;
use PHPUnit\Framework\TestCase;

final class TurnstileTest extends TestCase
{
    public function testValidTokenWithSuccessResponsePasses(): void
    {
        $captured = [];
        $t = new Turnstile('secret-key', function (string $url, array $fields) use (&$captured) {
            $captured = ['url' => $url, 'fields' => $fields];
            return '{"success":true}';
        });

        $this->assertTrue($t->verify('good-token', '203.0.113.7'));
        $this->assertSame(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            $captured['url']
        );
        $this->assertSame('secret-key', $captured['fields']['secret']);
        $this->assertSame('good-token', $captured['fields']['response']);
        $this->assertSame('203.0.113.7', $captured['fields']['remoteip']);
    }

    public function testSuccessFalseResponseFails(): void
    {
        $t = new Turnstile('secret-key', fn() => '{"success":false,"error-codes":["bad"]}');
        $this->assertFalse($t->verify('bad-token'));
    }

    public function testTransportExceptionFailsClosed(): void
    {
        $t = new Turnstile('secret-key', function () {
            throw new \RuntimeException('network down');
        });
        $this->assertFalse($t->verify('any-token'));
    }

    public function testNullBodyFailsClosed(): void
    {
        $t = new Turnstile('secret-key', fn() => null);
        $this->assertFalse($t->verify('any-token'));
    }

    public function testNonJsonBodyFailsClosed(): void
    {
        $t = new Turnstile('secret-key', fn() => 'not json');
        $this->assertFalse($t->verify('any-token'));
    }

    public function testEmptyTokenFailsWithoutCallingTransport(): void
    {
        $called = false;
        $t = new Turnstile('secret-key', function () use (&$called) {
            $called = true;
            return '{"success":true}';
        });

        $this->assertFalse($t->verify(''));
        $this->assertFalse($called, 'transport must not be called for an empty token');
    }

    public function testRemoteIpOmittedWhenNullOrEmpty(): void
    {
        $captured = [];
        $t = new Turnstile('secret-key', function (string $url, array $fields) use (&$captured) {
            $captured = $fields;
            return '{"success":true}';
        });

        $t->verify('good-token');
        $this->assertArrayNotHasKey('remoteip', $captured);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:php -- --filter TurnstileTest`
Expected: FAIL — `Class "App\Turnstile" not found`.

- [ ] **Step 3: Write the minimal implementation**

Create `app/src/Turnstile.php`:

```php
<?php

namespace App;

use Closure;

/**
 * Server-side Cloudflare Turnstile verifier. The HTTP call is injectable so
 * unit tests never touch the network; verify() is fail-closed — any error
 * (timeout, non-200, network fault, success:false) returns false.
 */
final class Turnstile
{
    private const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    /**
     * @param string       $secret    the Turnstile secret key
     * @param Closure|null $transport  fn(string $url, array $fields): ?string —
     *                                 POSTs form-encoded $fields, returns the
     *                                 body or null/throws on failure. Omitted
     *                                 in production; a real HTTPS POST is used.
     */
    public function __construct(
        private string $secret,
        private ?Closure $transport = null
    ) {
    }

    public function verify(string $token, ?string $remoteIp = null): bool
    {
        if ($token === '') {
            return false;
        }

        $fields = ['secret' => $this->secret, 'response' => $token];
        if ($remoteIp !== null && $remoteIp !== '') {
            $fields['remoteip'] = $remoteIp;
        }

        $transport = $this->transport ?? Closure::fromCallable([self::class, 'httpPost']);
        try {
            $body = $transport(self::VERIFY_URL, $fields);
        } catch (\Throwable $e) {
            return false;
        }

        if (!is_string($body) || $body === '') {
            return false;
        }
        $data = json_decode($body, true);

        return is_array($data) && ($data['success'] ?? false) === true;
    }

    /** Default transport: a short-timeout HTTPS POST. Returns body or null. */
    private static function httpPost(string $url, array $fields): ?string
    {
        $payload = http_build_query($fields);

        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => $payload,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 5,
                CURLOPT_CONNECTTIMEOUT => 5,
            ]);
            $body = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            return ($body !== false && $code === 200) ? (string) $body : null;
        }

        $ctx = stream_context_create(['http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $payload,
            'timeout' => 5,
        ]]);
        $body = @file_get_contents($url, false, $ctx);

        return $body === false ? null : (string) $body;
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:php -- --filter TurnstileTest`
Expected: PASS (7 tests).

- [ ] **Step 5: Lint**

Run: `npm run lint:php`
Expected: no errors for `app/src/Turnstile.php`.

- [ ] **Step 6: Commit**

```bash
git add app/src/Turnstile.php tests/Unit/TurnstileTest.php
git commit -m "feat(signups): add App\\Turnstile fail-closed verifier with unit tests"
```

---

## Task 2: Backend wiring — config + `signups.php`

**Files:**
- Modify: `config/config.example.php`
- Modify: `config/config.docker.php`
- Modify: `app/api/signups.php`

**Interfaces:**
- Consumes: `App\Turnstile` from Task 1; `$config['turnstile']['secret_key']` from the config blocks below.
- Produces: the POST contract — request JSON now also carries `hp` (honeypot) and `turnstile_token`; responses add `201 {ok:true}` on a honeypot hit (silent drop) and `403 {error:'…'}` on a failed challenge. Task 3's `signup.js` must send those two fields.

- [ ] **Step 1: Add the `turnstile` block to `config/config.example.php`**

Insert immediately after the `'features' => [ ... ],` block (before `'migrate'`):

```php
    // Cloudflare Turnstile keys guarding the public signup POST (App\Turnstile).
    // Mint per site in the Cloudflare dashboard (Turnstile) with the site's
    // domain(s) registered. site_key is public (rendered in the form); secret_key
    // is server-only. Empty/placeholder keys fail the check CLOSED (signups
    // blocked), so a server must hold real keys before souper_signup is enabled.
    'turnstile' => [
        'site_key'   => 'CHANGE_ME',
        'secret_key' => 'CHANGE_ME',
    ],
```

- [ ] **Step 2: Add the `turnstile` block to `config/config.docker.php`**

Insert immediately after the `'features' => [ ... ],` block (before `'migrate'`):

```php
    // Cloudflare's documented always-pass test keys, so local dev/CI need no
    // real Turnstile account (siteverify with these always returns success).
    // Real per-env keys live in each server's config.php.
    'turnstile' => [
        'site_key'   => '1x00000000000000000000AA',
        'secret_key' => '1x0000000000000000000000000000000AA',
    ],
```

- [ ] **Step 3: Add the `use` import in `app/api/signups.php`**

After `use App\Mailer;` add:

```php
use App\Turnstile;
```

- [ ] **Step 4: Read the two new fields in the POST branch**

In `app/api/signups.php`, the POST branch decodes `$data` then reads fields. Add, right after the `$menus = SignupRepository::normalizeMenus($data['menus'] ?? null);` line:

```php
    $honeypot = trim((string) ($data['hp'] ?? ''));
    $turnstileToken = trim((string) ($data['turnstile_token'] ?? ''));

    // Honeypot: a real form never fills this. Silently accept (201) without
    // storing or mailing, so a bot never learns it was trapped.
    if ($honeypot !== '') {
        http_response_code(201);
        echo json_encode(['ok' => true]);
        exit;
    }
```

- [ ] **Step 5: Add the Turnstile gate after field validation, before insert**

In `app/api/signups.php`, the existing validation `if ( … ) { http_response_code(400); … exit; }` block runs next. Immediately **after** that block closes and **before** `$repo->create([`, insert:

```php
    // Human-verification gate (fail-closed): reject before we insert or mail.
    $turnstile = new Turnstile((string) ($config['turnstile']['secret_key'] ?? ''));
    if (!$turnstile->verify($turnstileToken, $_SERVER['REMOTE_ADDR'] ?? null)) {
        http_response_code(403);
        echo json_encode(['error' => 'Vérification anti-robot échouée, veuillez réessayer.']);
        exit;
    }
```

- [ ] **Step 6: Lint PHP + confirm nothing broke**

Run: `npm run lint:php`
Expected: no errors.

Run: `npm run test:php -- --filter TurnstileTest`
Expected: still PASS (no regression; `signups.php` has no unit test — its logic is a guard `if` plus the tested `verify` call).

- [ ] **Step 7: Manually verify the branches locally**

Bring up the stack (`docker compose up -d --build`, or `npm run serve`). With the docker test keys, a normal browser submission succeeds. Then confirm the two guards with curl (bypasses the widget, exercises the server):

```bash
# Honeypot filled -> 201, and NO new row / NO mail in Mailpit (localhost:8025):
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8090/api/signups \
  -H "Content-Type: application/json" \
  -d '{"first_name":"A","last_name":"B","address":"x","phone":"1","email":"a@b.co","table_name":"T","menus":["meat"],"hp":"bot"}'
# Expected: 201

# Empty token -> 403 (dev secret only passes for a real solved token; empty fails):
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8090/api/signups \
  -H "Content-Type: application/json" \
  -d '{"first_name":"A","last_name":"B","address":"x","phone":"1","email":"a@b.co","table_name":"T","menus":["meat"],"turnstile_token":""}'
# Expected: 403
```

- [ ] **Step 8: Commit**

```bash
git add config/config.example.php config/config.docker.php app/api/signups.php
git commit -m "feat(signups): honeypot silent-drop + Turnstile gate on POST /api/signups"
```

---

## Task 3: Frontend — widget, honeypot, payload

**Files:**
- Modify: `app/pages/signup.php`
- Modify: `app/assets/js/signup.js`
- Modify: `app/assets/css/signup.css`

**Interfaces:**
- Consumes: `$config['turnstile']['site_key']` (rendered into the widget); the POST contract from Task 2 (`hp` + `turnstile_token`).
- Produces: nothing downstream.

- [ ] **Step 1: Expose the site key in `app/pages/signup.php`**

At the top of the `<?php … ?>` block (with the other setup, after `use` lines), add the global + read:

```php
global $config;
$turnstileSiteKey = (string) ($config['turnstile']['site_key'] ?? '');
```

- [ ] **Step 2: Add the hidden honeypot right after the form opens**

Immediately after `<form id="signup-form">` add:

```php
    <!-- Honeypot: hidden from real users; bots that autofill it are dropped server-side. -->
    <div class="hp-field" aria-hidden="true">
      <label for="website">Ne pas remplir ce champ</label>
      <input type="text" id="website" name="website" tabindex="-1" autocomplete="off" />
    </div>
```

- [ ] **Step 3: Add the Turnstile widget above the submit button**

Replace the `<div class="form-actions">` block with the widget added just before it:

```php
    <div class="cf-turnstile" data-sitekey="<?= htmlspecialchars($turnstileSiteKey) ?>"></div>

    <div class="form-actions">
      <button type="submit" class="btn-primary">Envoyer l'inscription</button>
    </div>
```

- [ ] **Step 4: Load the Turnstile script**

In the scripts block near the bottom of `app/pages/signup.php`, add (before `signup.js`):

```php
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

- [ ] **Step 5: Thread the fields through `app/assets/js/signup.js`**

In the `form.addEventListener("submit", …)` handler, replace the body up to and including the `fetch(...)` call so it reads the token, guards on it, sends both new fields, and resets the widget on failure:

```js
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var menus = [];
    guests.querySelectorAll(".guest-menu").forEach(function (s) {
      menus.push(s.value);
    });
    var tokenField = form.querySelector('[name="cf-turnstile-response"]');
    var token = tokenField ? tokenField.value : "";
    if (!token) {
      alert("Veuillez compléter la vérification anti-robot.");
      return;
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
      turnstile_token: token,
    };
    fetch("/api/signups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        if (!r.ok) {
          throw new Error("signup-failed");
        }
        window.location.href = "/signup_thanks";
      })
      .catch(function () {
        if (window.turnstile) {
          window.turnstile.reset();
        }
        alert("Échec de l'envoi du formulaire. Veuillez vérifier les champs et réessayer.");
      });
  });
```

- [ ] **Step 6: Add the honeypot CSS to `app/assets/css/signup.css`**

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

- [ ] **Step 7: Lint front-end**

Run: `npm run check`
Expected: eslint, stylelint, and prettier all pass (run `npm run fix` first if prettier reformats).

- [ ] **Step 8: Manual browser check**

Run the stack, open `/signup` (or `/sinscrire` route to the form). Confirm: the honeypot input is invisible and not tab-reachable; the Turnstile widget renders (managed mode shows a brief checkbox/verifying state with the dev key); submitting a completed form redirects to `/signup_thanks` and a confirmation lands in Mailpit; submitting before the widget resolves shows the "Veuillez compléter la vérification anti-robot." alert.

- [ ] **Step 9: Commit**

```bash
git add app/pages/signup.php app/assets/js/signup.js app/assets/css/signup.css
git commit -m "feat(signups): render Turnstile widget + honeypot on the signup form"
```

---

## Rollout (post-implementation, operational — not a coding task)

Before enabling `souper_signup` in PROD:
1. Register each site domain in the Cloudflare Turnstile dashboard and mint a site/secret key pair per environment.
2. Add the `turnstile` block with real keys to each server's `config.php` **before** the deploy that ships this code — the config-shape drift gate will otherwise refuse that server's deploy (a key the code now expects is missing).
3. Confirm no CSP header blocks `challenges.cloudflare.com` (the site sets none today — re-check if a CSP is ever added).

---

## Self-Review

**Spec coverage:**
- Goal 1 (verify before insert/mail) → Task 2 Step 5. ✅
- Goal 2 (fail-closed) → Task 1 impl + tests (`testTransportExceptionFailsClosed`, `testNullBodyFailsClosed`, `testNonJsonBodyFailsClosed`). ✅
- Goal 3 (honeypot before siteverify) → Task 2 Step 4 (silent 201). ✅
- Goal 4 (no IP stored, no migration) → no schema task exists; `REMOTE_ADDR` only passed transiently to Turnstile, never persisted. ✅
- Goal 5 (small injectable, unit-testable verifier) → Task 1. ✅
- Goal 6 (dev/CI without a real account) → Task 2 Steps 2 (test keys). ✅
- Frontend (widget, honeypot, script, JS payload, reset) → Task 3. ✅
- Config-shape drift documentation → Rollout section + config.example.php comment (Task 2 Step 1). ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✅

**Type consistency:** `Turnstile::__construct(string, ?Closure)` and `verify(string, ?string): bool` are used identically in Task 1 (definition), Task 1 tests, and Task 2 Step 5. Payload keys `hp` / `turnstile_token` match between Task 2 (read) and Task 3 (send). ✅
