<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEventRequest;
use App\Http\Requests\UpdateEventRequest;
use App\Http\Resources\EventResource;
use App\Models\Event;
use App\Support\Audit;
use App\Support\BandTime;
use Dedoc\Scramble\Attributes\QueryParameter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class EventController extends Controller
{
    /**
     * The planning: upcoming by default, or the history behind `?past=1`.
     *
     * `?past=1` is the OTHER HALF of the list, not a superset of it — by next
     * carnival the full list is a hundred rehearsals to scroll past on a
     * phone. It also reverses the order, because history is read backwards
     * from now, while the planning ahead is read soonest-first.
     *
     * The split is on BandTime::startOfToday(), not now(): a rehearsal that
     * began an hour ago must stay in the planning of somebody running late.
     * Pinned by EventIndexTest::test_an_event_happening_today_stays_in_the_planning_all_day,
     * and mutation-tested by hand against now() — see Task 4 step 7.
     *
     * Anything that is not exactly the magic word '1' is the default,
     * upcoming view — the same fail-safe direction MigrateController takes
     * with its `mode` parameter: a missing, misspelled or truncated value
     * must never be the one that hides events.
     *
     * No eager loads: there are no relations yet. MEASURED 2026-09-09: this
     * costs exactly 1 query today — the events query alone, since this route
     * carries no permission lookup. Pinned by
     * test_listing_the_planning_costs_a_fixed_number_of_queries at a budget
     * of 3, which is a FLOOR for R1c-2 — that release adds one relation and
     * one query, not an N+1, and the spare room is deliberate.
     */
    #[QueryParameter(
        'past',
        'Set to `1` for the history — past events, newest first — instead of the upcoming planning. Any other value, or none, gives the planning.',
        required: false,
        type: 'string',
        example: '1',
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $past = $request->query('past') === '1';
        $startOfToday = BandTime::startOfToday();

        $query = $past
            ? Event::where('starts_at', '<', $startOfToday)->orderBy('starts_at', 'desc')
            : Event::where('starts_at', '>=', $startOfToday)->orderBy('starts_at', 'asc');

        return EventResource::collection($query->get());
    }

    /**
     * One event, by id.
     *
     * Not redundant with index(): the edit form loads through this rather
     * than hunting the list, because a past event is absent from the default
     * list entirely — finding it there would work right up until somebody
     * edited last month's rehearsal. Route-model binding turns an unknown id
     * into a ModelNotFoundException; Laravel's own exception handler rewrites
     * that into a 404 before any render() closure sees it (checked against
     * bootstrap/app.php — no closure there is typed on it, so this 404 is the
     * FRAMEWORK's default JSON shape, not App\Exceptions\ApiError's
     * {error, code, fields[]} contract; EventIndexTest only asserts the
     * status for that reason).
     */
    public function show(Event $event): EventResource
    {
        return new EventResource($event);
    }

    /**
     * Puts a rehearsal or a gig on the planning.
     *
     * 201 with the created row, not 204: the SPA drops the response straight
     * into the list it is already showing, and a second GET to learn the id
     * would race the next writer.
     *
     * Audited, like every other privileged mutation, with the title captured
     * as the label — see App\Support\Audit for why the CALLER reads it.
     *
     * The two timestamps go in as the SPA sent them, offset and all. Turning
     * them into UTC instants is App\Casts\UtcDateTime's job, on the column —
     * this endpoint deliberately knows nothing about it, which is what makes
     * every other writer of these columns correct too.
     */
    public function store(StoreEventRequest $request): JsonResponse
    {
        $data = $request->validated();

        $event = Event::create([
            'title' => $data['title'],
            'starts_at' => $data['startsAt'],
            'ends_at' => $data['endsAt'],
            'location' => $data['location'],
            'attire' => $data['attire'] ?? null,
            'is_public' => $data['isPublic'],
            'notes' => $data['notes'] ?? null,
        ]);

        Audit::record($request->user(), 'event.created', 'event', $event->id, $event->title);

        return response()->json(new EventResource($event), 201);
    }

    /**
     * Corrects one already on it.
     *
     * The fields go through array_key_exists(), not isset(): isset() is false
     * for an explicitly-sent null, so clearing the attire or the notes — the
     * committee deciding a gig is in ordinary clothes after all — would answer
     * 200 and silently change nothing. MemberController::update() carries the
     * same loop for the same reason.
     *
     * (That comment there also names $request->has(). MEASURED 2026-09-10:
     * has() is in fact TRUE for an explicitly-sent null — Arr::has() is
     * array_key_exists underneath, and it is filled() that reads false. So
     * has() would work here; array_key_exists is still the right shape,
     * because it asks the question of validated() — the array the rules have
     * already vetted — rather than of the raw input.)
     *
     * The two timestamps go in as the SPA sent them, offset and all — see
     * store(), and App\Casts\UtcDateTime for why no endpoint converts them.
     *
     * Audited with the NEW title: a row still labelled with the old one names
     * an event that no longer exists under that name.
     */
    public function update(UpdateEventRequest $request, Event $event): EventResource
    {
        $data = $request->validated();

        $columns = [
            'title' => 'title',
            'startsAt' => 'starts_at',
            'endsAt' => 'ends_at',
            'location' => 'location',
            'attire' => 'attire',
            'isPublic' => 'is_public',
            'notes' => 'notes',
        ];

        foreach ($columns as $field => $column) {
            if (array_key_exists($field, $data)) {
                $event->{$column} = $data[$field];
            }
        }

        $event->save();

        Audit::record($request->user(), 'event.updated', 'event', $event->id, $event->title);

        return new EventResource($event);
    }

    /**
     * Takes one off the planning.
     *
     * NO AccessIntegrity EQUIVALENT, unlike deleting a member: an event has no
     * lockout invariant to violate, and nothing references `events` yet.
     *
     * The title and the id are captured BEFORE the delete, because the row is
     * gone by the time anybody reads the audit back — the label is then the
     * only part of that entry that still means anything.
     *
     * NO TEST PINS THAT ORDERING, and cannot. MEASURED 2026-09-10 by moving
     * both reads after $event->delete(): all 25 tests stay green, because
     * Eloquent leaves the deleted model's attributes in memory. It is kept
     * first for the reason MemberController::destroy() keeps its own ordering
     * — the audit must not depend on what a soft delete, a cascading delete
     * or a refreshed model would leave behind.
     *
     * {ok: true} rather than 204, so R1c-2 has somewhere to put the count of
     * answers that went with the event: a member who had said yes deserves to
     * be told how many responses were discarded, and a 204 has no body to say
     * it in.
     */
    public function destroy(Request $request, Event $event): JsonResponse
    {
        $label = $event->title;
        $id = $event->id;

        $event->delete();

        Audit::record($request->user(), 'event.deleted', 'event', $id, $label);

        return response()->json(['ok' => true]);
    }
}
