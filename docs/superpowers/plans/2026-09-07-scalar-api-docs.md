# Scalar API docs at `/api/docs` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An interactive Scalar API reference at `/api/docs` on local dev and
TEST, reading the committed OpenAPI document, with try-it that calls the
environment you are looking at.

**Architecture:** Two Laravel routes under `/api/`, so the existing `.htaccess`
dispatch already claims them and no rewrite rule changes. `GET /api/docs.json`
serves the committed `openapi.json` with its `servers` list rewritten to a
relative `/api`; `GET /api/docs` serves a Blade page that loads Scalar from a
CDN. Scramble stays a dev dependency and is not involved at runtime.

**Tech Stack:** Laravel 13, Blade, `@scalar/api-reference` from jsDelivr,
PHPUnit for the API tests.

**Spec:** `docs/superpowers/specs/2026-09-07-scalar-api-docs-design.md`

---

## Read before starting

The spec, and then `api/vendor/dedoc/scramble/resources/views/scalar.blade.php`
— that view is the known-good markup for the pinned CDN and this plan's page is
modelled on it. Read it before writing Task 3, and note the two things it does
that matter (CSRF replay, `credentials: 'include'`) and the one it does that
must **not** be copied (`proxyUrl`).

## What is already true, verified 2026-09-07

- **Scramble already ships a Scalar renderer**, fully configured in
  `api/config/scramble.php` under `renderers.scalar`. This plan does not use it
  at runtime — Scramble is a dev dependency — but its view is the reference.
- **The Scramble docs UI is unreachable in this project and always has been.**
  It registers `GET /docs/api`, which is not under `/api/`, so the `.htaccess`
  SPA catch-all rewrites it to the shell. At `:8090` it renders the SPA's 404
  view; `:5173` proxies only `/api` and `/sanctum`.
- **`api/openapi.json` ships in the artifact** — it is not in
  `LARAVEL_BUILD_EXCLUDES` — so the document is already on TEST today, unread.
- **The committed document declares exactly one server:**
  `https://lescanetons.org/api`. This is the crux of Task 2.
- **Adding an `exclude` to Scramble's `api_path` does not change the exported
  document.** Measured: switching `'api_path' => 'api'` to the array form with
  `exclude` and re-running `npm run openapi` produced a **byte-identical**
  file — paths stay stripped (`/login /logout /me /config /contact`) and
  `servers` is untouched. That was the one risk in Task 5 and it is settled.

## Global Constraints

- **Every new error path must stay inside the `{error, code, fields[]}`
  contract**, or `web/src/i18n/`'s `translateApiError()` has nothing to
  translate. These routes answer 404 via `abort(404)`, which
  `App\Exceptions\ApiError::invalidSession()` does *not* claim — so the 404
  renders through Laravel's default JSON, which is acceptable for a route whose
  absence is the message. Do not add a French token for it.
- **No new production Composer dependency.**
- **Do not deploy.** Enabling this on TEST happens in the other plan's cutover
  runbook (Task 8 there), in the same hand-edit of `_api/.env`.

## Sequencing with the other plan

Independent: this plan's controller reads `base_path('openapi.json')`, which
Laravel resolves, so it is unaffected by the `_api/` rename. Either can land
first.

**But do the rename plan first if you can**, for a human reason: both plans
need a hand-edit of TEST's `.env` (a move there, a new key here), and the
config-shape pre-flight compares the whole key set — so one edit is cheaper
than two.

**If this plan lands first**, note that Task 6 adds `API_DOCS_ENABLED` to
`api/.env.example`, and from that moment the deploy CLI **refuses** any server
whose `.env` lacks the key. That is the intended behaviour, and it means TEST
cannot take another deploy until its `.env` gains it.

---

## File structure

**Created**

```
api/config/docs.php                                   the enabled flag
api/app/Http/Middleware/EnsureDocsEnabled.php         404 when off
api/app/Http/Controllers/Api/DocsController.php       renders the page
api/app/Http/Controllers/Api/DocsDocumentController.php  reads + rewrites servers
api/resources/views/docs.blade.php                    the Scalar page
api/tests/Feature/DocsTest.php
```

**Modified**

```
api/routes/api.php              two routes behind the middleware
api/bootstrap/app.php           the middleware alias
api/config/scramble.php         exclude the docs routes from the export
api/.env.example                API_DOCS_ENABLED
docker/api/env.docker           API_DOCS_ENABLED=true
```

`resources/views/` travels in the artifact — only compiled views under
`storage/framework/views/` are excluded by `tools/build.mjs` — so the Blade
file reaches a server like any other source file.

---

## Task 1: The flag, and a route that is invisible when it is off

**Why the gate comes first.** Everything after it is a page that exposes the
whole API surface. Building the page first and the gate second means a window
in which `npm run dev` serves it unconditionally, and a habit of testing it
that way.

**404, not 403** (spec B5). A 403 confirms the feature exists on that host; a
404 says nothing. Fail closed: the config default is `false`, so a server that
never sets the key gets no docs.

