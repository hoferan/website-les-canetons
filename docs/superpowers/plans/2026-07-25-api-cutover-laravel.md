# `/api/*` Cutover to Laravel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve every `/api/*` request from Laravel, delete the old app's API layer, and retire its SQL migration system.

**Architecture:** Port the five remaining endpoints to idiomatic Laravel (Eloquent, FormRequests, Mail) behind a custom exception renderer that preserves the existing `{error, code, fields[]}` JSON contract the French display layer consumes. Then flip Apache's `/api/*` dispatch into Laravel in one atomic change, bridging Laravel's auth into `$_SESSION` so the not-yet-replaced PHP pages stay gated.

**Tech Stack:** PHP 8.4, Laravel 12 + Sanctum (SPA cookie mode), Eloquent on MariaDB 10.3, PHPUnit, vanilla JS + Vite, Apache with `.htaccess` on FastCGI.

**Spec:** `docs/superpowers/specs/2026-07-25-api-cutover-laravel-design.md`

---

## Guiding principle

**Don't carry the old app forward.** Where old code has a backward-compatibility path or a lazy data upgrade, drop it — don't port it. The session bridge (Task 21) is the one deliberate exception, and it is written to be deleted in one commit.

---

## Critical constraints

Read these before starting. Each has bitten someone already.

1. **The error JSON contract is load-bearing.** `app/assets/js/i18n.js`'s `translateApiError()` is the only place French is computed. It needs `{error, code, fields:[{field, reason, params?}]}`. Laravel's native `{message, errors:{}}` breaks every form error message. Field names must match the `fields.*` keys in `i18n.js` exactly (`lastName`, `firstName`, `table_name`, `eventId`, …) — note the deliberate mix of camelCase and snake_case.
2. **Use `[L]`, never `[END]`, in the dispatch rule.** `[END]` was added in Apache 2.3.9 and the host may be 2.2, where an unknown `RewriteRule` flag is a syntax error — a 500 on every request to the whole site. No `<IfModule>` can guard a flag.
3. **Never rename `api-laravel/` to `api/` in this plan.** `^api(/|$)` cannot match `api-laravel/…` because the hyphen defeats `(/|$)`. That is the only thing stopping the rewrite from looping. The rename is a separate follow-up PR (spec §12).
4. **Do not touch `api/.htaccess` or `api/public/.htaccess`.** Spec §6: they never reach a server, the root catch-all protects the tree, and delivering the `public/` grant would open staging `/api/*` to bots.
5. **The Laravel test suite uses `laravel_api_test`** (`api/phpunit.xml`). `RefreshDatabase` drops every table, so it must never point at the shared `lescanetons` database.
6. **A new JS or CSS entry file requires `docker compose restart assets`** before it appears in Vite's manifest.
7. **A `reason` token whose French string interpolates MUST be given its `params`.** `i18n.js` renders `invalid_value` as `"doit être l'une des valeurs suivantes : {{allowed}}"`, and i18next does **not** blank a missing interpolation value — it emits the literal `{{allowed}}` to the user. The invariant is therefore structural, not a convention: `invalid_value` is reachable **only** via the explicit `in` entry, which supplies `allowed`. Numeric failures (`gt`, `min`) use the paramless `invalid_number`, and the unmapped fallback is the paramless `invalid_format`. No interpolating token can ship without its params.

   This matters most for **object rules**, which are the likely trap: `Rule::enum(...)`, `Password::defaults()`, a custom `ValidationRule` or a closure rule do **not** report a StudlyCase name — `Validator.php` keys `failedRules` by `get_class($rule)`, so they arrive as an FQCN, never match the map, and take the fallback. Adding a rule that needs a specific user-visible message means adding an explicit map entry; everything else degrades safely to "n'est pas dans un format valide".
8. **Do not use `min` on a string or array field.** Laravel's `min` is polymorphic — "at least 5" for a number, "at least 5 characters" for a string, "at least 5 items" for an array — and reports all three as the same `Min` rule with no type information in `failed()`. It is mapped to `invalid_number`, so `['password' => ['min:8']]` would render as *"Mot de passe n'est pas un nombre valide"*. Nothing validates a string with `min` today. If a task needs one, add a separate `too_short` token mirroring `too_long` (with a `params` branch) rather than reusing the mapping. `gt` is numeric-only and has no such ambiguity.
9. **Never use `abort(403)` or `abort(401)` in an API controller or middleware.** They raise a bare `HttpException`, which the error renderer deliberately does not catch, so the response is Laravel's native untranslatable shape. Throw `AuthorizationException` or `AuthenticationException` instead (or use `Gate::authorize()`). Verified against the running kernel during Task 1 — this is the exact trap that made the first version of Task 1's 403 renderer dead code.

## Test commands

Use these exact forms. All were verified against the running stack on 2026-07-25.

| Purpose | Command |
| --- | --- |
| Laravel suite | `docker compose exec -w /var/www/html/api-laravel web php artisan test` |
| One Laravel test | `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=NameOfTest` |
| Old app unit suite | `npm run test:php -- -- --testsuite unit` |
| Old app, one test | `npm run test:php -- -- --filter=NameOfTest` |

Two things that will otherwise waste your time:

- **The `-w` flag is required.** `artisan test` shells out to `vendor/phpunit/phpunit/phpunit` relative to the *working directory*, so running it as `php api-laravel/artisan test` from `/var/www/html` fails with "Could not open input file".
- **The old app's suite needs a double `--`.** The first is npm's, the second is Composer's `exec` separator. `npm run test:php -- --testsuite unit` silently passes the flag to Composer instead of PHPUnit and errors.
- **In Git Bash, prefix docker commands with `MSYS_NO_PATHCONV=1`.** MSYS rewrites the `-w /var/www/html/api-laravel` argument into a Windows path and Docker rejects it with "Cwd must be an absolute path". PowerShell is unaffected.

**Baseline as of the start of this work:** Laravel 32/32 passing. Old app 84 unit tests passing, and **31 integration tests erroring** with `Call to undefined function App\mysqli_report()` — the `composer:2` image has no mysqli extension. That is pre-existing and unrelated to this plan. Every one of those 31 tests is deleted by Tasks 25 and 26, so:

- Before Task 26, gate on the **unit** suite and the individual lint scripts.
- `npm run check` chains the full `test:php`, so it is red until Task 26 and only becomes a valid gate from there on.
- Do **not** try to fix the integration tests. They are being deleted.

---

## File structure

### Created — Laravel (`api/`)

| File | Responsibility |
| --- | --- |
| `app/Exceptions/ApiError.php` | Renders exceptions into the `{error, code, fields[]}` contract; maps Laravel rule names to `reason` tokens |
| `app/Models/ContactMessage.php` | `contact_messages` |
| `app/Models/Signup.php` | `signups`, with a `menus` JSON cast |
| `app/Models/Event.php` | `events`, plus the frontend JSON shape |
| `app/Models/Response.php` | `responses` |
| `app/Support/Altcha.php` | Proof-of-work challenge create/verify (ported verbatim) |
| `app/Support/ChallengeGuard.php` | Single-use replay guard over `Cache::add()` |
| `app/Support/Occasion.php` | Occasion + menu constants, `normalizeMenus()` |
| `app/Support/SignupStats.php` | `computeStats()`, `exportRows()`, formula-injection escaping |
| `app/Http/Middleware/RequireCapability.php` | Route middleware `capability:respond` etc. |
| `app/Http/Requests/ContactRequest.php` | Validation for `POST /api/contact` |
| `app/Http/Requests/SignupRequest.php` | Validation for `POST /api/signups` |
| `app/Http/Requests/EventRequest.php` | Validation for `POST`/`PUT /api/events` |
| `app/Http/Requests/ResponseRequest.php` | Validation for `POST /api/responses` |
| `app/Http/Controllers/Api/ContactController.php` | Store a contact message |
| `app/Http/Controllers/Api/AltchaController.php` | Issue a challenge |
| `app/Http/Controllers/Api/SignupController.php` | Public store; admin stats + xlsx |
| `app/Http/Controllers/Api/EventController.php` | Public index; admin write |
| `app/Http/Controllers/Api/ResponseController.php` | Member store; admin summary |
| `app/Mail/SignupConfirmation.php` | Confirmation mail (French body) |
| `database/migrations/2026_07_26_000001_drop_used_challenges_table.php` | Drops the table replaced by the cache guard |
| `.env.example` | Committed template for the hand-placed server `.env` |

### Created — old app

| File | Responsibility |
| --- | --- |
| `app/assets/js/api.js` | `apiFetch()` — CSRF cookie priming + `X-XSRF-TOKEN` on mutating calls |

### Modified

| File | Change |
| --- | --- |
| `api/bootstrap/app.php` | Register `ApiError` renderer and the `capability` middleware alias |
| `api/routes/api.php` | Wire the five endpoints |
| `api/app/Http/Controllers/Api/AuthController.php` | `code: invalid_credentials`; the `$_SESSION` bridge |
| `api/app/Http/Controllers/Api/MigrateController.php` | Read the `X-Migrate-Token` header |
| `api/composer.json` | Add `shuchkin/simplexlsxgen` |
| `api/database/migrations/2026_07_23_000004_create_signups_table.php` | `$table->id()` → `$table->increments('id')` |
| `app/.htaccess` | Receives the dispatch block with `[L]` |
| `app/src/routes.php` | Remove `/api/*` route generation |
| `app/src/Auth.php` | Trim the API half; keep the page half |
| `app/src/bootstrap.php` | Remove the `AutoMigrator` call |
| `app/assets/js/*.js` (8 files) | Use `apiFetch()` |
| `tools/build-overlays.mjs` | Drop the docker dispatch merge |
| `tools/build.mjs` | Stop copying `sql/migrations` |
| `tools/deploy/preflight.mjs` | Add `.env` to `PROTECTED` |
| `tools/smoke-docker.mjs` | Cover the five now-live endpoints |
| `docker/web/entrypoint.sh` | Drop the old-migrations step |
| `config/config.example.php` | Remove `auto_migrate` and `migrate.token` |
| `CLAUDE.md`, `staging/README.md` | Update the changed architecture |

### Deleted

`app/api/` (all 8 handlers) · `app/src/Migrator.php` · `app/src/AutoMigrator.php` · `app/src/Altcha.php` · `app/src/Mailer.php` · `app/src/Http/JsonResponse.php` · `app/src/Dto/` · `app/src/Validation/` · `app/src/Repositories/{Event,Response,Challenge,User}Repository.php` · `sql/migrations/` · `tools/migrate.php` · `docker/web/api-dispatch.htaccess` · and the tests covering all of the above.

**Kept deliberately:** `app/src/Auth.php` (trimmed), `app/src/Repositories/SignupRepository.php` — nine pages under `app/pages/` still use them.

---

## Phase 1 — Laravel implementation (no server behaviour change)

Everything in this phase is inert on servers: nothing dispatches `/api/*` yet. The Laravel suite must be green at the end of every task.

**Run the suite with:** `docker compose exec -w /var/www/html/api-laravel web php artisan test`
**Run one test with:** `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=test_name`

---

### Task 1: The error-contract renderer

The single most important task: it defines the JSON shape every later endpoint depends on.

**Files:**
- Create: `api/app/Exceptions/ApiError.php`
- Create: `api/tests/Feature/ApiErrorContractTest.php`
- Modify: `api/bootstrap/app.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ApiErrorContractTest extends TestCase
{
    public function test_validation_failure_uses_the_legacy_contract(): void
    {
        Route::post('/api/_contract_probe', function () {
            request()->validate([
                'email' => ['required', 'email', 'max:255'],
                'subject' => ['required', 'string'],
            ]);
        });

        $response = $this->postJson('/api/_contract_probe', ['email' => 'nope']);

        $response->assertStatus(400)->assertExactJson([
            'error' => 'Invalid form submission',
            'code' => 'validation_failed',
            'fields' => [
                ['field' => 'email', 'reason' => 'invalid_format'],
                ['field' => 'subject', 'reason' => 'required'],
            ],
        ]);
    }

    public function test_max_length_failure_carries_the_limit_as_params(): void
    {
        Route::post('/api/_contract_probe_len', function () {
            request()->validate(['subject' => ['required', 'max:255']]);
        });

        $response = $this->postJson('/api/_contract_probe_len', [
            'subject' => str_repeat('x', 256),
        ]);

        $response->assertStatus(400)->assertJsonPath('fields.0', [
            'field' => 'subject',
            'reason' => 'too_long',
            'params' => ['max' => 255],
        ]);
    }

    public function test_in_rule_failure_carries_the_allowed_values(): void
    {
        Route::post('/api/_contract_probe_in', function () {
            request()->validate([
                'participation' => ['required', 'in:participate,notparticipate'],
            ]);
        });

        $response = $this->postJson('/api/_contract_probe_in', ['participation' => 'maybe']);

        $response->assertStatus(400)->assertJsonPath('fields.0', [
            'field' => 'participation',
            'reason' => 'invalid_value',
            'params' => ['allowed' => ['participate', 'notparticipate']],
        ]);
    }

    public function test_unauthenticated_request_uses_the_legacy_contract(): void
    {
        $this->getJson('/api/user')->assertStatus(401)->assertExactJson([
            'error' => 'Not authenticated',
            'code' => 'not_authenticated',
        ]);
    }

    public function test_only_the_first_failure_per_field_is_reported(): void
    {
        Route::post('/api/_contract_probe_first', function () {
            request()->validate(['email' => ['required', 'email']]);
        });

        $response = $this->postJson('/api/_contract_probe_first', ['email' => '']);

        $response->assertStatus(400)->assertJsonCount(1, 'fields');
    }

    public function test_authorization_failure_uses_the_legacy_contract(): void
    {
        // Regression guard: Handler::render() rewrites AuthorizationException
        // into AccessDeniedHttpException before the render callbacks run, so a
        // closure type-hinted on the original silently never fires. Task 4's
        // capability middleware throws exactly this.
        Route::get('/api/_contract_probe_403', function () {
            throw new \Illuminate\Auth\Access\AuthorizationException();
        });

        $this->getJson('/api/_contract_probe_403')->assertStatus(403)->assertExactJson([
            'error' => 'Access denied',
            'code' => 'access_denied',
        ]);
    }
}
```

Why `assertExactJson`: the old contract has no extra keys, and `translateApiError()` reads `code` and `fields` positionally. An extra `message` key is harmless but a missing `code` silently degrades every error to `"Une erreur est survenue"`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ApiErrorContractTest`
Expected: FAIL — Laravel returns its native `{message, errors}` with status 422, not 400.

- [ ] **Step 3: Write the renderer**

`api/app/Exceptions/ApiError.php`:

```php
<?php

namespace App\Exceptions;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * Renders exceptions into the JSON error contract the front-end consumes:
 *
 *     {"error": "...", "code": "...", "fields": [{"field", "reason", "params"?}]}
 *
 * This deliberately replaces Laravel's native {message, errors:{}} shape.
 * app/assets/js/i18n.js's translateApiError() is the ONLY place French is
 * computed in the whole system, and it maps `code` and `fields[].reason` —
 * stable machine tokens — onto French text. Laravel's native shape carries
 * English prose instead, which that layer cannot translate. Keeping this
 * contract is also what upholds the project rule that API bodies stay English.
 *
 * Every `reason` and `field` token emitted here must exist as a key in
 * i18n.js; ApiErrorVocabularyTest enforces that.
 */
final class ApiError
{
    /**
     * Laravel rule name => legacy reason token. Rules absent from this map fall
     * back to 'invalid_value', which i18n.js can always render.
     */
    private const REASONS = [
        'required' => 'required',
        'max' => 'too_long',
        'email' => 'invalid_format',
        'date' => 'invalid_format',
        'date_format' => 'invalid_format',
        'string' => 'invalid_type',
        'integer' => 'invalid_type',
        'boolean' => 'invalid_type',
        'array' => 'invalid_type',
        'in' => 'invalid_value',
        'min' => 'invalid_value',
        'gt' => 'invalid_value',
        'exists' => 'invalid_value',
    ];

    public static function validation(ValidationException $e): JsonResponse
    {
        $fields = [];

        // One entry per field, first failure only — the old Validator broke out
        // of its constraint loop on the first hit, and i18n.js renders one
        // message per field.
        foreach ($e->validator->failed() as $field => $rules) {
            $rule = (string) array_key_first($rules);
            $parameters = $rules[$rule];
            $reason = self::REASONS[self::snake($rule)] ?? 'invalid_value';

            $entry = ['field' => $field, 'reason' => $reason];
            if ($reason === 'too_long' && isset($parameters[0])) {
                $entry['params'] = ['max' => (int) $parameters[0]];
            } elseif ($reason === 'invalid_value' && self::snake($rule) === 'in') {
                $entry['params'] = ['allowed' => array_values($parameters)];
            }

            $fields[] = $entry;
        }

        return self::json(400, 'validation_failed', 'Invalid form submission', $fields);
    }

    public static function unauthenticated(AuthenticationException $e): JsonResponse
    {
        return self::json(401, 'not_authenticated', 'Not authenticated');
    }

    public static function forbidden(AuthorizationException $e): JsonResponse
    {
        return self::json(403, 'access_denied', 'Access denied');
    }

    /** @param array<int, array<string, mixed>> $fields */
    public static function json(
        int $status,
        string $code,
        string $message,
        array $fields = []
    ): JsonResponse {
        $body = ['error' => $message, 'code' => $code];
        if ($fields !== []) {
            $body['fields'] = $fields;
        }

        return response()->json($body, $status);
    }

