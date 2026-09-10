<?php

use App\Http\Controllers\Api\AccountPasswordController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ConfigController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\DocsController;
use App\Http\Controllers\Api\DocsDocumentController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\MemberController;
use App\Http\Controllers\Api\MemberPasswordController;
use App\Http\Controllers\Api\MemberRoleController;
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

    // Any account holder may change their OWN password — no permission,
    // because this is the screen every member needs and nobody administers,
    // and it is where every first login lands. It re-verifies the current
    // password itself, through the same throttled Reauthentication the
    // destructive endpoints use.
    Route::post('/me/password', AccountPasswordController::class);

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

        // The roster. Everyone associated with the band, account or not — one
        // roster (design §8), so a person with no credentials is listed here
        // and can be given an account later rather than living on a second
        // list somewhere else.
        Route::get('/members', [MemberController::class, 'index']);

        // Creating a person creates an ACCOUNT: every member has one, so this
        // mints a generated password and returns it once. No re-authentication
        // on either write — neither is destructive, and a password prompt on
        // every corrected typo trains the reflex the destructive dialogs rely
        // on.
        Route::post('/members', [MemberController::class, 'store']);
        Route::patch('/members/{member}', [MemberController::class, 'update']);

        // THE DESTRUCTIVE TWO. Both carry `currentPassword` and re-authenticate
        // before reading anything (decision B1), both check the lockout
        // invariants before writing, and both end the target's sessions inside
        // the same transaction as the change — a revoked permission that waits
        // for the next login is one the holder keeps using all evening, and a
        // deleted member with a live session is theatre.
        //
        // Replacing roles is PUT, not PATCH: roleIds is the complete set, and
        // an "add this one" API cannot express removal — which is the half the
        // invariants exist for.
        Route::put('/members/{member}/roles', MemberRoleController::class);
        Route::delete('/members/{member}', [MemberController::class, 'destroy']);

        // Issuing a credential and resetting one are the same operation (§4.4).
        Route::post('/members/{member}/password', MemberPasswordController::class);
    });

    // The planning. NO PERMISSION: reading it is something everybody in the
    // band does, not something the committee administers — gating it would
    // be the same mistake as gating the ability to answer for an event.
    // auth:sanctum alone (inherited from the group) is enough to keep it
    // members-only.
    Route::get('/events', [EventController::class, 'index']);
    Route::get('/events/{event}', [EventController::class, 'show']);

    // Writing the planning IS administration, unlike reading it. Nested
    // inside the auth:sanctum group above so an anonymous caller gets 401
    // rather than 403 — the same pairing the members.manage group makes, and
    // for the same reason: "log in" and "you may not" are different answers
    // and the SPA acts on each differently.
    Route::middleware('permission:events.manage')->group(function () {
        Route::post('/events', [EventController::class, 'store']);
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