**Files:**
- Create: `api/config/docs.php`, `api/app/Http/Middleware/EnsureDocsEnabled.php`
- Create: `api/tests/Feature/DocsTest.php`
- Modify: `api/routes/api.php`, `api/bootstrap/app.php`

- [x] **Step 1: Write the failing test**

Create `api/tests/Feature/DocsTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The API reference, served to a developer rather than to the SPA.
 *
 * Every test here sets config('docs.enabled') explicitly. phpunit.xml does not
 * pin API_DOCS_ENABLED, so leaving it ambient would make these tests read
 * whatever docker/api/env.docker happens to say — the exact trap that shipped
 * two red SessionLifetimeTest cases on this branch (see the R1b plan's
 * "Running the tests").
 */
class DocsTest extends TestCase
{
    use RefreshDatabase;

    public function test_both_routes_are_invisible_when_the_flag_is_off(): void
    {
        // 404, not 403: a 403 confirms the feature exists on this host.
        config(['docs.enabled' => false]);

        $this->get('/api/docs')->assertNotFound();
        $this->getJson('/api/docs.json')->assertNotFound();
    }

    public function test_the_flag_defaults_to_off(): void
    {
        // The property that matters on a server: a PROD .env that sets the key
        // to nothing, or a host provisioned before the key existed, must not
        // serve an interactive console over the whole API surface.
        //
        // Read from the config FILE with the variable absent, not from
        // config('docs.enabled') — phpunit.xml or the container may have set
        // it, and this asserts the default rather than the ambient value. Same
        // technique as SessionLifetimeTest's secure-cookie default test.
        $variable = 'API_DOCS_ENABLED';
        $fromEnv = array_key_exists($variable, $_ENV) ? $_ENV[$variable] : null;
        $fromServer = array_key_exists($variable, $_SERVER) ? $_SERVER[$variable] : null;
        $fromProcess = getenv($variable);

        unset($_ENV[$variable], $_SERVER[$variable]);
        putenv($variable);

        try {
            $config = require config_path('docs.php');
            $this->assertFalse($config['enabled']);
        } finally {
            if ($fromEnv !== null) {
                $_ENV[$variable] = $fromEnv;
            }
            if ($fromServer !== null) {
                $_SERVER[$variable] = $fromServer;
            }
            if ($fromProcess !== false) {
                putenv("{$variable}={$fromProcess}");
            }
        }
    }

    public function test_the_routes_answer_when_the_flag_is_on(): void
    {
        config(['docs.enabled' => true]);

        $this->get('/api/docs')->assertOk();
        $this->getJson('/api/docs.json')->assertOk();
    }

    public function test_the_docs_need_no_login(): void
    {
        // Deliberate. TEST and QA are behind HTTP Basic Auth, PROD has the flag
        // off, and requiring a session would mean you cannot read the login
        // endpoint's own documentation until you have logged in.
        config(['docs.enabled' => true]);

        $this->assertGuest();
        $this->get('/api/docs')->assertOk();
    }
}
```

- [x] **Step 2: Run it to verify it fails**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=DocsTest
```

(Use `-w /var/www/html/api-laravel` if the rename plan has not landed yet. In
Git Bash prefix with `MSYS_NO_PATHCONV=1`.)

Expected: FAIL — 404 on every route because they do not exist, so
`test_both_routes_are_invisible_when_the_flag_is_off` passes for the wrong
reason while the other three fail. Read the output rather than the summary.

- [x] **Step 3: Write the config**

Create `api/config/docs.php`:

```php
<?php

/**
 * The API reference at /api/docs.
 *
 * DEFAULTS TO FALSE, and that default is the security control. An interactive
 * console over the whole API surface belongs on a developer's machine and on
 * the Basic-Auth'd staging environments, not on the public site — and a server
 * provisioned before this key existed, or one whose .env sets it to nothing,
 * must land on "off" rather than "on".
 *
 * filter_var, not a bare env() read: a dotenv value is a STRING, so "false"
 * would be truthy. The same reason config/session.php wraps
 * SESSION_SECURE_COOKIE.
 *
 * Read through config() at the point of use, never env(), so `config:cache` on
 * a server cannot leave a stale value behind.
 */
return [
    'enabled' => filter_var(env('API_DOCS_ENABLED', false), FILTER_VALIDATE_BOOLEAN),
];
```

- [x] **Step 4: Write the middleware**

Create `api/app/Http/Middleware/EnsureDocsEnabled.php`:

```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Hides the API reference unless this environment enables it.
 *
 * 404, NOT 403. A 403 tells an anonymous caller that the feature exists on
 * this host and is merely switched off, which is an invitation; a 404 says
 * nothing at all. The route is not "forbidden", it is not there.
 *
 * abort(404) raises a bare HttpException, which App\Exceptions\ApiError
 * deliberately does not claim — so this renders through Laravel's default JSON
 * rather than the {error, code, fields[]} contract. That is fine and
 * deliberate: nothing in the SPA calls these routes, so no French copy is owed
 * for a token no display layer will ever see.
 */
class EnsureDocsEnabled
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(config('docs.enabled', false), 404);

        return $next($request);
    }
}
```

- [x] **Step 5: Alias it**

In `api/bootstrap/app.php`, extend the existing alias array:

```php
        $middleware->alias([
            'permission' => RequirePermission::class,
            'docs' => EnsureDocsEnabled::class,
        ]);