    /** Laravel reports failed rules in StudlyCase (e.g. DateFormat). */
    private static function snake(string $rule): string
    {
        return strtolower(preg_replace('/(?<!^)[A-Z]/', '_$0', $rule));
    }
}
```

- [ ] **Step 4: Register it**

Replace the `withExceptions` block in `api/bootstrap/app.php`:

```php
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        // The front-end's French layer reads {error, code, fields[]} — see
        // App\Exceptions\ApiError. These renderers replace Laravel's native
        // {message, errors:{}} for every /api/* response.
        $exceptions->render(fn (ValidationException $e, Request $request) => $request->is('api/*')
            ? ApiError::validation($e)
            : null);

        $exceptions->render(fn (AuthenticationException $e, Request $request) => $request->is('api/*')
            ? ApiError::unauthenticated($e)
            : null);

        // AccessDeniedHttpException, NOT AuthorizationException. Handler::render()
        // calls prepareException() BEFORE renderViaCallbacks(), and that rewrites
        // an AuthorizationException into AccessDeniedHttpException — so a closure
        // type-hinted on the original never fires and the 403 falls through to
        // Laravel's native shape. Verified against the real kernel. Do not
        // "simplify" this back.
        $exceptions->render(fn (AccessDeniedHttpException $e, Request $request) => $request->is('api/*')
            ? ApiError::forbidden($e)
            : null);
    })->create();
```

Add these imports at the top of `api/bootstrap/app.php`:

```php
use App\Exceptions\ApiError;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
```

`ApiError::forbidden()`'s parameter type must match — take the Symfony exception (or drop the type entirely, since the argument is unused).

- [ ] **Step 5: Run the test and confirm it passes**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ApiErrorContractTest`
Expected: PASS, 6 tests.

- [ ] **Step 6: Run the whole suite**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test`
Expected: PASS. `AuthTest::test_current_user_endpoint_requires_auth` still asserts only a 401 status, so the new body does not break it.

- [ ] **Step 7: Commit**

```bash
git add api/app/Exceptions/ApiError.php api/bootstrap/app.php api/tests/Feature/ApiErrorContractTest.php
git commit -m "feat(api): render API errors in the legacy {error, code, fields} contract"
```

---

### Task 2: Fix the login error code

`AuthController` returns `{"error": "Invalid credentials"}` with **no `code`**, so `translateApiError()` cannot map it and the user sees the generic fallback. The old `login.php` sent `code: 'invalid_credentials'`, which already exists in `i18n.js`.

**Files:**
- Modify: `api/app/Http/Controllers/Api/AuthController.php:23-25`
- Modify: `api/tests/Feature/AuthTest.php`

- [ ] **Step 1: Write the failing assertion**

Add to `api/tests/Feature/AuthTest.php`:

```php
    public function test_failed_login_carries_the_translatable_error_code(): void
    {
        User::create([
            'username' => 'demo.user',
            'password' => 'secret123',
            'role' => 'user',
        ]);

        $this->spaPostJson('/api/login', [
            'username' => 'demo.user',
            'password' => 'wrong',
        ])->assertStatus(401)->assertExactJson([
            'error' => 'Incorrect username or password',
            'code' => 'invalid_credentials',
        ]);
    }
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=test_failed_login_carries_the_translatable_error_code`
Expected: FAIL — body is `{"error":"Invalid credentials"}`, missing `code`.

- [ ] **Step 3: Fix the controller**

In `api/app/Http/Controllers/Api/AuthController.php`, replace the failure branch:

```php
        if (!Auth::attempt($credentials)) {
            // One generic code, never a per-field error: that would reveal
            // which of username/password was wrong, and enable enumeration.
            return ApiError::json(401, 'invalid_credentials', 'Incorrect username or password');
        }
```

Add the import:

```php
use App\Exceptions\ApiError;
```

- [ ] **Step 4: Run the suite**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=AuthTest`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add api/app/Http/Controllers/Api/AuthController.php api/tests/Feature/AuthTest.php
git commit -m "fix(api): send invalid_credentials code so the login error translates"
```

---

### Task 2b: A style gate for `api/`

`phpcs.xml` scopes only `<file>app</file>`, so the Laravel tree is **entirely unlinted**. Pint is already a dependency but is wired into no npm script and no CI step, and `api/` carries ~15 pre-existing issues. Doing this now, rather than after the remaining Laravel tasks, is the point — otherwise inconsistency accumulates across every file they add.

**Files:**
- Modify: `package.json`, `.github/workflows/ci.yml`
- Create: `tools/pint.mjs` (only if the Dockerised wrapper pattern needs it — check how `tools/php-lint.mjs` does it first and follow that pattern)

- [ ] **Step 1: See the current state**

Run: `docker compose exec -w /var/www/html/api-laravel web ./vendor/bin/pint --test`
Expected: FAIL, listing roughly 15 files.

- [ ] **Step 2: Fix them**

Run: `docker compose exec -w /var/www/html/api-laravel web ./vendor/bin/pint`
Then re-run `--test` and expect PASS.

Review the diff before committing — Pint reformats, and you want to see nothing surprising in files this plan has already touched.

- [ ] **Step 3: Add npm scripts**

In `package.json`, following the naming of the existing `lint:php` / `fix` scripts:

```json
"lint:api": "docker compose exec -T -w /var/www/html/api-laravel web ./vendor/bin/pint --test",
"fix:api": "docker compose exec -T -w /var/www/html/api-laravel web ./vendor/bin/pint"
```

Add `lint:api` to the `check` chain, and `fix:api` to the `fix` chain.

**Check first whether `npm run check` must work without Docker** (a Claude Code web session has no daemon — see CLAUDE.md). If the other PHP scripts fall back to a local binary via `tools/php-in-docker.mjs`, mirror that pattern instead of calling `docker compose` directly, or `check` will break in web sessions.

- [ ] **Step 4: Add it to CI**

Add a step running `npm run lint:api` alongside the existing lint jobs in `.github/workflows/ci.yml`. CI has no compose stack, so this must use whatever mechanism the other PHP lint step uses there — read that job before writing this one.

- [ ] **Step 5: Verify**

Run: `npm run lint:api`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json .github/workflows/ci.yml api/
git commit -m "build(api): lint the Laravel tree with Pint in check and CI"
```

---

### Task 3: Eloquent models

**Files:**
- Create: `api/app/Models/ContactMessage.php`, `Signup.php`, `Event.php`, `Response.php`
- Create: `api/tests/Feature/ModelsTest.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Signup;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ModelsTest extends TestCase
{
    use RefreshDatabase;

    public function test_signup_casts_menus_to_an_array(): void
    {
        $signup = Signup::create([
            'occasion' => 'anniversary-supper',
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'address' => 'Rue du Test 1',
            'phone' => '0790000000',
            'email' => 'ada@example.com',
            'table_name' => 'Table 1',
            'menus' => ['meat', 'child'],
        ]);

        $this->assertSame(['meat', 'child'], $signup->fresh()->menus);
    }

    public function test_event_exposes_the_frontend_shape(): void
    {
        $event = Event::create([
            'date' => '2027-11-13',
            'title' => 'Repetition',
            'start_time' => '20:00:00',
            'end_time' => '22:00:00',
            'location' => 'Local',
            'attire' => 'Casual',
            'weekend' => 1,
        ]);

        $this->assertSame([
            'id' => $event->id,
            'date' => '2027-11-13',
            'title' => 'Repetition',
            'startTime' => '20:00:00',
            'endTime' => '22:00:00',
            'location' => 'Local',
            'attire' => 'Casual',
            'weekend' => 1,
            'response' => null,
        ], $event->toFrontendShape());
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ModelsTest`
Expected: FAIL — `Class "App\Models\Signup" not found`.

- [ ] **Step 3: Write the models**

`api/app/Models/ContactMessage.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContactMessage extends Model
{
    protected $fillable = ['last_name', 'first_name', 'email', 'subject', 'message'];
}
```

`api/app/Models/Signup.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Signup extends Model
{
    protected $fillable = [
        'occasion', 'first_name', 'last_name', 'address',
        'phone', 'email', 'table_name', 'menus',
    ];

    // The column is TEXT holding a JSON array (the old app wrote it with
    // json_encode); 'array' keeps that wire format byte-compatible.
    protected function casts(): array
    {
        return ['menus' => 'array'];
    }
}
```

`api/app/Models/Event.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Event extends Model
{
    protected $fillable = [
        'date', 'title', 'start_time', 'end_time', 'location', 'attire', 'weekend',
    ];

    public function responses(): HasMany
    {
        return $this->hasMany(Response::class);
    }

    /**
     * The JSON shape the frontend expects. camelCase keys and the integer
     * `weekend` are what planning_repet.js already reads — do not "fix" them
     * to snake_case without changing that file and i18n.js's fields.* keys.
     *
     * `response` is the CALLER'S OWN answer, injected by EventController when a
     * user is authenticated. There is deliberately no way to ask for another
     * user's answer; that absence is what keeps a previously-fixed IDOR closed.
     */
    public function toFrontendShape(?string $ownAnswer = null): array
    {
        return [
            'id' => (int) $this->id,
            'date' => $this->date,
            'title' => $this->title,
            'startTime' => $this->start_time,
            'endTime' => $this->end_time,
            'location' => $this->location,
            'attire' => $this->attire,
            'weekend' => (int) $this->weekend,
            'response' => $ownAnswer ?: null,
        ];
    }
}
```

`api/app/Models/Response.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Response extends Model
{
    protected $fillable = ['user_id', 'event_id', 'answer'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ModelsTest`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add api/app/Models api/tests/Feature/ModelsTest.php
git commit -m "feat(api): add Eloquent models for contact, signups, events, responses"
```

---

### Task 4: Capability middleware

The capability matrix already exists as `App\Support\Capability`. This exposes it as route middleware. It is **not a hierarchy**: admin manages events but cannot respond.

**Files:**
- Create: `api/app/Http/Middleware/RequireCapability.php`
- Create: `api/tests/Feature/RequireCapabilityTest.php`
- Modify: `api/bootstrap/app.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class RequireCapabilityTest extends TestCase
{
    use RefreshDatabase;

    private function probe(string $capability): void
    {
        Route::middleware(['auth:sanctum', "capability:$capability"])
            ->get('/api/_capability_probe', fn () => response()->json(['ok' => true]));
    }

    public function test_a_role_holding_the_capability_passes(): void
    {
        $this->probe('respond');
        $user = User::create(['username' => 'u', 'password' => 'x', 'role' => 'user']);

        $this->actingAs($user)->getJson('/api/_capability_probe')
            ->assertOk()->assertJson(['ok' => true]);
    }

    public function test_a_role_lacking_the_capability_is_forbidden(): void
    {
        $this->probe('respond');
        // admin may manage events but must NOT respond — not a hierarchy.
        $admin = User::create(['username' => 'a', 'password' => 'x', 'role' => 'admin']);

        $this->actingAs($admin)->getJson('/api/_capability_probe')
            ->assertStatus(403)
            ->assertExactJson(['error' => 'Access denied', 'code' => 'access_denied']);
    }

    public function test_an_anonymous_caller_is_unauthenticated_not_forbidden(): void
    {
        $this->probe('respond');

        $this->getJson('/api/_capability_probe')
            ->assertStatus(401)
            ->assertExactJson(['error' => 'Not authenticated', 'code' => 'not_authenticated']);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=RequireCapabilityTest`
Expected: FAIL — `Target class [capability] does not exist`.

- [ ] **Step 3: Write the middleware**

`api/app/Http/Middleware/RequireCapability.php`:

```php
<?php

namespace App\Http\Middleware;

use App\Support\Capability;
use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware: capability:respond | manage_events | view_summary.
 *
 * Authentication is a separate concern — pair this with auth:sanctum so an
 * anonymous caller gets 401, not 403.
 */
class RequireCapability
{
    public function handle(Request $request, Closure $next, string $capability): Response
    {
        if (!Capability::can($request->user()?->role, $capability)) {
            throw new AuthorizationException();
        }

        return $next($request);
    }
}
```

- [ ] **Step 4: Register the alias**

In `api/bootstrap/app.php`, inside the `withMiddleware` closure, after `$middleware->statefulApi();`:

```php
        $middleware->alias([
            'capability' => \App\Http\Middleware\RequireCapability::class,
        ]);
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=RequireCapabilityTest`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add api/app/Http/Middleware/RequireCapability.php api/bootstrap/app.php api/tests/Feature/RequireCapabilityTest.php
git commit -m "feat(api): add capability route middleware over the shared matrix"
```

---

### Task 5: Port Altcha

Copy of `app/src/Altcha.php`, namespace changed. **Do not simplify the verification** — it is deliberately fail-closed and requires a signature, mitigating advisory GHSA-82w8-65qw-gch6 in the upstream library.

**Files:**
- Create: `api/app/Support/Altcha.php`
- Create: `api/tests/Unit/AltchaTest.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Unit;

use App\Support\Altcha;
use PHPUnit\Framework\TestCase;

class AltchaTest extends TestCase
{
    private const SECRET = 'test-secret';

    /** Solve a challenge the way the browser widget does. */
    private function solve(array $challenge, int $number): string
    {
        return base64_encode(json_encode([
            'algorithm' => $challenge['algorithm'],
            'challenge' => $challenge['challenge'],
            'number' => $number,
            'salt' => $challenge['salt'],
            'signature' => $challenge['signature'],
        ]));
    }

    public function test_a_correct_solution_returns_the_signature(): void
    {
        $altcha = new Altcha(self::SECRET);
        $challenge = $altcha->createChallenge(1000, 600, 1_000_000, 42, 'aabbcc');

        $this->assertSame(
            $challenge['signature'],
            $altcha->verifySolution($this->solve($challenge, 42), 1_000_000)
        );
    }

    public function test_a_wrong_number_is_rejected(): void
    {
        $altcha = new Altcha(self::SECRET);
        $challenge = $altcha->createChallenge(1000, 600, 1_000_000, 42, 'aabbcc');

        $this->assertNull($altcha->verifySolution($this->solve($challenge, 43), 1_000_000));
    }

    public function test_an_expired_challenge_is_rejected(): void
    {
        $altcha = new Altcha(self::SECRET);
        $challenge = $altcha->createChallenge(1000, 600, 1_000_000, 42, 'aabbcc');

        // 601s later: past the 600s TTL.
        $this->assertNull($altcha->verifySolution($this->solve($challenge, 42), 1_000_601));
    }

    public function test_a_missing_signature_is_rejected(): void
    {
        $altcha = new Altcha(self::SECRET);
        $challenge = $altcha->createChallenge(1000, 600, 1_000_000, 42, 'aabbcc');
        $payload = json_decode(base64_decode($this->solve($challenge, 42)), true);
        unset($payload['signature']);

        $this->assertNull(
            $altcha->verifySolution(base64_encode(json_encode($payload)), 1_000_000)
        );
    }

    public function test_a_signature_from_another_secret_is_rejected(): void
    {
        $challenge = (new Altcha('other-secret'))
            ->createChallenge(1000, 600, 1_000_000, 42, 'aabbcc');

        $this->assertNull(
            (new Altcha(self::SECRET))->verifySolution($this->solve($challenge, 42), 1_000_000)
        );
    }

    public function test_garbage_input_is_rejected(): void
    {
        $altcha = new Altcha(self::SECRET);

        $this->assertNull($altcha->verifySolution('not-base64!!', 1_000_000));
        $this->assertNull($altcha->verifySolution(base64_encode('not json'), 1_000_000));
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=AltchaTest`
Expected: FAIL — `Class "App\Support\Altcha" not found`.

- [ ] **Step 3: Copy the class**

Copy `app/src/Altcha.php` to `api/app/Support/Altcha.php` **verbatim**, changing only:
- `namespace App;` → `namespace App\Support;`
- keep `final class Altcha` and every method body byte-for-byte.

Retain the full class docblock; it records why a signature is mandatory.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=AltchaTest`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add api/app/Support/Altcha.php api/tests/Unit/AltchaTest.php
git commit -m "feat(api): port the self-hosted Altcha proof-of-work challenge"
```

---

### Task 6: The replay guard over the cache

Replaces `used_challenges` + `ChallengeRepository`. `Cache::add()` is atomic and self-expiring, so the manual prune disappears.

**Files:**
- Create: `api/app/Support/ChallengeGuard.php`
- Create: `api/tests/Feature/ChallengeGuardTest.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Support\ChallengeGuard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChallengeGuardTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_signature_can_be_consumed_once(): void
    {
        $guard = new ChallengeGuard();

        $this->assertTrue($guard->consume('sig-abc', 600));
    }

    public function test_replaying_the_same_signature_is_refused(): void
    {
        $guard = new ChallengeGuard();
        $guard->consume('sig-abc', 600);

        $this->assertFalse($guard->consume('sig-abc', 600));
    }

    public function test_distinct_signatures_do_not_collide(): void
    {
        $guard = new ChallengeGuard();

        $this->assertTrue($guard->consume('sig-abc', 600));
        $this->assertTrue($guard->consume('sig-def', 600));
    }

    public function test_a_non_positive_ttl_still_refuses_replay(): void
    {
        $guard = new ChallengeGuard();

        // An already-expired challenge must never be consumable at all.
        $this->assertFalse($guard->consume('sig-expired', 0));
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ChallengeGuardTest`
Expected: FAIL — `Class "App\Support\ChallengeGuard" not found`.

- [ ] **Step 3: Write the guard**

`api/app/Support/ChallengeGuard.php`:

```php
<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * Single-use store for solved Altcha challenge signatures (replay protection).
 *
 * Replaces the old app's `used_challenges` table: Cache::add() is atomic —
 * it writes only if the key is absent and reports which happened — which is
 * exactly the semantics needed, and entries expire on their own so no prune
 * step is required.
 *
 * Requires a SHARED, durable cache store (the database store; see the
 * server .env). With the `array` store each request gets a fresh cache and
 * every replay would succeed. `artisan cache:clear` drops outstanding guards,
 * permitting one replay inside a challenge's remaining TTL by an attacker
 * holding the exact payload — accepted, and noted in the spec.
 */
final class ChallengeGuard
{
    private const PREFIX = 'altcha:used:';

    /**
     * @param string $signature the challenge signature returned by Altcha::verifySolution
     * @param int    $ttlSeconds how long the guard must outlive the challenge
     * @return bool true if newly consumed; false on replay or an expired challenge
     */
    public function consume(string $signature, int $ttlSeconds): bool
    {
        if ($ttlSeconds <= 0) {
            return false;
        }

        return Cache::add(self::PREFIX . hash('sha256', $signature), true, $ttlSeconds);
    }
}
```

The key is hashed so a cache-key length limit can never truncate two distinct signatures into a collision.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ChallengeGuardTest`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add api/app/Support/ChallengeGuard.php api/tests/Feature/ChallengeGuardTest.php
git commit -m "feat(api): replace the used_challenges table with a cache replay guard"
```

---

### Task 7: `GET /api/altcha`

**Files:**
- Create: `api/app/Http/Controllers/Api/AltchaController.php`
- Create: `api/tests/Feature/AltchaEndpointTest.php`
- Modify: `api/routes/api.php`, `api/config/app.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use Tests\TestCase;

class AltchaEndpointTest extends TestCase
{
    public function test_it_issues_a_challenge(): void
    {
        config(['app.altcha_secret' => 'a-real-secret']);

        $this->getJson('/api/altcha')
            ->assertOk()
            ->assertJsonStructure(['algorithm', 'challenge', 'maxnumber', 'salt', 'signature'])
            ->assertJsonPath('algorithm', 'SHA-256')
            ->assertJsonPath('maxnumber', 50000);
    }

    public function test_it_fails_closed_when_the_secret_is_unset(): void
    {
        config(['app.altcha_secret' => '']);

        $this->getJson('/api/altcha')
            ->assertStatus(503)
            ->assertExactJson(['error' => 'Service unavailable', 'code' => 'service_unavailable']);
    }

    public function test_it_fails_closed_on_the_placeholder_secret(): void
    {
        // config.example.php ships CHANGE_ME publicly, so any challenge signed
        // with it is forgeable. A half-configured server must never issue one.
        config(['app.altcha_secret' => 'CHANGE_ME']);

        $this->getJson('/api/altcha')->assertStatus(503);
    }

    public function test_the_salt_carries_an_expiry(): void
    {
        config(['app.altcha_secret' => 'a-real-secret']);

        $salt = $this->getJson('/api/altcha')->json('salt');

        $this->assertMatchesRegularExpression('/\?expires=\d+$/', $salt);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=AltchaEndpointTest`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Add the config key**

In `api/config/app.php`, next to `'migrate_token'`:

```php
    // Shared secret signing Altcha proof-of-work challenges. Empty or the
    // literal CHANGE_ME makes the endpoint fail closed (503): the example
    // value is public, so challenges signed with it are forgeable.
    'altcha_secret' => env('ALTCHA_HMAC_SECRET', ''),
```

- [ ] **Step 4: Write the controller**

`api/app/Http/Controllers/Api/AltchaController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Support\Altcha;

class AltchaController extends Controller
{
    /** Client-side proof-of-work cost, and how long a challenge stays valid. */
    public const MAX_NUMBER = 50000;
    public const TTL_SECONDS = 600;

    public function __invoke()
    {
        $secret = (string) config('app.altcha_secret');
        if ($secret === '' || $secret === 'CHANGE_ME') {
            return ApiError::json(503, 'service_unavailable', 'Service unavailable');
        }

        // PoW cost: up to 50k client-side SHA-256 iterations (a few thousand on
        // average) — light friction per submission; 10-minute expiry.
        return response()->json(
            (new Altcha($secret))->createChallenge(self::MAX_NUMBER, self::TTL_SECONDS)
        );
    }
}
```

- [ ] **Step 5: Add the route**

In `api/routes/api.php`:

```php
Route::get('/altcha', AltchaController::class);
```

with `use App\Http\Controllers\Api\AltchaController;` at the top.

- [ ] **Step 6: Run the test and confirm it passes**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=AltchaEndpointTest`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add api/app/Http/Controllers/Api/AltchaController.php api/config/app.php api/routes/api.php api/tests/Feature/AltchaEndpointTest.php
git commit -m "feat(api): add GET /api/altcha, failing closed on a placeholder secret"
```

---

### Task 8: `POST /api/contact`

**Note the wire format:** `app/assets/js/contact.js` posts `new FormData(this)`, so this endpoint receives `multipart/form-data` with **camelCase** field names (`lastName`, `firstName`). Those names must appear verbatim in `fields[].field` to match `i18n.js`.

**Files:**
- Create: `api/app/Http/Requests/ContactRequest.php`, `api/app/Http/Controllers/Api/ContactController.php`
- Create: `api/tests/Feature/ContactEndpointTest.php`
- Modify: `api/routes/api.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContactEndpointTest extends TestCase
{
    use RefreshDatabase;

    private const VALID = [
        'lastName' => 'Lovelace',
        'firstName' => 'Ada',
        'email' => 'ada@example.com',
        'subject' => 'Bonjour',
        'message' => 'Un message.',
    ];

    public function test_it_stores_a_message(): void
    {
        $this->postJson('/api/contact', self::VALID)
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseHas('contact_messages', [
            'last_name' => 'Lovelace',
            'first_name' => 'Ada',
            'email' => 'ada@example.com',
            'subject' => 'Bonjour',
            'message' => 'Un message.',
        ]);
    }

    public function test_it_reports_missing_fields_with_camelcase_names(): void
    {
        $response = $this->postJson('/api/contact', []);

        $response->assertStatus(400)->assertJsonPath('code', 'validation_failed');

        // These names must match i18n.js's fields.* keys exactly.
        $fields = array_column($response->json('fields'), 'field');
        $this->assertSame(['lastName', 'firstName', 'email', 'subject', 'message'], $fields);
    }

    public function test_it_rejects_a_malformed_email(): void
    {
        $response = $this->postJson('/api/contact', ['email' => 'not-an-email'] + self::VALID);

        $response->assertStatus(400)->assertJsonPath('fields.0', [
            'field' => 'email',
            'reason' => 'invalid_format',
        ]);
    }

    public function test_it_stores_raw_input_without_escaping(): void
    {
        // Escaping happens at output time, not storage time.
        $this->postJson('/api/contact', ['message' => '<b>hi</b>'] + self::VALID)->assertOk();

        $this->assertSame('<b>hi</b>', ContactMessage::latest('id')->first()->message);
    }

    public function test_it_rejects_a_get(): void
    {
        $this->getJson('/api/contact')->assertStatus(405);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ContactEndpointTest`
Expected: FAIL — 404.

- [ ] **Step 3: Write the FormRequest**

`api/app/Http/Requests/ContactRequest.php`:

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Field names are camelCase because contact.js posts the form via FormData with
 * those input names, and App\Exceptions\ApiError echoes them straight into
 * fields[].field, where i18n.js looks them up. Renaming them silently breaks
 * the French error messages.
 */
class ContactRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'lastName' => ['required', 'string', 'max:255'],
            'firstName' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'max:255', 'email'],
            'subject' => ['required', 'string', 'max:255'],
            'message' => ['required', 'string'],
        ];
    }
}
```

Rule order matters: `required` first so an empty field reports `required`, and `max` before `email` so an over-long address reports `too_long`, matching the old DTO's attribute order.

- [ ] **Step 4: Write the controller**

`api/app/Http/Controllers/Api/ContactController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ContactRequest;
use App\Models\ContactMessage;

