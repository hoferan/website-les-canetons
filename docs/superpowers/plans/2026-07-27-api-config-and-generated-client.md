# Plan 1 — `/api/config` + generated TypeScript client

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Laravel API for a static SPA — a public `GET /api/config`, REST-shaped `/events/{id}`, and an accurate OpenAPI document — then generate a typed TanStack Query client from it.

**Architecture:** `dedoc/scramble` exports OpenAPI 3.1 from the existing controllers; three custom `ExceptionToResponseExtension`s teach it this API's real error contract; `orval` turns the document into a client plus Query hooks whose CSRF priming, credentials and error normalization live in one hand-written mutator. Nothing in `app/` is touched, so the live site keeps working throughout.

**Tech Stack:** Laravel 13.8, Sanctum 4, `dedoc/scramble` v0.13.36, `opis/json-schema`, TypeScript, `orval`, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-27-frontend-spa-cutover-design.md` (§3, §4)

---

## Context for the engineer

This repo is a Guggenmusik band website. Until recently it was a PHP app; the API has already been migrated to Laravel, which lives in `api/` and is deployed to a directory named `api-laravel/`. The old PHP front end in `app/` still serves every page and **must keep working** — it is deleted in a later plan, not this one.

**This API does not use Laravel's default error shape.** `App\Exceptions\ApiError` renders every error as:

```json
{"error": "Invalid form submission", "code": "validation_failed",
 "fields": [{"field": "email", "reason": "required", "params": {}}]}
```

Validation failures return **HTTP 400, not 422**. This is deliberate: `code` and `fields[].reason` are stable machine tokens that the front end translates into French, which is the only place French is computed. `api/tests/Feature/ApiErrorContractTest.php` already pins every status and body; read it before touching anything error-related.

**Already done** (commit `8c4e065`): `dedoc/scramble` v0.13.36 is installed as an `api/` dev dependency and verified to export OpenAPI 3.1.0 for all 14 operations.

### Commands you will use

```bash
# Run one API test class (the compose stack must be up: npm run dev)
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=ClassName'

# Run the whole API suite
docker compose exec -T web sh -c 'cd api-laravel && php artisan test'

# Add a Composer dependency to api/  (MSYS_NO_PATHCONV is required on Windows/Git Bash,
# or /api is silently rewritten to a Windows path and Composer fails)
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps --entrypoint composer deps \
  require <package> --dev --no-scripts --working-dir=/api
docker compose exec -T web php api-laravel/artisan package:discover
```

`api/` is bind-mounted read-write into the container, so files written inside it (including the exported `openapi.json`) appear on the host.

## File structure

**Create:**

| File | Responsibility |
|---|---|
| `api/config/scramble.php` | Published Scramble config: pinned `servers`, registered extensions |
| `api/app/Support/Scramble/ErrorResponse.php` | Builds the shared `{error, code, fields}` OpenAPI schema — one place, three consumers |
| `api/app/Support/Scramble/ValidationExceptionResponse.php` | Documents `ValidationException` as 400 + the real contract |
| `api/app/Support/Scramble/AuthenticationExceptionResponse.php` | Documents `AuthenticationException` as 401 + the real contract |
| `api/app/Support/Scramble/AccessDeniedResponse.php` | Documents `AccessDeniedHttpException` as 403 + the real contract |
| `api/app/Http/Controllers/Api/ConfigController.php` | The public runtime-config endpoint |
| `api/tests/Feature/ConfigEndpointTest.php` | Config shape, allowlist leak guard, env collapse, flag gating |
| `api/tests/Feature/OpenApiDocumentTest.php` | The exported document documents what the API really returns |
| `api/openapi.json` | The committed OpenAPI document (generated, never hand-edited) |
| `tools/openapi.mjs` | Exports the document, Docker-or-local, same pattern as `tools/pint.mjs` |
| `orval.config.ts` | Generation config for the client + Query hooks |
| `tsconfig.json` | TypeScript config for `web/` |
| `web/src/api/http.ts` | The mutator: credentials, CSRF priming, `ApiError` normalization |
| `web/src/api/http.test.ts` | Unit tests for the mutator |
| `web/src/api/generated/` | Generated client + hooks (committed, never hand-edited) |

**Modify:**

| File | Change |
|---|---|
| `api/app/Support/Occasion.php` | Add `MENU_INFO` (description + price per menu) |
| `api/app/Http/Controllers/Api/SignupController.php` | `#[BodyParameter]` attributes only — **no logic change** |
| `api/routes/api.php` | `/events/{id}`, the config route, `#[ExcludeRouteFromDocs]` on migrate |
| `api/app/Http/Controllers/Api/EventController.php` | `update`/`destroy` take `$id` as an argument |
| `api/tests/Feature/EventWriteTest.php` | Target the new paths |
| `api/tests/Feature/OccasionDriftTest.php` | Also pin `MENU_INFO` |
| `package.json` | `openapi`, `orval`, `test:web` scripts; TS/orval/Vitest dev deps |
| `.github/workflows/ci.yml` | Drift-check job |

---

## Task 1: Publish and pin the Scramble config

**Why:** Two defaults are wrong for us. `servers` is built from `APP_URL`, so a spec exported on a dev machine says `http://localhost:8090/api` and one exported in CI says something else — the drift check in Task 11 would fail forever. And extensions must be registered before Task 2 can take effect.

**Files:**
- Create: `api/config/scramble.php`

- [ ] **Step 1: Publish the config**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan vendor:publish --tag=scramble-config'
```

Expected: `INFO  Publishing [scramble-config] assets.` and `api/config/scramble.php` now exists on the host.

- [ ] **Step 2: Pin `export_path` and `servers`**

In `api/config/scramble.php`, set these two keys (leave every other key at its published default):

```php
    /*
     * Exported to api/openapi.json (relative to the Laravel project root), which
     * is committed and consumed by orval. See tools/openapi.mjs.
     */
    'export_path' => 'openapi.json',
```

```php
    /*
     * Pinned to an ABSOLUTE production URL on purpose. Left at null, Scramble
     * derives the server from APP_URL, so the same code exports a different
     * document on every machine (http://localhost:8090/api locally, something
     * else in CI) and the drift check in CI could never pass. Laravel's url()
     * helper returns absolute URLs unchanged, so this value survives verbatim
     * and the exported document is byte-identical everywhere.
     *
     * The client does not read this: web/src/api/http.ts prepends /api itself,
     * because the SPA is served from the same origin as the API.
     */
    'servers' => [
        'Production' => 'https://lescanetons.org/api',
    ],
```

- [ ] **Step 3: Verify the server URL is now environment-independent**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan scramble:export --path=/tmp/spec.json' \
  && MSYS_NO_PATHCONV=1 docker compose exec -T web node -e "console.log(JSON.stringify(require('/tmp/spec.json').servers))" 2>/dev/null \
  || MSYS_NO_PATHCONV=1 docker compose exec -T web sh -c 'grep -o "\"servers\":\[[^]]*\]" /tmp/spec.json'
```