```

and add `use App\Http\Middleware\EnsureDocsEnabled;`.

> If the R1b plan has landed, that array also holds `'no-store'`. Add to it;
> do not replace it.

- [x] **Step 6: Add the routes with placeholder closures**

In `api/routes/api.php`, above the `POST /api/migrate` route:

```php
// The API reference, for developers. PUBLIC BUT GATED: no session is required
// — you should be able to read the login endpoint's documentation before
// logging in — and the `docs` middleware answers 404 unless this environment
// sets API_DOCS_ENABLED. TEST and QA sit behind HTTP Basic Auth; PROD has the
// flag off.
//
// Under /api/ deliberately. The site .htaccess dispatches /api/* to Laravel
// BEFORE its SPA fallback, so these need no rewrite rule of their own —
// whereas Scramble's own /docs/api has been swallowed by that fallback since
// the day it was installed.
Route::middleware('docs')->group(function () {
    Route::get('/docs', fn () => response('placeholder'));
    Route::get('/docs.json', fn () => response()->json(['placeholder' => true]));
});
```

- [x] **Step 7: Run the test to verify it passes**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=DocsTest
```

Expected: PASS, 4 tests.

- [x] **Step 8: Mutation-test the gate**

```
1. Change abort_unless(...) to abort_unless(true, 404). Re-run.
   EXPECT: test_both_routes_are_invisible_when_the_flag_is_off FAILS.
2. Restore, then change config/docs.php's default from false to true. Re-run.
   EXPECT: test_the_flag_defaults_to_off FAILS.
3. Restore. Re-run: green.
```

- [x] **Step 9: Commit**

```bash
git add api/config/docs.php api/app/Http/Middleware/EnsureDocsEnabled.php \
        api/bootstrap/app.php api/routes/api.php api/tests/Feature/DocsTest.php
git commit -m "feat(api): a gated route pair for the API reference

404 rather than 403 when disabled — a 403 confirms the feature exists on the
host and is merely switched off. Defaults to off, so a server provisioned
before the key existed does not start serving an interactive console over the
whole API surface.

Under /api/ because the site .htaccess dispatches /api/* to Laravel before its
SPA fallback. Scramble's own /docs/api sits outside that prefix and has been
swallowed by the fallback since the day it was installed, which is why nobody
in this project has ever seen it.

Placeholder bodies; the next two commits fill them in."
```

---

## Task 2: The document, with its servers rewritten

**This is the task that matters most.** The committed document declares:

```json
"servers": [{ "url": "https://lescanetons.org/api", "description": "Production" }]
```

Scalar builds every "Send" from that list. Served untouched, a docs page on
TEST fires real requests — including mutating ones — at the live production
site. Confirmed by reading the file, not suspected.

That pin is deliberate and must stay in `api/config/scramble.php`: it is what
makes the export byte-identical on every machine, which is what lets CI's
`openapi-drift` job pass at all. So the rewrite happens **at serve time only**.

**Files:**
- Create: `api/app/Http/Controllers/Api/DocsDocumentController.php`
- Modify: `api/routes/api.php`, `api/tests/Feature/DocsTest.php`

- [x] **Step 1: Write the failing tests**

Append to `api/tests/Feature/DocsTest.php`, inside the class:

```php
    public function test_the_document_never_points_at_production(): void
    {
        // THE most important assertion in this file. api/openapi.json pins
        // servers to https://lescanetons.org/api so that the export is
        // byte-identical on every machine (CI's drift check depends on that) —
        // and Scalar builds every "Send" from that list. Served untouched, the
        // docs page on TEST would fire real requests, including mutating ones,
        // at the live site.
        config(['docs.enabled' => true]);

        $servers = $this->getJson('/api/docs.json')->assertOk()->json('servers');

        $this->assertSame([['url' => '/api', 'description' => 'This environment']], $servers);
    }

    public function test_the_document_server_is_relative_so_it_cannot_name_an_environment(): void
    {
        // A relative URL is resolved by the reader against the page's own
        // origin (OpenAPI 3.1). Whatever host you are reading the docs on IS
        // the host you are calling, so it cannot name the wrong environment —
        // it names none. An absolute URL would depend on APP_URL being right
        // in each server's hand-written .env.
        config(['docs.enabled' => true]);

        $url = $this->getJson('/api/docs.json')->assertOk()->json('servers.0.url');

        $this->assertStringStartsWith('/', $url);
        $this->assertStringNotContainsString('http', $url);
        $this->assertStringNotContainsString('lescanetons.org', $url);
    }

    public function test_the_document_is_the_committed_one_and_not_an_empty_object(): void
    {
        // Proves the file was actually read. A controller that failed to load
        // it and returned [] would satisfy every servers assertion above.
        config(['docs.enabled' => true]);

        $body = $this->getJson('/api/docs.json')->assertOk();

        $body->assertJsonPath('openapi', '3.1.0');
        // A path the SPA client is generated from, so it cannot quietly vanish.
        $this->assertArrayHasKey('/config', $body->json('paths'));
    }

    public function test_nothing_else_in_the_document_is_altered(): void
    {
        // The rewrite is one key. If it ever grows, this is what notices.
        config(['docs.enabled' => true]);

        $served = $this->getJson('/api/docs.json')->assertOk()->json();
        $committed = json_decode(file_get_contents(base_path('openapi.json')), true);

        unset($served['servers'], $committed['servers']);
        $this->assertSame($committed, $served);
    }

    public function test_a_missing_document_is_a_404_rather_than_a_500(): void
    {
        // It means the artifact is incomplete. A docs page is not worth an
        // error page, and a 500 on a shared host means reading logs over FTP.
        config(['docs.enabled' => true]);
        config(['docs.document' => base_path('does-not-exist.json')]);

        $this->getJson('/api/docs.json')->assertNotFound();
    }
```

