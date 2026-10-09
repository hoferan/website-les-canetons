<?php

use App\Http\Controllers\Api\AccountPasswordController;
use App\Http\Controllers\Api\AgendaController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BandController;
use App\Http\Controllers\Api\CommitteeController;
use App\Http\Controllers\Api\CommitteeFunctionController;
use App\Http\Controllers\Api\ConfigController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\ContactMessageController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\EventSeriesController;
use App\Http\Controllers\Api\EventTagController;
use App\Http\Controllers\Api\FormTokenController;
use App\Http\Controllers\Api\GuestListExportController;
use App\Http\Controllers\Api\HistoryEntryController;
use App\Http\Controllers\Api\ImageController;
use App\Http\Controllers\Api\ImageFileController;
use App\Http\Controllers\Api\InboxController;
use App\Http\Controllers\Api\MemberAttendanceController;
use App\Http\Controllers\Api\MemberController;
use App\Http\Controllers\Api\MemberPasswordController;
use App\Http\Controllers\Api\MemberRoleController;
use App\Http\Controllers\Api\PhotoSlotController;
use App\Http\Controllers\Api\RegistrationController;
use App\Http\Controllers\Api\RegistrationOptionController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SectionController;
use App\Http\Middleware\RunPendingMigrations;
use App\Models\PhotoSlot;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

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
// NOW GUARDED. Honeypot plus submit-timing is required on both public write
// endpoints (ADR 0019), and this one had neither until the registration
// endpoint arrived with the middleware that covers them both.
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

    // Public event registration — the souper, generalised (ADR 0020).
    // Anonymous by design: the people booking a place are not band members.
    //
    // `event.published:everyone`: a draft is a 404 here for ALL callers, a
    // logged-in manager included, and the 404 comes before validation so an
    // empty body cannot tell a stranger the draft exists.
    Route::post('/events/{event}/registrations', [RegistrationController::class, 'store'])
        ->middleware('event.published:everyone');
});

// Public: what the booking form needs to render itself. A GET, so it is not
// behind the write guard — but it answers 404 for an event that takes no
// registrations, so it cannot be used to enumerate the band's planning.
Route::get('/events/{event}/registration', [RegistrationController::class, 'form'])
    ->middleware('event.published:everyone');

// Public: the two people-pages of the public site, generated from the roster
// rather than authored (ADR 0015). Both are read-only and both list ONLY
// the people who have consented to appear — the filter lives in the relations
// and the query, never in a caller.
//
// NOT BEHIND THE `public-write` THROTTLE, which fronts the anonymous WRITES.
// These are reads of the same forty-five rows the band prints on a flyer, so a
// limiter here would buy nothing and would break the site for a school whose
// pupils share one address.
// Public: what the band is doing next, and the ONLY thing that has ever read
// `is_public`. The column was settable before anything read it, and meant
// nothing until this endpoint existed — a rehearsal stays off this list
// because the flag defaults to false, so appearing in public is a decision
// somebody made about an event rather than the default for the whole diary.
Route::get('/agenda', [AgendaController::class, 'index']);

// The band's history. PUBLIC: it is the page a parent reads before signing a
// child up, and it holds nothing the band would not print on a flyer.
Route::get('/history', [HistoryEntryController::class, 'index']);

Route::get('/band', [BandController::class, 'index']);
Route::get('/committee', [CommitteeController::class, 'index']);

// Every photo slot that shows a photo, wherever it is on the site. PUBLIC,
// like /band beside it, and outside the authenticated group for the same
// reason: nothing here depends on who asks.
Route::get('/photo-slots', [PhotoSlotController::class, 'index']);

// One size of a library photo (#105). PUBLIC, because the public pages show
// these photos to anybody. Nothing is listed here: the path names the SHA-256
// of the size's own bytes, so a file is reachable only by somebody who already
// has its URL from a page or from the library.
//
// OUTSIDE THE AUTHENTICATED GROUP, because that group adds `no-store`. The
// bytes behind a path never change, so this answers `immutable` for a year.
//
// STATELESS. A browser loading an <img> sends a same-origin Referer, so
// Sanctum would start a session for it, and the response would carry the
// visitor's session cookie under a Cache-Control that lets any cache keep it.
//
// WITHOUT RunPendingMigrations, so a photo costs one query and a revalidation
// none. A page of photos is a burst of parallel requests against a host that
// allows ten connections, and each would otherwise also read the migrations
// table. The SPA's own first call, GET /config, still migrates a fresh deploy
// before any page asks for a photo.
//
// NO RATE LIMIT, deliberately. A throttle counts in the `database` cache
// store, so it would add queries to every photo, against the same ten
// connections it was meant to protect. What bounds the cost instead: a
// year of `immutable` caching, a 304 that touches no database, and one
// indexed read whose connection closes before the bytes are sent.
// The path is the SHA-256 of the size's own bytes, in lower case only, so a
// size has one URL, one cache entry and one tag.
Route::get('/images/{sha256}.jpg', ImageFileController::class)
    ->where('sha256', '[0-9a-f]{64}')
    ->withoutMiddleware([EnsureFrontendRequestsAreStateful::class, RunPendingMigrations::class]);