Expected: the servers array contains `https://lescanetons.org/api` and no `localhost`.

- [ ] **Step 4: Commit**

```bash
git add api/config/scramble.php
git commit -m "build(api): publish Scramble config with a pinned server URL"
```

---

## Task 2: Teach Scramble this API's real error contract

**Why:** Scramble documents validation failures as **422 `{message, errors}`** — Laravel's default. This API returns **400 `{error, code, fields[]}}`**. Every form in the SPA depends on that shape, so a generated client built on the wrong types would be actively misleading. Verified live during the spike:

```
POST /api/contact {} -> HTTP 400
{"error":"Invalid form submission","code":"validation_failed","fields":[{"field":"lastName","reason":"required"}, ...]}
GET /api/user     -> HTTP 401  {"error":"Not authenticated","code":"not_authenticated"}
```

**Files:**
- Create: `api/app/Support/Scramble/ErrorResponse.php`
- Create: `api/app/Support/Scramble/ValidationExceptionResponse.php`
- Create: `api/app/Support/Scramble/AuthenticationExceptionResponse.php`
- Create: `api/app/Support/Scramble/AccessDeniedResponse.php`
- Create: `api/tests/Feature/OpenApiDocumentTest.php`
- Modify: `api/config/scramble.php`

- [ ] **Step 1: Write the failing test**

Create `api/tests/Feature/OpenApiDocumentTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * The exported OpenAPI document must describe what this API actually returns.
 *
 * Scramble infers most shapes from the controllers correctly, but it cannot know
 * about App\Exceptions\ApiError: out of the box it documents Laravel's default
 * 422 {message, errors} for validation, while this API answers 400
 * {error, code, fields[]}. App\Support\Scramble\* fixes that, and this test is
 * what stops the fix from silently regressing — a wrong error type in the
 * document becomes a wrong error type in the generated client.
 */
class OpenApiDocumentTest extends TestCase
{
    /** @var array<string,mixed> */
    private array $document;

    protected function setUp(): void
    {
        parent::setUp();

        $path = sys_get_temp_dir().'/openapi-test.json';
        Artisan::call('scramble:export', ['--path' => $path]);
        $this->document = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    public function test_validation_failures_are_documented_as_400_not_422(): void
    {
        $contact = $this->document['paths']['/contact']['post']['responses'];

        $this->assertArrayHasKey('400', $contact, 'Validation is documented under the wrong status.');
        $this->assertArrayNotHasKey('422', $contact, "422 is Laravel's default shape; this API does not use it.");
    }

    public function test_the_validation_response_carries_the_error_contract(): void
    {
        $schema = $this->resolve($this->document['paths']['/contact']['post']['responses']['400']);
        $properties = $schema['properties'];

        $this->assertSame(['validation_failed'], $properties['code']['enum']);
        $this->assertSame('array', $properties['fields']['type']);
        $this->assertSame(
            ['field', 'reason'],
            $properties['fields']['items']['required'],
            'field and reason are always present; params is optional.'
        );
        $this->assertArrayNotHasKey('errors', $properties, "Laravel's native errors bag must not appear.");
    }

    public function test_unauthenticated_responses_carry_the_error_contract(): void
    {
        $schema = $this->resolve($this->document['paths']['/user']['get']['responses']['401']);

        $this->assertSame(['not_authenticated'], $schema['properties']['code']['enum']);
    }

    /**
     * Follow a $ref into components, since Scramble emits shared error responses
     * by reference rather than inline.
     *
     * @param  array<string,mixed>  $response
     * @return array<string,mixed>
     */
    private function resolve(array $response): array
    {
        if (isset($response['$ref'])) {
            $name = basename(str_replace('\\', '/', $response['$ref']));
            $response = $this->document['components']['responses'][$name];
        }

        return $response['content']['application/json']['schema'];
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=OpenApiDocumentTest'
```

Expected: FAIL — `test_validation_failures_are_documented_as_400_not_422` reports that key `400` is missing (the document currently has `422`).

- [ ] **Step 3: Write the shared schema builder**

Create `api/app/Support/Scramble/ErrorResponse.php`:

```php
<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\Support\Generator\Types as OpenApiTypes;

/**
 * Builds the OpenAPI schema for App\Exceptions\ApiError's response body:
 *
 *     {"error": "...", "code": "...", "fields": [{"field", "reason", "params"?}]}
 *
 * One builder, three extensions, so the documented contract cannot differ
 * between statuses. ApiError is the authority on the shape; this only describes
 * it, and Tests\Feature\OpenApiDocumentTest pins the two together.
 */
final class ErrorResponse
{
    /** @param  string[]  $codes  the `code` values this status can carry */
    public static function schema(array $codes, bool $withFields = false): OpenApiTypes\ObjectType
    {
        $body = (new OpenApiTypes\ObjectType)
            ->addProperty('error', (new OpenApiTypes\StringType)
                ->setDescription('English message. Never displayed: the front end renders `code`.'))
            ->addProperty('code', (new OpenApiTypes\StringType)
                ->enum($codes)
                ->setDescription('Stable machine token the front end maps to French.'))
            ->setRequired(['error', 'code']);

        if (! $withFields) {
            return $body;
        }

        // `params` is absent unless the reason interpolates (today: too_long,
        // invalid_value), so it is deliberately NOT in required.
        $field = (new OpenApiTypes\ObjectType)
            ->addProperty('field', new OpenApiTypes\StringType)
            ->addProperty('reason', new OpenApiTypes\StringType)
            ->addProperty('params', (new OpenApiTypes\ObjectType)
                ->additionalProperties(new OpenApiTypes\MixedType))
            ->setRequired(['field', 'reason']);

        return $body->addProperty('fields', (new OpenApiTypes\ArrayType)->setItems($field));
    }
}
```

- [ ] **Step 4: Write the three extensions**

Create `api/app/Support/Scramble/ValidationExceptionResponse.php`:

```php
<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\Extensions\ExceptionToResponseExtension;
use Dedoc\Scramble\Support\Generator\Reference;
use Dedoc\Scramble\Support\Generator\Response;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Type\ObjectType;
use Dedoc\Scramble\Support\Type\Type;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Replaces Scramble's built-in 422 {message, errors} with what
 * App\Exceptions\ApiError::validation() really returns: 400 validation_failed.
 */
final class ValidationExceptionResponse extends ExceptionToResponseExtension
{
    public function shouldHandle(Type $type): bool
    {
        return $type instanceof ObjectType && $type->isInstanceOf(ValidationException::class);
    }

    public function toResponse(Type $type)
    {
        return Response::make(400)
            ->setDescription('Validation failed. See App\Exceptions\ApiError::validation().')
            ->setContent(
                'application/json',
                Schema::fromType(ErrorResponse::schema(['validation_failed'], withFields: true))
            );
    }

    public function reference(ObjectType $type)
    {
        return new Reference('responses', Str::start($type->name, '\\'), $this->components);
    }
}
```

Create `api/app/Support/Scramble/AuthenticationExceptionResponse.php`:

```php
<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\Extensions\ExceptionToResponseExtension;
use Dedoc\Scramble\Support\Generator\Reference;
use Dedoc\Scramble\Support\Generator\Response;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Type\ObjectType;
use Dedoc\Scramble\Support\Type\Type;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Support\Str;

/** 401 not_authenticated — see App\Exceptions\ApiError::unauthenticated(). */
final class AuthenticationExceptionResponse extends ExceptionToResponseExtension
{
    public function shouldHandle(Type $type): bool
    {
        return $type instanceof ObjectType && $type->isInstanceOf(AuthenticationException::class);
    }

    public function toResponse(Type $type)
    {
        return Response::make(401)
            ->setDescription('Not authenticated.')
            ->setContent('application/json', Schema::fromType(ErrorResponse::schema(['not_authenticated'])));
    }

    public function reference(ObjectType $type)
    {
        return new Reference('responses', Str::start($type->name, '\\'), $this->components);
    }
}
```

Create `api/app/Support/Scramble/AccessDeniedResponse.php`:

```php
<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\Extensions\ExceptionToResponseExtension;
use Dedoc\Scramble\Support\Generator\Reference;
use Dedoc\Scramble\Support\Generator\Response;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Type\ObjectType;
use Dedoc\Scramble\Support\Type\Type;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * 403 access_denied — see App\Exceptions\ApiError::forbidden().
 *
 * Typed on Symfony's AccessDeniedHttpException, not Laravel's
 * AuthorizationException, mirroring the renderer in bootstrap/app.php: a thrown
 * AuthorizationException has been rewritten to this by the time it is rendered.
 */
final class AccessDeniedResponse extends ExceptionToResponseExtension
{
    public function shouldHandle(Type $type): bool
    {
        return $type instanceof ObjectType && $type->isInstanceOf(AccessDeniedHttpException::class);
    }

    public function toResponse(Type $type)
    {
        return Response::make(403)
            ->setDescription('Access denied.')
            ->setContent('application/json', Schema::fromType(ErrorResponse::schema(['access_denied'])));
    }

    public function reference(ObjectType $type)
    {
        return new Reference('responses', Str::start($type->name, '\\'), $this->components);
    }
}
```

- [ ] **Step 5: Register them**

In `api/config/scramble.php`, replace `'extensions' => [],` with:

```php
    /*
     * Custom exception documentation. Scramble's built-ins describe Laravel's
     * default error shapes; this API replaces those with App\Exceptions\ApiError's
     * contract, so the built-ins would document responses that never occur.
     */
    'extensions' => [
        \App\Support\Scramble\ValidationExceptionResponse::class,
        \App\Support\Scramble\AuthenticationExceptionResponse::class,
        \App\Support\Scramble\AccessDeniedResponse::class,
    ],
```

- [ ] **Step 6: Run the test and watch it pass**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=OpenApiDocumentTest'
```

Expected: PASS (3 tests). If a `$ref` cannot be resolved, print the document's `components.responses` keys and adjust `resolve()` — Scramble names shared responses after the exception class.

- [ ] **Step 7: Confirm nothing else regressed**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test'
```

Expected: the whole suite passes, `ApiErrorContractTest` included.

- [ ] **Step 8: Commit**

```bash
git add api/app/Support/Scramble api/config/scramble.php api/tests/Feature/OpenApiDocumentTest.php
git commit -m "feat(api): document the real error contract in OpenAPI, not Laravel's default"
```

---

## Task 3: Prove the document matches reality

**Why:** Task 2's extensions are hand-written descriptions of a hand-written renderer. Nothing yet stops the two drifting — and if they drift, the generated client's error types become fiction, silently. This test triggers **real** error responses and validates them against the **committed** document.

**Files:**
- Modify: `api/tests/Feature/OpenApiDocumentTest.php`
- Modify: `api/composer.json` (dev dependency)

- [ ] **Step 1: Add a JSON-Schema validator**

```bash
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps --entrypoint composer deps \
  require opis/json-schema --dev --no-scripts --working-dir=/api
docker compose exec -T web php api-laravel/artisan package:discover
```

Expected: `opis/json-schema` locked and installed. It is chosen over `justinrainbow/json-schema` because OpenAPI 3.1 uses JSON Schema 2020-12, which only Opis supports.

- [ ] **Step 2: Write the failing test**

Append to `api/tests/Feature/OpenApiDocumentTest.php` (inside the class):

```php
    /**
     * The document is only useful if it is TRUE. This drives a real request into
     * a real error and validates the real body against the documented schema, so
     * the extensions in App\Support\Scramble cannot drift away from
     * App\Exceptions\ApiError without failing a build.
     */
    public function test_a_real_validation_failure_matches_its_documented_schema(): void
    {
        $response = $this->postJson('/api/contact', []);
        $response->assertStatus(400);

        $this->assertMatchesDocumentedSchema(
            $this->document['paths']['/contact']['post']['responses']['400'],
            $response->json()
        );
    }

    public function test_a_real_401_matches_its_documented_schema(): void
    {
        $response = $this->getJson('/api/user');
        $response->assertStatus(401);

        $this->assertMatchesDocumentedSchema(
            $this->document['paths']['/user']['get']['responses']['401'],
            $response->json()
        );
    }

    /**
     * @param  array<string,mixed>  $response  the documented response object
     * @param  array<string,mixed>  $body      the body the API actually returned
     */
    private function assertMatchesDocumentedSchema(array $response, array $body): void
    {
        $validator = new \Opis\JsonSchema\Validator;
        $result = $validator->validate(
            json_decode((string) json_encode($body), false, 512, JSON_THROW_ON_ERROR),
            (string) json_encode($this->resolve($response))
        );

        if (! $result->isValid()) {
            $error = $result->error();
            $this->fail(sprintf(
                "The API's real response does not match its documented schema.\n  keyword: %s\n  path: %s\n  body: %s",
                $error?->keyword() ?? 'unknown',
                implode('/', $error?->data()->path() ?? []),
                json_encode($body)
            ));
        }

        $this->assertTrue(true);
    }
```