- [x] **Step 2: Run them to verify they fail**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=DocsTest
```

Expected: FAIL — the placeholder returns `{"placeholder": true}`, so `servers`
is null and `openapi` is missing.

- [x] **Step 3: Add the document path to the config**

The last test needs the path to be overridable. In `api/config/docs.php`, add:

```php
    /**
     * The OpenAPI document to serve.
     *
     * base_path() resolves inside the Laravel project directory, where
     * `npm run openapi` writes it (config/scramble.php's export_path is a bare
     * 'openapi.json', resolved against the exporting process's working
     * directory — see tools/openapi.mjs, which cd's there for exactly this
     * reason). It is committed and travels in the deploy artifact.
     *
     * Configurable so a test can point at a missing file and assert the 404.
     */
    'document' => base_path('openapi.json'),
```

- [x] **Step 4: Write the controller**

Create `api/app/Http/Controllers/Api/DocsDocumentController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * Serves the committed OpenAPI document to the reference page.
 *
 * IT SERVES THE COMMITTED FILE, not a freshly-generated one. Scramble is a dev
 * dependency and is not installed on any server, and CI's openapi-drift job
 * already fails if the committed document disagrees with the code — so this is
 * both cheaper (no static analysis over the whole app per request on shared
 * hosting) and stronger: what the docs show is exactly the document
 * web/src/api/generated/ was produced from, so the documentation cannot
 * describe an API the client does not speak.
 *
 * THE ONE THING IT CHANGES, AND WHY. The committed document declares
 * `servers: [{"url": "https://lescanetons.org/api"}]`. That is deliberate —
 * config/scramble.php pins an absolute production URL so the export is
 * byte-identical on every machine, which is what lets the drift check pass —
 * but Scalar builds every "Send" from that list. Served untouched, the docs
 * page on TEST would fire real requests, INCLUDING MUTATING ONES, at the live
 * production site.
 *
 * The replacement is RELATIVE. OpenAPI 3.1 resolves a relative server URL
 * against the location the document is served from, so the reader calls
 * whatever origin it loaded the page from. It cannot name the wrong
 * environment because it names none — which is stronger than an absolute URL
 * built from APP_URL, a value each server sets by hand.
 *
 * The committed file is never written to.
 */
class DocsDocumentController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $path = config('docs.document');

        if (! is_string($path) || ! is_file($path)) {
            // The artifact is incomplete. A docs page is not worth an error
            // page, and a 500 on this host means reading logs over FTP.
            abort(404);
        }

        $document = json_decode((string) file_get_contents($path), true);

        if (! is_array($document)) {
            abort(404);
        }

        $document['servers'] = [[
            'url' => '/api',
            'description' => 'This environment',
        ]];

        // no-store: the document describes whatever code this server is
        // running, and a proxy holding a stale copy after a deploy would
        // describe the previous release.
        return response()
            ->json($document)
            ->header('Cache-Control', 'no-store');
    }
}
```

- [x] **Step 5: Point the route at it**

In `api/routes/api.php`, replace the `/docs.json` placeholder:

```php
    Route::get('/docs.json', DocsDocumentController::class);
```

and add the import.

- [x] **Step 6: Run the tests**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=DocsTest
```

Expected: PASS, 9 tests.

- [x] **Step 7: Mutation-test the servers rewrite**

This guard is the whole reason the task exists. Prove it can fail.

```
1. Delete the $document['servers'] = [...] assignment. Re-run.
   EXPECT: test_the_document_never_points_at_production and
   test_the_document_server_is_relative_so_it_cannot_name_an_environment both
   FAIL, reporting the production URL.

2. Restore it, then change the url to url('/api'). Re-run.
   EXPECT: test_..._is_relative FAILS on "http" being present. This is the
   fallback the spec documents, so knowing which test rejects it matters.

3. Restore. Re-run: green.
```

- [x] **Step 8: Commit**

