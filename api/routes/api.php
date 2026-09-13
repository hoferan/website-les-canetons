<?php

use App\Http\Controllers\Api\AccountPasswordController;
use App\Http\Controllers\Api\AgendaController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BandController;
use App\Http\Controllers\Api\CommitteeController;
use App\Http\Controllers\Api\ConfigController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\EventSeriesController;
use App\Http\Controllers\Api\FormTokenController;
use App\Http\Controllers\Api\GuestListExportController;
use App\Http\Controllers\Api\MemberAttendanceController;
use App\Http\Controllers\Api\MemberController;
use App\Http\Controllers\Api\MemberPasswordController;
use App\Http\Controllers\Api\MemberRoleController;
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
// IDEMPOTENT AS WELL, and `idempotent` comes LAST of the three on purpose. A
// replay still costs a valid form token and a slot in the rate limit, so a
// stored key cannot be used to walk past the anti-abuse guard; a genuine retry
// arrives seconds later carrying the same token, which stays valid for two
// hours. The key is REQUIRED on both — a guest tapping Book twice on a stalled
// connection is the failure, and a protection that only covers the clients who
// remembered to opt in protects the ones that did not need it.
Route::middleware(['throttle:public-write', 'public-write', 'idempotent'])->group(function () {
    Route::post('/contact', ContactController::class);

    // Public event registration — the souper, generalised (D9). Anonymous
    // by design: the people booking a place are not band members.
    Route::post('/events/{event}/registrations', [RegistrationController::class, 'store']);
});

// Public: what the booking form needs to render itself. A GET, so it is not
// behind the write guard — but it answers 404 for an event that takes no
// registrations, so it cannot be used to enumerate the band's planning.
Route::get('/events/{event}/registration', [RegistrationController::class, 'form']);

// Public: the two people-pages of the public site, generated from the roster
// rather than authored (design §8, R2). Both are read-only and both list ONLY
// the people who have consented to appear — the filter lives in the relations
// and the query, never in a caller.
//
// NOT BEHIND THE `public-write` THROTTLE, which fronts the anonymous WRITES.
// These are reads of the same forty-five rows the band prints on a flyer, so a
// limiter here would buy nothing and would break the site for a school whose
// pupils share one address.
// Public: what the band is doing next, and the ONLY thing that has ever read
// `is_public`. The column has been settable since R1c-1 and meant nothing
// until now — a rehearsal stays off this list because the flag defaults to
// false, so appearing in public is a decision somebody made about an event
// rather than the default for the whole diary.
Route::get('/agenda', [AgendaController::class, 'index']);

