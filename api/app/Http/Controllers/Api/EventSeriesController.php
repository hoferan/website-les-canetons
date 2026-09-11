<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEventSeriesRequest;
use App\Http\Resources\EventResource;
use App\Models\Event;
use App\Models\Member;
use App\Support\Audit;
use App\Support\BandTime;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

#[Group('Events', weight: 20)]
class EventSeriesController extends Controller
{
    /**
     * Generate a season of events from one template.
     *
     * Requires `events.manage`. Takes a `template` and a list of `Y-m-d`
     * `dates`, at most 60 of them, and creates one event per date. Answers
     * `201` with the created events, in the same shape `GET /api/v1/events`
     * returns, so a client can refresh its list straight from the response.
     *
     * The events are independent, and there is no series afterwards: nothing
     * links them, and each one is edited, answered and deleted on its own.
     *
     * The template carries `startTime` and `endTime` as `H:i` wall-clock
     * strings rather than instants, applied in Europe/Zurich for each date.
     * A season that crosses the daylight-saving change therefore keeps the
     * same time on the clock throughout. `endTime` must be after `startTime`.
     *
     * `title`, `location`, `isPublic`, `startTime` and `endTime` are required
     * on the template; `attire` and `notes` are optional. An empty date list
     * fails validation against `dates` with `required`, more than 60 dates
     * with `too_long`, and a date that is not `Y-m-d` against its own entry
     * with `invalid_format`. A refused request writes nothing at all.
     */
    public function __invoke(StoreEventSeriesRequest $request): JsonResponse
    {
        // Writes a whole season in one request — thirteen rehearsals, the
        // gigs, the AG.
        //
        // A GENERATOR, NOT AN ENTITY (decision C3). This endpoint stores no
        // rule and no `series_id`: it writes N independent events and forgets
        // they arrived together. That is what makes "how does a player attend
        // one occurrence?" a non-question — each row is an ordinary event,
        // edited and answered like any other. EventSeriesTest asserts the
        // absence of the column directly, because the cheapest way for that
        // decision to erode is for somebody to add one.
        //
        // Single-action, matching MemberRoleController and
        // MemberPasswordController. That is not only style: Scramble names the
        // generated operation after the controller and drops the method for
        // single-action ones, which is what makes the client hook
        // `useEventSeries` rather than `useEventSeriesStore`.
        $data = $request->validated();

        /** @var array<string, mixed> $template */
        $template = $data['template'];
        /** @var list<string> $dates */
        $dates = $data['dates'];

        /** @var Member|null $actor */
        $actor = $request->user();

        // ONE TRANSACTION FOR THE WHOLE BATCH. A half-created season is worse
        // than none: the committee has no way to tell which half landed, and
        // the obvious repair — send it again — duplicates whatever did.
        //
        // NO TEST PINS IT, and the plan's claim that one does is wrong.
        // MEASURED 2026-09-10 by removing this wrapper: all 14 tests stay
        // green, test_one_bad_date_writes_nothing_at_all included. That test
        // passes because `dates.*` refuses the bad date in validation, before
        // this method runs at all — so what it actually pins is that the
        // batch is vetted before any write, which is the valuable half and is
        // not this. What the transaction covers is a failure part-way through
        // the loop: a deadlock, a lost connection, a unique index some later
        // release adds. None of those is reachable from a feature test, so it
        // is kept on the argument rather than on a red bar.
        $events = DB::transaction(function () use ($template, $dates, $actor): array {
            $created = [];

            foreach ($dates as $date) {
                // BandTime::compose, never a bare parse. The band's zone is
                // Europe/Zurich, and a season crosses the daylight-saving
                // change: parsing "$date $time" against app.timezone (UTC)
                // would put every event outside CEST an hour out, so half a
                // season would be wrong and the other half right. This is the
                // reason BandTime exists at all.
                $created[] = $event = Event::create([
                    'title' => $template['title'],
                    'starts_at' => BandTime::compose($date, $template['startTime']),
                    'ends_at' => BandTime::compose($date, $template['endTime']),
                    'location' => $template['location'],
                    'attire' => $template['attire'] ?? null,
                    'is_public' => $template['isPublic'],
                    'notes' => $template['notes'] ?? null,
                ]);

                // `event.created`, the same action a single create writes —
                // they are the same thing, and somebody chasing an event
                // through the audit log should not have to know which screen
                // made the row.
                Audit::record($actor, 'event.created', 'event', $event->id, $event->title);
            }

            return $created;
        });

        // The same shape GET /api/v1/events returns, so the SPA refreshes its
        // list from this response rather than guessing what it just made.
        $planning = EventResource::collection($events);

        return response()->json($planning, 201);
    }
}