```bash
git add api/app/Http/Controllers/Api/DocsDocumentController.php \
        api/config/docs.php api/routes/api.php api/tests/Feature/DocsTest.php
git commit -m "feat(api): serve the committed OpenAPI document, servers rewritten

The committed document pins servers to https://lescanetons.org/api — on
purpose, because a byte-identical export is what lets CI's drift check pass.
But a reader builds every request from that list, so served untouched the docs
page on TEST would fire real requests, including mutating ones, at the live
site.

Replaced at serve time with a RELATIVE /api, which OpenAPI 3.1 resolves against
the page's own origin: it cannot name the wrong environment because it names
none. Stronger than an absolute URL built from APP_URL, which each server sets
by hand. The committed file is never written to.

Serving the committed file rather than generating means no production
dependency on a doc generator, and what the docs show is exactly the document
the SPA client was generated from.

Mutation-tested: dropping the rewrite fails two tests with the production URL;
switching to url('/api') fails the relative-URL assertion."
```

---

## Task 3: The page

**Files:**
- Create: `api/app/Http/Controllers/Api/DocsController.php`
- Create: `api/resources/views/docs.blade.php`
- Modify: `api/routes/api.php`, `api/tests/Feature/DocsTest.php`

- [x] **Step 1: Read the reference implementation**

```bash
cat api/vendor/dedoc/scramble/resources/views/scalar.blade.php
```

Three things in it are kept below, and one is deliberately dropped. Read the
next step's comments before writing the file.

- [x] **Step 2: Write the failing tests**

Append to `api/tests/Feature/DocsTest.php`, inside the class:

```php
    public function test_the_page_points_at_this_apps_document(): void
    {
        config(['docs.enabled' => true]);

        $this->get('/api/docs')
            ->assertOk()
            ->assertHeader('Content-Type', 'text/html; charset=UTF-8')
            ->assertSee('/api/docs.json');
    }

    public function test_the_page_does_not_route_requests_through_a_third_party(): void
    {
        // api/config/scramble.php sets proxyUrl => https://proxy.scalar.com,
        // and Scramble's own view passes its whole renderer config through — so
        // anyone modelling this page on that file inherits it. That would send
        // request bodies off-site, lose the session cookie on the hop, and fail
        // opaquely on TEST, where the proxy has no Basic Auth credentials.
        // These requests are same-origin and need no proxy.
        config(['docs.enabled' => true]);

        $this->get('/api/docs')
            ->assertOk()
            ->assertDontSee('proxy.scalar.com')
            ->assertDontSee('proxyUrl', false);
    }

    public function test_the_page_replays_the_csrf_token_so_try_it_is_not_419(): void
    {
        // Sanctum's stateful SPA mode puts /api/* behind the `web` middleware
        // group, so a mutating request without X-XSRF-TOKEN answers
        // 419 {"code":"invalid_session"}. web/src/api/http.ts does this for the
        // SPA; a docs page that skipped it would 419 on the first POST and
        // look broken rather than protected.
        config(['docs.enabled' => true]);

        $page = $this->get('/api/docs')->assertOk();

        $page->assertSee('X-XSRF-TOKEN', false);
        $page->assertSee('XSRF-TOKEN', false);
        // The cookie has to exist before it can be replayed, and only
        // /sanctum/csrf-cookie plants it.
        $page->assertSee('/sanctum/csrf-cookie', false);
        // Without this the session cookie is not sent and every authenticated
        // endpoint answers 401.
        $page->assertSee('credentials', false);
    }
```

- [x] **Step 3: Run them to verify they fail**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=DocsTest
```

Expected: FAIL — the placeholder returns the string `placeholder`.

- [x] **Step 4: Write the view**

Create `api/resources/views/docs.blade.php`:

```blade
<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Les Canetons — API</title>
</head>
<body>
{{--
    Modelled on api/vendor/dedoc/scramble/resources/views/scalar.blade.php,
    which is known-good markup for this CDN build. Three things are kept from
    it and one is deliberately dropped — see below. Read that file before
    changing anything here.

    The document is fetched by URL rather than inlined, so the page is a static
    shell and the document has its own no-store response. It also means the
    servers rewrite lives in exactly one place.
--}}
<div id="app"></div>

{{-- Pinned by path, not by version: config/scramble.php names this same CDN
     entry point, so the two stay in step. Loaded from a CDN rather than
     vendored into the artifact — @scalar/api-reference is over a megabyte, and
     this project rejects that kind of weight on every FTP deploy. --}}
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>

<script>
    const CSRF_COOKIE = 'XSRF-TOKEN';
    const CSRF_HEADER = 'X-XSRF-TOKEN';

    const cookieValue = (key) => {
        const found = document.cookie.split(';').find((c) => c.trim().startsWith(key));
        return found?.split('=')[1];
    };

    // Plant the cookie the replay below reads. Sanctum's SPA flow seeds
    // XSRF-TOKEN from this route and nothing else, so on a cold visit — which
    // is most visits to a docs page — it does not exist yet and every mutating
    // "Send" would answer 419. web/src/api/http.ts primes it the same way
    // before every mutating call.
    const primed = fetch('/sanctum/csrf-cookie', { credentials: 'include' }).catch(() => {});

    Scalar.createApiReference('#app', {
        url: '/api/docs.json',
        theme: 'laravel',
        darkMode: false,
        // NO proxyUrl, deliberately. config/scramble.php sets one
        // (proxy.scalar.com) and Scramble's view forwards its whole renderer
        // config, so copying that file wholesale inherits it. Routing try-it
        // through a third-party proxy would send request bodies off-site, lose
        // the session cookie on the hop, and fail opaquely on TEST, where the
        // proxy has no Basic Auth credentials. Every request here is
        // same-origin and needs no proxy.
        onBeforeRequest: ({ requestBuilder }) => {
            const token = cookieValue(CSRF_COOKIE);
            if (token) {
                requestBuilder.headers.set(CSRF_HEADER, decodeURIComponent(token));
            }
        },
        customFetch: async (input, init) => {
            // Await the prime so the very first request already carries the
            // token, rather than being the one that fails.
            await primed;
            // credentials: 'include' or the session cookie is not sent and
            // every authenticated endpoint answers 401.
            return window.fetch(input, { ...init, credentials: 'include' });
        },
    });
