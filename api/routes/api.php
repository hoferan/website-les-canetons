<?php

use App\Http\Controllers\Api\AccountPasswordController;
use App\Http\Controllers\Api\AgendaController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BandController;
use App\Http\Controllers\Api\BookingReadController;
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
use App\Http\Controllers\Api\MyRegistrationController;
use App\Http\Controllers\Api\PhotoSlotController;
use App\Http\Controllers\Api\RegistrationController;
use App\Http\Controllers\Api\RegistrationOptionController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\RolePermissionController;
use App\Http\Controllers\Api\SectionController;
use App\Http\Middleware\RunPendingMigrations;
use App\Models\PhotoSlot;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

// Public: the SPA reads the environment from it before its first render. It
// carries no secrets (see ConfigController).
Route::get('/config', ConfigController::class);

// Public: the signed stamp every anonymous form sends back
// (App\Support\FormToken). It is fetched before the visitor submits anything,
// and grants nothing on its own. Throttled with the public writes, since
// minting is the first step of the loop that limiter stops and an open
// endpoint lets a caller bank tokens.
Route::middleware('throttle:public-write')->group(function () {
    Route::get('/form-token', FormTokenController::class);
});

// Public, anonymous writes. Both need honeypot plus submit timing (ADR 0019).
// The throttle matters most: the stamp is not bound to a caller and replays
// for two hours, so without it one token buys unlimited submissions, and each
// registration mails an address the caller chose through the band's own
// mailbox. A blacklisted sending domain is not something the committee can
// repair.
// `idempotent` comes last so a replay still costs a valid form token and a
// rate-limit slot. The key is required: a guest tapping Book twice on a stalled
// connection is exactly the case it covers.
Route::middleware(['throttle:public-write', 'public-write', 'idempotent'])->group(function () {
    Route::post('/contact', ContactController::class);

    // Public event registration (ADR 0020). Guests are not band members.
    // `event.published:everyone` makes a draft a 404 for every caller,
    // managers included, before validation, so an empty body cannot reveal
    // that the draft exists.
    Route::post('/events/{event}/registrations', [RegistrationController::class, 'store'])
        ->middleware('event.published:everyone');
});

// Public: what the booking form needs to render. It answers 404 for an event
// that takes no registrations, so it cannot enumerate the band's planning.
Route::get('/events/{event}/registration', [RegistrationController::class, 'form'])
    ->middleware('event.published:everyone');

// Public reads below are not behind the `public-write` throttle. They serve
// what the band would print on a flyer, and a limiter would break the site for
// a school whose pupils share one address.
//
// Public: the band's upcoming public events, the only reader of `is_public`.
// The flag defaults to false, so a rehearsal stays off the list unless
// somebody decides otherwise.
Route::get('/agenda', [AgendaController::class, 'index']);

// Public: a parent reads it before signing a child up.
Route::get('/history', [HistoryEntryController::class, 'index']);

// Public: the two people-pages, generated from the roster (ADR 0015). They list
// only the people who consented to appear; the filter lives in the relations
// and the query, never in a caller.
Route::get('/band', [BandController::class, 'index']);
Route::get('/committee', [CommitteeController::class, 'index']);

// Public: every photo slot that shows a photo. Nothing here depends on who asks.
Route::get('/photo-slots', [PhotoSlotController::class, 'index']);

// Public: one size of a library photo (#105). Nothing is listed; the path is
// the lower-case SHA-256 of the size's bytes, so a file is reachable only from
// a URL a page or the library handed out, and each size has one URL, one cache
// entry and one tag.
//
// Outside the authenticated group, which adds `no-store`: the bytes behind a
// path never change, so this answers `immutable` for a year.
//
// Stateless: an <img> load sends a same-origin Referer, so Sanctum would start
// a session and put the session cookie under a cacheable Cache-Control.
//
// Without RunPendingMigrations: a page of photos is a burst of parallel
// requests against a host that allows ten connections. GET /config still
// migrates a fresh deploy before any page asks for a photo.
//
// No rate limit: the throttle counts in the `database` cache store and would
// add queries to every photo. The cost is bounded by the year of caching, a
// 304 that touches no database, and one indexed read whose connection closes
// before the bytes are sent.
Route::get('/images/{sha256}.jpg', ImageFileController::class)
    ->where('sha256', '[0-9a-f]{64}')
    ->withoutMiddleware([EnsureFrontendRequestsAreStateful::class, RunPendingMigrations::class]);

// Public: the caller has no session yet.
Route::post('/login', [AuthController::class, 'login']);

