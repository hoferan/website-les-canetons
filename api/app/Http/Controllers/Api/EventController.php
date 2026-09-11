<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEventRequest;
use App\Http\Requests\UpdateEventRequest;
use App\Http\Resources\EventResource;
use App\Models\Event;
use App\Support\Audit;
use App\Support\BandTime;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\QueryParameter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

#[Group('Events', weight: 20)]
class EventController extends Controller
{
    /**
     * List the planning.
     *
     * Any logged-in member; no permission is needed. Returns the events still
     * to come, soonest first, each carrying `myAttendance`: the caller's own
     * answer, or `null` where they have not given one.
     *
     * `?past=1` returns the history instead, the events that have already
     * happened, newest first. Any other value, or none, gives the upcoming
     * planning. The two are halves of the list rather than a list and a
     * superset of it.
     *
     * An event taking place today stays in the planning for the whole of that
     * day; it does not move to the history the moment it starts.
     */
    // `type` is the LITERAL '1', not `string`. Scramble parses this argument as
    // a PHPDoc type, so a constant string becomes an enum of one value — which
    // is the contract: send `1`, or leave the parameter off. The controller is
    // lenient about anything else on purpose (see below), and leniency is not
    // something a document should invite a client to rely on.
    #[QueryParameter(
        'past',
        'Set to `1` for the history — past events, newest first — instead of the upcoming planning. Omit it for the planning.',
        required: false,
        type: "'1'",
        example: '1',
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        // `?past=1` is the OTHER HALF of the list, not a superset of it — by
        // next carnival the full list is a hundred rehearsals to scroll past
        // on a phone. It also reverses the order, because history is read
        // backwards from now, while the planning ahead is read soonest-first.
        //
        // Anything that is not exactly the magic word '1' is the default,
        // upcoming view — the same fail-safe direction MigrateController
        // takes with its `mode` parameter: a missing, misspelled or truncated
        // value must never be the one that hides events.
        //
        // ONE eager load below, and it is the one R1c-2 was given room for:
        // the caller's own answer, constrained to them in the query.
        // MEASURED 2026-09-09 at exactly 1 query before attendance existed;
        // the join makes it 2, against the budget of 3 that
        // test_listing_the_planning_costs_a_fixed_number_of_queries has
        // always asserted. The spare room was deliberate and is now spent.
        //
        // This note lives HERE and not immediately above the return, because
        // Scramble publishes the comment directly preceding a return as the
        // 200 response description. Measured 2026-09-10: it had shipped this
        // paragraph, decision codes and test names included, to /api/docs.
        $past = $request->query('past') === '1';

        // The split is on BandTime::startOfToday(), not now(): a rehearsal
        // that began an hour ago must stay in the planning of somebody
        // running late. Pinned by
        // EventIndexTest::test_an_event_happening_today_stays_in_the_planning_all_day,
        // and mutation-tested by hand against now() — see Task 4 step 7.
        $startOfToday = BandTime::startOfToday();

        $query = $past
            ? Event::where('starts_at', '<', $startOfToday)->orderBy('starts_at', 'desc')
            : Event::where('starts_at', '>=', $startOfToday)->orderBy('starts_at', 'asc');