</script>
</body>
</html>
```

- [x] **Step 5: Write the controller**

Create `api/app/Http/Controllers/Api/DocsController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Contracts\View\View;

/**
 * The API reference page.
 *
 * A static shell: it names the document's URL and lets the reader fetch it, so
 * the servers rewrite lives in exactly one place
 * (DocsDocumentController) and this response has nothing environment-specific
 * in it at all.
 *
 * Returning a View from a route in the `api` group is fine. bootstrap/app.php's
 * shouldRenderJsonWhen() governs only how EXCEPTIONS render, not successful
 * responses.
 */
class DocsController extends Controller
{
    public function __invoke(): View
    {
        return view('docs');
    }
}
```

- [x] **Step 6: Point the route at it**

In `api/routes/api.php`, replace the `/docs` placeholder:

```php
    Route::get('/docs', DocsController::class);
```

and add the import.

- [x] **Step 7: Run the tests**

```bash
docker compose exec -w /var/www/html/_api web php artisan test --filter=DocsTest
```

Expected: PASS, 12 tests.

- [x] **Step 8: Commit**

```bash
git add api/app/Http/Controllers/Api/DocsController.php \
        api/resources/views/docs.blade.php api/routes/api.php \
        api/tests/Feature/DocsTest.php
git commit -m "feat(api): the Scalar reference page

Modelled on Scramble's own scalar.blade.php, keeping the two things that make
try-it work at all — the X-XSRF-TOKEN replay, without which every mutating
request answers 419 under Sanctum's stateful SPA mode, and credentials:
'include', without which every authenticated endpoint answers 401 — plus a
/sanctum/csrf-cookie prime, because on a cold visit the cookie being replayed
does not exist yet.

And dropping the one thing that must not be inherited: config/scramble.php's
proxyUrl. Routing try-it through proxy.scalar.com would send request bodies
off-site, lose the session cookie on the hop, and fail opaquely on TEST, where
the proxy has no Basic Auth credentials. A test asserts the string is absent,
so a later diff against Scramble's view cannot quietly restore it."
```

---

## Task 4: Look at it in a browser

**A green suite is not a rendered page.** Every assertion so far checks strings
in HTML; none of them proves Scalar renders, or that a request goes where it
should. This project has shipped auth changes that passed every test and failed
in Chrome.

- [x] **Step 1: Enable it locally and rebuild**

In `docker/api/env.docker`, add:

```dotenv
# The API reference at /api/docs. On locally and on the Basic-Auth'd staging
# environments; off on PROD. Kept in step with api/.env.example, because the
# deploy CLI compares the two files' KEY SETS and refuses on drift.
API_DOCS_ENABLED=true
```

Then:

```bash
npm run build
npm run dev
```

The container reads its `.env` from the mounted file, so the stack must be
**recreated**, not just restarted — `npm run dev` does that.

- [x] **Step 2: Open it**

http://localhost:8090/api/docs

Confirm: Scalar renders; the endpoint list shows `/login`, `/logout`, `/me`,
`/config`, `/contact`; the server selector shows a **relative** `/api` and not
`lescanetons.org`.

- [x] **Step 3: Send a request and watch where it goes**

With the browser's network panel open, send `GET /config` from the page.

Confirm the request URL is **`http://localhost:8090/api/config`**. If it is
`https://lescanetons.org/api/config`, stop: either the rewrite is not applied
or Scalar has not resolved the relative URL. In the latter case, apply the
spec's documented fallback (`$request->getSchemeAndHttpHost().'/api'`), update
`test_the_document_server_is_relative_so_it_cannot_name_an_environment` to
match, and record the change.

- [x] **Step 4: Prove try-it works against a session**

1. Log in through the SPA at http://localhost:8090/login as
   `demo.direction` / `demo`.
2. Back on `/api/docs`, send `GET /me`.

Confirm **200** with the member's identity, not 401. A 401 means
`credentials: 'include'` is not taking effect.

3. Send `POST /logout`.

Confirm **200**, not 419. A 419 means the CSRF replay or the prime is not
working — check that the `XSRF-TOKEN` cookie exists in the browser first.

- [x] **Step 5: Confirm the gate, from the browser**

Set `API_DOCS_ENABLED=false` in `docker/api/env.docker`, run `npm run dev`
again, and reload `/api/docs`.