class ContactController extends Controller
{
    public function __invoke(ContactRequest $request)
    {
        // Store raw input; escape at output time (not at storage time).
        ContactMessage::create([
            'last_name' => trim($request->input('lastName')),
            'first_name' => trim($request->input('firstName')),
            'email' => trim($request->input('email')),
            'subject' => trim($request->input('subject')),
            'message' => trim($request->input('message')),
        ]);

        return response()->json(['ok' => true]);
    }
}
```

- [ ] **Step 5: Add the route**

```php
Route::post('/contact', ContactController::class);
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ContactEndpointTest`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add api/app/Http/Requests/ContactRequest.php api/app/Http/Controllers/Api/ContactController.php api/routes/api.php api/tests/Feature/ContactEndpointTest.php
git commit -m "feat(api): port POST /api/contact to Laravel"
```

---

### Task 9: The signup confirmation mail

**Files:**
- Create: `api/app/Mail/SignupConfirmation.php`
- Create: `api/tests/Feature/SignupConfirmationMailTest.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Mail\SignupConfirmation;
use App\Support\Occasion;
use Tests\TestCase;

class SignupConfirmationMailTest extends TestCase
{
    private const SIGNUP = [
        'first_name' => 'Ada',
        'last_name' => 'Lovelace',
        'email' => 'ada@example.com',
        'table_name' => 'Table 1',
        'menus' => ['meat', 'meat', 'child'],
    ];

    public function test_the_subject_names_the_occasion(): void
    {
        $mail = new SignupConfirmation(Occasion::active(), self::SIGNUP);

        $this->assertSame(
            'Confirmation de votre inscription — Souper des 25 ans des Canetons',
            $mail->envelope()->subject
        );
    }

    public function test_the_body_counts_each_menu_and_the_total(): void
    {
        $body = (new SignupConfirmation(Occasion::active(), self::SIGNUP))->buildBody();

        $this->assertStringContainsString('Bonjour Ada Lovelace,', $body);
        $this->assertStringContainsString('- Table : Table 1', $body);
        $this->assertStringContainsString('- Viande : 2', $body);
        $this->assertStringContainsString('- Enfant : 1', $body);
        $this->assertStringContainsString('- Végétarien : 0', $body);
        $this->assertStringContainsString('- Total : 3 personne(s)', $body);
        $this->assertStringContainsString('Les Canetons de Fribourg', $body);
    }

    public function test_an_unknown_menu_value_does_not_inflate_the_counts(): void
    {
        $signup = ['menus' => ['meat', 'bogus']] + self::SIGNUP;

        $body = (new SignupConfirmation(Occasion::active(), $signup))->buildBody();

        $this->assertStringContainsString('- Viande : 1', $body);
        $this->assertStringContainsString('- Total : 2 personne(s)', $body);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=SignupConfirmationMailTest`
Expected: FAIL — `Class "App\Mail\SignupConfirmation" not found`. (`Occasion` arrives in Task 10; if the runner complains about it first, do Task 10 then return.)

- [ ] **Step 3: Write the Mailable**

`api/app/Mail/SignupConfirmation.php`:

```php
<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Plain-text French confirmation for a supper signup. Body assembly is a pure
 * method so it can be asserted without a mail transport.
 */
class SignupConfirmation extends Mailable
{
    use Queueable;
    use SerializesModels;

    /**
     * @param array<string,mixed> $occasion an Occasion entry
     * @param array<string,mixed> $signup   first_name,last_name,email,table_name,menus[]
     */
    public function __construct(
        private array $occasion,
        private array $signup
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            to: [new Address(
                (string) $this->signup['email'],
                trim($this->signup['first_name'] . ' ' . $this->signup['last_name'])
            )],
            subject: 'Confirmation de votre inscription — ' . $this->occasion['title'],
        );
    }

    public function content(): Content
    {
        return new Content(text: 'mail.signup-confirmation-plain', with: [
            'body' => $this->buildBody(),
        ]);
    }

    public function buildBody(): string
    {
        $counts = ['meat' => 0, 'child' => 0, 'vegetarian' => 0];
        foreach ($this->signup['menus'] as $menu) {
            if (isset($counts[$menu])) {
                $counts[$menu]++;
            }
        }
        $total = count($this->signup['menus']);

        return 'Bonjour ' . $this->signup['first_name'] . ' ' . $this->signup['last_name'] . ",\n\n"
            . $this->occasion['teaser'] . "\n\n"
            . 'Date : ' . $this->occasion['date_display'] . "\n\n"
            . "Votre réservation a bien été enregistrée :\n"
            . '- Table : ' . $this->signup['table_name'] . "\n"
            . '- Viande : ' . $counts['meat'] . "\n"
            . '- Enfant : ' . $counts['child'] . "\n"
            . '- Végétarien : ' . $counts['vegetarian'] . "\n"
            . '- Total : ' . $total . " personne(s)\n\n"
            . "Merci et à bientôt !\n"
            . 'Les Canetons de Fribourg';
    }
}
```

- [ ] **Step 4: Create the view**

`api/resources/views/mail/signup-confirmation-plain.blade.php`:

```blade
{!! $body !!}
```

A one-line passthrough: the body is already fully assembled plain text, and `{!! !!}` avoids HTML-escaping the French accents and the `—`.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=SignupConfirmationMailTest`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add api/app/Mail/SignupConfirmation.php api/resources/views/mail/signup-confirmation-plain.blade.php api/tests/Feature/SignupConfirmationMailTest.php
git commit -m "feat(api): add the signup confirmation Mailable"
```

---

### Task 10: Occasion constants and signup aggregation

Pure functions lifted from `SignupRepository`. The old class **stays** in the old app (pages read its constants); this is a parallel copy for the API, which is acceptable because the old one is deleted in sub-project 3.

**Files:**
- Create: `api/app/Support/Occasion.php`, `api/app/Support/SignupStats.php`
- Create: `api/tests/Unit/OccasionTest.php`, `api/tests/Unit/SignupStatsTest.php`

- [ ] **Step 1: Write the failing tests**

`api/tests/Unit/OccasionTest.php`:

```php
<?php

namespace Tests\Unit;

use App\Support\Occasion;
use PHPUnit\Framework\TestCase;

class OccasionTest extends TestCase
{
    public function test_the_active_occasion_is_resolvable(): void
    {
        $this->assertSame(
            'Souper des 25 ans des Canetons',
            Occasion::active()['title']
        );
    }

    public function test_valid_menus_are_returned_unchanged(): void
    {
        $this->assertSame(['meat', 'child'], Occasion::normalizeMenus(['meat', 'child']));
    }

    public function test_a_non_array_is_rejected(): void
    {
        $this->assertNull(Occasion::normalizeMenus('meat'));
        $this->assertNull(Occasion::normalizeMenus(null));
    }

    public function test_an_unknown_menu_value_is_rejected(): void
    {
        $this->assertNull(Occasion::normalizeMenus(['meat', 'lobster']));
    }

    public function test_an_empty_list_is_rejected(): void
    {
        $this->assertNull(Occasion::normalizeMenus([]));
    }

    public function test_more_than_the_guest_cap_is_rejected(): void
    {
        $this->assertNull(Occasion::normalizeMenus(array_fill(0, 31, 'meat')));
        $this->assertNotNull(Occasion::normalizeMenus(array_fill(0, 30, 'meat')));
    }
}
```

`api/tests/Unit/SignupStatsTest.php`:

```php
<?php

namespace Tests\Unit;

use App\Support\SignupStats;
use PHPUnit\Framework\TestCase;

class SignupStatsTest extends TestCase
{
    private const SIGNUPS = [
        [
            'first_name' => 'Ada', 'last_name' => 'Lovelace',
            'address' => 'Rue 1', 'phone' => '079', 'email' => 'ada@example.com',
            'table_name' => 'Table 1', 'menus' => ['meat', 'child'],
        ],
        [
            'first_name' => 'Alan', 'last_name' => 'Turing',
            'address' => 'Rue 2', 'phone' => '078', 'email' => 'alan@example.com',
            'table_name' => 'Table 1', 'menus' => ['vegetarian'],
        ],
        [
            'first_name' => 'Grace', 'last_name' => 'Hopper',
            'address' => 'Rue 3', 'phone' => '077', 'email' => 'grace@example.com',
            'table_name' => 'Table 2', 'menus' => ['meat'],
        ],
    ];

    public function test_it_totals_persons_and_tables(): void
    {
        $stats = SignupStats::compute(self::SIGNUPS);

        $this->assertSame(4, $stats['totalPersons']);
        $this->assertSame(2, $stats['totalTables']);
        $this->assertSame(['meat' => 2, 'child' => 1, 'vegetarian' => 1], $stats['menuTotals']);
    }

    public function test_it_groups_signups_by_table_preserving_order(): void
    {
        $stats = SignupStats::compute(self::SIGNUPS);

        $this->assertSame('Table 1', $stats['tables'][0]['name']);
        $this->assertSame(3, $stats['tables'][0]['personCount']);
        $this->assertCount(2, $stats['tables'][0]['signups']);
        $this->assertSame('Table 2', $stats['tables'][1]['name']);
        $this->assertSame(1, $stats['tables'][1]['personCount']);
    }

    public function test_export_rows_start_with_a_french_header(): void
    {
        $rows = SignupStats::exportRows(self::SIGNUPS);

        $this->assertSame(
            ['Table', 'Nom', 'Prénom', 'Email', 'Adresse', 'Téléphone',
             'Viande', 'Enfant', 'Végétarien', 'Total'],
            $rows[0]
        );
        $this->assertCount(4, $rows);
    }

    public function test_export_neutralizes_spreadsheet_formula_injection(): void
    {
        $rows = SignupStats::exportRows([
            ['first_name' => '=cmd', 'last_name' => '+x', 'address' => '-y',
             'phone' => '@z', 'email' => 'ok@example.com',
             'table_name' => 'Table', 'menus' => ['meat']],
        ]);

        $this->assertSame("'+x", $rows[1][1]);
        $this->assertSame("'=cmd", $rows[1][2]);
        $this->assertSame("'-y", $rows[1][4]);
        $this->assertSame("'@z", $rows[1][5]);
    }
}
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter="OccasionTest|SignupStatsTest"`
Expected: FAIL — both classes not found.

- [ ] **Step 3: Write `Occasion`**

`api/app/Support/Occasion.php`:

```php
<?php

namespace App\Support;

/**
 * Occasion + menu reference data for the public signup form, and validation of
 * a client-supplied menu list.
 *
 * Mirrors the constants in the old app's App\Repositories\SignupRepository,
 * which still serves the old pages until sub-project 3 retires them. Keep the
 * two in step until then: the prices and copy are placeholders and will change.
 */
final class Occasion
{
    public const MENU_VALUES = ['meat', 'child', 'vegetarian'];

    public const MENU_LABELS = [
        'meat' => 'Viande',
        'child' => 'Enfant',
        'vegetarian' => 'Végétarien',
    ];

    public const MAX_GUESTS = 30;

    public const ACTIVE = 'anniversary-supper';

    public const ALL = [
        'anniversary-supper' => [
            'title' => 'Souper des 25 ans des Canetons',
            'subtitle' => 'Sortie du nouveau costume · Soirée guggen',
            'date' => '2027-11-13',
            'date_display' => '13 novembre 2027',
            'teaser' => 'Fêtez avec nous les 25 ans des Canetons ! Nouveau '
                . 'costume, un souper d\'anniversaire et une soirée guggen.',
            'invitation' => 'Amis et familles, réservez votre place et votre menu.',
        ],
    ];

    /** @return array<string,mixed> */
    public static function active(): array
    {
        return self::ALL[self::ACTIVE];
    }

    /**
     * Validate a raw menus value from client input.
     *
     * @return string[]|null clean list of menu values, or null if invalid
     */
    public static function normalizeMenus(mixed $raw): ?array
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
}
```