Route::post('/login', [AuthController::class, 'login']);

// `no-store` on the whole authenticated group: every response below depends on
// who is asking, and a shared proxy that cached one would serve one member's
// view to another (ADR 0010). A middleware rather than nine ->header() calls,
// so the tenth endpoint cannot forget.
Route::middleware(['auth:sanctum', 'no-store'])->group(function () {
    // SESSION ONLY. These two and the inbox further down are the only routes
    // in this group without a `permission:` gate. Logging out has to work for
    // whoever is logged in, whatever they hold. /me is how a client learns
    // what the caller holds in the first place, so gating it on a permission
    // would leave nothing to read the answer from.
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Changing one's OWN password: `account.manage`, which the baseline role
    // grants to every account. This is where every first login lands. It
    // re-verifies the current password itself, through the same throttled
    // Reauthentication the destructive endpoints use.
    Route::post('/me/password', AccountPasswordController::class)
        ->middleware('permission:account.manage');

    // Member administration. `permission:` never sees a role name: roles merely
    // group permissions, and which role granted this one is not a question the
    // enforcement point may ask (ADR 0014). Paired with auth:sanctum so an
    // anonymous caller gets 401 rather than 403.
    Route::middleware('permission:members.manage')->group(function () {
        // Read-only reference data the roster form needs. Gated on
        // members.manage because /members is the only consumer that exists;
        // a second consumer can widen it when there is one.
        Route::get('/sections', [SectionController::class, 'index']);
        Route::get('/roles', [RoleController::class, 'index']);

        // The committee's seats. Gated with the other two rather than made
        // public alongside /committee: that page projects a member down to a
        // name and a heading, and the reference table is the roster form's
        // business.
        Route::get('/committee-functions', [CommitteeFunctionController::class, 'index']);

        // The roster. Everyone the band tracks, and since 2026_09_08_000001
        // every one of them has an account (ADR 0015), so there is one list of
        // people and no second list of accounts beside it.
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
        // 2026-09-10. Both did once require `currentPassword`; that was
        // dropped on 2026-09-08 (ADR 0017), and the guard on a delete is now
        // the type-the-name confirmation in the UI. Verified rather than
        // assumed: `currentPassword` appears nowhere in app/ outside
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

        // Issuing a credential and resetting one are the same operation
        // (ADR 0016).
        Route::post('/members/{member}/password', MemberPasswordController::class);
    });

    // The planning: `events.view`. Everybody in the band reads it, and
    // everybody holds it through the baseline role, the same way any other
    // ability is held (ADR 0014).
    Route::get('/events', [EventController::class, 'index'])
        ->middleware('permission:events.view');

    // CARRIES `etag:event`, and that is what makes the two conditional writes
    // below usable at all: this is where a client gets the tag it has to quote
    // back. The list does not hand one out — one tag cannot validate thirty
    // events — so an edit starts by reading the one event it is about, which
    // is also the correct concurrency window: "while this form was open".
    //
    // `event.published`: a draft is a 404 for anybody without events.manage,
    // here and on every other route below that takes an {event}. It comes
    // before `permission:` for the reason given at the group below.
    Route::get('/events/{event}', [EventController::class, 'show'])
        ->middleware(['etag:event', 'event.published', 'permission:events.view']);

    // Writing the planning IS administration, unlike reading it. Nested
    // inside the auth:sanctum group above so an anonymous caller gets 401
    // rather than 403 — the same pairing the members.manage group makes, and
    // for the same reason: "log in" and "you may not" are different answers
    // and the SPA acts on each differently.
    //
    // `event.published` comes BEFORE `permission:` in every group below that takes
    // an {event}. In the other order a caller without the permission is told 403
    // for a draft and 404 for an id nothing matches, and can count the drafts.
    Route::middleware(['event.published', 'permission:events.manage'])->group(function () {
        Route::post('/events', [EventController::class, 'store']);

        // BEFORE the parameterised routes, deliberately. Nothing collides
        // today — `series` is a POST and `/events/{event}` is not — but a
        // literal segment and a parameter sharing a prefix is worth keeping in
        // an order that stays correct if either ever gains the other's verb.
        //
        // A GENERATOR, not a resource: it writes N independent events and
        // stores no rule and no series_id, so there is nothing here to GET.
        Route::post('/events/series', EventSeriesController::class);

        Route::patch('/events/{event}', [EventController::class, 'update'])
            ->middleware('etag:event');

        // Publishing is its own act, not a field on the PATCH: a draft is
        // saved as often as anybody likes and shown to the band once, on
        // purpose. DELETE puts it back, and is refused after anybody has
        // answered. Both carry the tag, like every other write on an event.
        Route::post('/events/{event}/publish', [EventController::class, 'publish'])
            ->middleware('etag:event');
        Route::delete('/events/{event}/publish', [EventController::class, 'unpublish'])
            ->middleware('etag:event');

        // No re-authentication on the delete, unlike the roster's — the call
        // MemberController::destroy() documents (ADR 0017), and an event
        // carries none of a member's account state. Protection against a
        // mis-aimed tap is the confirmation in the UI.
        Route::delete('/events/{event}', [EventController::class, 'destroy'])
            ->middleware('etag:event');
    });

    // The event tags (#107). Reading them takes the same permission as
    // reading the planning they label: the filter on it needs the list.
    // Changing them is planning administration, so it takes the same
    // permission as changing the events.
    Route::get('/event-tags', [EventTagController::class, 'index'])
        ->middleware('permission:events.view');
    Route::middleware('permission:events.manage')->group(function () {
        Route::get('/event-tags/{eventTag}', [EventTagController::class, 'show'])
            ->middleware('etag:event_tag');
        Route::post('/event-tags', [EventTagController::class, 'store']);
        Route::put('/event-tags/{eventTag}', [EventTagController::class, 'update'])
            ->middleware('etag:event_tag');
        Route::delete('/event-tags/{eventTag}', [EventTagController::class, 'destroy'])
            ->middleware('etag:event_tag');
    });

    // Changing the history, and the single-entry read its edit form starts
    // from. Inside auth:sanctum, so an anonymous caller gets 401, not 403.
    Route::middleware('permission:history.manage')->group(function () {
        Route::get('/history/{historyEntry}', [HistoryEntryController::class, 'show'])
            ->middleware('etag:history');
        Route::post('/history', [HistoryEntryController::class, 'store']);
        Route::put('/history/{historyEntry}', [HistoryEntryController::class, 'update'])
            ->middleware('etag:history');
        Route::delete('/history/{historyEntry}', [HistoryEntryController::class, 'destroy'])
            ->middleware('etag:history');
    });

    // The photo library (#105). One permission for the lot: uploading,
    // browsing and deleting are the same job, done by whoever looks after the
    // site's pictures.
    Route::middleware('permission:images.manage')->group(function () {
        Route::get('/images', [ImageController::class, 'index']);

        // Before `/images/{image}`. The number constraint already keeps
        // `summary` from binding as an id; the order keeps it so if the
        // constraint ever goes.
        Route::get('/images/summary', [ImageController::class, 'summary']);

        Route::get('/images/{image}', [ImageController::class, 'show'])
            ->whereNumber('image')
            ->middleware('etag:image');

        // POST, because PHP parses multipart bodies on POST only. Throttled
        // per account: every upload writes up to 1.8 MB to the database.
        Route::post('/images', [ImageController::class, 'store'])
            ->middleware('throttle:image-upload');

        Route::patch('/images/{image}', [ImageController::class, 'update'])
            ->whereNumber('image')
            ->middleware('etag:image');

        // POST for the same reason as the upload, and throttled with it: a
        // replacement writes as many bytes as an upload does.
        Route::post('/images/{image}/file', [ImageController::class, 'replace'])
            ->whereNumber('image')
            ->middleware(['throttle:image-upload', 'etag:image']);

        Route::delete('/images/{image}', [ImageController::class, 'destroy'])
            ->whereNumber('image')
            ->middleware('etag:image');

        // One slot per write, chosen on the page that shows it. The slot name
        // is the page's own and free within PhotoSlot::KEY. No `etag:`: each
        // write is one value, so there is no half of it to lose (see
        // ConditionalWrite).
        Route::put('/photo-slots/{slot}', [PhotoSlotController::class, 'update'])
            ->where('slot', PhotoSlot::KEY);
    });

    // Answering for yourself: `attendance.respond`, held through `musician`.
    // The register only groups and displays. An organiser who plays holds
    // `musician` beside their other roles, which keeps the old bug fixed
    // where an admin could not say whether they were coming (ADR 0014).
    // Holding this permission is also what puts somebody on the chase list
    // and into the planning's counts.
    //
    // PUT so the answer is an idempotent upsert; DELETE is undo, and it
    // expires after five minutes so the rule that withdrawing a yes costs a
    // reason is not decorative (ADR 0018).
    Route::middleware(['event.published', 'permission:attendance.respond'])->group(function () {
        Route::put('/events/{event}/attendance', [AttendanceController::class, 'update']);
        Route::delete('/events/{event}/attendance', [AttendanceController::class, 'destroy']);
    });

    // The chase list. Answering is every musician's; reading who has NOT
    // answered is the committee's, so it takes a permission of its own.
    Route::middleware(['event.published', 'permission:attendance.view_all'])->group(function () {
        Route::get('/events/{event}/attendance', [AttendanceController::class, 'index']);
    });

    // Answering on somebody's behalf — the phone call to the committee. A
    // SEPARATE permission from viewing the list: seeing who is missing and
    // speaking for them are different acts, and roles are editable data that
    // may well grant one without the other. Refuses its own caller (ADR 0018).
    Route::middleware(['event.published', 'permission:attendance.record_for_others'])->group(function () {
        Route::put('/events/{event}/attendance/{member}', [MemberAttendanceController::class, 'update']);

        // Taking one back. A mis-aimed on-behalf write was otherwise
        // permanent, and it starts the member's own five-minute undo clock
        // from the moment the DIRECTION wrote it.
        Route::delete('/events/{event}/attendance/{member}', [MemberAttendanceController::class, 'destroy']);
    });

    // THE GUEST LIST, and reading it is all this grants. `committee` holds
    // registrations.view as its ONLY permission — the role exists so
    // somebody can look at the list — so this token must not also authorise
    // deleting from it.
    Route::middleware(['event.published', 'permission:registrations.view'])->group(function () {
        Route::get('/events/{event}/registrations', [RegistrationController::class, 'index']);

        // The same list as a file. `{format}` is constrained here rather
        // than validated in the controller, so an unknown one is a 404 from
        // the router instead of reaching code at all.
        Route::get('/events/{event}/registrations.{format}', GuestListExportController::class)
            ->where('format', 'xlsx|csv|md|json');
    });

    // Correcting and cancelling a booking. A SEPARATE permission from
    // reading the list: guests get no self-service (ADR 0020), so this is the
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

    // THE INBOX NEEDS A SESSION AND NOTHING MORE, the third exception after
    // /logout and /me. Each of its sources still requires a permission, and
    // the inbox filters by those instead of refusing, so the nav can ask for
    // the count without first working out whether it is allowed to — see
    // InboxRegistry.
    //
    // `/inbox/summary` is written before `/inbox/{anything}` would be, if one
    // ever exists; there is no dynamic segment here today and adding one must
    // not shadow this.
    Route::get('/inbox/summary', [InboxController::class, 'summary']);
    Route::get('/inbox', [InboxController::class, 'index']);

    // THE COMMITTEE INBOX. `committee` holds messages.view as its second
    // permission — a prestation enquiry is committee business and somebody has
    // to be able to read one — so reading is all this token grants.
    Route::middleware('permission:messages.view')->group(function () {
        Route::get('/contact-messages', [ContactMessageController::class, 'index']);

        // The read that hands out the tag the writes below require. Gated with
        // the readers rather than the managers, unlike /registrations/{id}:
        // this one is also how a screen displays the message body, so the
        // people who merely read need it too.
        Route::get('/contact-messages/{contactMessage}', [ContactMessageController::class, 'show'])
            ->middleware('etag:contact_message');
    });

    // Clearing the inbox, which is a different act from reading it and a
    // different set of people: `committee` sees a prestation enquiry, and
    // binning a stranger's message is direction's call.
    Route::middleware('permission:messages.manage')->group(function () {
        Route::patch('/contact-messages/{contactMessage}', [ContactMessageController::class, 'handle'])
            ->middleware('etag:contact_message');
        Route::delete('/contact-messages/{contactMessage}', [ContactMessageController::class, 'destroy'])
            ->middleware('etag:contact_message');
    });

    // What an event OFFERS is part of the event, so this is events.manage
    // rather than a registration permission — the same act as setting its
    // date. PUT and replace-all, matching /members/{member}/roles: an "add
    // one" API cannot express removal.
    Route::middleware(['event.published', 'permission:events.manage'])->group(function () {
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