Confirm: the SPA's own 404 view or Laravel's 404 — **not** the Scalar page.
Then set it back to `true` and recreate again.

- [x] **Step 6: Commit**

```bash
git add docker/api/env.docker
git commit -m "chore(dev): enable the API reference in the local stack

Verified in a browser, not only in the suite: Scalar renders, the server
selector shows a relative /api, GET /config goes to localhost rather than
production, GET /me returns the logged-in member (so credentials: include
works) and POST /logout returns 200 rather than 419 (so the CSRF replay and the
cookie prime both work)."
```

---

## Task 5: Keep the docs out of their own documentation

Scramble documents every route under `api`, which now includes the two this
plan added. Left alone, the next `npm run openapi` adds `/docs` and
`/docs.json` to the committed document, and orval then generates client hooks
for a documentation page.

**Measured 2026-09-07:** switching `api_path` from the string form to the array
form with an `exclude` produces a **byte-identical** document — paths stay
stripped and `servers` is unchanged. So this is safe.

**Files:**
- Modify: `api/config/scramble.php`

- [x] **Step 1: Add the exclusion**

In `api/config/scramble.php`, replace `'api_path' => 'api',` with:

```php
    /*
     * The docs routes are excluded so the API reference does not document
     * itself — and, more to the point, so orval does not generate TanStack
     * Query hooks for a documentation page.
     *
     * The array form is used with a SINGLE include, which keeps Scramble's
     * path-stripping behaviour: paths stay /me and /config rather than
     * becoming /api/me. Verified 2026-09-07 by exporting both ways and
     * diffing — the document is byte-identical.
     */
    'api_path' => [
        'include' => 'api',
        'exclude' => ['api/docs', 'api/docs.json'],
    ],
```

- [x] **Step 2: Regenerate and confirm nothing moved**

```bash
npm run openapi
git diff --stat api/openapi.json
```

Expected: **no output** — the document is unchanged. The docs routes were never
in it (they were added after the last export), and the exclusion keeps them
out.

If the diff is non-empty, read it before proceeding. Paths gaining an `/api`
prefix means the stripping behaviour changed and the exclusion must be done
another way (`Scramble::routes()` in a service provider).

- [x] **Step 3: Confirm the client is unaffected**

```bash
npm run generate:api
git status --porcelain api/openapi.json web/src/api/generated
```

Expected: no output. This is the same check CI's `openapi-drift` job runs.

- [x] **Step 4: Commit**

```bash
git add api/config/scramble.php
git commit -m "chore(api): exclude the docs routes from the exported document

Otherwise the next npm run openapi documents the documentation, and orval
generates TanStack Query hooks for a reference page. The array form keeps
Scramble's single-include path stripping, so the exported document is
byte-identical — verified by exporting both ways and diffing."
```

---

## Task 6: Make the flag deployable, and the full green run

**The consequence to understand before doing this.** Adding a key to
`api/.env.example` makes the deploy CLI's config-shape pre-flight **refuse**
any server whose `.env` lacks it. That is the point of that check — it is how
shipping code that expects a new key fails a deploy instead of 500ing every
request afterwards — but it means TEST cannot take another deploy until its
`.env` gains the key by hand.

**Files:**
- Modify: `api/.env.example`
- Modify: `CLAUDE.md`

- [x] **Step 1: Document the key**

Add to `api/.env.example`, after the session block:

```dotenv
# --- API reference ------------------------------------------------------------
# Serves an interactive Scalar reference at /api/docs, reading the committed
# openapi.json that ships in this artifact.
#
# `true` on local dev and on TEST/QA, which sit behind HTTP Basic Auth.
# `false` on PROD — an interactive console over the whole API surface invites
# poking, and nobody needs it there.
#
# The key must be PRESENT on every server even when false: the deploy's
# config-shape pre-flight compares this file's key set against the server's
# .env and refuses on any drift.
API_DOCS_ENABLED=false
```

- [x] **Step 2: Confirm the pre-flight now sees the drift**

Without deploying:

```bash
npm run status:test
```

If TEST's `.env` has not yet been hand-edited, expect the config-shape check to
report `API_DOCS_ENABLED` as **missing** on the server. That is the correct
answer and the reason it is safe: a deploy would refuse rather than silently
land code expecting a key nobody set.

Record which environments need the hand-edit. TEST's happens in the other
plan's cutover runbook (Task 8, step 3).

- [x] **Step 3: Document the feature**

Add to `CLAUDE.md`, in the Architecture section after the runtime-configuration
bullet:

```markdown
- **The API reference lives at `GET /api/docs`**, gated by `API_DOCS_ENABLED`
  in each server's `.env` (default **off**, answering 404 rather than 403).
  It is a Scalar page reading the **committed** `openapi.json` that ships in
  the artifact — Scramble is a dev dependency and is not installed on any
  server, and CI's `openapi-drift` job already guarantees that file matches the
  code, so the docs cannot describe an API the generated client does not speak.
  `GET /api/docs.json` serves that document with its `servers` rewritten to a
  relative `/api`: the committed file pins an absolute production URL (for a
  byte-identical export), and serving it untouched would make the docs page on
  TEST fire real requests at PROD.

  Both routes sit under `/api/` deliberately, because the `.htaccess` dispatch
  claims that prefix before the SPA fallback. Scramble's own `/docs/api` is
  outside it and has always been swallowed by the fallback.
```