- [ ] **Step 3: Run it**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=OpenApiDocumentTest'
```

Expected: PASS (5 tests). If validation fails, the failure message names the offending keyword and path — fix the **schema** in `ErrorResponse` to match the real body, never the other way round: `ApiError` is the authority.

- [ ] **Step 4: Commit**

```bash
git add api/composer.json api/composer.lock api/tests/Feature/OpenApiDocumentTest.php
git commit -m "test(api): validate real error responses against the documented schema"
```

---

## Task 4: Document `POST /signups`' body without touching its logic

**Why:** Scramble infers request bodies from injected `FormRequest` parameters. `SignupController::store()` takes a plain `Request` and resolves `SignupRequest` via `app()` at line ~129 — so the body is undocumented, and the generated client would take no arguments.

**Do not "fix" this by injecting the FormRequest.** The controller explains why: an injected `FormRequest` validates *before* the method body runs, which would put validation ahead of the honeypot check and "let a bot's malformed submission be told it was malformed". Injecting it is an anti-abuse regression. Document the body with attributes instead.

**Files:**
- Modify: `api/app/Http/Controllers/Api/SignupController.php`
- Modify: `api/tests/Feature/OpenApiDocumentTest.php`

- [ ] **Step 1: Write the failing test**

Add to `api/tests/Feature/OpenApiDocumentTest.php`:

```php
    /**
     * SignupController::store() resolves its FormRequest via app() instead of
     * injecting it — deliberately, so the honeypot runs before validation — which
     * makes the body invisible to Scramble's inference. Attributes document it
     * explicitly, and this test is what notices if they are removed or drift from
     * SignupRequest::rules().
     */
    public function test_the_signup_body_is_documented(): void
    {
        $body = $this->document['paths']['/signups']['post']['requestBody'] ?? null;
        $this->assertNotNull($body, 'POST /signups documents no request body.');

        $properties = $body['content']['application/json']['schema']['properties'];

        foreach (['firstName', 'lastName', 'address', 'phone', 'email', 'tableName', 'menus'] as $field) {
            $this->assertArrayHasKey($field, $properties, "The signup body is missing {$field}.");
        }
        $this->assertSame('array', $properties['menus']['type']);
    }
```

- [ ] **Step 2: Run it and watch it fail**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=test_the_signup_body_is_documented'
```

Expected: FAIL — "POST /signups documents no request body."

- [ ] **Step 3: Read the real field names**

```bash
sed -n '1,80p' api/app/Http/Requests/SignupRequest.php
```

Use exactly the keys `rules()` validates. The camelCase names above are the expected convention (`GET /events` returns `startTime`), **but the test must assert whatever `rules()` actually uses** — correct the test if they differ, and note the mismatch in the commit message.

- [ ] **Step 4: Add the attributes**

Add to `api/app/Http/Controllers/Api/SignupController.php`. Import `Dedoc\Scramble\Attributes\BodyParameter`, then annotate `store()` — leaving its body untouched:

```php
    #[BodyParameter('firstName', description: 'Guest first name.', required: true)]
    #[BodyParameter('lastName', description: 'Guest last name.', required: true)]
    #[BodyParameter('address', description: 'Postal address.', required: true)]
    #[BodyParameter('phone', description: 'Contact phone number.', required: true)]
    #[BodyParameter('email', description: 'Confirmation is mailed here.', required: true)]
    #[BodyParameter('tableName', description: 'Free-text table or group name.', required: true)]
    #[BodyParameter('menus', description: 'One menu value per guest; see /config for the allowed values.', required: true)]
    #[BodyParameter('altcha', description: 'Solved proof-of-work payload from GET /altcha.', required: true)]
    #[BodyParameter('hp', description: 'Honeypot. A real client leaves this empty.', required: false)]
    public function store(Request $request): JsonResponse
    {
```

If `BodyParameter`'s constructor signature differs, check it:

```bash
MSYS_NO_PATHCONV=1 docker compose exec -T web sh -c \
  'grep -n "public function __construct" -A 12 api-laravel/vendor/dedoc/scramble/src/Attributes/BodyParameter.php'
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=OpenApiDocumentTest'
```

Expected: PASS.

- [ ] **Step 6: Verify the anti-abuse ordering is untouched**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=SignupStoreTest'
```

Expected: PASS — including the honeypot test. If any signup test changed behavior, you edited logic; revert and re-apply attributes only.

- [ ] **Step 7: Commit**

```bash
git add api/app/Http/Controllers/Api/SignupController.php api/tests/Feature/OpenApiDocumentTest.php
git commit -m "docs(api): document the signup body with attributes, preserving honeypot-first order"
```

---

## Task 5: Keep `/api/migrate` out of the client

**Why:** `POST /api/migrate` is token-gated deploy tooling called by `tools/dbmigrate.mjs`. Documenting it ships a deploy-trigger method into the browser bundle.

**Files:**
- Modify: `api/routes/api.php`
- Modify: `api/tests/Feature/OpenApiDocumentTest.php`

- [ ] **Step 1: Write the failing test**

```php
    public function test_the_migrate_route_is_not_documented(): void
    {
        $this->assertArrayNotHasKey(
            '/migrate',
            $this->document['paths'],
            'The token-gated deploy endpoint must not reach the generated browser client.'
        );
    }
```

- [ ] **Step 2: Run it and watch it fail**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=test_the_migrate_route_is_not_documented'
```

Expected: FAIL — `/migrate` is present.

- [ ] **Step 3: Exclude the route**

In `api/routes/api.php`, above the migrate route, add the import `use Dedoc\Scramble\Attributes\ExcludeRouteFromDocs;` and wrap it:

```php
// Token-gated (not session-gated): the deploy tooling calls this server-side
// with the shared MIGRATE_TOKEN, so it must not require an authenticated user.
//
// Excluded from the OpenAPI document: the generated TypeScript client is for the
// browser, and nothing in the browser may trigger a migration.
Route::post('/migrate', MigrateController::class)
    ->middleware(ExcludeRouteFromDocs::class);
```

If `ExcludeRouteFromDocs` is an attribute rather than middleware, apply it to `MigrateController::__invoke()` instead:

```bash
MSYS_NO_PATHCONV=1 docker compose exec -T web sh -c \
  'sed -n "1,30p" api-laravel/vendor/dedoc/scramble/src/Attributes/ExcludeRouteFromDocs.php'
```

- [ ] **Step 4: Run the test and the migrate test**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=OpenApiDocumentTest'
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=MigrateTest'
```

Expected: both PASS — the route still works, it is only undocumented.

- [ ] **Step 5: Commit**

```bash
git add api/routes/api.php api/tests/Feature/OpenApiDocumentTest.php
git commit -m "chore(api): exclude the migrate route from the generated client"
```

---

## Task 6: Move `/events` writes to `/events/{id}`

**Why:** `PUT`/`DELETE /events` carry the id in the query string for one reason only — the old `planning_repet.js` sent it that way — and that file is being deleted. Scramble cannot even see `PUT`'s id today, so the generated client would omit it.

**Files:**
- Modify: `api/routes/api.php`
- Modify: `api/app/Http/Controllers/Api/EventController.php`
- Modify: `api/tests/Feature/EventWriteTest.php`

- [ ] **Step 1: Read what exists**

```bash
grep -n "update\|destroy\|query\|input('id')" api/app/Http/Controllers/Api/EventController.php
grep -n "put\|delete\|id=" api/tests/Feature/EventWriteTest.php | head -20
```

- [ ] **Step 2: Update the tests first**

In `api/tests/Feature/EventWriteTest.php`, change every write call from the query-string form to the path form, e.g.:

```php
// before: $this->putJson('/api/events?id='.$event->id, $payload)
$this->putJson('/api/events/'.$event->id, $payload)
// before: $this->deleteJson('/api/events?id='.$event->id)
$this->deleteJson('/api/events/'.$event->id)
```

Add one test pinning that a missing id is now a routing 404 rather than a 400:

```php
    /**
     * The id moved from the query string into the path, so an absent id is no
     * longer a validation error the controller reports — it simply matches no
     * route. Pinned because it is a deliberate contract change.
     */
    public function test_a_write_without_an_id_is_now_a_404(): void
    {
        $this->actingAs($this->admin())
            ->deleteJson('/api/events')
            ->assertStatus(404);
    }
