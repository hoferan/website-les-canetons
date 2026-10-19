<?php

use App\Http\Controllers\Api\DocsController;
use App\Http\Controllers\Api\DocsDocumentController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\MigrateController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Meta routes: unversioned, outside the API contract
|--------------------------------------------------------------------------
|
| These sit at /api/*, not /api/v1/*, because they describe or operate the
| API rather than being part of it. A v2 would not get a second reference or
| a second migration trigger.
|
| Registered from bootstrap/app.php's withRouting(then:) hook with the same
| `api` middleware group as routes/api.php, so RunPendingMigrations sits in
| front of them too.
|
| They stay under /api/ so the site .htaccess dispatches them to Laravel
| before its SPA fallback. Scramble's own /docs/api is outside that prefix,
| and the fallback swallows it.
*/

// Public: the API reference. No session is required, so the login endpoint's
// documentation is readable before logging in. The `docs` middleware answers
// 404 when API_DOCS_ENABLED is off (on by default); the try-it console is gated
// separately by `docs.interactive`. config/docs.php has the reasoning.
Route::middleware('docs')->group(function () {
    Route::get('/docs', DocsController::class);
    Route::get('/docs.json', DocsDocumentController::class);
});

// Public, for a monitor that holds no session: the server, its database and
// which deploy it runs. See HealthController for why nothing in it is hidden.
Route::get('/health', HealthController::class);

// Token-gated, no session: the deploy tooling calls this server-side with the
// shared MIGRATE_TOKEN. Excluded from the OpenAPI document, since nothing in
// the browser may trigger a migration.
Route::post('/migrate', MigrateController::class);