// `no-store` on the whole authenticated group: every response depends on who
// asks, and a shared proxy could serve one member's view to another (ADR 0010).
// One middleware, so a new endpoint cannot forget it. `auth:sanctum` here is
// what makes an anonymous caller get 401 rather than 403 from the gates below.
Route::middleware(['auth:sanctum', 'no-store'])->group(function () {
    // Session only: these two and the inbox are the only routes in this group
    // without a `permission:` gate. Logging out works for whoever is logged
    // in, and /me is how a client learns what the caller holds.
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // One's own password: `account.manage`, granted to every account by the
    // baseline role. Every first login lands here. The controller re-verifies
    // the current password through the throttled Reauthentication.
    Route::post('/me/password', AccountPasswordController::class)
        ->middleware('permission:account.manage');

    // `permission:` never sees a role name (ADR 0014).
    // The role list has two readers, either of whom may hold only one of these:
    // the roster form assigns roles, the role editor shapes them. This is the
    // one route in the file that accepts either permission.
    Route::get('/roles', [RoleController::class, 'index'])
        ->middleware('permission:members.manage,roles.manage');

    // The role editor (#194): what a role is called and what it grants, a
    // different job from who holds it (members.manage, below). Every write is
    // conditional on the role's tag, which covers its holders, and the
    // controller calls AccessIntegrity on every write that can change who
    // holds a permission.
    Route::middleware('permission:roles.manage')->group(function () {
        Route::get('/roles/{role}', [RoleController::class, 'show'])
            ->middleware('etag:role');
        Route::post('/roles', [RoleController::class, 'store']);
        Route::patch('/roles/{role}', [RoleController::class, 'update'])
            ->middleware('etag:role');
        // PUT and replace-all, like /members/{member}/roles: an "add this one"
        // API cannot express removal, which the lockout rule exists for.
        Route::put('/roles/{role}/permissions', RolePermissionController::class)
            ->middleware('etag:role');
        Route::delete('/roles/{role}', [RoleController::class, 'destroy'])
            ->middleware('etag:role');
    });

    Route::middleware('permission:members.manage')->group(function () {
        // The registers (#276), kept by whoever assigns members to them. A
        // register grants nothing, so no write here can lock anybody out.
        Route::get('/sections', [SectionController::class, 'index']);
        Route::post('/sections', [SectionController::class, 'store']);

        // Before the parameterised routes, so `order` never binds as an id.
        // No `etag:`: the body is the whole order, see the controller.
        Route::put('/sections/order', [SectionController::class, 'reorder']);

        Route::get('/sections/{section}', [SectionController::class, 'show'])
            ->whereNumber('section')
            ->middleware('etag:section');
        Route::patch('/sections/{section}', [SectionController::class, 'update'])
            ->whereNumber('section')
            ->middleware('etag:section');
        Route::delete('/sections/{section}', [SectionController::class, 'destroy'])
            ->whereNumber('section')
            ->middleware('etag:section');

        // The committee's seats. Gated rather than public beside /committee:
        // that page shows only a name and a heading, and the reference table
        // is the roster form's business.
        Route::get('/committee-functions', [CommitteeFunctionController::class, 'index']);

        // The roster. Every member has an account (ADR 0015), so this is the
        // only list of people.
        Route::get('/members', [MemberController::class, 'index']);

        // One person, read for its tag. The roster list hands out none (one
        // tag cannot validate forty-five members), so an edit starts by
        // reading the member, which sets the concurrency window to "while this
        // form was open".
        Route::get('/members/{member}', [MemberController::class, 'show'])
            ->middleware('etag:member');

        // Every member has an account, so creating one mints a generated
        // password and returns it once. Neither write re-authenticates: a
        // password prompt on every corrected typo trains away the caution the
        // destructive dialogs rely on.
        Route::post('/members', [MemberController::class, 'store']);
        Route::patch('/members/{member}', [MemberController::class, 'update'])
            ->middleware('etag:member');

        // The two destructive writes. Both check the lockout invariants and
        // end the target's sessions in the same transaction as the change, so
        // a revoked permission or a deleted member cannot keep a live session.
        // Neither re-authenticates (ADR 0017); the guard on a delete is the
        // type-the-name confirmation in the UI.
        //
        // Replacing roles is PUT: roleIds is the complete set, and an "add
        // this one" API cannot express removal, which the invariants exist for.
        //
        // Both are conditional on `etag:member` because they change who may
        // do what, and a lost update here silently discards one
        // administrator's grant. The member facet is computed over the
        // rendered MemberResource, `roleIds` included, because roles live in a
        // pivot table and a role change does not move `members.updated_at`.
        Route::put('/members/{member}/roles', MemberRoleController::class)
            ->middleware('etag:member');
        Route::delete('/members/{member}', [MemberController::class, 'destroy'])
            ->middleware('etag:member');

        // Issuing a credential and resetting one are the same operation
        // (ADR 0016).
        Route::post('/members/{member}/password', MemberPasswordController::class);
    });

    // The planning: `events.view`, which everybody holds through the baseline
    // role (ADR 0014).
    Route::get('/events', [EventController::class, 'index'])
        ->middleware('permission:events.view');

    // Hands out `etag:event` for the conditional writes below. The list hands
    // out none (one tag cannot validate thirty events), so an edit starts by
    // reading its event.
    //
    // `event.published`: a draft is a 404 for anybody without events.manage,
    // here and on every route below that takes an {event}.
    Route::get('/events/{event}', [EventController::class, 'show'])
        ->middleware(['etag:event', 'event.published', 'permission:events.view']);

    // Writing the planning: `events.manage`.
    //
    // `event.published` comes before `permission:` in every group that takes
    // an {event}. In the other order a caller without the permission gets 403
    // for a draft and 404 for an unknown id, and can count the drafts.
    Route::middleware(['event.published', 'permission:events.manage'])->group(function () {
        Route::post('/events', [EventController::class, 'store']);

        // Before the parameterised routes. Nothing collides today (`series`
        // is a POST and `/events/{event}` is not), but this order stays
        // correct if either gains the other's verb.
        //
        // A generator: it writes N independent events and stores no rule and
        // no series_id, so there is nothing to GET.
        Route::post('/events/series', EventSeriesController::class);

        Route::patch('/events/{event}', [EventController::class, 'update'])
            ->middleware('etag:event');

        // Publishing is its own act rather than a PATCH field: a draft is
        // saved as often as anybody likes and shown to the band once. DELETE
        // unpublishes, and is refused once anybody has answered.
        Route::post('/events/{event}/publish', [EventController::class, 'publish'])
            ->middleware('etag:event');
        Route::delete('/events/{event}/publish', [EventController::class, 'unpublish'])
            ->middleware('etag:event');

        // No re-authentication (ADR 0017); the confirmation in the UI guards
        // against a mis-aimed tap.
        Route::delete('/events/{event}', [EventController::class, 'destroy'])
            ->middleware('etag:event');
    });

    // The event tags (#107). Reading them takes `events.view`, since the
    // planning's filter needs the list; changing them takes `events.manage`.
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
    // from: `history.manage`.
    Route::middleware('permission:history.manage')->group(function () {
        Route::get('/history/{historyEntry}', [HistoryEntryController::class, 'show'])
            ->middleware('etag:history');
        Route::post('/history', [HistoryEntryController::class, 'store']);
        Route::put('/history/{historyEntry}', [HistoryEntryController::class, 'update'])
            ->middleware('etag:history');
        Route::delete('/history/{historyEntry}', [HistoryEntryController::class, 'destroy'])
            ->middleware('etag:history');
    });

    // The photo library (#105): `images.manage` for all of it, since
    // uploading, browsing and deleting are one person's job.
    Route::middleware('permission:images.manage')->group(function () {
        Route::get('/images', [ImageController::class, 'index']);

        // Before `/images/{image}`, so `summary` never binds as an id even
        // without the number constraint.
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

        // One slot per write, chosen on the page that shows it; the name is
        // free within PhotoSlot::KEY. No `etag:`: each write is one value, so
        // there is nothing to lose half of (see ConditionalWrite).
        Route::put('/photo-slots/{slot}', [PhotoSlotController::class, 'update'])
            ->where('slot', PhotoSlot::KEY);
    });

    // Answering for yourself: `attendance.respond`, held through `musician`
    // beside any other role (ADR 0014); the register grants nothing. Holding
    // it also puts somebody on the chase list and into the planning's counts.
    //
    // PUT is an idempotent upsert. DELETE is undo and expires after five
    // minutes, so withdrawing a yes still costs a reason (ADR 0018).
    Route::middleware(['event.published', 'permission:attendance.respond'])->group(function () {
        Route::put('/events/{event}/attendance', [AttendanceController::class, 'update']);
        Route::delete('/events/{event}/attendance', [AttendanceController::class, 'destroy']);
    });

    // A member's own booking on a form for members only (ADR 0034):
    // `events.view`, which every account holds, because any account may fill
    // one in. `event.published:everyone` hides a draft's form from its
    // managers too, as on the public booking routes.
    //
    // No `etag:`, like answering an event above: a member writes only their
    // own booking, and the committee's corrections touch other fields. It
    // would also break the ADR 0031 lock, which must open the transaction:
    // ConditionalWrite reads the tag first and fixes the snapshot.
    Route::middleware(['event.published:everyone', 'permission:events.view'])->group(function () {
        Route::get('/events/{event}/my-registration', [MyRegistrationController::class, 'show']);
        Route::put('/events/{event}/my-registration', [MyRegistrationController::class, 'put']);
        Route::delete('/events/{event}/my-registration', [MyRegistrationController::class, 'destroy']);
    });

    // The chase list: who has not answered. `attendance.view_all`, separate
    // from answering.
    Route::middleware(['event.published', 'permission:attendance.view_all'])->group(function () {
        Route::get('/events/{event}/attendance', [AttendanceController::class, 'index']);
    });

    // Answering on somebody's behalf, after a phone call to the committee:
    // `attendance.record_for_others`, separate from viewing the list because
    // roles may grant one without the other. Refuses its own caller (ADR 0018).
    Route::middleware(['event.published', 'permission:attendance.record_for_others'])->group(function () {
        Route::put('/events/{event}/attendance/{member}', [MemberAttendanceController::class, 'update']);

        // Takes back a mis-aimed on-behalf answer. The member's own
        // five-minute undo clock starts when the direction wrote it.
        Route::delete('/events/{event}/attendance/{member}', [MemberAttendanceController::class, 'destroy']);
    });

    // The guest list, read only: `registrations.view`, which `committee` holds
    // so somebody can look at the list without being able to delete from it.
    Route::middleware(['event.published', 'permission:registrations.view'])->group(function () {
        Route::get('/events/{event}/registrations', [RegistrationController::class, 'index']);

        // The same list as a file. An unknown `{format}` is a 404 from the
        // router and never reaches the controller.
        Route::get('/events/{event}/registrations.{format}', GuestListExportController::class)
            ->where('format', 'xlsx|csv|md|json');

        // The committee's shared read mark on this list (ADR 0035). Reading
        // the list is enough: marking it read changes no booking. No `etag:`
        // facet, because `upTo` and `mark` already carry what the screen saw:
        // a stale screen can neither swallow a newer booking nor undo a
        // colleague's newer read.
        Route::get('/events/{event}/booking-read', [BookingReadController::class, 'show']);
        Route::put('/events/{event}/booking-read', [BookingReadController::class, 'mark']);
        Route::delete('/events/{event}/booking-read', [BookingReadController::class, 'unmark']);
    });

    // Correcting and cancelling a booking: `registrations.manage`. Guests get
    // no self-service (ADR 0020), so this is the committee acting on somebody's
    // personal data.
    Route::middleware('permission:registrations.manage')->group(function () {
        // Hands out the tag the two writes below require. Gated with them:
        // the guest list already shows readers everything.
        Route::get('/registrations/{registration}', [RegistrationController::class, 'show'])
            ->middleware('etag:registration');

        Route::patch('/registrations/{registration}', [RegistrationController::class, 'update'])
            ->middleware('etag:registration');
        Route::delete('/registrations/{registration}', [RegistrationController::class, 'destroy'])
            ->middleware('etag:registration');
    });

    // Session only, the third exception after /logout and /me. Each source
    // still requires its permission, and the inbox filters by them instead of
    // refusing, so the nav can ask for the count unconditionally (see
    // InboxRegistry).
    //
    // A future `/inbox/{anything}` must go below `/inbox/summary`.
    Route::get('/inbox/summary', [InboxController::class, 'summary']);
    Route::get('/inbox', [InboxController::class, 'index']);

    // The contact inbox, read only: `messages.view`, which `committee` holds
    // because a prestation enquiry is committee business.
    Route::middleware('permission:messages.view')->group(function () {
        Route::get('/contact-messages', [ContactMessageController::class, 'index']);

        // Hands out the tag the writes below require. Gated with the readers,
        // unlike /registrations/{id}, because it is also how a screen shows the
        // message body.
        Route::get('/contact-messages/{contactMessage}', [ContactMessageController::class, 'show'])
            ->middleware('etag:contact_message');
    });

    // Clearing the inbox: `messages.manage`. Binning a stranger's message is
    // direction's call, not the committee's.
    Route::middleware('permission:messages.manage')->group(function () {
        Route::patch('/contact-messages/{contactMessage}', [ContactMessageController::class, 'handle'])
            ->middleware('etag:contact_message');
        Route::delete('/contact-messages/{contactMessage}', [ContactMessageController::class, 'destroy'])
            ->middleware('etag:contact_message');
    });

    // What an event offers is part of the event, so this takes events.manage
    // rather than a registration permission. PUT and replace-all, like
    // /members/{member}/roles: an "add one" API cannot express removal.
    Route::middleware(['event.published', 'permission:events.manage'])->group(function () {
        // `etag:event.options` is computed over the option list itself. The
        // options are absent from EventResource, so `etag:event` would miss
        // every option change and refuse an options edit after an unrelated
        // change to the event.
        Route::get('/events/{event}/registration-options', [RegistrationOptionController::class, 'index'])
            ->middleware('etag:event.options');

        Route::put('/events/{event}/registration-options', [RegistrationOptionController::class, 'replace'])
            ->middleware('etag:event.options');
    });
});
