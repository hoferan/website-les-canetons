<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEventSeriesRequest;
use App\Http\Resources\EventResource;
use App\Models\Event;
use App\Models\EventTag;
use App\Models\Member;
use App\Support\Audit;
use App\Support\BandTime;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Database\Eloquent\Collection;
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
     * Every event is created as a draft (`publishedAt` is `null`): visible to
     * people who can manage events and to nobody else, so a season can be read
     * through before the band sees it. Each one is published on its own with
     * `POST /api/v1/events/{event}/publish`.
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
    #[Endpoint(operationId: 'event.series')]
    public function __invoke(StoreEventSeriesRequest $request): JsonResponse
    {
        // A generator, with no stored rule and no `series_id`: it writes N
        // independent events and forgets they arrived together, so each row
        // is an ordinary event, edited and answered like any other.
        // EventSeriesTest asserts the column is absent, so nobody adds one.
        //
        // Single-action, so Scramble names the operation after the controller
        // and the client hook is `useEventSeries` rather than
        // `useEventSeriesStore`.
        $data = $request->validated();

        /** @var array<string, mixed> $template */
        $template = $data['template'];
        /** @var list<string> $dates */
        $dates = $data['dates'];

        /** @var Member|null $actor */
        $actor = $request->user();

        // One transaction for the whole batch. A half-created season is worse
        // than none: the committee cannot tell which half landed, and sending
        // it again duplicates whatever did.
        //
        // No test pins it; removing it keeps the suite green.
        // test_one_bad_date_writes_nothing_at_all passes because validation
        // refuses the bad date before this method runs. The transaction covers
        // a failure part-way through the loop (a deadlock, a lost connection),
        // which no feature test can reach.
        $events = DB::transaction(function () use ($template, $dates, $actor): array {
            $created = [];

            foreach ($dates as $date) {
                // BandTime::compose, never a bare parse: a season crosses the
                // daylight-saving change, and parsing "$date $time" against
                // app.timezone (UTC) would put half the season an hour out.
                $created[] = $event = Event::create([
                    'title' => $template['title'],
                    'starts_at' => BandTime::compose($date, $template['startTime']),
                    'ends_at' => BandTime::compose($date, $template['endTime']),
                    'location' => $template['location'],
                    'attire' => $template['attire'] ?? null,
                    'is_public' => $template['isPublic'],
                    'notes' => $template['notes'] ?? null,
                ]);

                // `event.created`, as a single create writes, so the audit
                // log does not depend on which screen made the row.
                Audit::record($actor, 'event.created', 'event', $event->id, $event->title);
            }

            // One insert for the whole season rather than an attach() per
            // event, which would be a query per date.
            $tagIds = EventTag::distinctIds($template['tagIds'] ?? []);
            $pivot = [];
            foreach ($created as $event) {
                foreach ($tagIds as $tagId) {
                    $pivot[] = ['event_id' => $event->id, 'event_tag_id' => $tagId];
                }
            }
            if ($pivot !== []) {
                DB::table('event_event_tag')->insert($pivot);
            }

            return $created;
        });

        // The same shape GET /api/v1/events returns, so the SPA refreshes its
        // list from this response rather than guessing what it just made.
        $request->attributes->set(EventResource::ANSWERABLE_COUNT, EventController::answerable($request));

        // Loaded on the collection, so each relation costs one WHERE IN query
        // for the whole batch rather than one per date.
        // test_a_season_does_not_cost_a_query_per_row_beyond_its_writes pins it.
        $events = Collection::make($events);
        $events->load(['tags', Event::POSTER]);
        $events->loadCount(EventController::counts());
        $events->loadSum(Event::guestCount(), 'quantity');

        $planning = EventResource::collection($events);

        return response()->json($planning, 201);
    }
}