Route::get('/band', [BandController::class, 'index']);
Route::get('/committee', [CommitteeController::class, 'index']);

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

        // ONE PERSON, and it exists because of the conditional writes below.
        // The roster list hands out no tag — one tag cannot validate forty-five
        // members — so editing somebody starts by reading them, which is also
        // the right concurrency window: "while this form was open". Rendering
        // the row from the list and writing without a read would be the lost
        // update again, one screen further back.
        Route::get('/members/{member}', [MemberController::class, 'show'])
            ->middleware('etag:member');

        // Creating a person creates an ACCOUNT: every member has one, so this
        // mints a generated password and returns it once. No re-authentication
        // on either write — neither is destructive, and a password prompt on
        // every corrected typo trains the reflex the destructive dialogs rely
        // on.
        Route::post('/members', [MemberController::class, 'store']);
        Route::patch('/members/{member}', [MemberController::class, 'update'])
            ->middleware('etag:member');

        // THE DESTRUCTIVE TWO. Both check the lockout invariants before
        // writing, and both end the target's sessions inside the same
        // transaction as the change — a revoked permission that waits for the
        // next login is one the holder keeps using all evening, and a deleted
        // member with a live session is theatre.
        //
        // NEITHER RE-AUTHENTICATES, and this comment said the opposite until
        // 2026-09-10. Decision B1 did require `currentPassword` on both;
        // decision B7 removed it, and the guard on a delete is now the
        // type-the-name confirmation in the UI. Verified rather than assumed:
        // `currentPassword` appears nowhere in app/ outside
        // AccountPasswordController, and App\Support\Reauthentication has
        // exactly one caller. The stale claim was believed by a documentation
        // pass and nearly published to /api/docs.
        //
        // Replacing roles is PUT, not PATCH: roleIds is the complete set, and
        // an "add this one" API cannot express removal — which is the half the
        // invariants exist for.
        //
        // BOTH ARE CONDITIONAL (`etag:member`), and these two are why the
        // machinery was worth building. They are the writes that change WHO
        // MAY DO WHAT, and a lost update here is not a wrong start time — it
        // is one administrator's grant silently discarded by another's, on a
        // host with no shell to notice it from. The member facet is computed
        // over the rendered MemberResource, `roleIds` included, precisely so a
        // role change moves the tag: `members.updated_at` does not, because
        // roles live in a pivot table.
        Route::put('/members/{member}/roles', MemberRoleController::class)
            ->middleware('etag:member');
        Route::delete('/members/{member}', [MemberController::class, 'destroy'])
            ->middleware('etag:member');

        // Issuing a credential and resetting one are the same operation (§4.4).
        Route::post('/members/{member}/password', MemberPasswordController::class);
    });

    // The planning. NO PERMISSION: reading it is something everybody in the
    // band does, not something the committee administers — gating it would
    // be the same mistake as gating the ability to answer for an event.
    // auth:sanctum alone (inherited from the group) is enough to keep it
    // members-only.
    Route::get('/events', [EventController::class, 'index']);

    // CARRIES `etag:event`, and that is what makes the two conditional writes
    // below usable at all: this is where a client gets the tag it has to quote
    // back. The list does not hand one out — one tag cannot validate thirty
    // events — so an edit starts by reading the one event it is about, which
    // is also the correct concurrency window: "while this form was open".
    Route::get('/events/{event}', [EventController::class, 'show'])
        ->middleware('etag:event');

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

        Route::patch('/events/{event}', [EventController::class, 'update'])
            ->middleware('etag:event');

        // No re-authentication on the delete, unlike the roster's — the call
        // MemberController::destroy() documents (decision B7), and an event
        // carries none of a member's account state. Protection against a
        // mis-aimed tap is the confirmation in the UI.
        Route::delete('/events/{event}', [EventController::class, 'destroy'])
            ->middleware('etag:event');
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
        // The read that hands out the tag the two writes below require. Gated
        // with them rather than with `registrations.view`, because it exists
        // for the people who amend a booking, not for the people who count
        // them — and the guest list already shows the committee everything.
        Route::get('/registrations/{registration}', [RegistrationController::class, 'show'])
            ->middleware('etag:registration');

        Route::patch('/registrations/{registration}', [RegistrationController::class, 'update'])
            ->middleware('etag:registration');
        Route::delete('/registrations/{registration}', [RegistrationController::class, 'destroy'])
            ->middleware('etag:registration');
    });

    // What an event OFFERS is part of the event, so this is events.manage
    // rather than a registration permission — the same act as setting its
    // date. PUT and replace-all, matching /members/{member}/roles: an "add
    // one" API cannot express removal.
    Route::middleware('permission:events.manage')->group(function () {
        // ITS OWN FACET, not the event's. The options are absent from
        // EventResource, so conditioning this write on `etag:event` would both
        // miss every option change — the tag would not move, and a lost update
        // would go straight through — and refuse a perfectly good options edit
        // because somebody corrected the event's dress code. `etag:event.options`
        // is computed over the option list itself.
        Route::get('/events/{event}/registration-options', [RegistrationOptionController::class, 'index'])
            ->middleware('etag:event.options');

        Route::put('/events/{event}/registration-options', [RegistrationOptionController::class, 'replace'])
            ->middleware('etag:event.options');
    });
});