- [ ] **Step 4: Write `SignupStats`**

`api/app/Support/SignupStats.php`:

```php
<?php

namespace App\Support;

/** Aggregation and spreadsheet export for supper signups. */
final class SignupStats
{
    /**
     * Aggregate signups into totals + per-table grouping.
     *
     * @param array<int,array<string,mixed>> $signups each with table_name, menus(string[]) and contact fields
     * @return array<string,mixed>
     */
    public static function compute(array $signups): array
    {
        $menuTotals = self::zeroCounts();
        $totalPersons = 0;
        $index = [];
        $tables = [];

        foreach ($signups as $signup) {
            $counts = self::zeroCounts();
            foreach ($signup['menus'] as $menu) {
                $counts[$menu]++;
                $menuTotals[$menu]++;
                $totalPersons++;
            }

            $personCount = count($signup['menus']);
            $name = $signup['table_name'];
            if (!isset($index[$name])) {
                $index[$name] = count($tables);
                $tables[] = [
                    'name' => $name,
                    'personCount' => 0,
                    'menuCounts' => self::zeroCounts(),
                    'signups' => [],
                ];
            }

            $i = $index[$name];
            $tables[$i]['personCount'] += $personCount;
            foreach (self::MENU_KEYS as $key) {
                $tables[$i]['menuCounts'][$key] += $counts[$key];
            }
            $tables[$i]['signups'][] = [
                'first_name' => $signup['first_name'],
                'last_name' => $signup['last_name'],
                'address' => $signup['address'],
                'phone' => $signup['phone'],
                'email' => $signup['email'] ?? '',
                'personCount' => $personCount,
                'menuCounts' => $counts,
            ];
        }

        return [
            'totalPersons' => $totalPersons,
            'totalTables' => count($tables),
            'menuTotals' => $menuTotals,
            'tables' => $tables,
        ];
    }

    private const MENU_KEYS = ['meat', 'child', 'vegetarian'];

    /**
     * Flat rows for the spreadsheet export: a header row then one row per
     * signup with per-menu counts.
     *
     * @param array<int,array<string,mixed>> $signups
     * @return array<int,array<int,mixed>>
     */
    public static function exportRows(array $signups): array
    {
        $rows = [[
            'Table', 'Nom', 'Prénom', 'Email', 'Adresse', 'Téléphone',
            'Viande', 'Enfant', 'Végétarien', 'Total',
        ]];

        foreach ($signups as $signup) {
            $counts = self::zeroCounts();
            foreach ($signup['menus'] as $menu) {
                if (isset($counts[$menu])) {
                    $counts[$menu]++;
                }
            }

            $rows[] = [
                self::cellSafe($signup['table_name']),
                self::cellSafe($signup['last_name']),
                self::cellSafe($signup['first_name']),
                self::cellSafe($signup['email'] ?? ''),
                self::cellSafe($signup['address']),
                self::cellSafe($signup['phone']),
                $counts['meat'],
                $counts['child'],
                $counts['vegetarian'],
                count($signup['menus']),
            ];
        }

        return $rows;
    }

    /** @return array{meat:int,child:int,vegetarian:int} */
    private static function zeroCounts(): array
    {
        return ['meat' => 0, 'child' => 0, 'vegetarian' => 0];
    }

    /**
     * Neutralize spreadsheet formula injection: prefix a leading =, +, -, @ (or
     * control char) with a quote so the cell is treated as text.
     */
    private static function cellSafe(string $value): string
    {
        if ($value !== '' && preg_match('/^[=+\-@\t\r]/', $value) === 1) {
            return "'" . $value;
        }

        return $value;
    }
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter="OccasionTest|SignupStatsTest"`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add api/app/Support/Occasion.php api/app/Support/SignupStats.php api/tests/Unit/OccasionTest.php api/tests/Unit/SignupStatsTest.php
git commit -m "feat(api): add occasion reference data and signup aggregation"
```

---

### Task 11: `POST /api/signups`

The most behaviour-sensitive endpoint. Four things must hold, in this order: honeypot → validation → Altcha (fail-closed) + replay → insert → mail (fail-safe).

**Two prerequisites discovered in Task 7:**

1. **Add `ALTCHA_HMAC_SECRET` to `docker/api/env.docker`.** It is absent, so `/api/altcha` currently 503s locally — correct fail-closed behaviour, but it means the signup form cannot be exercised end-to-end in the local stack until this task sets it. Use an obviously-synthetic local value; that file is committed on purpose and carries a "NEVER copy this to a server" warning. This task owns the change because it is the first one that needs a working local challenge.
2. **Assert the guard lifetime against `AltchaController::TTL_SECONDS`, not a literal `600`.** The constants are public so the two stay in step, but nothing enforces that this controller reads them rather than re-hardcoding the number. The test is what makes the coupling real.

**Files:**
- Create: `api/app/Http/Requests/SignupRequest.php`, `api/app/Http/Controllers/Api/SignupController.php`
- Create: `api/tests/Feature/SignupStoreTest.php`
- Modify: `api/routes/api.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Mail\SignupConfirmation;
use App\Support\Altcha;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class SignupStoreTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'a-real-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.altcha_secret' => self::SECRET]);
        Mail::fake();
    }

    /** A solved challenge payload, as the browser widget would submit it. */
    private function solvedAltcha(): string
    {
        $altcha = new Altcha(self::SECRET);
        $number = 7;
        $challenge = $altcha->createChallenge(1000, 600, null, $number, 'aabbcc');

        return base64_encode(json_encode([
            'algorithm' => $challenge['algorithm'],
            'challenge' => $challenge['challenge'],
            'number' => $number,
            'salt' => $challenge['salt'],
            'signature' => $challenge['signature'],
        ]));
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'address' => 'Rue du Test 1',
            'phone' => '0790000000',
            'email' => 'ada@example.com',
            'table_name' => 'Table 1',
            'menus' => ['meat', 'child'],
            'altcha' => $this->solvedAltcha(),
        ], $overrides);
    }

    public function test_it_stores_a_signup_and_sends_the_confirmation(): void
    {
        $this->postJson('/api/signups', $this->payload())
            ->assertStatus(201)
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseHas('signups', [
            'occasion' => 'anniversary-supper',
            'first_name' => 'Ada',
            'table_name' => 'Table 1',
        ]);
        Mail::assertSent(SignupConfirmation::class);
    }

    public function test_the_occasion_is_fixed_server_side(): void
    {
        $this->postJson('/api/signups', $this->payload(['occasion' => 'hacked']))
            ->assertStatus(201);

        $this->assertDatabaseHas('signups', ['occasion' => 'anniversary-supper']);
        $this->assertDatabaseMissing('signups', ['occasion' => 'hacked']);
    }

    public function test_a_filled_honeypot_is_silently_accepted_without_storing(): void
    {
        // A real form never fills `hp`. Respond 201 so a bot cannot tell it was
        // trapped, but store nothing and send nothing.
        $this->postJson('/api/signups', $this->payload(['hp' => 'i-am-a-bot']))
            ->assertStatus(201)
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseCount('signups', 0);
        Mail::assertNothingSent();
    }

    public function test_a_trapped_bot_skips_validation_entirely(): void
    {
        // The honeypot check precedes validation, so garbage still gets 201.
        $this->postJson('/api/signups', ['hp' => 'bot'])->assertStatus(201);

        $this->assertDatabaseCount('signups', 0);
    }

    public function test_it_reports_validation_failures(): void
    {
        $response = $this->postJson('/api/signups', ['altcha' => $this->solvedAltcha()]);

        $response->assertStatus(400)->assertJsonPath('code', 'validation_failed');
        $fields = array_column($response->json('fields'), 'field');
        $this->assertContains('first_name', $fields);
        $this->assertContains('menus', $fields);
    }

    public function test_an_invalid_menu_value_is_rejected(): void
    {
        $response = $this->postJson('/api/signups', $this->payload(['menus' => ['lobster']]));

        // invalid_format, NOT invalid_value: the closure-validator path cannot
        // attach params, and invalid_value's French interpolates {{allowed}}.
        // invalid_format is also the accurate token, since normalizeMenus()
        // rejects on count (empty, > MAX_GUESTS) as well as on value.
        $response->assertStatus(400)->assertJsonPath('fields.0', [
            'field' => 'menus',
            'reason' => 'invalid_format',
        ]);
        $this->assertDatabaseCount('signups', 0);
    }

    public function test_a_missing_altcha_solution_is_refused(): void
    {
        $this->postJson('/api/signups', $this->payload(['altcha' => '']))
            ->assertStatus(403)
            ->assertExactJson([
                'error' => 'Anti-bot verification failed, please try again',
                'code' => 'captcha_failed',
            ]);

        $this->assertDatabaseCount('signups', 0);
    }

    public function test_it_fails_closed_when_the_server_secret_is_a_placeholder(): void
    {
        $payload = $this->payload();
        config(['app.altcha_secret' => 'CHANGE_ME']);

        $this->postJson('/api/signups', $payload)->assertStatus(403);

        $this->assertDatabaseCount('signups', 0);
    }

    public function test_replaying_a_solved_challenge_is_refused(): void
    {
        $payload = $this->payload();

        $this->postJson('/api/signups', $payload)->assertStatus(201);
        $this->postJson('/api/signups', $payload)->assertStatus(403);

        $this->assertDatabaseCount('signups', 1);
    }

    public function test_a_mail_failure_still_returns_201(): void
    {
        // The reservation is already stored; a mail error must not lose it.
        Mail::shouldReceive('send')->andThrow(new \RuntimeException('smtp down'));

        $this->postJson('/api/signups', $this->payload())->assertStatus(201);

        $this->assertDatabaseCount('signups', 1);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=SignupStoreTest`
Expected: FAIL — 404.

- [ ] **Step 3: Write the FormRequest**

`api/app/Http/Requests/SignupRequest.php`:

```php
<?php

namespace App\Http\Requests;

use App\Support\Occasion;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Field names are snake_case here (unlike ContactRequest) because that is what
 * signup.js sends and what i18n.js's fields.* keys expect. Do not normalise
 * the two endpoints to one convention without changing both.
 */
class SignupRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'address' => ['required', 'string', 'max:255'],
            'phone' => ['required', 'string', 'max:64'],
            'email' => ['required', 'string', 'max:255', 'email'],
            'table_name' => ['required', 'string', 'max:255'],
        ];
    }

    /**
     * `menus` is validated by Occasion::normalizeMenus rather than Laravel
     * rules, so the accepted values, the 1..MAX_GUESTS cap and the reason token
     * all stay in one place. A failure reports invalid_value, matching the old
     * endpoint exactly.
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                if (Occasion::normalizeMenus($this->input('menus')) === null) {
                    $validator->errors()->add('menus', 'invalid_value');
                }
            },
        ];
    }
}
```

Because the `after()` hook adds a raw message rather than a failed rule, extend `ApiError::validation()` to fall back to the message when `failed()` has no entry for a field. Add this immediately after the `foreach` in `ApiError::validation()`:

```php
        // Closure validators (FormRequest::after) add messages without a rule.
        // Their message IS the reason token; see SignupRequest::after().
        foreach ($e->validator->errors()->keys() as $field) {
            if (!in_array($field, array_column($fields, 'field'), true)) {
                $fields[] = [
                    'field' => $field,
                    'reason' => (string) $e->validator->errors()->first($field),
                ];
            }
        }
```

- [ ] **Step 4: Write the controller**

`api/app/Http/Controllers/Api/SignupController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Http\Requests\SignupRequest;
use App\Mail\SignupConfirmation;
use App\Models\Signup;
use App\Support\Altcha;
use App\Support\ChallengeGuard;
use App\Support\Occasion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SignupController extends Controller
{
    /**
     * Public: one contact registers guests. The occasion is fixed server-side,
     * never taken from the request.
     *
     * Order is deliberate: honeypot, then validation, then proof-of-work, then
     * the insert, then mail. Each step is cheaper than the next, and a trapped
     * bot must trigger none of the work below it.
     */
    public function store(Request $request)
    {
        // Honeypot: a real form never fills this. Silently accept (201) without
        // storing or mailing, so a bot never learns it was trapped. Checked
        // before validation so a bot cannot distinguish the trap from success.
        if (trim((string) $request->input('hp', '')) !== '') {
            return response()->json(['ok' => true], 201);
        }

        $validated = app(SignupRequest::class)->validated();
        $menus = Occasion::normalizeMenus($request->input('menus'));

        if (!$this->passesProofOfWork((string) $request->input('altcha', ''))) {
            return ApiError::json(
                403,
                'captcha_failed',
                'Anti-bot verification failed, please try again'
            );
        }

        $signup = Signup::create($validated + [
            'occasion' => Occasion::ACTIVE,
            'menus' => $menus,
        ]);

        // Fail-safe: the reservation is already stored. A mail error must not
        // block the response — log it and still return 201.
        try {
            Mail::send(new SignupConfirmation(Occasion::active(), [
                'first_name' => $signup->first_name,
                'last_name' => $signup->last_name,
                'email' => $signup->email,
                'table_name' => $signup->table_name,
                'menus' => $menus,
            ]));
        } catch (\Throwable $e) {
            Log::error('Signup confirmation mail failed: ' . $e->getMessage());
        }

        return response()->json(['ok' => true], 201);
    }

    /**
     * Proof-of-work gate (fail-closed) plus the single-use replay guard.
     *
     * A server left on the placeholder or empty secret must fail closed: the
     * default secret is public (config.example.php), so any challenge it signs
     * is forgeable.
     */
    private function passesProofOfWork(string $payload): bool
    {
        // Fail closed on a non-shared cache store, for the same reason as the
        // placeholder secret below: ChallengeGuard IS the replay protection,
        // and the `array` store is per-process while `file` is per-server, so
        // either silently reduces this to no protection at all — with every
        // test still green. Verified in Task 6 that only a shared, durable
        // store refuses a cross-process replay.
        if (!in_array(config('cache.default'), ['database', 'redis', 'memcached'], true)) {
            Log::error('Signup refused: cache store is not shared, replay guard would be ineffective');

            return false;
        }

        $secret = (string) config('app.altcha_secret');
        if ($secret === '' || $secret === 'CHANGE_ME') {
            return false;
        }

        $signature = (new Altcha($secret))->verifySolution($payload);
        if ($signature === null) {
            return false;
        }

        return (new ChallengeGuard())->consume($signature, AltchaController::TTL_SECONDS);
    }
}
```

Note `app(SignupRequest::class)->validated()` rather than injecting the request: validation must run *after* the honeypot check, and an injected FormRequest validates before the method body runs.

- [ ] **Step 5: Add the route**

```php
Route::post('/signups', [SignupController::class, 'store']);
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=SignupStoreTest`
Expected: PASS, 11 tests.

- [ ] **Step 7: Run the whole suite**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test`
Expected: PASS — confirms the `ApiError` change in step 3 broke nothing.

- [ ] **Step 8: Commit**

```bash
git add api/app/Http/Requests/SignupRequest.php api/app/Http/Controllers/Api/SignupController.php api/app/Exceptions/ApiError.php api/routes/api.php api/tests/Feature/SignupStoreTest.php
git commit -m "feat(api): port POST /api/signups with honeypot, fail-closed Altcha and replay guard"
```

---

### Task 12: `GET /api/signups` — admin stats and xlsx export

**Files:**
- Modify: `api/app/Http/Controllers/Api/SignupController.php`, `api/composer.json`, `api/routes/api.php`
- Create: `api/tests/Feature/SignupSummaryTest.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\Signup;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SignupSummaryTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::create(['username' => 'demo.admin', 'password' => 'x', 'role' => 'admin']);
    }

    private function seedSignups(): void
    {
        Signup::create([
            'occasion' => 'anniversary-supper', 'first_name' => 'Ada',
            'last_name' => 'Lovelace', 'address' => 'Rue 1', 'phone' => '079',
            'email' => 'ada@example.com', 'table_name' => 'Table 1',
            'menus' => ['meat', 'child'],
        ]);
        Signup::create([
            'occasion' => 'anniversary-supper', 'first_name' => 'Alan',
            'last_name' => 'Turing', 'address' => 'Rue 2', 'phone' => '078',
            'email' => 'alan@example.com', 'table_name' => 'Table 2',
            'menus' => ['vegetarian'],
        ]);
    }

    public function test_an_admin_gets_totals_and_the_occasion(): void
    {
        $this->seedSignups();

        $this->actingAs($this->admin())->getJson('/api/signups')
            ->assertOk()
            ->assertJsonPath('totalPersons', 3)
            ->assertJsonPath('totalTables', 2)
            ->assertJsonPath('menuTotals', ['meat' => 1, 'child' => 1, 'vegetarian' => 1])
            ->assertJsonPath('occasion.title', 'Souper des 25 ans des Canetons');
    }

    public function test_a_responder_role_may_not_view_the_summary(): void
    {
        // view_summary is admin-only; user/moderator may respond, not view.
        $user = User::create(['username' => 'u', 'password' => 'x', 'role' => 'user']);

        $this->actingAs($user)->getJson('/api/signups')->assertStatus(403);
    }

    public function test_an_anonymous_caller_is_unauthenticated(): void
    {
        $this->getJson('/api/signups')->assertStatus(401);
    }

    public function test_the_xlsx_export_downloads_a_spreadsheet(): void
    {
        $this->seedSignups();

        $response = $this->actingAs($this->admin())->get('/api/signups?format=xlsx');

        $response->assertOk();
        $this->assertStringContainsString(
            'spreadsheetml',
            $response->headers->get('Content-Type')
        );
        $this->assertStringContainsString(
            'inscriptions-souper.xlsx',
            $response->headers->get('Content-Disposition')
        );
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=SignupSummaryTest`
Expected: FAIL — 404/405.