- [x] **Step 4: Full green run**

```bash
docker compose exec -w /var/www/html/_api web php artisan test
npm run test:js
npm run smoke
```

```powershell
npm run check
```

Expected: all green. `npm run smoke` should be unchanged by this plan — it
makes no assertion about `/api/docs`, deliberately: the flag is off by default
and a smoke check would have to enable it, which is a check of its own
scaffolding.

- [x] **Step 5: Commit**

```bash
git add api/.env.example CLAUDE.md
git commit -m "docs(api): the API reference, and the .env key it needs

Adding the key to api/.env.example means the deploy's config-shape pre-flight
refuses any server whose .env lacks it. That is intended — it is how code
expecting a new key fails a deploy rather than 500ing every request afterwards
— and it means TEST needs a hand-edit before its next deploy."
```

---

## Done when

- `docker compose exec -w /var/www/html/_api web php artisan test` is green,
  including `DocsTest`'s 12 tests.
- `npm run check` and `npm run test:js` are green; `npm run smoke` is unchanged.
- `npm run openapi && npm run generate:api` leaves the tree clean — the docs
  routes are not in the document and no client hook was generated for them.
- In a browser at `:8090`: `/api/docs` renders Scalar; a `GET /config` sent
  from the page goes to **localhost**; `GET /me` returns the logged-in member;
  `POST /logout` returns 200 rather than 419.
- With `API_DOCS_ENABLED=false`, `/api/docs` is a 404 and not the page.
- No pull request has been opened, and nothing has been deployed.

## Carried out of this plan

- **Enabling it on TEST.** One line in `_api/.env`, done in the other plan's
  cutover runbook so TEST's `.env` is opened once.
- **Prose descriptions for endpoints.** Scramble infers everything from code
  today, so the reference is accurate but terse. Worth authoring later; it
  changes only the committed document, not this plumbing.
- **Scramble's own `renderer` setting** stays `'elements'`. Its UI is
  unreachable and dev-only, and this plan does not use it — changing the value
  would be a change nobody can observe.
- **Smoke coverage for `/api/docs`.** Deliberately none: the flag defaults off,
  so a check would have to enable it and would then be testing its own
  scaffolding. The browser pass in Task 4 is the verification.

---

## Corrections made while executing, 2026-09-07

Four things in this plan were wrong as written. All four are fixed in the
committed work; they are recorded here so a reader of the plan is not misled.

1. **Task 3's view put the proxy warning in a JS `//` comment**, containing both
   `proxyUrl` and `proxy.scalar.com` — the two strings Task 3's own test
   asserts are *absent from the rendered page*. The plan's view therefore fails
   the plan's own test. Shipped as a **Blade** comment instead: the warning
   still lives in the source for anyone diffing against Scramble's view, and
   the rendered page genuinely contains neither string. Mutation-tested by
   adding `proxyUrl` back.

2. **Task 4 Step 4 said to log in through the SPA** at `:8090/login` as
   `demo.direction`/`demo`. Impossible on this branch — `web/src/pages/Login.tsx`
   is still R1a's formless stub, so there is no form to fill. This is the same
   trap the R1b plan already had corrected once. Substituted: log in from the
   **docs page's own `POST /login` try-it**, which is strictly stronger — it
   puts a mutating request through the CSRF replay and the cookie prime, which
   is exactly what the step exists to prove. Verified `POST /login` 200 (not
   419), `GET /me` returning Dominique Direction with the five `direction`
   permissions, `POST /logout` 200.

3. **The `servers` description was specified in French** — `Cet environnement`.
   Caught by André on TEST, after the fact. It was the only French string in a
   reference whose every other word is English, and it sat in an API JSON
   response body, which CLAUDE.md keeps English without exception; French in
   this project is for the band's user-visible UI, not a developer console.
   Shipped as `This environment`, with `<html lang="fr">` on the page corrected
   to `en` for the same reason. Both this plan and the spec above have been
   corrected at source so the string is not reintroduced.

4. **Task 6 Step 2 named `npm run status:test`** to surface the config-shape
   drift. That command only reads the remote `.sync-state.json` manifest and
   never runs the pre-flight. `npm run deploy:test -- --dry-run` is what does,
   and it uploads nothing:
   `_api/.env on TEST is MISSING key: API_DOCS_ENABLED`.

Everything else executed as written, including the measured claim that the
`api_path` array form leaves `api/openapi.json` byte-identical.

### Final state

- Laravel suite **147 passed** (was 135; DocsTest adds 12).
- `npm run test:js` 144, `npm run smoke` 9/9, `npm run check` exit 0.
- `npm run openapi && npm run generate:api` leaves the tree clean.
- Nothing deployed, no PR opened. **TEST still needs `API_DOCS_ENABLED` added
  to its `_api/.env` by hand before it can take another deploy** — fold it into
  the same visit as any other pending hand-edit.
