<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\EventResource;
use App\Models\Event;
use App\Support\BandTime;
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
     * No eager loads: there are no relations yet. Pinned by
     * test_listing_the_planning_costs_a_fixed_number_of_queries, which is a
     * FLOOR for R1c-2 — that release adds one relation and one query, not an
     * N+1.
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
}