```

Use whatever helper the file already uses to authenticate an admin (read the top of the file; do not invent `admin()` if it is named otherwise).

- [ ] **Step 3: Run the tests and watch them fail**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=EventWriteTest'
```

Expected: FAIL — the new paths match no route (404 where a 200 is expected).

- [ ] **Step 4: Change the routes**

In `api/routes/api.php`, inside the `manage_events` group, replace the two write routes and correct the comments that explain the old shape:

```php
    Route::post('/events', [EventController::class, 'store']);
    // The id is a PATH parameter. It used to live in the query string purely
    // because the old planning_repet.js sent it there; that front end is gone,
    // so the endpoints are plain REST and the generated client gets a normal
    // path parameter instead of an invisible one.
    Route::put('/events/{id}', [EventController::class, 'update']);
    Route::delete('/events/{id}', [EventController::class, 'destroy']);
```

- [ ] **Step 5: Change the controller**

In `EventController`, take the id as an argument instead of reading the query string, keeping every other line — validation, authorization and the response shape — as it is:

```php
    public function update(EventRequest $request, int $id): JsonResponse
    public function destroy(int $id): JsonResponse
```

Delete the now-dead "id came from the query string" branches, including their 400-on-missing-id handling: routing guarantees an id is present.

- [ ] **Step 6: Run the tests**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=EventWriteTest'
docker compose exec -T web sh -c 'cd api-laravel && php artisan test'
```

Expected: both PASS. `GET /events` and `/responses` are untouched — in particular `/responses` still names no user, which is what keeps a previously fixed IDOR closed.

- [ ] **Step 7: Verify the document now shows a path parameter**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan scramble:export --path=/tmp/spec.json'
MSYS_NO_PATHCONV=1 docker compose exec -T web sh -c 'grep -o "/events/{id}" /tmp/spec.json | head -2'
```

Expected: `/events/{id}` appears.

- [ ] **Step 8: Commit**

```bash
git add api/routes/api.php api/app/Http/Controllers/Api/EventController.php api/tests/Feature/EventWriteTest.php
git commit -m "refactor(api)!: move event writes to /events/{id}"
```

---

## Task 7: `Occasion` gains `MENU_INFO`

**Why:** The signup form shows a description and price per menu. That data lives only in the old app's `SignupRepository::MENU_INFO`, which was deliberately not copied to Laravel ("only ever read by the old pages' form markup"). The SPA has no PHP to render it, so it must come from the API.

**Files:**
- Modify: `api/app/Support/Occasion.php`
- Modify: `api/tests/Feature/OccasionDriftTest.php`

- [ ] **Step 1: Confirm the source of truth is unchanged**

```bash
grep -n -A 14 "MENU_INFO" app/src/Repositories/SignupRepository.php
```

Expected: the three entries reproduced in Step 4 below. Copy them **exactly** — descriptions and prices are placeholders awaiting real values, and a divergence would advertise different prices on different pages.

- [ ] **Step 2: Write the failing test**

In `api/tests/Feature/OccasionDriftTest.php`, add to the existing drift assertions:

```php
        $this->assertSame(
            SignupRepository::MENU_INFO,
            Occasion::MENU_INFO,
            'MENU_INFO drifted between SignupRepository and Occasion.'
        );
```

- [ ] **Step 3: Run it and watch it fail**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=OccasionDriftTest'
```

Expected: FAIL — `Occasion::MENU_INFO` is undefined.

- [ ] **Step 4: Add the constant**

In `api/app/Support/Occasion.php`, below `MENU_LABELS`, add the constant with the values read in Step 1 and a comment recording why it is here now:

```php
    /**
     * Per-menu description and price, keyed by menu value.
     *
     * Previously excluded from this class because only the old pages' form
     * markup read it. The SPA has no server-rendered markup, so /api/config
     * ships it and this is now the single source of truth — SignupRepository's
     * copy dies with the old app.
     */
    public const MENU_INFO = [
        'meat' => [
            'description' => 'Rôti de bœuf, sauce aux morilles, gratin dauphinois '
                .'et légumes de saison.',
            'price' => 'CHF 45.–',
        ],
        'child' => [
            'description' => 'Émincé de poulet, frites maison et compote.',
            'price' => 'CHF 20.–',
        ],
        'vegetarian' => [
            'description' => 'Risotto aux champignons et légumes rôtis de saison.',
            'price' => 'CHF 40.–',
        ],
    ];
```

Note `price` is a **pre-formatted display string** (`'CHF 45.–'`), not a number. Keep it that way: it is French display copy like the description beside it, the client only renders it, and converting it to a number would move currency formatting into the SPA for no gain.

- [ ] **Step 5: Run the tests**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=Occasion'
```

Expected: PASS — `OccasionDriftTest` and `OccasionTest` both.

- [ ] **Step 6: Commit**

```bash
git add api/app/Support/Occasion.php api/tests/Feature/OccasionDriftTest.php
git commit -m "feat(api): move per-menu description and price into Occasion"
```

---

## Task 8: `GET /api/config`

**Why:** A static SPA cannot read `config.php`. The env ribbon, the `souper_signup` gate and all occasion copy were server-rendered; they now arrive here. It must be public (the ribbon and the signup form are visible to anonymous visitors) and it must never leak a secret.

**Files:**
- Create: `api/app/Http/Controllers/Api/ConfigController.php`
- Create: `api/tests/Feature/ConfigEndpointTest.php`
- Modify: `api/routes/api.php`

- [ ] **Step 1: Write the failing tests**