- [ ] **Step 3: Add the spreadsheet dependency**

```bash
docker compose exec web composer require shuchkin/simplexlsxgen --working-dir=/var/www/html/api-laravel
```

Confirm `api/composer.json` gained `"shuchkin/simplexlsxgen"` under `require`.

- [ ] **Step 4: Add the controller methods**

Add to `api/app/Http/Controllers/Api/SignupController.php`:

```php
    /**
     * Admin only (Team Direction): totals + per-table list, or an xlsx export.
     * Gated by the capability middleware on the route, not here.
     */
    public function index(Request $request)
    {
        $signups = Signup::where('occasion', Occasion::ACTIVE)
            ->orderBy('table_name')
            ->orderBy('id')
            ->get()
            ->map(fn (Signup $s) => [
                'first_name' => $s->first_name,
                'last_name' => $s->last_name,
                'address' => $s->address,
                'phone' => $s->phone,
                'email' => $s->email,
                'table_name' => $s->table_name,
                'menus' => $s->menus ?? [],
            ])
            ->all();

        if ((string) $request->query('format') === 'xlsx') {
            return $this->xlsx($signups);
        }

        $stats = SignupStats::compute($signups);
        $stats['occasion'] = Occasion::active();

        return response()->json($stats);
    }

    /** @param array<int,array<string,mixed>> $signups */
    private function xlsx(array $signups): StreamedResponse
    {
        $rows = SignupStats::exportRows($signups);

        return response()->streamDownload(
            fn () => SimpleXLSXGen::fromArray($rows)->saveAs('php://output'),
            'inscriptions-souper.xlsx',
            ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        );
    }
```

Add these imports:

```php
use App\Support\SignupStats;
use Shuchkin\SimpleXLSXGen;
use Symfony\Component\HttpFoundation\StreamedResponse;
```

- [ ] **Step 5: Add the route**

```php
Route::middleware(['auth:sanctum', 'capability:view_summary'])
    ->get('/signups', [SignupController::class, 'index']);
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=SignupSummaryTest`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add api/app/Http/Controllers/Api/SignupController.php api/composer.json api/composer.lock api/routes/api.php api/tests/Feature/SignupSummaryTest.php
git commit -m "feat(api): port GET /api/signups with stats and xlsx export"
```

---

### Task 13: `GET /api/events`

Public read. A logged-in caller additionally sees **their own** response on each event.

**Files:**
- Create: `api/app/Http/Controllers/Api/EventController.php`
- Create: `api/tests/Feature/EventIndexTest.php`
- Modify: `api/routes/api.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Response;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EventIndexTest extends TestCase
{
    use RefreshDatabase;

    private function event(string $date, string $title): Event
    {
        return Event::create([
            'date' => $date, 'title' => $title,
            'start_time' => '20:00:00', 'end_time' => '22:00:00',
            'location' => 'Local', 'attire' => '', 'weekend' => 0,
        ]);
    }

    public function test_events_are_public_and_ordered_by_date(): void
    {
        $this->event('2027-03-02', 'Second');
        $this->event('2027-03-01', 'First');

        $response = $this->getJson('/api/events');

        $response->assertOk();
        $this->assertSame(['First', 'Second'], array_column($response->json(), 'title'));
    }

    public function test_an_anonymous_caller_sees_null_responses(): void
    {
        $this->event('2027-03-01', 'First');

        $this->getJson('/api/events')->assertOk()->assertJsonPath('0.response', null);
    }

    public function test_a_logged_in_user_sees_their_own_answer(): void
    {
        $event = $this->event('2027-03-01', 'First');
        $user = User::create(['username' => 'u', 'password' => 'x', 'role' => 'user']);
        Response::create(['user_id' => $user->id, 'event_id' => $event->id, 'answer' => 'participate']);

        $this->actingAs($user)->getJson('/api/events')
            ->assertOk()
            ->assertJsonPath('0.response', 'participate');
    }

    public function test_a_user_never_sees_another_users_answer(): void
    {
        $event = $this->event('2027-03-01', 'First');
        $mine = User::create(['username' => 'mine', 'password' => 'x', 'role' => 'user']);
        $other = User::create(['username' => 'other', 'password' => 'x', 'role' => 'user']);
        Response::create(['user_id' => $other->id, 'event_id' => $event->id, 'answer' => 'participate']);

        $this->actingAs($mine)->getJson('/api/events')
            ->assertOk()
            ->assertJsonPath('0.response', null);
    }

    public function test_the_payload_uses_the_camelcase_frontend_shape(): void
    {
        $this->event('2027-03-01', 'First');

        $this->getJson('/api/events')->assertOk()->assertJsonStructure([
            ['id', 'date', 'title', 'startTime', 'endTime', 'location', 'attire', 'weekend', 'response'],
        ]);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=EventIndexTest`
Expected: FAIL — 404.

- [ ] **Step 3: Write the controller**

`api/app/Http/Controllers/Api/EventController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use Illuminate\Http\Request;

class EventController extends Controller
{
    /**
     * Reading events is public. Logged-in users additionally see each event
     * annotated with THEIR OWN response; anonymous visitors get null.
     *
     * There is deliberately no way to request another user's answers — that
     * absence is what keeps a previously-fixed IDOR closed. Do not add a
     * username/userId parameter here.
     */
    public function index(Request $request)
    {
        $userId = $request->user()?->id;

        $events = Event::query()
            ->when($userId, fn ($query) => $query->with([
                'responses' => fn ($q) => $q->where('user_id', $userId),
            ]))
            ->orderBy('date')
            ->get();

        return response()->json(
            $events->map(fn (Event $event) => $event->toFrontendShape(
                $userId ? $event->responses->first()?->answer : null
            ))->all()
        );
    }
}
```

- [ ] **Step 4: Add the route**

```php
Route::get('/events', [EventController::class, 'index']);
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=EventIndexTest`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add api/app/Http/Controllers/Api/EventController.php api/routes/api.php api/tests/Feature/EventIndexTest.php
git commit -m "feat(api): port GET /api/events with own-response annotation"
```

---

### Task 14: Event writes — `POST`, `PUT`, `DELETE /api/events`

All writes require `manage_events` (admin).

**Files:**
- Create: `api/app/Http/Requests/EventRequest.php`
- Modify: `api/app/Http/Controllers/Api/EventController.php`, `api/routes/api.php`
- Create: `api/tests/Feature/EventWriteTest.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EventWriteTest extends TestCase
{
    use RefreshDatabase;

    private const VALID = [
        'date' => '2027-03-01',
        'title' => 'Repetition',
        'startTime' => '20:00',
        'endTime' => '22:00',
        'location' => 'Local',
        'attire' => 'Casual',
        'weekend' => false,
    ];

    private function admin(): User
    {
        return User::create(['username' => 'demo.admin', 'password' => 'x', 'role' => 'admin']);
    }

    private function existing(): Event
    {
        return Event::create([
            'date' => '2027-01-01', 'title' => 'Old', 'start_time' => '18:00',
            'end_time' => '19:00', 'location' => 'Ancien', 'attire' => '', 'weekend' => 0,
        ]);
    }

    public function test_an_admin_creates_an_event(): void
    {
        $this->actingAs($this->admin())->postJson('/api/events', self::VALID)
            ->assertStatus(201)
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseHas('events', [
            'title' => 'Repetition', 'start_time' => '20:00', 'location' => 'Local',
        ]);
    }

    public function test_a_non_admin_may_not_create_an_event(): void
    {
        $user = User::create(['username' => 'u', 'password' => 'x', 'role' => 'user']);

        $this->actingAs($user)->postJson('/api/events', self::VALID)->assertStatus(403);
        $this->assertDatabaseCount('events', 0);
    }

    public function test_an_anonymous_caller_may_not_create_an_event(): void
    {
        $this->postJson('/api/events', self::VALID)->assertStatus(401);
    }

    public function test_missing_fields_are_reported_with_camelcase_names(): void
    {
        $response = $this->actingAs($this->admin())->postJson('/api/events', []);

        $response->assertStatus(400)->assertJsonPath('code', 'validation_failed');
        $fields = array_column($response->json('fields'), 'field');
        $this->assertSame(['date', 'title', 'startTime', 'endTime', 'location'], $fields);
    }

    public function test_an_admin_updates_an_event(): void
    {
        $event = $this->existing();

        $this->actingAs($this->admin())
            ->putJson('/api/events', ['id' => $event->id] + self::VALID)
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseHas('events', ['id' => $event->id, 'title' => 'Repetition']);
    }

    public function test_an_update_without_a_valid_id_is_rejected(): void
    {
        $this->actingAs($this->admin())
            ->putJson('/api/events', ['id' => 0] + self::VALID)
            ->assertStatus(400)
            ->assertJsonPath('fields.0.field', 'id');
    }

    public function test_an_admin_deletes_an_event(): void
    {
        $event = $this->existing();

        $this->actingAs($this->admin())->deleteJson('/api/events?id=' . $event->id)
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseCount('events', 0);
    }

    public function test_a_delete_without_an_id_is_rejected(): void
    {
        $this->actingAs($this->admin())->deleteJson('/api/events')
            ->assertStatus(400)
            ->assertJsonPath('fields.0', ['field' => 'id', 'reason' => 'required']);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=EventWriteTest`
Expected: FAIL — 405/404.

- [ ] **Step 3: Write the FormRequest**

`api/app/Http/Requests/EventRequest.php`:

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * camelCase startTime/endTime match what planning_repet.js sends and what
 * i18n.js's fields.* keys expect; the DB columns are snake_case and the
 * controller maps between them.
 *
 * `attire` is optional but must be a string when present (the old DTO used
 * TypeString, not Required) — an empty tenue is legitimate.
 */
class EventRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'date' => ['required', 'string'],
            'title' => ['required', 'string', 'max:255'],
            'startTime' => ['required', 'string'],
            'endTime' => ['required', 'string'],
            'location' => ['required', 'string', 'max:255'],
            'attire' => ['nullable', 'string', 'max:255'],
            'weekend' => ['nullable', 'boolean'],
        ];
    }
}
```

- [ ] **Step 4: Add the controller methods**

Add to `EventController`:

```php
    public function store(EventRequest $request)
    {
        Event::create($this->columns($request));

        return response()->json(['ok' => true], 201);
    }

    public function update(EventRequest $request)
    {
        $id = (int) $request->input('id', 0);
        if ($id <= 0) {
            return ApiError::json(400, 'validation_failed', 'Invalid form submission', [
                ['field' => 'id', 'reason' => 'invalid_number'],
            ]);
        }

        Event::whereKey($id)->update($this->columns($request));

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request)
    {
        $raw = $request->query('id');
        if ($raw === null || $raw === '') {
            return ApiError::json(400, 'validation_failed', 'Invalid form submission', [
                ['field' => 'id', 'reason' => 'required'],
            ]);
        }

        $id = (int) $raw;
        if ($id <= 0) {
            return ApiError::json(400, 'validation_failed', 'Invalid form submission', [
                ['field' => 'id', 'reason' => 'invalid_number'],
            ]);
        }

        // Responses go with it via the FK's ON DELETE CASCADE.
        Event::whereKey($id)->delete();

        return response()->json(['ok' => true]);
    }

    /** Map the camelCase request payload onto snake_case columns. */
    private function columns(EventRequest $request): array
    {
        return [
            'date' => $request->input('date'),
            'title' => $request->input('title'),
            'start_time' => $request->input('startTime'),
            'end_time' => $request->input('endTime'),
            'location' => $request->input('location'),
            'attire' => trim((string) $request->input('attire', '')),
            'weekend' => $request->boolean('weekend') ? 1 : 0,
        ];
    }
```

Add imports: `use App\Exceptions\ApiError;` and `use App\Http\Requests\EventRequest;`.

- [ ] **Step 5: Add the routes**

```php
Route::middleware(['auth:sanctum', 'capability:manage_events'])->group(function () {
    Route::post('/events', [EventController::class, 'store']);
    Route::put('/events', [EventController::class, 'update']);
    Route::delete('/events', [EventController::class, 'destroy']);
});
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=EventWriteTest`
Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
git add api/app/Http/Requests/EventRequest.php api/app/Http/Controllers/Api/EventController.php api/routes/api.php api/tests/Feature/EventWriteTest.php
git commit -m "feat(api): port event create/update/delete behind manage_events"
```

---

### Task 15: `POST /api/responses`

A member records **their own** answer. Only `user`/`moderator` may respond — admin must not vote.

**Files:**
- Create: `api/app/Http/Requests/ResponseRequest.php`, `api/app/Http/Controllers/Api/ResponseController.php`
- Create: `api/tests/Feature/ResponseStoreTest.php`
- Modify: `api/routes/api.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ResponseStoreTest extends TestCase
{
    use RefreshDatabase;

    private function event(): Event
    {
        return Event::create([
            'date' => '2027-03-01', 'title' => 'Repetition',
            'start_time' => '20:00', 'end_time' => '22:00',
            'location' => 'Local', 'attire' => '', 'weekend' => 0,
        ]);
    }

    private function member(): User
    {
        return User::create(['username' => 'u', 'password' => 'x', 'role' => 'user']);
    }

    public function test_a_member_records_an_answer(): void
    {
        $event = $this->event();
        $user = $this->member();

        $this->actingAs($user)->postJson('/api/responses', [
            'eventId' => $event->id,
            'participation' => 'participate',
        ])->assertStatus(201)->assertExactJson(['ok' => true]);

        $this->assertDatabaseHas('responses', [
            'user_id' => $user->id, 'event_id' => $event->id, 'answer' => 'participate',
        ]);
    }

    public function test_answering_again_updates_rather_than_duplicates(): void
    {
        $event = $this->event();
        $user = $this->member();

        foreach (['participate', 'notparticipate'] as $answer) {
            $this->actingAs($user)->postJson('/api/responses', [
                'eventId' => $event->id, 'participation' => $answer,
            ])->assertStatus(201);
        }

        $this->assertDatabaseCount('responses', 1);
        $this->assertDatabaseHas('responses', ['answer' => 'notparticipate']);
    }

    public function test_an_admin_may_not_respond(): void
    {
        // Not a hierarchy: admin manages events but must never vote.
        $event = $this->event();
        $admin = User::create(['username' => 'a', 'password' => 'x', 'role' => 'admin']);

        $this->actingAs($admin)->postJson('/api/responses', [
            'eventId' => $event->id, 'participation' => 'participate',
        ])->assertStatus(403);

        $this->assertDatabaseCount('responses', 0);
    }

    public function test_an_anonymous_caller_is_unauthenticated(): void
    {
        $this->postJson('/api/responses', [
            'eventId' => 1, 'participation' => 'participate',
        ])->assertStatus(401);
    }

    public function test_an_unknown_event_is_reported(): void
    {
        $this->actingAs($this->member())->postJson('/api/responses', [
            'eventId' => 999, 'participation' => 'participate',
        ])->assertStatus(404)->assertExactJson([
            'error' => 'Event not found', 'code' => 'event_not_found',
        ]);
    }

    public function test_an_invalid_participation_value_is_rejected(): void
    {
        $event = $this->event();

        $response = $this->actingAs($this->member())->postJson('/api/responses', [
            'eventId' => $event->id, 'participation' => 'maybe',
        ]);

        $response->assertStatus(400)->assertJsonPath('fields.0', [
            'field' => 'participation',
            'reason' => 'invalid_value',
            'params' => ['allowed' => ['participate', 'notparticipate']],
        ]);
    }

    public function test_a_missing_event_id_is_rejected(): void
    {
        $response = $this->actingAs($this->member())
            ->postJson('/api/responses', ['participation' => 'participate']);

        $response->assertStatus(400)->assertJsonPath('fields.0.field', 'eventId');
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ResponseStoreTest`
Expected: FAIL — 404.

- [ ] **Step 3: Write the FormRequest**

`api/app/Http/Requests/ResponseRequest.php`:

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ResponseRequest extends FormRequest
{
    /** Stored answers are English enum values; only the UI label is French. */
    public const ANSWERS = ['participate', 'notparticipate'];

    public function rules(): array
    {
        return [
            'eventId' => ['required', 'integer', 'gt:0'], // gt -> invalid_number (paramless)
            'participation' => ['required', 'in:' . implode(',', self::ANSWERS)],
        ];
    }
}
```

- [ ] **Step 4: Write the controller**

`api/app/Http/Controllers/Api/ResponseController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Http\Requests\ResponseRequest;
use App\Models\Event;
use App\Models\Response;
use Illuminate\Http\Request;

class ResponseController extends Controller
{
    /**
     * A logged-in member records THEIR OWN answer — the user comes from the
     * session, never from the request body, so one member can never answer for
     * another. Gated to the `respond` capability on the route.
     */
    public function store(ResponseRequest $request)
    {
        $eventId = (int) $request->input('eventId');

        if (!Event::whereKey($eventId)->exists()) {
            return ApiError::json(404, 'event_not_found', 'Event not found');
        }

        // Upsert on (user, event): answering again changes the answer.
        Response::updateOrCreate(
            ['user_id' => $request->user()->id, 'event_id' => $eventId],
            ['answer' => $request->input('participation')],
        );

        return response()->json(['ok' => true], 201);
    }
}
```

- [ ] **Step 5: Add the route**

```php
Route::middleware(['auth:sanctum', 'capability:respond'])
    ->post('/responses', [ResponseController::class, 'store']);
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ResponseStoreTest`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add api/app/Http/Requests/ResponseRequest.php api/app/Http/Controllers/Api/ResponseController.php api/routes/api.php api/tests/Feature/ResponseStoreTest.php
git commit -m "feat(api): port POST /api/responses for the caller's own answer"
```

---

