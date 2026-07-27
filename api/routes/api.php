<?php

use App\Http\Controllers\Api\AltchaController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\MigrateController;
use App\Http\Controllers\Api\ResponseController;
use App\Http\Controllers\Api\SignupController;
use Illuminate\Support\Facades\Route;

// Public: the contact form is open to anonymous visitors.
Route::post('/contact', ContactController::class);

// The souper signup feature, behind the server-owned SOUPER_SIGNUP_ENABLED flag
// — the API half of the old app's $config['features']['souper_signup'], which
// used to wrap these same two endpoint names in app/src/routes.php. With the
// flag off none of the three routes below exists (404). The whole endpoint
// NAME is gated, both verbs of /signups together, exactly as the old route
// table did: the summary describes reservations for an occasion that has not
// been announced on a server where the feature is off, so there is nothing for
// an admin to read there either. See App\Http\Middleware\EnsureSouperSignupEnabled.
Route::middleware('feature.souper_signup')->group(function () {
    // Public: anonymous visitors filling the signup form need a challenge
    // before they can submit, so this is deliberately unauthenticated and
    // uncapped.
    Route::get('/altcha', AltchaController::class);

    // Public: anyone may reserve a place. Anti-abuse is the honeypot plus the
    // proof-of-work challenge above, not authentication.
    Route::post('/signups', [SignupController::class, 'store']);

    // Admin-only, and the exact opposite of the POST above: the summary and the
    // xlsx export list every guest's name, address, phone and email.
    // `view_summary` is held by `admin` alone — the capability matrix is not a
    // hierarchy, so `user`/`moderator` (who may `respond`) are refused here.
    // The feature gate runs FIRST (group middleware precedes the route's own),
    // so a disabled server 404s an anonymous caller rather than 401ing them,
    // which is what keeps the route indistinguishable from an absent one.
    Route::middleware(['auth:sanctum', 'capability:view_summary'])
        ->get('/signups', [SignupController::class, 'index']);
});

// Public: planning_repet.js and sinscrire.js both fetch the events list before
// the visitor has logged in, so this must not require authentication. A
// logged-in caller additionally gets their OWN response on each event; there is
// deliberately no parameter naming a user, which is what keeps a
// previously-fixed IDOR closed. See EventController::index().
Route::get('/events', [EventController::class, 'index']);

// Admin-only, and the exact opposite of the GET above: reading the planning is
// public, changing it needs `manage_events`, which `admin` alone holds. The
// capability matrix is not a hierarchy, so `user`/`moderator` (who may
// `respond`) are refused here. auth:sanctum is paired with it so an anonymous
// caller gets 401, not 403.
//
// The id is a `/events/{id}` path parameter on both writes below, constrained
// to digits by whereNumber() so the OpenAPI generator can see it as a normal
// path parameter and a generated TypeScript client gets a real way to say
// which event to update. Previously PUT took the id in the request BODY and
// DELETE took it from the QUERY STRING — two different shapes that only
// existed because that is what planning_repet.js happened to send for each;
// EventController::update()/destroy() no longer need to extract or validate
// it themselves, since whereNumber() guarantees the controller only ever sees
// a present, numeric id.
Route::middleware(['auth:sanctum', 'capability:manage_events'])->group(function () {
    Route::post('/events', [EventController::class, 'store']);
    Route::put('/events/{id}', [EventController::class, 'update'])->whereNumber('id');
    Route::delete('/events/{id}', [EventController::class, 'destroy'])->whereNumber('id');
});

// A member records THEIR OWN answer. `respond` is held by `user`/`moderator`
// alone — the capability matrix is not a hierarchy, so `admin` (the Team
// Direction, who organises events but does not vote in them) is refused here,
// which is what keeps the summary's "Pas de réponse" count meaningful.
// auth:sanctum is paired with it so an anonymous caller gets 401, not 403. The
// answering user comes from the session; no route parameter or body field names
// one. See ResponseController::store().
Route::middleware(['auth:sanctum', 'capability:respond'])
    ->post('/responses', [ResponseController::class, 'store']);

// Admin-only, and the exact opposite of the POST above: writing your own answer
// is `respond`, reading the whole band's answers is `view_summary`, which
// `admin` alone holds. Same path, opposite holders.
Route::middleware(['auth:sanctum', 'capability:view_summary'])
    ->get('/responses', [ResponseController::class, 'index']);

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);
});

// Token-gated (not session-gated): the deploy tooling calls this server-side
// with the shared MIGRATE_TOKEN, so it must not require an authenticated user.
// Excluded from the OpenAPI document: the generated TypeScript client is for the
// browser, and nothing in the browser may trigger a migration.
Route::post('/migrate', MigrateController::class);