Create `api/tests/Feature/ConfigEndpointTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Support\Occasion;
use Tests\TestCase;

/**
 * The SPA's only source of server configuration.
 *
 * Replaces what the old app rendered server-side from config.php: the env ribbon
 * (App\Env), the souper_signup gate (App\Features) and the occasion copy. Public
 * on purpose — an anonymous visitor sees both the ribbon and the signup form.
 */
class ConfigEndpointTest extends TestCase
{
    public function test_it_is_public(): void
    {
        $this->getJson('/api/config')->assertStatus(200);
    }

    public function test_it_reports_the_environment(): void
    {
        config(['app.env' => 'test']);

        $this->getJson('/api/config')->assertJsonPath('env', 'test');
    }

    /**
     * Mirrors App\Env exactly: anything that is not a known non-prod environment
     * collapses to prod, so a stale or misspelled APP_ENV can never paint a
     * staging ribbon on the live site.
     */
    public function test_an_unknown_environment_collapses_to_prod(): void
    {
        config(['app.env' => 'staging-2']);

        $this->getJson('/api/config')->assertJsonPath('env', 'prod');
    }

    public function test_the_occasion_is_absent_when_the_feature_is_off(): void
    {
        config(['app.souper_signup_enabled' => false]);

        $this->getJson('/api/config')
            ->assertJsonPath('features.souper_signup', false)
            ->assertJsonPath('occasion', null);
    }

    public function test_the_occasion_is_served_when_the_feature_is_on(): void
    {
        config(['app.souper_signup_enabled' => true]);

        $response = $this->getJson('/api/config');

        $response->assertJsonPath('occasion.title', Occasion::active()['title']);
        $response->assertJsonPath('occasion.maxGuests', Occasion::MAX_GUESTS);
        $response->assertJsonPath('occasion.menus.0.value', Occasion::MENU_VALUES[0]);
        $response->assertJsonPath('occasion.menus.0.label', Occasion::MENU_LABELS[Occasion::MENU_VALUES[0]]);
    }

    /**
     * LEAK GUARD. This endpoint is public and unauthenticated, so it is the one
     * place where a careless config() spread would publish database or mail
     * credentials to the internet. The assertion is an allowlist, not a
     * blocklist: any new top-level key fails until it is added deliberately.
     */
    public function test_it_exposes_only_allowlisted_keys(): void
    {
        config(['app.souper_signup_enabled' => true]);

        $body = $this->getJson('/api/config')->json();

        $this->assertSame(['env', 'features', 'occasion'], array_keys($body));
        $this->assertSame(['souper_signup'], array_keys($body['features']));

        $serialised = (string) json_encode($body);
        foreach (['password', 'secret', 'token', 'DB_', 'MAIL_', 'hmac'] as $needle) {
            $this->assertStringNotContainsStringIgnoringCase(
                $needle,
                $serialised,
                "The public config response looks like it leaked a credential ({$needle})."
            );
        }
    }

    /**
     * A stale flag or ribbon would survive a server-side change, so this must
     * never be cached — the old app re-read config.php on every request.
     */
    public function test_it_is_not_cacheable(): void
    {
        $this->getJson('/api/config')->assertHeader('Cache-Control', 'no-store');
    }
}
```

- [ ] **Step 2: Run them and watch them fail**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=ConfigEndpointTest'
```

Expected: FAIL — 404, no such route.

- [ ] **Step 3: Write the controller**

Create `api/app/Http/Controllers/Api/ConfigController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Support\Occasion;
use Illuminate\Http\JsonResponse;

/**
 * Runtime configuration for the SPA.
 *
 * WHY THIS EXISTS. The front end is a static bundle promoted unchanged from TEST
 * to QA to PROD, so nothing environment-specific may be compiled into it —
 * baking values in at build time would mean one build per environment and would
 * break tag-based promotion. Everything the old app rendered from config.php
 * therefore arrives here at runtime.
 *
 * PUBLIC AND UNAUTHENTICATED, so every value below is an explicit, reviewed
 * choice. Never return config() wholesale: this response is world-readable and
 * the same config carries database, mail and Altcha secrets.
 */
final class ConfigController
{
    /** Non-prod environments, mirroring the old App\Env::RIBBONS. */
    private const NON_PROD = ['dev', 'test', 'qa'];

    public function __invoke(): JsonResponse
    {
        // config('app.souper_signup_enabled'), NOT a features.* key: the flag
        // lives in api/config/app.php, fed by SOUPER_SIGNUP_ENABLED, and
        // App\Http\Middleware\EnsureSouperSignupEnabled reads that same key.
        // The RESPONSE key stays features.souper_signup — the client-facing
        // name, matching the old app's $config['features']['souper_signup'].
        $enabled = (bool) config('app.souper_signup_enabled');

        return response()->json([
            'env' => $this->env(),
            'features' => [
                'souper_signup' => $enabled,
            ],
            // Null when the feature is off, so a server with the feature
            // disabled publishes no copy about an unannounced event — matching
            // the old app, where those routes did not exist at all.
            'occasion' => $enabled ? $this->occasion() : null,
        ])->header('Cache-Control', 'no-store');
    }

    /**
     * Anything that is not a known non-prod environment collapses to 'prod',
     * copying App\Env's fail-safe: a missing or misspelled APP_ENV must never
     * paint a staging ribbon on the live site.
     */
    private function env(): string
    {
        $env = strtolower(trim((string) config('app.env')));

        return in_array($env, self::NON_PROD, true) ? $env : 'prod';
    }

    /**
     * The active occasion, flattened for the client: menus become a list of
     * {value, label, description, price} rather than four parallel maps, so the
     * form can render them in one pass.
     *
     * `price` is a pre-formatted French display string ('CHF 45.–'), not a
     * number — currency formatting stays server-side, beside the description it
     * belongs with.
     *
     * @return array<string,mixed>
     */
    private function occasion(): array
    {
        $occasion = Occasion::active();

        return [
            'title' => $occasion['title'],
            'subtitle' => $occasion['subtitle'],
            'date' => $occasion['date'],
            'dateDisplay' => $occasion['date_display'],
            'teaser' => $occasion['teaser'],
            'invitation' => $occasion['invitation'],
            'maxGuests' => Occasion::MAX_GUESTS,
            'menus' => array_map(
                static fn (string $value): array => [
                    'value' => $value,
                    'label' => Occasion::MENU_LABELS[$value],
                    'description' => Occasion::MENU_INFO[$value]['description'] ?? '',
                    'price' => Occasion::MENU_INFO[$value]['price'] ?? '',
                ],
                Occasion::MENU_VALUES
            ),
        ];
    }
}
```

If `MENU_INFO`'s inner keys are not `description`/`price`, use the real ones from Task 7 Step 1 and update the test accordingly.

- [ ] **Step 4: Register the route**

In `api/routes/api.php`, add the import and the route near the top, beside the other public routes:

```php
// Public: the SPA fetches this before its first render, alongside GET /user, to
// learn the environment (ribbon), the feature flags and the occasion copy. It
// carries no secrets — see ConfigController and its leak-guard test.
Route::get('/config', ConfigController::class);
```

- [ ] **Step 5: Run the tests**

```bash
docker compose exec -T web sh -c 'cd api-laravel && php artisan test --filter=ConfigEndpointTest'
```

Expected: PASS (8 tests). The controller sets `Cache-Control: no-store` explicitly, so that assertion should match exactly; if Laravel has appended to the header, assert with `assertHeader` on the value it really sends — but the response must remain uncacheable, never merely revalidated.

- [ ] **Step 6: Check it by hand**

```bash
curl -s http://localhost:8090/api/config | head -c 400; echo
```

Expected: JSON with `env`, `features`, `occasion` — and no credentials.

- [ ] **Step 7: Commit**

```bash
git add api/app/Http/Controllers/Api/ConfigController.php api/routes/api.php api/tests/Feature/ConfigEndpointTest.php
git commit -m "feat(api): add public GET /config for the SPA's runtime configuration"
```

---

## Task 9: Export the document into the repo

**Why:** `orval` reads a file, CI diffs a file, and reviewers read a diff. The document must be committed and regenerable by one command that works with Docker (locally) and without it (CI, web sessions).

**Files:**
- Create: `tools/openapi.mjs`
- Create: `api/openapi.json`
- Modify: `package.json`

- [ ] **Step 1: Write the exporter**

Create `tools/openapi.mjs`, following `tools/pint.mjs`'s established shape:

```js
// Exports the Laravel API's OpenAPI document to api/openapi.json, which is
// committed and consumed by orval (see orval.config.ts).
//
// Runs through runInPhp(), so it uses the php:8.4-cli container when a Docker
// daemon is reachable and the locally-installed php when it is not (Claude Code
// web sessions) — the same mechanism as tools/pint.mjs. It never talks to the
// compose stack, so it also works with the stack down.
//
// APP_KEY is a fixed dummy: exporting is static analysis over routes and
// controllers, it touches neither the database nor the encrypter, and a real key
// must never be needed to regenerate a checked-in artifact. APP_URL is likewise
// irrelevant — config/scramble.php pins an absolute server URL precisely so this
// export is byte-identical on every machine (see the CI drift check).
//
// Usage: node tools/openapi.mjs
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { runInPhp } from './php-in-docker.mjs';