        return EventResource::collection(
            $query->with(self::myAttendance($request))->get()
        );
    }

    /**
     * The eager load that puts the CALLER's own answer on an event, and only
     * theirs.
     *
     * One extra query for a whole list, not one per row — and constrained to
     * the caller inside the QUERY rather than filtered afterwards, so
     * another member's answer is never loaded into memory at all. That is
     * the half a post-hoc filter gets wrong: it works, until somebody reads
     * `$event->attendance` for a different purpose and quietly gets
     * everybody's. Pinned by
     * MyAttendanceTest::test_it_never_shows_somebody_elses_answer.
     *
     * @return array<string, \Closure>
     */
    private static function myAttendance(Request $request): array
    {
        $memberId = $request->user()?->id;

        return [
            'attendance' => fn ($query) => $query->where('member_id', $memberId),
        ];
    }

    /**
     * Read one event.
     *
     * Any logged-in member; no permission is needed. Returns the event with
     * `myAttendance`, the caller's own answer or `null`.
     *
     * Works for a past event as well as an upcoming one, unlike the default
     * list. An unknown id answers `404`.
     */
    public function show(Request $request, Event $event): EventResource
    {
        // Not redundant with index(): the edit form loads through this rather
        // than hunting the list, because a past event is absent from the
        // default list entirely — finding it there would work right up until
        // somebody edited last month's rehearsal.
        //
        // Route-model binding turns an unknown id into a
        // ModelNotFoundException; Laravel's own exception handler rewrites
        // that into a 404 before any render() closure sees it (checked against
        // bootstrap/app.php — no closure there is typed on it, so this 404 is
        // the FRAMEWORK's default JSON shape, not App\Exceptions\ApiError's
        // {error, code, fields[]} contract; EventIndexTest only asserts the
        // status for that reason).
        $event->load(self::myAttendance($request));

        return new EventResource($event);
    }

    /**
     * Put a rehearsal or a gig on the planning.
     *
     * Requires `events.manage`. Answers `201` with the created event.
     *
     * `startsAt` and `endsAt` are ISO 8601 instants carrying an offset, and
     * `endsAt` must come after `startsAt` or it fails validation against that
     * field with `must_be_after`. An event spanning two days is an ordinary
     * row, not an error. `title`, `location`, `startsAt`, `endsAt` and
     * `isPublic` are required; a missing one fails validation against itself
     * with `required`.
     *
     * Setting `registrationClosesAt` is what opens the event to public
     * registration. It must come after `registrationOpensAt`, which may be
     * left null to mean the form opens as soon as the closing date is set,
     * and `registrationMaxGuests` caps how many people one booking may cover.
     */
    public function store(StoreEventRequest $request): JsonResponse
    {
        // 201 with the created row, not 204: the SPA drops the response
        // straight into the list it is already showing, and a second GET to
        // learn the id would race the next writer.
        //
        // The two timestamps go in as the SPA sent them, offset and all.
        // Turning them into UTC instants is App\Casts\UtcDateTime's job, on
        // the column — this endpoint deliberately knows nothing about it,
        // which is what makes every other writer of these columns correct too.
        $data = $request->validated();

        $event = Event::create([
            'title' => $data['title'],
            'starts_at' => $data['startsAt'],
            'ends_at' => $data['endsAt'],
            'location' => $data['location'],
            'attire' => $data['attire'] ?? null,
            'is_public' => $data['isPublic'],
            'notes' => $data['notes'] ?? null,
            'registration_opens_at' => $data['registrationOpensAt'] ?? null,
            'registration_closes_at' => $data['registrationClosesAt'] ?? null,
            'registration_max_guests' => $data['registrationMaxGuests'] ?? null,
        ]);

        // Audited, like every other privileged mutation, with the title
        // captured as the label — see App\Support\Audit for why the CALLER
        // reads it.
        Audit::record($request->user(), 'event.created', 'event', $event->id, $event->title);

        return response()->json(new EventResource($event), 201);
    }

    /**
     * Correct an event already on the planning.
     *
     * Requires `events.manage`. Send only the fields that change: an omitted
     * field is left alone, and an explicit `null` clears an optional one such
     * as `attire` or `notes`. Returns the updated event, including the
     * caller's own `myAttendance`.
     *
     * `endsAt` must still come after the start. A request that sends a new end
     * and no new start is compared against the stored `startsAt`, and fails
     * against `endsAt` with `must_be_after` if it falls before it.
     *
     * Clearing `registrationClosesAt` switches public registration off again.
     */
    public function update(UpdateEventRequest $request, Event $event): EventResource
    {
        // The fields go through array_key_exists(), not isset(): isset() is
        // false for an explicitly-sent null, so clearing the attire or the
        // notes — the committee deciding a gig is in ordinary clothes after
        // all — would answer 200 and silently change nothing.
        // MemberController::update() carries the same loop for the same
        // reason.
        //
        // (That comment there also names $request->has(). MEASURED
        // 2026-09-10: has() is in fact TRUE for an explicitly-sent null —
        // Arr::has() is array_key_exists underneath, and it is filled() that
        // reads false. So has() would work here; array_key_exists is still the
        // right shape, because it asks the question of validated() — the array
        // the rules have already vetted — rather than of the raw input.)
        //
        // The two timestamps go in as the SPA sent them, offset and all — see
        // store(), and App\Casts\UtcDateTime for why no endpoint converts
        // them.
        $data = $request->validated();

        $columns = [
            'title' => 'title',
            'startsAt' => 'starts_at',
            'endsAt' => 'ends_at',
            'location' => 'location',
            'attire' => 'attire',
            'isPublic' => 'is_public',
            'notes' => 'notes',
            'registrationOpensAt' => 'registration_opens_at',
            'registrationClosesAt' => 'registration_closes_at',
            'registrationMaxGuests' => 'registration_max_guests',
        ];

        foreach ($columns as $field => $column) {
            if (array_key_exists($field, $data)) {
                $event->{$column} = $data[$field];
            }
        }

        $event->save();

        // Audited with the NEW title: a row still labelled with the old one
        // names an event that no longer exists under that name.
        Audit::record($request->user(), 'event.updated', 'event', $event->id, $event->title);

        // Loaded explicitly: an organiser who also plays has their own answer
        // on this event, and a response reporting myAttendance as null would
        // reset the buttons on their own screen. See EventResource.
        $event->load(self::myAttendance($request));

        return new EventResource($event);
    }

    /**
     * Take an event off the planning.
     *
     * Requires `events.manage`. Deletes the event and everything attached to
     * it: every attendance answer given for it, and every public registration
     * booked for it.
     *
     * Answers `{"ok": true, "attendanceDeleted": n, "registrationsDeleted": n}`
     * with the counts of what went with it, so a confirmation can say what is
     * about to be discarded rather than merely asking again.
     */
    public function destroy(Request $request, Event $event): JsonResponse
    {
        // NO AccessIntegrity EQUIVALENT, unlike deleting a member: an event has
        // no lockout invariant to violate, and nothing references `events` yet.
        //
        // The title and the id are captured BEFORE the delete, because the row
        // is gone by the time anybody reads the audit back — the label is then
        // the only part of that entry that still means anything.
        //
        // NO TEST PINS THAT ORDERING, and cannot. MEASURED 2026-09-10 by moving
        // both reads after $event->delete(): all 25 tests stay green, because
        // Eloquent leaves the deleted model's attributes in memory. It is kept
        // first for the reason MemberController::destroy() keeps its own
        // ordering — the audit must not depend on what a soft delete, a
        // cascading delete or a refreshed model would leave behind.
        $label = $event->title;
        $id = $event->id;

        // COUNTED BEFORE THE DELETE, because the cascade removes the rows
        // this counts. Deleting an event destroys every answer given for it,
        // and saying so is the difference between a confirmation that warns
        // and one that merely asks again — see the R1c-1 plan Task 12, and
        // the R3 spec §4 which adds registrationsDeleted beside it.
        //
        // {ok: true} rather than 204 for the same reason: R1c-2 needed
        // somewhere to put the count of answers that went with the event, and
        // a 204 has no body to say it in.
        $attendanceDeleted = $event->attendance()->count();
        $registrationsDeleted = $event->registrations()->count();

        // ONE TRANSACTION: the delete now spans four tables — the choices
        // Event::booted() clears first, then the cascades into registrations,
        // options and attendance. A failure part-way through would leave a
        // half-deleted event whose bookings point at nothing.
        DB::transaction(fn () => $event->delete());

        Audit::record($request->user(), 'event.deleted', 'event', $id, $label);

        return response()->json([
            'ok' => true,
            'attendanceDeleted' => $attendanceDeleted,
            'registrationsDeleted' => $registrationsDeleted,
        ]);
    }
}
