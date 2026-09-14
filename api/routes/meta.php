<?php

use App\Http\Controllers\Api\DocsController;
use App\Http\Controllers\Api\DocsDocumentController;
use App\Http\Controllers\Api\MigrateController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Meta routes — UNVERSIONED, and deliberately outside the contract
|--------------------------------------------------------------------------
|
| These sit at /api/*, not /api/v1/*, because they describe or operate the
| API rather than being part of it. A v2 would not get a second copy of the
| reference or a second migration trigger.
|
| Registered from bootstrap/app.php's withRouting(then:) hook, with the same
| `api` middleware group routes/api.php gets — so RunPendingMigrations still
| sits in front of them, exactly as it did when they lived in that file.
|
| Both are still under /api/v1/ so the site .htaccess dispatches them to Laravel
| before its SPA fallback. Scramble's own /docs/api is outside that prefix and
| has been swallowed by the fallback since the day it was installed.
*/

// The API reference, for developers. PUBLIC BUT GATED: no session is required
// — you should be able to read the login endpoint's documentation before
// logging in — and the `docs` middleware answers 404 when API_DOCS_ENABLED is
// off, which as of 2026-09-11 it is not by default: the reference is public
// everywhere, because hiding it was security through obscurity while the SPA
// bundle ships the whole surface anyway. What IS off on production is the
// try-it console, gated separately by `docs.interactive` — see config/docs.php
// for the argument.
Route::middleware('docs')->group(function () {
    Route::get('/docs', DocsController::class);
    Route::get('/docs.json', DocsDocumentController::class);
});

// Token-gated (not session-gated): the deploy tooling calls this server-side
// with the shared MIGRATE_TOKEN. Excluded from the OpenAPI document — nothing
// in the browser may trigger a migration.
Route::post('/migrate', MigrateController::class);