if (!existsSync('api/vendor/dedoc/scramble')) {
  console.log('openapi: api/vendor missing — installing the Laravel API dev dependencies once...');
  const install = ['install', '--working-dir=api', '--no-interaction', '--no-progress', '--no-scripts'];
  execFileSync(process.execPath, ['tools/composer.mjs', ...install], { stdio: 'inherit' });
}

const env = 'APP_KEY=base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= APP_ENV=production';

try {
  runInPhp(`cd api && ${env} php artisan package:discover --no-ansi && ${env} php artisan scramble:export`);
} catch {
  process.exit(1);
}

console.log('openapi: wrote api/openapi.json');
```

- [ ] **Step 2: Add the script**

In `package.json`, add to `scripts`:

```json
    "openapi": "node tools/openapi.mjs",
```

- [ ] **Step 3: Run it**

```bash
npm run openapi && node -e "const s=require('./api/openapi.json');console.log(s.openapi, Object.keys(s.paths).length, 'paths')"
```

Expected: `3.1.0 14 paths` (13 if `/migrate` is excluded and counted per path). If `artisan` fails on a missing `.env`, add the missing variable to the `env` string — never by requiring a real `api/.env`, which does not exist on the host.

- [ ] **Step 4: Prove it is deterministic**

```bash
npm run openapi && cp api/openapi.json /tmp/first.json && npm run openapi && diff /tmp/first.json api/openapi.json && echo DETERMINISTIC
```

Expected: `DETERMINISTIC`. If it differs, something environment-derived is still in the document (check `servers` and `info.version`) — fix it now, or Task 11's drift check will fail on every CI run.

- [ ] **Step 5: Commit**

```bash
git add tools/openapi.mjs package.json api/openapi.json
git commit -m "build(api): export the OpenAPI document to api/openapi.json"
```

---

## Task 10: Generate the client and hand-write the mutator

**Why:** The generated hooks must not each remember this API's three peculiarities. `orval`'s custom mutator is the single place they live: `credentials: 'include'` (Sanctum cookie auth), a `GET /sanctum/csrf-cookie` priming call before the first mutating request (without it Sanctum answers 419), and normalizing `{error, code, fields}` into a typed `ApiError`.

This task adds only the TypeScript toolchain — no React, no Tailwind, no router. Those come in plan 2.

**Files:**
- Create: `tsconfig.json`, `orval.config.ts`, `web/src/api/http.ts`, `web/src/api/http.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install the toolchain**

```bash
npm install --save-dev typescript orval vitest @tanstack/react-query
```

`@tanstack/react-query` is a real dependency of the generated hooks, but stays a devDependency like every other bundled package in this repo (Vite inlines it; nothing installs from `package.json` at runtime).

- [ ] **Step 2: Add `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "skipLibCheck": true
  },
  "include": ["web/src", "orval.config.ts"]
}
```

- [ ] **Step 3: Write the mutator's tests first**

Create `web/src/api/http.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, customFetch, resetCsrfPriming } from './http';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.restoreAllMocks();
  resetCsrfPriming();
});

describe('customFetch', () => {
  it('sends cookies, because Sanctum authenticates by session cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await customFetch({ url: '/config', method: 'GET' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
  });

  it('prefixes the API base, so callers pass spec-relative paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await customFetch({ url: '/config', method: 'GET' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/config');
  });

  it('primes the CSRF cookie before the first mutating request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await customFetch({ url: '/login', method: 'POST', data: { username: 'a', password: 'b' } });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/sanctum/csrf-cookie');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/login');
  });

  it('primes only once across several mutations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await customFetch({ url: '/login', method: 'POST', data: {} });
    await customFetch({ url: '/responses', method: 'POST', data: {} });

    const primingCalls = fetchMock.mock.calls.filter((c) => c[0] === '/sanctum/csrf-cookie');
    expect(primingCalls).toHaveLength(1);
  });

  it('does not prime for reads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await customFetch({ url: '/events', method: 'GET' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a typed ApiError carrying code and fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: 'Invalid form submission',
            code: 'validation_failed',
            fields: [{ field: 'email', reason: 'required' }],
          },
          400,
        ),
      ),
    );

    const error = await customFetch({ url: '/contact', method: 'POST', data: {} }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('validation_failed');
    expect(error.fields).toEqual([{ field: 'email', reason: 'required' }]);
  });

  it('still throws an ApiError when the body is not the contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 })));

    const error = await customFetch({ url: '/events', method: 'GET' }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.code).toBe('unknown_error');
  });
});
```

- [ ] **Step 4: Run them and watch them fail**

```bash
npx vitest run web/src/api/http.test.ts
```

Expected: FAIL — cannot resolve `./http`.

- [ ] **Step 5: Write the mutator**

Create `web/src/api/http.ts`:

```ts
/**
 * The one place this project's API peculiarities live.
 *
 * orval generates every endpoint and TanStack Query hook, and routes them all
 * through customFetch below, so no generated file is ever hand-edited and no
 * call site has to remember any of the following:
 *
 *  - Sanctum authenticates by SESSION COOKIE, so every request needs
 *    credentials: 'include'.
 *  - Sanctum rejects a mutating request with 419 unless the XSRF cookie has been
 *    seeded by GET /sanctum/csrf-cookie first. That path is NOT under /api.
 *  - Errors use this API's own contract, {error, code, fields[]}, not Laravel's
 *    {message, errors}. `code` and `fields[].reason` are stable machine tokens
 *    the display layer translates into French; they are never shown raw.
 */

/** Spec paths are relative to /api; the SPA is served from the same origin. */
const API_BASE = '/api';
const CSRF_COOKIE_PATH = '/sanctum/csrf-cookie';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type ApiErrorField = {
  field: string;
  reason: string;
  params?: Record<string, unknown>;
};

/**
 * Thrown for every non-2xx response, so callers (and TanStack Query's error
 * state) always receive one type. `code` falls back to 'unknown_error' when the
 * body is not the contract at all — an HTML 502 from the host, say — because the
 * display layer must always have a token to translate.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: ApiErrorField[];

  constructor(status: number, code: string, message: string, fields: ApiErrorField[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

let csrfPrimed = false;

/** Test seam: lets a test start from an unprimed state. */
export function resetCsrfPriming(): void {
  csrfPrimed = false;
}

async function primeCsrf(): Promise<void> {
  if (csrfPrimed) return;
  await fetch(CSRF_COOKIE_PATH, { method: 'GET', credentials: 'include' });
  csrfPrimed = true;
}

export type RequestConfig = {
  url: string;
  method: string;
  params?: Record<string, unknown>;
  data?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export async function customFetch<T>(config: RequestConfig): Promise<T> {
  const method = config.method.toUpperCase();

  if (MUTATING.has(method)) {
    await primeCsrf();
  }

  const query = config.params
    ? Object.entries(config.params)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&')
    : '';

  const response = await fetch(`${API_BASE}${config.url}${query ? `?${query}` : ''}`, {
    method,
    credentials: 'include',
    signal: config.signal,
    headers: {
      Accept: 'application/json',
      ...(config.data !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...config.headers,
    },
    ...(config.data !== undefined ? { body: JSON.stringify(config.data) } : {}),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiError(response.status, 'unknown_error', `HTTP ${response.status}`);
  }

  const contract = body as { error?: string; code?: string; fields?: ApiErrorField[] };
  if (typeof contract?.code !== 'string') {
    return new ApiError(response.status, 'unknown_error', `HTTP ${response.status}`);
  }

  return new ApiError(
    response.status,
    contract.code,
    contract.error ?? `HTTP ${response.status}`,
    contract.fields ?? [],
  );
}
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
npx vitest run web/src/api/http.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 7: Configure orval**

Create `orval.config.ts`:

```ts
import { defineConfig } from 'orval';

/**
 * Generates the API client and TanStack Query hooks from the committed OpenAPI
 * document. Everything under web/src/api/generated/ is GENERATED — never edit it
 * by hand; change the Laravel controller, run `npm run openapi && npm run
 * generate:api`, and commit the result. CI enforces this (see ci.yml).
 *
 * Every request goes through the mutator in web/src/api/http.ts, which owns the
 * cookie credentials, the Sanctum CSRF priming and the {error, code, fields}
 * error contract.
 */
export default defineConfig({
  canetons: {
    input: 'api/openapi.json',
    output: {
      target: 'web/src/api/generated/endpoints.ts',
      schemas: 'web/src/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      prettier: true,
      override: {
        mutator: {
          path: 'web/src/api/http.ts',
          name: 'customFetch',
        },
      },
    },
  },
});
```

- [ ] **Step 8: Generate, and verify it type-checks**

```bash
npx orval --config orval.config.ts && npx tsc --noEmit
```

Expected: files appear under `web/src/api/generated/` and `tsc` reports no errors.

**If orval's option names have changed**, read its current schema rather than guessing:

```bash
npx orval --help
node -e "console.log(require('orval/package.json').version)"
```

The requirements are fixed even if the keys move: react-query hooks, a fetch client, and every call routed through `customFetch`. If `httpClient: 'fetch'` is unsupported in the installed version, use the axios-free equivalent it does support, since the mutator itself performs the request.

- [ ] **Step 9: Add the scripts**

In `package.json`:

```json
    "generate:api": "orval --config orval.config.ts",
    "test:web": "vitest run",
    "typecheck": "tsc --noEmit",
```

- [ ] **Step 10: Sanity-check a generated hook**

```bash
grep -rn "customFetch" web/src/api/generated/endpoints.ts | head -3
grep -rn "events/\${id}\|events/{id}" web/src/api/generated/endpoints.ts | head -3
```

Expected: the endpoints call `customFetch`, and the event write functions take an `id` path parameter.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json orval.config.ts web/src/api
git commit -m "feat(web): generate a typed API client with a CSRF-aware mutator"
```

---

## Task 11: Fail CI when the client drifts from the API

**Why:** The generated client is only trustworthy if it cannot lag behind the controllers. A change to a response shape must fail the build until the document and client are regenerated.

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Read the existing Laravel API job**

```bash
grep -n -A 30 "The Laravel API at api/ has its own PHPUnit suite" .github/workflows/ci.yml
```

Reuse its PHP setup and Composer install steps — do not invent a new pattern.

- [ ] **Step 2: Add the job**

Add to `.github/workflows/ci.yml`, modelled on the job you just read:

```yaml
  # The generated client must never lag behind the API. Regenerating and diffing
  # is the only check that catches a changed response shape: types that describe
  # a response the API no longer sends fail nothing at runtime until a member
  # sees a broken page.
  openapi-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.4'
          coverage: none
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - name: Install Node dependencies
        run: npm ci
      - name: Install API dependencies
        run: composer install --working-dir=api --no-interaction --no-progress --no-scripts
      - name: Regenerate the OpenAPI document and the client
        run: |
          npm run openapi
          npm run generate:api
      - name: Fail if either is out of date
        run: |
          if ! git diff --exit-code -- api/openapi.json web/src/api/generated; then
            echo "::error::api/openapi.json or the generated client is stale. Run 'npm run openapi && npm run generate:api' and commit the result."
            exit 1
          fi
      - name: Type-check
        run: npm run typecheck
      - name: Frontend unit tests
        run: npm run test:web
```

- [ ] **Step 3: Verify the same commands pass locally from a clean tree**

```bash
git status --short && npm run openapi && npm run generate:api && git diff --exit-code -- api/openapi.json web/src/api/generated && echo NO_DRIFT
```

Expected: `NO_DRIFT`. A diff here means Task 9 Step 4's determinism check was passed prematurely.

- [ ] **Step 4: Run the full local check**

```bash
npm run typecheck && npm run test:web && docker compose exec -T web sh -c 'cd api-laravel && php artisan test'
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: fail when the generated API client drifts from the API"
```

---

## Done when

- `GET /api/config` serves env, feature flags and occasion copy, is public, is uncacheable, and its leak-guard test passes.
- Event writes are `PUT`/`DELETE /api/events/{id}`, with the query-string form gone.
- `Occasion::MENU_INFO` exists and is pinned against `SignupRepository` until the old app dies.
- `api/openapi.json` is committed, deterministic, documents this API's **real** error contract at the right statuses, includes the signup body, and excludes `/migrate`.
- A test validates real error responses against that document.
- `web/src/api/generated/` compiles, routes every call through the tested mutator, and CI fails if either artifact goes stale.
- The old site still works: `app/` is untouched by this plan.

## Not in this plan

React, Tailwind, the router, the app shell, any page, the `.htaccess` cutover, deleting `app/`, and the local-stack rework — those are plans 2 to 5. The i18n token-parity test keeps reading `app/assets/js/i18n.js` until plan 2 moves that file; `ApiErrorVocabularyTest::I18N_PATHS` is repointed there, not here.
