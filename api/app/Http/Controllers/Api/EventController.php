<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEventRequest;
use App\Http\Resources\EventResource;
use App\Models\Event;
use App\Support\Audit;
use App\Support\BandTime;
use Carbon\CarbonImmutable;
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
     */
    public function store(StoreEventRequest $request): JsonResponse
    {
        $data = $request->validated();

        $event = Event::create([
            'title' => $data['title'],
            'starts_at' => self::instant($data['startsAt']),
            'ends_at' => self::instant($data['endsAt']),
            'location' => $data['location'],
            'attire' => $data['attire'] ?? null,
            'is_public' => $data['isPublic'],
            'notes' => $data['notes'] ?? null,
        ]);

        Audit::record($request->user(), 'event.created', 'event', $event->id, $event->title);

        return response()->json(new EventResource($event), 201);
    }

    /**
     * An offset-bearing timestamp from the SPA, as the UTC instant the column
     * stores.
     *
     * THE ->utc() IS LOAD-BEARING, and it is not what the `datetime` cast does.
     * MEASURED 2026-09-10 against this stack: handing Event::create() the raw
     * string '2026-09-05T10:00:00+02:00' persists `2026-09-05 10:00:00`. The
     * cast parses it into a Carbon that KEEPS the +02:00 offset and then
     * formats it with the model's date format, which has no offset in it — so
     * the wall-clock hour is written into a column every reader treats as UTC,
     * and a 10:00 Fribourg rehearsal reads back as 12:00. Every comparison in
     * index() is against a real UTC instant from BandTime, so the row would
     * also fall on the wrong side of the upcoming/past split for two hours a
     * day. Pinned by
     * EventWriteTest::test_the_wall_clock_time_survives_the_round_trip.
     *
     * Not BandTime::compose(): that is for a date and a wall-clock time typed
     * separately, where the band's zone is the missing piece. Here the offset
     * arrives in the payload, so this needs to know nothing about Fribourg —
     * it only has to stop the offset being thrown away.
     *
     * It does assume the offset IS there. `date` accepts an offsetless string
     * too, and CarbonImmutable::parse() would then read it as UTC — two hours
     * early, silently. Every caller today is the SPA, which sends ISO-8601
     * with an offset; a second client would need that pinned by the Form
     * Request rather than assumed here.
     */
    private static function instant(string $value): CarbonImmutable
    {
        return CarbonImmutable::parse($value)->utc();
    }
}
