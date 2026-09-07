<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ConfigController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\DocsController;
use App\Http\Controllers\Api\DocsDocumentController;
use App\Http\Controllers\Api\MigrateController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SectionController;
use Illuminate\Support\Facades\Route;

// Public: the SPA fetches this before its first render to learn the
// environment (ribbon). It carries no secrets — see ConfigController.
Route::get('/config', ConfigController::class);

// Public: the contact form is open to anonymous visitors.
Route::post('/contact', ContactController::class);

Route::post('/login', [AuthController::class, 'login']);

// `no-store` on the whole authenticated group: every response below depends on
// who is asking, and a shared proxy that cached one would serve one member's
// view to another (design §4). A middleware rather than nine ->header() calls,
// so the tenth endpoint cannot forget.
Route::middleware(['auth:sanctum', 'no-store'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Member administration. `permission:` never sees a role name: roles merely
    // group permissions, and which role granted this one is not a question the
    // enforcement point may ask (design §3). Paired with auth:sanctum so an
    // anonymous caller gets 401 rather than 403.
    Route::middleware('permission:members.manage')->group(function () {
        // Read-only reference data the roster form needs. Gated on
        // members.manage because /members is the only consumer that exists;
        // R2's public band page can widen it when it has a second one.
        Route::get('/sections', [SectionController::class, 'index']);
        Route::get('/roles', [RoleController::class, 'index']);
    });
});

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
    Route::get('/docs', DocsController::class);
    Route::get('/docs.json', DocsDocumentController::class);
});

// Token-gated (not session-gated): the deploy tooling calls this server-side
// with the shared MIGRATE_TOKEN. Excluded from the OpenAPI document — nothing
// in the browser may trigger a migration.
Route::post('/migrate', MigrateController::class);
