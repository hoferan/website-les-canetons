<?php

use App\Http\Controllers\Api\AccountPasswordController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ConfigController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\DocsController;
use App\Http\Controllers\Api\DocsDocumentController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\EventSeriesController;
use App\Http\Controllers\Api\FormTokenController;
use App\Http\Controllers\Api\GuestListExportController;
use App\Http\Controllers\Api\MemberAttendanceController;
use App\Http\Controllers\Api\MemberController;
use App\Http\Controllers\Api\MemberPasswordController;
use App\Http\Controllers\Api\MemberRoleController;
use App\Http\Controllers\Api\MigrateController;
use App\Http\Controllers\Api\RegistrationController;
use App\Http\Controllers\Api\RegistrationOptionController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SectionController;
use Illuminate\Support\Facades\Route;

// Public: the SPA fetches this before its first render to learn the
// environment (ribbon). It carries no secrets — see ConfigController.
Route::get('/config', ConfigController::class);

// Public: the signed stamp every anonymous form must send back. Ungated by
// necessity — it is fetched before the visitor has submitted anything — and
// it grants nothing on its own. See App\Support\FormToken.
// THROTTLED, like everything anonymous below it. Minting a stamp is cheap,
// but it is the first step of the loop the write limiter exists to stop, and
// leaving it open lets a caller bank tokens.
Route::middleware('throttle:public-write')->group(function () {
    Route::get('/form-token', FormTokenController::class);
});

// Public: the contact form is open to anonymous visitors.
//
// NOW GUARDED, after three release slicings left it unprotected. §6 of the
// rebuild spec required honeypot + submit-timing on "both public write
// endpoints" and no release ever claimed this one; R3 adds the second such
// endpoint and the middleware that covers them both.
// THROTTLED AS WELL AS GUARDED, and the throttle is the half that matters.
// PublicWriteGuard costs an attacker one extra GET and a two-second wait:
// the stamp is not bound to a caller and is deliberately replayable for two
// hours, so without a limiter one token buys unlimited submissions. Each
// registration sends mail INLINE to an address the caller chose, through the
// band's own authenticated mailbox — an open relay whose cost is a
// blacklisted sending domain, which the committee cannot repair.
Route::middleware(['throttle:public-write', 'public-write'])->group(function () {
    Route::post('/contact', ContactController::class);

    // Public event registration — the souper, generalised (D9). Anonymous
    // by design: the people booking a place are not band members.
    Route::post('/events/{event}/registrations', [RegistrationController::class, 'store']);
});

// Public: what the booking form needs to render itself. A GET, so it is not
// behind the write guard — but it answers 404 for an event that takes no
// registrations, so it cannot be used to enumerate the band's planning.
Route::get('/events/{event}/registration', [RegistrationController::class, 'form']);

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

        // BEFORE the parameterised routes, deliberately. Nothing collides
        // today — `series` is a POST and `/events/{event}` is not — but a
        // literal segment and a parameter sharing a prefix is worth keeping in
        // an order that stays correct if either ever gains the other's verb.
        //
        // A GENERATOR, not a resource (C3): it writes N independent events and
        // stores no rule and no series_id, so there is nothing here to GET.
        Route::post('/events/series', EventSeriesController::class);

        Route::patch('/events/{event}', [EventController::class, 'update']);

        // No re-authentication on the delete, unlike the roster's — the call
        // MemberController::destroy() documents (decision B7), and an event
        // carries none of a member's account state. Protection against a
        // mis-aimed tap is the confirmation in the UI.
        Route::delete('/events/{event}', [EventController::class, 'destroy']);
    });

    // ANSWERING FOR YOURSELF NEEDS NO PERMISSION, and that absence is a
    // decision rather than an oversight (design §3). Making it a grant is
    // what produced the old bug where an admin could not say whether they
    // were coming, and left the "Pas de réponse" counts meaningless. What
    // gates it instead is Member::isPlayer() — being in a register — checked
    // in App\Support\AttendanceIntegrity, because it is a fact about the
    // person rather than something anybody granted them.
    //
    // PUT so the answer is an idempotent upsert; DELETE is undo, and it
    // expires after five minutes (C12) so C11's reason rule is not
    // decorative.
    Route::put('/events/{event}/attendance', [AttendanceController::class, 'update']);
    Route::delete('/events/{event}/attendance', [AttendanceController::class, 'destroy']);

    // The chase list. Answering is everybody's; reading who has NOT answered
    // is the committee's, so unlike answering this one is gated.
    Route::middleware('permission:attendance.view_all')->group(function () {
        Route::get('/events/{event}/attendance', [AttendanceController::class, 'index']);
    });

    // Answering on somebody's behalf — the phone call to the committee. A
    // SEPARATE permission from viewing the list: seeing who is missing and
    // speaking for them are different acts, and roles are editable data that
    // may well grant one without the other. Refuses its own caller (C14).
    Route::middleware('permission:attendance.record_for_others')->group(function () {
        Route::put('/events/{event}/attendance/{member}', [MemberAttendanceController::class, 'update']);

        // Taking one back. A mis-aimed on-behalf write was otherwise
        // permanent, and it starts the member's own five-minute undo clock
        // (C12) from the moment the DIRECTION wrote it.
        Route::delete('/events/{event}/attendance/{member}', [MemberAttendanceController::class, 'destroy']);
    });

    // THE GUEST LIST, and reading it is all this grants. `committee` holds
    // registrations.view as its ONLY permission — the role exists so
    // somebody can look at the list — so this token must not also authorise
    // deleting from it.
    Route::middleware('permission:registrations.view')->group(function () {
        Route::get('/events/{event}/registrations', [RegistrationController::class, 'index']);

        // The same list as a file. `{format}` is constrained here rather
        // than validated in the controller, so an unknown one is a 404 from
        // the router instead of reaching code at all.
        Route::get('/events/{event}/registrations.{format}', GuestListExportController::class)
            ->where('format', 'xlsx|csv|md|json');
    });

    // Correcting and cancelling a booking. A SEPARATE permission from
    // reading the list: guests get no self-service (G2), so this is the
    // committee acting on somebody's personal data.
    Route::middleware('permission:registrations.manage')->group(function () {
        Route::patch('/registrations/{registration}', [RegistrationController::class, 'update']);
        Route::delete('/registrations/{registration}', [RegistrationController::class, 'destroy']);
    });

    // What an event OFFERS is part of the event, so this is events.manage
    // rather than a registration permission — the same act as setting its
    // date. PUT and replace-all, matching /members/{member}/roles: an "add
    // one" API cannot express removal.
    Route::middleware('permission:events.manage')->group(function () {
        Route::put('/events/{event}/registration-options', RegistrationOptionController::class);
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
