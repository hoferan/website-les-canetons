<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ConfigController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\MigrateController;
use Illuminate\Support\Facades\Route;

// Public: the SPA fetches this before its first render to learn the
// environment (ribbon). It carries no secrets — see ConfigController.
Route::get('/config', ConfigController::class);

// Public: the contact form is open to anonymous visitors.
Route::post('/contact', ContactController::class);

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
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
    Route::get('/docs', fn () => response('placeholder'));
    Route::get('/docs.json', fn () => response()->json(['placeholder' => true]));
});

// Token-gated (not session-gated): the deploy tooling calls this server-side
// with the shared MIGRATE_TOKEN. Excluded from the OpenAPI document — nothing
// in the browser may trigger a migration.
Route::post('/migrate', MigrateController::class);
