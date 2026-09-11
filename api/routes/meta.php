<?php

use App\Http\Controllers\Api\DocsController;
use App\Http\Controllers\Api\DocsDocumentController;
use App\Http\Controllers\Api\MigrateController;
use App\Http\Controllers\Api\ProblemController;
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

// The problem types every error's `type` URI resolves to. JSON, always — a
// route under /api/ that answered curl with HTML was the reason this stopped
// being a rendered page. Humans read the same list in the Scalar reference,
// which generates it from App\Support\ErrorVocabulary too. PUBLIC AND UNGATED,
// unlike /api/docs above: that reference describes the whole schema, this
// describes what one error token means — and that vocabulary already ships to
// every visitor inside the SPA bundle (web/src/i18n/fr.ts). A `type` URI that
// resolved only where API_DOCS_ENABLED happened to be on would be worse than
// one that never resolved at all.
//
// Unversioned for the same reason as everything else in this file, and here it
// is the strongest case: clients BRANCH on `type`, so it can never change once
// anything depends on it. See App\Support\ErrorVocabulary::TYPE_BASE.
Route::get('/problems', [ProblemController::class, 'index']);
Route::get('/problems/{slug}', [ProblemController::class, 'show']);

// Token-gated (not session-gated): the deploy tooling calls this server-side
// with the shared MIGRATE_TOKEN. Excluded from the OpenAPI document — nothing
// in the browser may trigger a migration.
Route::post('/migrate', MigrateController::class);