### Task 16: `GET /api/responses` — admin summary

Lists **only** users whose role may respond, so "Pas de réponse" stays meaningful.

**Files:**
- Modify: `api/app/Http/Controllers/Api/ResponseController.php`, `api/routes/api.php`
- Create: `api/tests/Feature/ResponseSummaryTest.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Response;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ResponseSummaryTest extends TestCase
{
    use RefreshDatabase;

    private function event(): Event
    {
        return Event::create([
            'date' => '2027-03-01', 'title' => 'Repetition',
            'start_time' => '20:00', 'end_time' => '22:00',
            'location' => 'Local', 'attire' => '', 'weekend' => 0,
        ]);
    }

    private function admin(): User
    {
        return User::create(['username' => 'demo.admin', 'password' => 'x', 'role' => 'admin']);
    }

    public function test_it_lists_responding_roles_with_their_answers(): void
    {
        $event = $this->event();
        $this->admin();
        $user = User::create(['username' => 'zoe', 'password' => 'x', 'role' => 'user']);
        $moderator = User::create(['username' => 'mod', 'password' => 'x', 'role' => 'moderator']);
        Response::create(['user_id' => $user->id, 'event_id' => $event->id, 'answer' => 'participate']);

        $body = $this->actingAs($this->admin())
            ->getJson('/api/responses?eventId=' . $event->id)
            ->assertOk()
            ->json();

        $usernames = array_column($body, 'username');
        $this->assertContains('zoe', $usernames);
        $this->assertContains('mod', $usernames);
        // The admin holds view_summary, not respond — it must not be listed.
        $this->assertNotContains('demo.admin', $usernames);
    }

    public function test_a_user_without_an_answer_is_listed_with_a_null_response(): void
    {
        $event = $this->event();
        User::create(['username' => 'silent', 'password' => 'x', 'role' => 'user']);

        $body = $this->actingAs($this->admin())
            ->getJson('/api/responses?eventId=' . $event->id)
            ->assertOk()
            ->json();

        $this->assertSame('silent', $body[0]['username']);
        $this->assertNull($body[0]['response']);
    }

    public function test_it_includes_the_instrument_name(): void
    {
        $event = $this->event();
        $instrumentId = DB::table('instruments')->insertGetId(['name' => 'Trompette']);
        User::create([
            'username' => 'zoe', 'password' => 'x', 'role' => 'user',
            'instrument_id' => $instrumentId,
        ]);

        $body = $this->actingAs($this->admin())
            ->getJson('/api/responses?eventId=' . $event->id)
            ->assertOk()
            ->json();

        $this->assertSame('Trompette', $body[0]['instrument']);
    }

    public function test_a_responder_may_not_view_the_summary(): void
    {
        $user = User::create(['username' => 'u', 'password' => 'x', 'role' => 'user']);

        $this->actingAs($user)->getJson('/api/responses?eventId=1')->assertStatus(403);
    }

    public function test_a_missing_event_id_is_rejected(): void
    {
        $this->actingAs($this->admin())->getJson('/api/responses')
            ->assertStatus(400)
            ->assertJsonPath('fields.0', ['field' => 'eventId', 'reason' => 'required']);
    }

    public function test_a_non_positive_event_id_is_rejected(): void
    {
        $this->actingAs($this->admin())->getJson('/api/responses?eventId=0')
            ->assertStatus(400)
            ->assertJsonPath('fields.0', ['field' => 'eventId', 'reason' => 'invalid_number']);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ResponseSummaryTest`
Expected: FAIL — 405.

- [ ] **Step 3: Add the controller method**

Add to `ResponseController`:

```php
    /**
     * Admin-only summary of every eligible user's answer for one event.
     *
     * Only users whose role may respond are listed — non-voting roles (the
     * admin / Team Direction) are excluded so "Pas de réponse" stays
     * meaningful. Answered users sort first, then by username, matching the
     * old endpoint's ordering.
     */
    public function index(Request $request)
    {
        $raw = $request->query('eventId');
        if ($raw === null || $raw === '') {
            return ApiError::json(400, 'validation_failed', 'Invalid form submission', [
                ['field' => 'eventId', 'reason' => 'required'],
            ]);
        }

        $eventId = (int) $raw;
        if ($eventId <= 0) {
            return ApiError::json(400, 'validation_failed', 'Invalid form submission', [
                ['field' => 'eventId', 'reason' => 'invalid_number'],
            ]);
        }

        $rows = User::query()
            ->whereIn('users.role', Capability::rolesWith('respond'))
            ->leftJoin('instruments', 'users.instrument_id', '=', 'instruments.id')
            ->leftJoin('responses', function ($join) use ($eventId) {
                $join->on('responses.user_id', '=', 'users.id')
                    ->where('responses.event_id', '=', $eventId);
            })
            ->orderByRaw("COALESCE(responses.answer, '') DESC")
            ->orderBy('users.username')
            ->get([
                'users.username as username',
                'instruments.name as instrument',
                'responses.answer as response',
            ]);

        return response()->json($rows->all());
    }
```

Add imports: `use App\Models\User;` and `use App\Support\Capability;`.

- [ ] **Step 4: Add the route**

```php
Route::middleware(['auth:sanctum', 'capability:view_summary'])
    ->get('/responses', [ResponseController::class, 'index']);
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ResponseSummaryTest`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add api/app/Http/Controllers/Api/ResponseController.php api/routes/api.php api/tests/Feature/ResponseSummaryTest.php
git commit -m "feat(api): port GET /api/responses summary, excluding non-voting roles"
```

---

### Task 17: Migrate token via header

**Files:**
- Modify: `api/app/Http/Controllers/Api/MigrateController.php`, `api/tests/Feature/MigrateTest.php`

- [ ] **Step 1: Write the failing test**

Add to `api/tests/Feature/MigrateTest.php`:

```php
    public function test_it_accepts_the_token_in_the_x_migrate_token_header(): void
    {
        config(['app.migrate_token' => 'a-secret-token']);

        $this->withHeaders(['X-Migrate-Token' => 'a-secret-token'])
            ->postJson('/api/migrate')
            ->assertOk()
            ->assertJsonPath('ok', true);
    }

    public function test_it_ignores_a_token_passed_as_a_query_parameter(): void
    {
        // A query-string token would land in Apache's access log.
        config(['app.migrate_token' => 'a-secret-token']);

        $this->postJson('/api/migrate?token=a-secret-token')->assertStatus(403);
    }
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=MigrateTest`
Expected: FAIL — the header is ignored, the query parameter is accepted.

- [ ] **Step 3: Change the controller**

Replace the token read in `api/app/Http/Controllers/Api/MigrateController.php`:

```php
        $expectedToken = config('app.migrate_token');
        // Header, not a body/query parameter: this matches what
        // tools/dbmigrate.mjs and the CI secrets already send, and a header
        // cannot leak into Apache's access log the way ?token= would.
        $providedToken = $request->header('X-Migrate-Token');
```

- [ ] **Step 4: Run the suite**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=MigrateTest`
Expected: PASS. Update or delete any existing test that asserted the body-parameter contract.

- [ ] **Step 5: Commit**

```bash
git add api/app/Http/Controllers/Api/MigrateController.php api/tests/Feature/MigrateTest.php
git commit -m "refactor(api): read the migrate token from the X-Migrate-Token header"
```

---

### Task 17b: The `/api/migrate` response contract

**Found during Task 17, and more important than the token change was.** Switching to the header was necessary but not sufficient: the response *shape* also disagrees with the caller, and one half of the mismatch is dangerous.

`tools/dbmigrate.mjs` expects:
- `body.status === 'ok'` — anything else is reported as a failure
- `body.applied[]` and `body.pending[]` — the migration names, for its output
- a `?mode=dry-run|apply` query parameter it appends

Laravel's `MigrateController` returns `{ok: true, output: "<raw artisan text>"}`, never sends `status`, and **ignores `mode` completely**.

Two consequences:

1. A **successful** migration is reported as `Migration apply FAILED`, because `status` is absent. Noisy but safe.
2. **`npm run dbmigrate:<env> -- --dry-run` applies migrations for real.** The caller believes it is asking for a dry run; the endpoint runs `artisan migrate --force` regardless. That is a real hazard on QA or PROD, and it is the reason this cannot wait.

**Fix:** make `MigrateController` honour the existing contract rather than changing the caller — CI secrets and the operator checklist already depend on the Node side. Specifically:
- read `mode`; on `dry-run` use `artisan migrate --pretend` (or `migrate:status`) and apply nothing
- return `status: 'ok'` on success, and a non-`ok` status on failure
- return `applied[]` and `pending[]` as arrays of migration names, parsed from Artisan's output or read via the migrator, rather than one opaque `output` string

Keep `output` as well if it is useful for debugging — the caller ignores extra keys.

**Verify by running `npm run dbmigrate:test -- --dry-run` against the local stack and confirming it reports pending work without applying it**, then a real run. Do not point it at QA or PROD.

### Task 18: The i18n vocabulary guard

Cheap insurance: a token the API emits but `i18n.js` lacks degrades silently to "Une erreur est survenue".

**Files:**
- Create: `api/tests/Feature/ApiErrorVocabularyTest.php`

- [ ] **Step 1: Write the test**

```php
<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The API's error vocabulary must stay a subset of what the front-end can
 * translate. app/assets/js/i18n.js is the only place French is computed; an
 * unknown code or reason silently renders as the generic fallback.
 */
class ApiErrorVocabularyTest extends TestCase
{
    /** Every reason token App\Exceptions\ApiError can emit. */
    private const REASONS = [
        'required', 'too_long', 'invalid_format', 'invalid_type', 'invalid_value',
        'invalid_number',
    ];

    /** Every code any controller can emit. */
    private const CODES = [
        'validation_failed', 'not_authenticated', 'access_denied',
        'invalid_credentials', 'event_not_found', 'service_unavailable',
        'captcha_failed',
    ];

    /** Every field name that can appear in fields[].field. */
    private const FIELDS = [
        'lastName', 'firstName', 'email', 'subject', 'message',
        'first_name', 'last_name', 'address', 'phone', 'table_name', 'menus',
        'date', 'title', 'startTime', 'endTime', 'location', 'attire', 'id',
        'username', 'password', 'eventId', 'participation',
    ];

    private function i18nSource(): string
    {
        $path = dirname(__DIR__, 3) . '/app/assets/js/i18n.js';
        $this->assertFileExists($path, 'The front-end i18n module moved; update this test.');

        return file_get_contents($path);
    }

    public function test_every_reason_token_is_translatable(): void
    {
        $source = $this->i18nSource();

        foreach (self::REASONS as $reason) {
            $this->assertMatchesRegularExpression(
                '/\b' . preg_quote($reason, '/') . '\s*:/',
                $source,
                "i18n.js has no validation.$reason key"
            );
        }
    }

    public function test_every_error_code_is_translatable(): void
    {
        $source = $this->i18nSource();

        foreach (self::CODES as $code) {
            $this->assertMatchesRegularExpression(
                '/\b' . preg_quote($code, '/') . '\s*:/',
                $source,
                "i18n.js has no errors.$code key"
            );
        }
    }

    public function test_every_field_name_is_translatable(): void
    {
        $source = $this->i18nSource();

        foreach (self::FIELDS as $field) {
            $this->assertMatchesRegularExpression(
                '/\b' . preg_quote($field, '/') . '\s*:/',
                $source,
                "i18n.js has no fields.$field key"
            );
        }
    }
}
```

- [ ] **Step 2: Run it**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ApiErrorVocabularyTest`
Expected: PASS, 3 tests. If a token is missing, add it to `app/assets/js/i18n.js` with a French translation rather than removing it from this test.

- [ ] **Step 3: Commit**

```bash
git add api/tests/Feature/ApiErrorVocabularyTest.php
git commit -m "test(api): assert the error vocabulary stays translatable by i18n.js"
```

---

### Task 19: Drop `used_challenges`, align the `signups` PK

**Files:**
- Create: `api/database/migrations/2026_07_26_000001_drop_used_challenges_table.php`
- Modify: `api/database/migrations/2026_07_23_000004_create_signups_table.php:13`
- Delete: `api/tests/Feature/UsedChallengesMigrationTest.php`

- [ ] **Step 1: Write the drop migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * The Altcha replay guard moved to Laravel's cache (App\Support\ChallengeGuard),
 * where Cache::add() gives the same atomic single-use semantics and entries
 * expire on their own. This table is no longer read or written.
 *
 * The create-or-adopt migration that made it (2026_07_23_000005) stays: it has
 * already run on every server and is recorded in the `migrations` table by
 * filename. On a fresh database it creates the table and this migration then
 * drops it, which is harmless.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('used_challenges');
    }

    public function down(): void
    {
        // Deliberately irreversible: recreating an empty replay-guard table
        // would provide no protection for challenges already in flight.
    }
};
```

- [ ] **Step 2: Align the signups primary key**

In `api/database/migrations/2026_07_23_000004_create_signups_table.php`, change line 13:

```php
            Schema::create('signups', function (Blueprint $table) {
                // increments(), not id(): every server took the ADOPT branch, so
                // their signups.id is int(10) UNSIGNED (see the old
                // sql/migrations/001_create_signups.sql). id() would make a
                // fresh local database bigint and silently diverge from prod.
                $table->increments('id');
```

- [ ] **Step 3: Delete the obsolete test**

```bash
git rm api/tests/Feature/UsedChallengesMigrationTest.php
```

- [ ] **Step 4: Verify a fresh migration run**

Run the suite first — `RefreshDatabase` migrates `laravel_api_test` from empty, which is exactly the fresh-database path:

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=ModelsTest`
Expected: PASS.

Then inspect the resulting schema:

Run: `docker compose exec db mariadb -uroot -proot laravel_api_test -e "SHOW COLUMNS FROM signups LIKE 'id'; SHOW TABLES LIKE 'used_challenges';"`
Expected: `id` is `int(10) unsigned`, and the `SHOW TABLES` result is empty.

If `signups.id` still reports `bigint`, the table survived from an earlier run — drop it and re-run:
`docker compose exec db mariadb -uroot -proot laravel_api_test -e "DROP TABLE IF EXISTS signups;"`

- [ ] **Step 5: Run the whole suite**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/database/migrations
git commit -m "feat(api): drop used_challenges and align the signups PK with prod"
```

---

### Task 20: Phase 1 checkpoint

- [ ] **Step 1: Full Laravel suite**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test`
Expected: PASS, no skips.

- [ ] **Step 2: Old app suite still green**

Run: `npm run test:php -- -- --testsuite unit`
Expected: PASS — Phase 1 touched nothing in `app/`.

- [ ] **Step 3: Lint**

Run: `npm run lint:php && npm run lint:js && npm run lint:css && npm run format:check && npm run guard`
Expected: PASS.

Not `npm run check` — it chains `test:php`, whose 31 integration tests error until Task 26 deletes them (see "Test commands" above). `npm run check` becomes a valid gate from Task 26 onward.

- [ ] **Step 3b: Raise the CI coverage gap with the maintainer**

**CI never runs the Laravel test suite.** It lints `api/` (from Task 2b onward) but executes no Laravel tests — `.github/workflows/ci.yml` runs only the old app's PHPUnit. By this checkpoint that is ~15 tasks of Laravel code with no CI coverage, and merging to `main` auto-deploys to TEST.

This is a pre-existing gap, not caused by this plan, but Phase 2 is the wrong time to discover it. Decide before proceeding: add a CI job running the Laravel suite, or accept that TEST is the first place Laravel code is exercised outside a developer's machine. A CI job needs a MariaDB service container and the `laravel_api_test` database — the same shape `docker/db/init/00-databases.sql` now creates locally.

- [ ] **Step 4: Confirm every endpoint is routed**

Run: `docker compose exec web php api-laravel/artisan route:list --path=api`
Expected: `login`, `logout`, `user`, `migrate`, `altcha`, `contact`, `signups` (GET+POST), `events` (GET/POST/PUT/DELETE), `responses` (GET+POST).

**Stop here for review before Phase 2.** Everything so far is inert on servers; Phase 2 is the irreversible-feeling part.

---

## Phase 2 — The cutover

After this phase the old `/api/*` handlers are gone and Apache routes `/api/*` into Laravel. Everything must land together: rolling back means redeploying the previous tag, which restores `app/.htaccess` and the handlers as a set.

---

### Task 21: The session bridge

Laravel becomes the source of truth for auth; the old PHP pages read `$_SESSION`. This bridge keeps them working and is **deleted in one commit** by sub-project 3.

**Files:**
- Modify: `api/app/Http/Controllers/Api/AuthController.php`
- Create: `api/app/Support/LegacySession.php`
- Create: `api/tests/Feature/LegacySessionBridgeTest.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\LegacySession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TEMPORARY — deleted with the bridge in sub-project 3.
 *
 * PHP's native session cannot be started inside PHPUnit (headers are already
 * sent and $_SESSION is process-global), so these tests exercise the pure
 * shape-building instead of session_start() itself. The end-to-end check is
 * manual, on TEST: log in via the new API, then load /planning_repet.
 */
class LegacySessionBridgeTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_builds_the_shape_the_old_app_expects(): void
    {
        $user = User::create(['username' => 'demo.user', 'password' => 'x', 'role' => 'user']);

        // App\Auth::user() returns exactly ['username' => ..., 'role' => ...].
        $this->assertSame(
            ['username' => 'demo.user', 'role' => 'user'],
            LegacySession::shapeFor($user)
        );
    }

    public function test_the_shape_has_no_extra_keys(): void
    {
        $user = User::create(['username' => 'demo.admin', 'password' => 'x', 'role' => 'admin']);

        // The old pages read only these two; anything else is dead weight, and
        // a password hash must never reach $_SESSION.
        $this->assertSame(['username', 'role'], array_keys(LegacySession::shapeFor($user)));
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test --filter=LegacySessionBridgeTest`
Expected: FAIL — `Class "App\Support\LegacySession" not found`.

- [ ] **Step 3: Write the bridge**

`api/app/Support/LegacySession.php`:

```php
<?php

namespace App\Support;

use App\Models\User;

/**
 * TEMPORARY BRIDGE — DELETE THIS CLASS IN SUB-PROJECT 3.
 *
 * Laravel now owns authentication, but the old PHP pages (app/pages/*.php) still
 * gate on $_SESSION['user'] via App\Auth. Both apps run in the SAME PHP-FPM pool
 * and on the same origin since the single-origin stack landed, so Laravel can
 * write PHP's native session directly and the old pages keep working unchanged.
 *
 * This was not possible before that change, when the two apps were separate
 * services on separate ports.
 *
 * Sub-project 3 replaces those pages with the SPA. At that point delete this
 * class, its two call sites in AuthController, and LegacySessionBridgeTest —
 * nothing else depends on it.
 */
final class LegacySession
{
    /**
     * The exact array App\Auth::user() returns, and all the old pages read.
     *
     * @return array{username: string, role: string}
     */
    public static function shapeFor(User $user): array
    {
        return ['username' => $user->username, 'role' => $user->role];
    }

    /** Mirror a successful Laravel login into PHP's native session. */
    public static function write(User $user): void
    {
        self::start();
        $_SESSION['user'] = self::shapeFor($user);
    }

    /** Clear the mirrored session on logout. */
    public static function forget(): void
    {
        self::start();
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
    }

    /**
     * Start PHP's native session with the same cookie flags App\Auth::startSession
     * uses, so both halves share one cookie rather than fighting over it.
     */
    private static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE || headers_sent()) {
            return;
        }

        session_set_cookie_params([
            'httponly' => true,
            'samesite' => 'Lax',
            'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        ]);
        session_start();
    }
}
```

`headers_sent()` guards the test environment, where output has already begun.

- [ ] **Step 4: Call it from `AuthController`**

After `$request->session()->regenerate();` in `login()`:

```php
        // TEMPORARY: mirror into PHP's native session so the old pages, which
        // still gate on $_SESSION, stay logged in. Delete with sub-project 3.
        LegacySession::write($request->user());
```

At the start of `logout()`, before `Auth::guard('web')->logout()`:

```php
        LegacySession::forget();
```

Add `use App\Support\LegacySession;`.

- [ ] **Step 5: Run the suite**

Run: `docker compose exec -w /var/www/html/api-laravel web php artisan test`
Expected: PASS. If any test errors on `session_start()`, the `headers_sent()` guard is missing.

- [ ] **Step 6: Commit**

```bash
git add api/app/Support/LegacySession.php api/app/Http/Controllers/Api/AuthController.php api/tests/Feature/LegacySessionBridgeTest.php
git commit -m "feat(api): bridge Laravel auth into \$_SESSION for the old pages"
```

---

### Task 22: The `apiFetch()` CSRF helper

**Why this is needed:** Sanctum's `statefulApi()` puts `/api/*` behind the web middleware group, which validates CSRF tokens. Every mutating call from the old JS — including the public `POST /api/contact` and `/api/signups` — needs an `X-XSRF-TOKEN` header seeded by `GET /sanctum/csrf-cookie`, or it gets 419.

**Files:**
- Create: `app/assets/js/api.js`
- Modify: `app/assets/js/{authentification-inscription,contact,signup,planning_repet,inscriptions_utilisateurs,inscriptions_admin,signups_admin,sinscrire}.js`

- [ ] **Step 1: Write the helper**

`app/assets/js/api.js`:

```js
// Single entry point for every call to /api/*.
//
// Laravel's Sanctum SPA mode puts /api/* behind the web middleware group, which
// validates CSRF tokens. So any mutating request needs an X-XSRF-TOKEN header
// whose value comes from the XSRF-TOKEN cookie that GET /sanctum/csrf-cookie
// sets. Without it Laravel answers 419 and the form appears to fail silently.
//
// GET/HEAD requests skip all of this — they are not CSRF-validated.

var csrfPrimed = false;

function readCookie(name) {
  var match = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : null;
}

// Fetch the cookie once per page load. Concurrent callers share one request so
// two forms submitting together don't both prime it.
var priming = null;
function primeCsrf() {
  if (csrfPrimed) return Promise.resolve();
  if (priming) return priming;

  priming = fetch("/sanctum/csrf-cookie", { credentials: "same-origin" })
    .then(function () {
      csrfPrimed = true;
      priming = null;
    })
    .catch(function (error) {
      priming = null;
      throw error;
    });

  return priming;
}

/**
 * fetch() for /api/* paths, priming and attaching CSRF for mutating methods.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
export function apiFetch(url, options) {
  var config = options || {};
  var method = (config.method || "GET").toUpperCase();
  var safe = method === "GET" || method === "HEAD";

  config.credentials = "same-origin";

  if (safe) {
    return fetch(url, config);
  }

  return primeCsrf().then(function () {
    var token = readCookie("XSRF-TOKEN");
    config.headers = Object.assign({}, config.headers);
    if (token) {
      config.headers["X-XSRF-TOKEN"] = token;
    }
    return fetch(url, config);
  });
}
```

- [ ] **Step 2: Restart the assets service so Vite sees the new entry**

Run: `docker compose restart assets`

A new JS file does not enter Vite's manifest until the dev server restarts. Skipping this produces a confusing "module not found" in the browser.

- [ ] **Step 3: Switch every call site**

In each file below, add the import and replace `fetch(` with `apiFetch(` **only for `/api/*` URLs**:

```js
import { apiFetch } from "./api.js";
```

| File | Line | Call |
| --- | --- | --- |
| `app/assets/js/authentification-inscription.js` | 25 | `POST /api/login` |
| `app/assets/js/contact.js` | 5 | `POST /api/contact` |
| `app/assets/js/signup.js` | 73 | `GET /api/altcha` |
| `app/assets/js/signup.js` | 152 | `POST /api/signups` |
| `app/assets/js/signups_admin.js` | 3 | `GET /api/signups` |
| `app/assets/js/planning_repet.js` | 55 | `GET /api/events` |
| `app/assets/js/planning_repet.js` | 178 | `POST`/`PUT /api/events` |
| `app/assets/js/planning_repet.js` | 312 | `DELETE /api/events` |
| `app/assets/js/inscriptions_utilisateurs.js` | 18 | `POST /api/responses` |
| `app/assets/js/inscriptions_admin.js` | 40 | `GET /api/responses` |
| `app/assets/js/sinscrire.js` | 6 | `GET /api/events` |

GET calls are converted too, so there is exactly one way to reach the API and no future writer copies a raw `fetch`.

- [ ] **Step 4: Add a Vite entry if required**

Check `vite.config.js`: if entries are listed explicitly, `api.js` needs no entry of its own — it is imported by the others, so Vite bundles it as a shared chunk. Add an entry **only** if the build reports it as unresolved.

- [ ] **Step 5: Lint**

Run: `npm run lint:js && npm run lint:css && npm run format:check`
Expected: PASS. (Not `npm run check` — see "Test commands" above.)

- [ ] **Step 6: Commit**

```bash
git add app/assets/js
git commit -m "feat(js): route all /api/* calls through apiFetch with CSRF priming"
```

---

### Task 23: Move the dispatch block into `app/.htaccess`

**Files:**
- Modify: `app/.htaccess`
- Modify: `tools/build-overlays.mjs`, `tools/build-overlays.test.mjs`
- Delete: `docker/web/api-dispatch.htaccess`

- [ ] **Step 1: Add the dispatch block to `app/.htaccess`**

Insert **immediately after** `RewriteEngine on` and **before** the `RedirectMatch 301` line, so dispatch happens before the legacy-URL redirect and before the catch-all:

```apache
# ---------------------------------------------------------------------------
# Laravel API dispatch.
#
#   /api/*     -> the Laravel app in api-laravel/
#   /sanctum/* -> ditto. Sanctum's SPA flow needs GET /sanctum/csrf-cookie,
#                 which is not under /api/.
#
# The document root holds api-laravel/ (the Laravel project) — see
# tools/build.mjs. ^api(/|$) CANNOT match api-laravel/... because the hyphen
# defeats (/|$), which is the only reason this rewrite does not loop. Never
# rename that directory without adding a REDIRECT_STATUS guard here.
#
# Forward Authorization and X-XSRF-Token into the request environment: CGI-family
# SAPIs (this host, and the local container) do not hand Authorization to PHP
# otherwise. Laravel ships equivalent rules in its own public/.htaccess, but that
# file never reaches a server and its rules would not run for a dispatched
# request anyway.
RewriteCond %{HTTP:Authorization} .
RewriteRule ^(api|sanctum)(/|$) - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteCond %{HTTP:x-xsrf-token} .
RewriteRule ^(api|sanctum)(/|$) - [E=HTTP_X_XSRF_TOKEN:%{HTTP:X-XSRF-Token}]

# [L], NOT [END]. [END] was added in Apache 2.3.9 and this host's version is
# unresolved (staging/README.md records that it 500s on <RequireAny>, which
# leans 2.2). An unknown RewriteRule flag is a syntax error — a 500 on every
# request to the whole site — and no <IfModule> can guard a flag.
#
# [L] is safe on 2.2 and 2.4 and is verified to work here: the ruleset re-runs
# against the substituted path, but REDIRECT_STATUS is then set, so the
# front-controller catch-all below does not match, and ^api(/|$) cannot match
# api-laravel/... either. Hence no loop.
RewriteRule ^api(/|$) api-laravel/public/index.php [L]
RewriteRule ^sanctum(/|$) api-laravel/public/index.php [L]
# ---------------------------------------------------------------------------
```

- [ ] **Step 2: Simplify `tools/build-overlays.mjs`**

The docker target no longer needs a dispatch merge — the block is in `app/.htaccess`, which every overlay already includes. Delete the `dockerHtaccess()` function and its import of `docker/web/api-dispatch.htaccess`, and make the docker branch identical to prod's plain front controller:

```js
  if (env === 'docker') {
    // The Laravel dispatch block now lives in app/.htaccess itself, so the
    // docker overlay is just the front controller — same as prod.
    writeFileSync(`${outDir}/.htaccess`, `${frontController}\n`);
    return;
  }
```

Update the header comment: the `docker` target no longer describes a dispatch merge.

- [ ] **Step 3: Update the overlay tests**

In `tools/build-overlays.test.mjs`, delete the three tests asserting the docker dispatch merge and replace them with:

```js
test('the docker target is the plain front controller', () => {
  buildOverlay('docker');
  const out = readFileSync('dist/overlay/docker/.htaccess', 'utf8');
  const frontController = readFileSync('app/.htaccess', 'utf8').trimEnd();

  assert.equal(out, `${frontController}\n`);
});

test('app/.htaccess dispatches /api and /sanctum into Laravel with [L]', () => {
  const frontController = readFileSync('app/.htaccess', 'utf8');

  assert.match(frontController, /RewriteRule \^api\(\/\|\$\) api-laravel\/public\/index\.php \[L\]/);
  assert.match(frontController, /RewriteRule \^sanctum\(\/\|\$\) api-laravel\/public\/index\.php \[L\]/);
  // [END] is Apache 2.4-only and would 500 the whole site on 2.2.
  assert.doesNotMatch(frontController, /\[END\]/);
});
```

Keep whatever helper the existing tests use to invoke the generator; do not invent a new one.

- [ ] **Step 4: Delete the now-unused block**

```bash
git rm docker/web/api-dispatch.htaccess
```

- [ ] **Step 5: Regenerate and bring the stack up**

Run: `npm run dev`
Expected: the stack starts; `dist/overlay/docker/.htaccess` equals `app/.htaccess`.

- [ ] **Step 6: Verify dispatch reaches Laravel**

Run: `curl -si http://localhost:8090/api/user | head -1`
Expected: `HTTP/1.1 401 Unauthorized` — Laravel answering, not the old app's 404.

Run: `curl -s http://localhost:8090/api/user`
Expected: `{"error":"Not authenticated","code":"not_authenticated"}`.

Run: `curl -si http://localhost:8090/sanctum/csrf-cookie | grep -i set-cookie`
Expected: an `XSRF-TOKEN` cookie.

Run: `curl -si http://localhost:8090/api-laravel/.env | head -1`
Expected: `HTTP/1.1 404` — the front-controller catch-all, confirming the tree stays unreachable.

- [ ] **Step 7: Run the tests**

Run: `node --test tools/build-overlays.test.mjs`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/.htaccess tools/build-overlays.mjs tools/build-overlays.test.mjs
git rm docker/web/api-dispatch.htaccess
git commit -m "feat(apache): dispatch /api and /sanctum into Laravel from app/.htaccess"
```

---

### Task 24: Delete the old API handlers and routes

**Files:**
- Delete: `app/api/` (all 8 files)
- Modify: `app/src/routes.php`
- Modify: `tests/Unit/RoutesTest.php`

- [ ] **Step 1: Read the route table**

Read `app/src/routes.php` around lines 75-90 to see how `/api/*` routes are generated (a loop over endpoint names, adding both the clean route and a `.php` 301).

- [ ] **Step 2: Update the route test first**

In `tests/Unit/RoutesTest.php`, delete assertions that `/api/<name>` routes exist and add one asserting they do not:

```php
    public function test_no_api_routes_are_registered(): void
    {
        // /api/* is dispatched to Laravel by app/.htaccess before the front
        // controller ever runs; the old handlers are gone.
        foreach (['contact', 'signups', 'altcha', 'events', 'responses', 'login', 'logout', 'migrate'] as $name) {
            $this->assertArrayNotHasKey("/api/$name", $this->routeUris());
        }
    }
```

Adapt `routeUris()` to whatever accessor the existing tests use for the route table.

- [ ] **Step 3: Run it and confirm it fails**

Run: `npm run test:php -- -- --filter=RoutesTest`
Expected: FAIL — the routes are still registered.

- [ ] **Step 4: Remove the route generation**

Delete the `/api/*` loop from `app/src/routes.php`, including the `$apiMethods` variable and the `.php` redirect for API paths, plus the now-unused endpoint-name list. Leave every page route untouched.

- [ ] **Step 5: Delete the handlers**

```bash
git rm -r app/api
```

- [ ] **Step 6: Run the suite**

Run: `npm run test:php -- -- --testsuite unit`
Expected: PASS. Tests referencing the deleted handlers must be deleted, not weakened.

- [ ] **Step 7: Commit**

```bash
git add app/src/routes.php tests/Unit/RoutesTest.php
git rm -r app/api
git commit -m "refactor: delete the old app's /api handlers and route table"
```

---

### Task 25: Trim `App\Auth` and delete the orphaned classes

**Files:**
- Modify: `app/src/Auth.php`
- Delete: `app/src/Altcha.php`, `app/src/Mailer.php`, `app/src/Http/JsonResponse.php`, `app/src/Dto/`, `app/src/Validation/`, `app/src/Repositories/{Event,Response,Challenge,User}Repository.php`
- Delete: the tests covering those classes
- Modify: `tests/Unit/AuthTest.php`

- [ ] **Step 1: Trim `Auth`**

From `app/src/Auth.php` delete: `attemptLogin()`, `completeLogin()`, `logout()`, `requireLogin()`, `requireCapability()`, `requireCanManageEvents()`, `requireCanViewSummary()`, `requireCanRespond()`, `rolesWithCapability()`, and the `use App\Http\JsonResponse;`, `use App\Repositories\UserRepository;` and `use mysqli_sql_exception;` imports.

Keep: `CAPABILITIES`, `roleCan()`, `canManageEvents()`, `canViewSummary()`, `canRespond()`, `startSession()`, `check()`, `user()`, `role()`, `requireLoginPage()`.

Add this note above the class:

```php
/**
 * Page-side authentication for the old app. Login, logout and every API guard
 * moved to Laravel; what remains is what app/pages/, app/partials/ and App\View
 * still call. The session itself is written by Laravel's login (see the API's
 * App\Support\LegacySession bridge) — this class only reads it.
 *
 * Sub-project 3 retires this class along with those pages.
 */
```

**Do not port the legacy plain-text password path.** It is deliberately dropped; a remaining un-hashed row is handled by a one-time DB script instead.

- [ ] **Step 2: Update `tests/Unit/AuthTest.php`**

Delete tests covering `attemptLogin`, `logout`, the `requireCanX` guards and `rolesWithCapability`. Keep the capability-matrix tests, which are the valuable part.

- [ ] **Step 3: Delete the orphaned classes**

```bash
git rm app/src/Altcha.php app/src/Mailer.php app/src/Http/JsonResponse.php
git rm -r app/src/Dto app/src/Validation
git rm app/src/Repositories/EventRepository.php app/src/Repositories/ResponseRepository.php app/src/Repositories/ChallengeRepository.php app/src/Repositories/UserRepository.php
```

- [ ] **Step 4: Delete their tests**

```bash
git rm tests/Unit/AltchaTest.php tests/Unit/MailerTest.php tests/Unit/JsonResponseTest.php tests/Unit/ValidatorTest.php tests/Unit/EventInputTest.php
git rm tests/Integration/EventRepositoryTest.php tests/Integration/ResponseRepositoryTest.php tests/Integration/ChallengeRepositoryTest.php tests/Integration/UserRepositoryTest.php tests/Integration/AuthLoginTest.php
```

- [ ] **Step 5: Confirm nothing still references them**

Run: `grep -rn "JsonResponse\|App\\\\Dto\|App\\\\Validation\|UserRepository\|EventRepository\|ResponseRepository\|ChallengeRepository\|App\\\\Mailer\|App\\\\Altcha" app/ tests/`
Expected: no matches. `SignupRepository` still appearing is correct — it stays.

- [ ] **Step 6: Run the suite and lint**

Run: `npm run test:php -- -- --testsuite unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/Auth.php tests/Unit/AuthTest.php
git commit -m "refactor: trim App\\Auth to its page half and delete the orphaned API classes"
```

---

## Phase 3 — Retire the old migration system and deploy plumbing

---

### Task 26: Delete the old migration system

**Files:**
- Delete: `app/src/Migrator.php`, `app/src/AutoMigrator.php`, `sql/migrations/`, `tools/migrate.php`, `tests/Integration/{MigratorTest,AutoMigratorTest}.php`
- Modify: `app/src/bootstrap.php`, `tools/build.mjs`, `docker/web/entrypoint.sh`

- [ ] **Step 1: Remove the `AutoMigrator` call**

In `app/src/bootstrap.php`, delete the `AutoMigrator` block and its import. Laravel now owns the schema entirely; `POST /api/migrate` runs `artisan migrate`.

- [ ] **Step 2: Stop copying `sql/migrations` in the build**

In `tools/build.mjs`, delete the `sql/migrations` copy step and the comment block above it (around lines 36-40).

- [ ] **Step 3: Remove the entrypoint's old-migrations step**

In `docker/web/entrypoint.sh`, delete the step that runs `/srv/tools/migrate.php` and its retry wrapper, keeping the `artisan migrate --force` step and the `chown` that follows.

**Then remove two bind mounts from `docker-compose.yml`, in the same commit as the deletions.** Both point at paths this task deletes:

- `- ./sql/migrations:/var/www/html/sql/migrations:ro` (around line 61)
- `- ./tools:/srv/tools:ro` (around line 67)

This is not cosmetic. A bind mount whose host path does not exist makes Docker **create a directory in its place**, and `web` then fails to start — the same failure mode CLAUDE.md documents for the generated `.htaccess` overlay. Deleting `sql/migrations/` while that mount remains takes the local stack down.

Also drop the `/srv/app/src` symlink from `docker/web/Dockerfile` if nothing else uses it. Check first:

Run: `grep -rn "srv/tools\|srv/app\|sql/migrations" docker/ tools/ docker-compose.yml`

- [ ] **Step 4: Delete the files**

```bash
git rm app/src/Migrator.php app/src/AutoMigrator.php tools/migrate.php
git rm -r sql/migrations
git rm tests/Integration/MigratorTest.php tests/Integration/AutoMigratorTest.php
```

If `sql/` is now empty, remove it too.

- [ ] **Step 5: Confirm nothing references them**

Run: `grep -rn "AutoMigrator\|App\\\\Migrator\|sql/migrations" app/ tools/ tests/ docker/ .github/`
Expected: no matches outside documentation, which Task 30 updates.

- [ ] **Step 6: Rebuild the stack from scratch**

Run: `npm run dev:down && npm run dev`
Expected: the stack comes up; the entrypoint runs only Laravel's migrations.

Run: `docker compose exec db mariadb -uroot -proot lescanetons -e "SHOW TABLES;"`
Expected: every application table present, plus Laravel's `migrations`/`sessions`/`cache`; no `used_challenges`.

- [ ] **Step 7: Run the suites**

Run: `npm run test:php && docker compose exec -w /var/www/html/api-laravel web php artisan test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/src/bootstrap.php tools/build.mjs docker/
git rm app/src/Migrator.php app/src/AutoMigrator.php tools/migrate.php
git rm -r sql/migrations
git rm tests/Integration/MigratorTest.php tests/Integration/AutoMigratorTest.php
git commit -m "refactor: retire the old SQL migration system; Laravel owns the schema"
```

---

### Task 27: Trim `config.example.php`

**This changes the deploy contract.** The config-shape pre-flight reports drift in *both* directions, so removing keys here makes every deploy refuse until each server's `config.php` is hand-edited to match.

**Files:**
- Modify: `config/config.example.php`, `config/config.docker.php`

- [ ] **Step 1: Remove the dead keys**

Delete `'auto_migrate'` and the whole `'migrate' => ['token' => ...]` block from both files, including their comments. Nothing reads them now: `AutoMigrator` is gone, and Laravel's migrate endpoint reads `MIGRATE_TOKEN` from its own `.env`.

- [ ] **Step 2: Verify the shape check sees the change**

Run: `npm run deploy:test -- --dry-run`
Expected: **refusal (exit 2)** naming `auto_migrate` and `migrate.token` as keys the server has but the code no longer expects. That is the pre-flight working correctly.

- [ ] **Step 3: Record the operator step**

Add to `staging/README.md`, under the per-server configuration section:

```markdown
### Before deploying the `/api/*` cutover

Each server's `config.php` must be hand-edited **before** that deploy, or the
config-shape pre-flight refuses it (exit 2):

- remove `'auto_migrate' => ...` — the old `App\AutoMigrator` is gone
- remove the `'migrate' => ['token' => ...]` block — Laravel's migrate endpoint
  reads `MIGRATE_TOKEN` from `api-laravel/.env` instead

Keep `'altcha' => ['hmac_secret' => ...]` — still read by the old pages.
```

- [ ] **Step 4: Commit**

```bash
git add config/config.example.php config/config.docker.php staging/README.md
git commit -m "refactor(config): drop auto_migrate and migrate.token from config.php"
```

---

### Task 28: Laravel's server-side `.env`

Laravel has **no configuration on any server**: `tools/build.mjs` strips `.env` from the artifact and nothing recreates it. Without this task the first dispatched request fails outright.

**Files:**
- Create: `api/.env.example`
- Modify: `tools/deploy/preflight.mjs`, `tools/deploy/preflight.test.mjs`, `staging/README.md`

- [ ] **Step 1: Write the template**

`api/.env.example`:

```dotenv
# Template for the SERVER-OWNED api-laravel/.env. Copy to the server by hand,
# once per environment, and fill in the real values — exactly like config.php.
# It is never uploaded by a deploy and never overwritten.
#
# Generate APP_KEY with: php artisan key:generate --show

APP_NAME="Les Canetons API"
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://lescanetons.org

# APP_DEBUG must be false on every server: true renders stack traces into API
# responses.
#
# APP_ENV is NOT merely cosmetic: POST /api/migrate reports it back in its
# `environment` field, which tools/dbmigrate.mjs prints. Left at Laravel's
# default, every server logs `environment: production` — so a QA migration would
# claim to be production, which is the worst possible thing to be misleading
# about during a promotion. Set it to test / qa / prod per server, matching the
# old config.php's `env` key.

LOG_CHANNEL=stack
LOG_LEVEL=error

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=
DB_USERNAME=
DB_PASSWORD=

# The database store is REQUIRED, not a preference: App\Support\ChallengeGuard
# uses the cache as the Altcha single-use replay guard, so it must be shared
# across requests and durable. The `array` store would make every replay succeed.
CACHE_STORE=database
SESSION_DRIVER=database
SESSION_LIFETIME=120
QUEUE_CONNECTION=sync

# Same value as the site's own host, so Sanctum treats the SPA as same-origin.
SANCTUM_STATEFUL_DOMAINS=lescanetons.org
SESSION_DOMAIN=lescanetons.org

# Must match the MIGRATE_TOKEN in .env.<env> / the CI secret that calls
# POST /api/migrate.
MIGRATE_TOKEN=

# Signs Altcha proof-of-work challenges. REQUIRED — set a long random value per
# server. Empty or the literal CHANGE_ME makes /api/altcha fail closed (503) and
# every signup submission refuse with captcha_failed, which looks like a broken
# form rather than a missing setting. The example value is public, so any
# challenge signed with it is forgeable; that is why it fails closed rather than
# falling back.
ALTCHA_HMAC_SECRET=

MAIL_MAILER=smtp
MAIL_HOST=
MAIL_PORT=465
MAIL_USERNAME=
MAIL_PASSWORD=
# Set this EXPLICITLY. The old app's config.php had secure => 'ssl' on port 465
# (implicit TLS). Laravel reads MAIL_SCHEME in config/mail.php; if it is unset,
# Symfony's transport factory infers TLS from the port number instead — which
# happens to give the right answer for 465, but by inference rather than
# instruction. Use `smtps` for 465, or `smtp` with MAIL_PORT=587 for STARTTLS.
MAIL_SCHEME=smtps
# The real per-server sender. This lived in the old config.php's
# mail.from_email / mail.from_name and has no other home now.
MAIL_FROM_ADDRESS=
MAIL_FROM_NAME="Les Canetons de Fribourg"
```

- [ ] **Step 2: Write the failing protected-set test**

Add to `tools/deploy/preflight.test.mjs`:

```js
test('.env is protected so a relist never deletes a server Laravel config', () => {
  // api-laravel/.env is hand-placed and server-owned. It is not in the build
  // artifact, so without this an authoritative LIST (--relist or a bootstrap
  // deploy) would see it as stale and delete Laravel's entire configuration.
  assert.ok(PROTECTED.has('.env'));
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `node --test tools/deploy/preflight.test.mjs`
Expected: FAIL — `.env` is not in the set.

- [ ] **Step 4: Add `.env` to the protected set**

In `tools/deploy/preflight.mjs` line 16:

```js
// Files that live on the server and must never be uploaded or deleted (plus
// the state file, which this tool owns and writes separately).
//
// '.env' is api-laravel/.env — Laravel's hand-placed server config. Matching is
// by basename at any depth, which is what protects it here.
export const PROTECTED = new Set(['.htaccess', 'robots.txt', 'config.php', '.htpasswd', '.env', STATE_FILE]);
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `node --test tools/deploy/preflight.test.mjs`
Expected: PASS.

- [ ] **Step 6: Document the operator step**

Add to `staging/README.md`, next to the Task 27 block:

```markdown
### Laravel's server config (`api-laravel/.env`)

Laravel needs its own `.env` on every server; the deploy never ships one
(`tools/build.mjs` strips it from the artifact). Place it by hand, once per
environment, from `api/.env.example`:

1. Copy `api/.env.example` to the server as `api-laravel/.env`.
2. Fill in `APP_KEY` (`php artisan key:generate --show`), the `DB_*` block, the
   `MAIL_*` block, `MIGRATE_TOKEN` and `ALTCHA_HMAC_SECRET`.
3. Set `APP_ENV` to `test`/`qa`/`prod` and keep `APP_DEBUG=false`.
4. Point `SANCTUM_STATEFUL_DOMAINS` and `SESSION_DOMAIN` at that server's host.
5. Leave `CACHE_STORE=database` — the Altcha replay guard depends on a shared,
   durable cache.

`.env` is in the deploy CLI's protected set, so it is never uploaded and never
deleted — including by `--relist`.
```

- [ ] **Step 7: Commit**

```bash
git add api/.env.example tools/deploy/preflight.mjs tools/deploy/preflight.test.mjs staging/README.md
git commit -m "feat(deploy): add the Laravel .env template and protect it from deletion"
```

---

### Task 29: Extend the smoke checks

**Files:**
- Modify: `tools/smoke-docker.mjs`

- [ ] **Step 1: Read the existing script**

Read `tools/smoke-docker.mjs` to match its check-definition style and its token-sending behaviour (it currently sends the migrate token both ways; now only the header is needed).

- [ ] **Step 2: Add checks for the five endpoints**

Add, in the script's existing idiom:

| Check | Request | Expected |
| --- | --- | --- |
| Altcha issues a challenge | `GET /api/altcha` | 200, JSON with `challenge` and `signature` |
| Events are public | `GET /api/events` | 200, a JSON array |
| Contact rejects an empty post | `POST /api/contact` (no body, no CSRF) | 419 or 400 — Laravel answering, not a 404 |
| Signups require auth for the summary | `GET /api/signups` | 401 with `code: not_authenticated` |
| Responses require auth | `POST /api/responses` | 401 or 419 |
| The Laravel tree stays unreachable | `GET /api-laravel/.env` | 404 from the front controller |

The point of each is that **Laravel answers at all** — a 404 would mean dispatch is broken. Assert on `code` where the contract provides one.

- [ ] **Step 3: Simplify the migrate token to header-only**

The controller now reads only `X-Migrate-Token`, so drop the duplicate body/query parameter — it is dead weight, and the check is stricter without it. Also fix the now-false comment above it (around line 100), which still says `MigrateController` reads the token from a request input.

Keep the `json.ok === true` **and** `typeof json.output === 'string'` assertions. Those are deliberate — they stop a `200 {ok:true}` from some other handler passing — and Task 17b kept both keys in the response specifically so this check keeps working.

- [ ] **Step 3b: Fix the two currently-failing smoke checks**

`npm run smoke` is **6/8** as of Task 17b, and both failures are pre-existing rather than caused by this work: `/api/* reaches Laravel` and `old app /api/* shadowed`. They concern `/api/contact`, and they encode the old "known limitation" world where Laravel implemented none of these endpoints. Now that it implements all five, the assertions themselves are stale.

Diagnose before rewriting — a smoke check that was asserting the wrong thing is worth understanding, since these two were the only guard on dispatch behaviour.

- [ ] **Step 4: Run the smoke checks**

Run: `npm run smoke`
Expected: PASS, all checks green.

- [ ] **Step 5: Commit**

```bash
git add tools/smoke-docker.mjs
git commit -m "test(smoke): cover the five ported endpoints and the dispatch boundary"
```

---

### Task 30: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Delete: `docs/superpowers/specs/`-adjacent stale claims as listed

- [ ] **Step 1: Remove the known-limitation section**

Delete the whole **"Known limitation — `/api/*` is ahead of the code"** block from `CLAUDE.md`. It is now false: every endpoint Laravel receives, it implements.

- [ ] **Step 2: Update the architecture entries**

In `CLAUDE.md`:

- **Automated DB migrations:** rewrite to say Laravel owns migrations — `POST /api/migrate` runs `artisan migrate`, gated by the `X-Migrate-Token` header; `sql/migrations/`, `App\Migrator` and `App\AutoMigrator` are gone.
- **API:** replace "`app/api/*.php` return JSON … guard with `Auth::require*`" with the Laravel routing/controller/middleware description, and note the `{error, code, fields[]}` contract and that `App\Exceptions\ApiError` renders it.
- **Auth:** note that Laravel owns login/logout, `App\Auth` retains only page-gating, and `App\Support\LegacySession` bridges the two until sub-project 3.
- **Local Development:** `/api/*` now works end-to-end locally; remove the `:8092` and "five endpoints 404" caveats if any remain.
- **Deployment:** add that `api-laravel/.env` is a fourth server-owned file placed by hand, and is in the protected set.
- **Build step:** it no longer copies `sql/migrations`.

- [ ] **Step 3: Verify no stale references remain**

Run: `grep -rn "api-dispatch\|AutoMigrator\|sql/migrations\|ahead of the code\|8092" CLAUDE.md staging/README.md README.md`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md staging/README.md
git commit -m "docs: describe Laravel as the sole API and schema owner"
```

---

### Task 31: Final verification

- [ ] **Step 1: Both suites**

Run: `npm run test:php && docker compose exec -w /var/www/html/api-laravel web php artisan test`
Expected: PASS, no skips.

- [ ] **Step 2: Lint everything**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Rebuild the stack from nothing**

Run: `npm run dev:down && npm run dev && npm run smoke`
Expected: stack healthy, all smoke checks green. This proves a fresh database migrates correctly with the old system gone.

- [ ] **Step 4: Exercise every endpoint by hand**

At `http://localhost:8090`, logged in as each seeded user (`demo.admin` / `demo.moderator` / `demo.user`, password `demo`):

- [ ] Log in as `demo.user` — succeeds, and the page shows you as logged in (proves the `$_SESSION` bridge)
- [ ] `/planning_repet` lists events; RSVP saves and survives a reload
- [ ] Log in as `demo.admin` — create, edit and delete an event
- [ ] `/inscriptions_admin` shows the response summary, and `demo.admin` is **not** listed as a responder
- [ ] Submit the contact form — succeeds, and the message appears in Adminer
- [ ] Submit the signup form — succeeds, Altcha solves, and the mail appears in Mailpit (`:8025`)
- [ ] Submit the same signup payload twice via curl — the second is refused (replay guard)
- [ ] Download the admin xlsx export and open it
- [ ] Force a validation error in each form — the message is **French**, not English or a raw key
- [ ] Log out — the members' pages redirect to login again

- [ ] **Step 5: Verify the build produces a complete artifact**

Run: `npm run build`
Expected: succeeds. Then confirm:

```bash
ls dist/build/api 2>/dev/null && echo "FAIL: old api/ still in the artifact" || echo "ok: no old api/"
ls dist/build/api-laravel/public/index.php
ls dist/build/sql 2>/dev/null && echo "FAIL: sql/ still shipped" || echo "ok: no sql/"
grep -c "api-laravel/public/index.php" dist/build/.htaccess
```

Expected: no old `api/`, Laravel's front controller present, no `sql/`, and the dispatch rule in the built `.htaccess`.

- [ ] **Step 6: Dry-run the deploy**

Run: `npm run deploy:test -- --dry-run`
Expected: **refusal (exit 2)** on config-shape drift until TEST's `config.php` is trimmed per Task 27 — that is correct. After trimming it by hand, re-run and read the deletion list: it should show `api/*.php` and `sql/` being removed and `api-laravel/*` being added.

- [ ] **Step 7: Commit anything outstanding**

```bash
git status --short
```

Expected: clean.

---

## Deployment checklist (operator, not agent)

In order. The first three are hand steps on each server and must precede the deploy.

1. **Hash any plain-text passwords.** On TEST, QA and PROD:
   `SELECT COUNT(*) FROM users WHERE password NOT LIKE '$%';`
   Must be 0. Run the one-time hashing script first if not. Do TEST too, before step 6 — otherwise the login check fails and looks like a dispatch fault.
2. **Place `api-laravel/.env`** on each server from `api/.env.example` (Task 28).
3. **Trim each `config.php`** — remove `auto_migrate` and `migrate.token` (Task 27). Until this is done the deploy refuses with exit 2.
4. **Merge to `main`** — auto-deploys TEST.
5. **Run the migrations:** `npm run dbmigrate:test`.
6. **Verify TEST by hand** using the Task 31 step 4 checklist against `https://test.lescanetons.org`.
7. **Tag** via `tag-release.yml`, then dispatch `deploy-qa.yml`; verify; then `deploy-prod.yml`.
8. **Rollback if needed:** redeploy the previous tag. `app/.htaccess` and the old handlers are restored as a set — never promote one without the other.

**Do not rename `api-laravel/` to `api/` in this work.** That is a separate PR; see spec §12 for the rewrite-loop hazard and its one-line fix.
