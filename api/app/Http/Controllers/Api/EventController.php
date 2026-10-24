<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEventRequest;
use App\Http\Requests\UpdateEventRequest;
use App\Http\Resources\EventResource;
use App\Models\Event;
use App\Models\EventTag;
use App\Models\Member;
use App\Support\Audit;
use App\Support\BandTime;
use App\Support\EffectivePermissions;
use App\Support\Emits;
use App\Support\Permission;
use App\Support\Search;
use Carbon\CarbonImmutable;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\QueryParameter;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

#[Group('Events', 'The planning: what the band is doing and when. Every member reads it; changing it needs `events.manage`.', weight: 20)]
class EventController extends Controller
{
    /**
     * List the planning.
     *
     * Requires `events.view`, which every account holds through the baseline
     * role. Returns the events still to come, soonest first, each carrying
     * `myAttendance`: the caller's own answer, or `null` where they have not
     * given one.
     *
     * `?past=1` returns the history instead, the events that have already
     * happened, newest first. Any other value, or none, gives the upcoming
     * planning. The two are halves of the list rather than a list and a
     * superset of it.
     *
     * An event taking place today stays in the planning for the whole of that
     * day; it does not move to the history the moment it starts.
     *
     * `?q=` narrows either half to the events whose title or location contains
     * it, ignoring case and accents. `meta.total` counts the matches.
     */
    // `type` is the literal '1', which Scramble parses as a PHPDoc type and
    // publishes as an enum of one value. The contract is "send `1` or leave it
    // off"; the controller's leniency about other values is not advertised.
    #[QueryParameter(
        'past',
        'Set to `1` for the history — past events, newest first — instead of the upcoming planning. Omit it for the planning.',
        required: false,
        type: "'1'",
        example: '1',
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        // `?past=1` is the other half of the list, not a superset, so the
        // phone never scrolls past a season of rehearsals. History reads
        // newest first, the planning soonest first.
        //
        // Anything but exactly '1' gives the upcoming view, so a missing,
        // misspelled or truncated value never hides events.
        //
        // The query count is pinned by
        // test_listing_the_planning_costs_a_fixed_number_of_queries.
        //
        // This note stays away from the return so Scramble does not publish
        // it as the 200 description.
        $past = $request->query('past') === '1';

        // `q` is validated, unlike `past`: leniency there fails safe towards
        // the planning, but there is no safe reading of a 5,000-character
        // search, so it is refused rather than guessed at.
        $filters = $request->validate([
            /**
             * Text to find in an event's title or location.
             *
             * @example concert
             */
            'q' => Search::RULES,
            /** Only events carrying this tag, by its id from `GET /event-tags`. */
            'tag' => ['sometimes', 'integer', 'exists:event_tags,id'],
        ]);

        // Split on BandTime::startOfToday(), not now(): a rehearsal that
        // began an hour ago stays in the planning of somebody running late.
        // Pinned by
        // EventIndexTest::test_an_event_happening_today_stays_in_the_planning_all_day.
        $startOfToday = BandTime::startOfToday();

        // Drafts are filtered in the query, since the envelope slices what
        // this returns and meta.total counts what the caller may see.
        //
        // They cannot ride the starts_at split: NULL >= anything is false, so
        // an undated draft would fall in neither half. Every draft belongs to
        // the default half, dated or not, so one dated last week is not
        // buried in the history. Undated ones sort first.
        $mayManage = EffectivePermissions::ofRequest($request)->contains(Permission::EventsManage);

        $query = $past
            ? Event::published()->where('starts_at', '<', $startOfToday)->orderBy('starts_at', 'desc')
            : Event::where(function ($planning) use ($mayManage, $startOfToday): void {
                $planning->where(fn ($published) => $published
                    ->whereNotNull('published_at')
                    ->where('starts_at', '>=', $startOfToday));

                if ($mayManage) {
                    $planning->orWhereNull('published_at');
                }
            })->orderByRaw('starts_at IS NULL DESC')->orderBy('starts_at', 'asc');

        // A WHERE on the one query, not a filter over its rows (#97): the
        // envelope slices what this returns, and the query budget holds.
        // isset() rather than when()'s truthiness, so a search for "0" is one.
        $query->when(isset($filters['q']), function ($query) use ($filters): void {
            $pattern = Search::contains($filters['q']);
            $query->where(fn ($match) => $match
                ->where('title', 'like', $pattern)
                ->orWhere('location', 'like', $pattern));
        });

        $query->when(isset($filters['tag']), function ($query) use ($filters): void {
            $query->whereHas('tags', fn ($tags) => $tags->whereKey($filters['tag']));
        });

        // The denominator rides the request. It is one number for the whole
        // list, so a per-row COUNT would be a query per event, and
        // ->additional() would write into the envelope PaginatesCollections
        // owns, outside every EventResource.
        $request->attributes->set(EventResource::ANSWERABLE_COUNT, self::answerable($request));

        return EventResource::collection(
            $query->with([...self::myAttendance($request), 'tags', Event::POSTER])
                ->withExists(self::myRegistration($request))
                ->withCount(self::counts())
                ->withSum(Event::guestCount(), 'quantity')
                ->get()
        );
    }

    /**
     * The eager load that puts the caller's own answer on an event, and only
     * theirs.
     *
     * One extra query for a whole list, constrained to the caller in the
     * query, so another member's answer is never loaded and a later reader of
     * `$event->attendance` cannot get everybody's. Pinned by
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
     * Whether the caller has booked each event's members form (ADR 0034), as
     * a subselect on the events query rather than a query of its own, scoped
     * to the current member like myAttendance(). Read by
     * EventResource::myRegistration().
     *
     * @return array<string, \Closure>
     */
    private static function myRegistration(Request $request): array
    {
        $memberId = $request->user()?->id;

        return [
            'registrations as '.EventResource::MY_REGISTRATION => fn ($query) => $query->where('member_id', $memberId),
        ];
    }

    /**
     * Whether the caller may see how many people have answered.
     *
     * EffectivePermissions::ofRequest() memoizes the whole permission set once
     * per request, and every gate reads it, here and in the Resource. A
     * boolean memoized per gate would make each gate pay its own query.
     * Pinned by
     * EventCountsTest::test_listing_the_planning_for_the_committee_costs_a_fixed_number_of_queries
     * and EventIndexTest::test_listing_the_planning_costs_a_fixed_number_of_queries.
     *
     * A request with no user answers false. Besides the anonymous case,
     * EntityTag::state() renders this Resource through a bare
     * Request::create('/'), and the counts must not reach the tag.
     */
    private static function maySeeAnswers(Request $request): bool
    {
        return EffectivePermissions::ofRequest($request)->contains(Permission::AttendanceViewAll);
    }

    /**
     * The bookings gate lives in EventResource, so maySeeAnswers() has no
     * sibling here.
     *
     * This controller asks about answers because it decides whether to run
     * the denominator COUNT at all. The guest sum is a subselect on the query
     * that already runs, so it is loaded unconditionally and the Resource
     * gates the output.
     *
     * The two gates are independent: the seeded `committee` role holds
     * registrations.view and not attendance.view_all, pinned by
     * EventCountsTest::test_the_two_gates_are_independent.
     */

    /**
     * The aggregate loads that back the planning's metadata strip (#93).
     *
     * Subselects on the query that already runs, so no extra round trip and
     * no cost per event. Nothing is stored: a cached total would need
     * invalidating on every answer, booking and roster change.
     *
     * The answer count covers only members who currently hold
     * attendance.respond, so the fraction cannot read 19/18 after somebody
     * who answered lost it, and it counts the same people as the chase list.
     *
     * Public because EventSeriesController returns EventResource too and
     * needs the same shape.
     *
     * @return array<string, \Closure>
     */
    public static function counts(): array
    {
        return [
            'attendance as answered_count' => fn ($query) => $query->whereIn(
                'member_id',
                EffectivePermissions::holders(Permission::AttendanceRespond),
            ),
        ];
    }

    /**
     * How many members are answerable at all: the denominator.
     *
     * A property of the roster, not of the event, so one query for the whole
     * list. Only run for a caller who may see it.
     *
     * Public for the same reason as counts().
     */
    public static function answerable(Request $request): ?int
    {
        return self::maySeeAnswers($request)
            ? Member::query()->whereIn('id', EffectivePermissions::holders(Permission::AttendanceRespond))->count()
            : null;
    }

    /**
     * Read one event.
     *
     * Requires `events.view`, like the list. Returns the event with
     * `myAttendance`, the caller's own answer or `null`.
     *
     * Works for a past event as well as an upcoming one, unlike the default
     * list. An unknown id answers `404`.
     */
    public function show(Request $request, Event $event): EventResource
    {
        // The edit form loads through this rather than the list, because a
        // past event is absent from the default list.
        //
        // Route-model binding turns an unknown id into a
        // ModelNotFoundException, which Laravel rewrites into a 404 before any
        // render() closure sees it. No closure in bootstrap/app.php is typed
        // on it, so this 404 has the framework's JSON shape rather than
        // ApiError's; EventIndexTest asserts only the status.
        $event->load(self::myAttendance($request))->loadExists(self::myRegistration($request));
        $event->loadCount(self::counts());
        $event->loadSum(Event::guestCount(), 'quantity');
        $request->attributes->set(EventResource::ANSWERABLE_COUNT, self::answerable($request));

        return new EventResource($event);
    }

    /**
     * Write down a rehearsal or a gig as a draft.
     *
     * Requires `events.manage`. Answers `201` with the created event, whose
     * `publishedAt` is `null`: it is visible to people who can manage events and
     * to nobody else until it is published.
     *
     * Only `title` is required; a missing one fails validation against itself
     * with `required`. `startsAt`, `endsAt` and `location` may be left out and
     * are required to publish. They are ISO 8601 instants carrying an offset, and
     * when both dates are sent `endsAt` must come after `startsAt` or it fails
     * validation against that field with `must_be_after`. An event spanning two
     * days is an ordinary row, not an error. `isPublic` defaults to false.
     *
     * Setting `registrationClosesAt` is what opens the event to public
     * registration. It must come after `registrationOpensAt`, which may be
     * left null to mean the form opens as soon as the closing date is set,
     * and `registrationMaxGuests` caps how many people one booking may cover.
     */
    public function store(StoreEventRequest $request): JsonResponse
    {
        // 201 with the created row, not 204: the SPA drops it straight into
        // its list, and a second GET to learn the id would race the next
        // writer.
        //
        // The timestamps go in as sent, offset and all. App\Casts\UtcDateTime
        // on the column turns them into UTC, so every writer of these columns
        // is correct without converting.
        $data = $request->validated();

        $event = Event::create([
            'title' => $data['title'],
            'starts_at' => $data['startsAt'] ?? null,
            'ends_at' => $data['endsAt'] ?? null,
            'location' => $data['location'] ?? null,
            'attire' => $data['attire'] ?? null,
            'is_public' => $data['isPublic'] ?? false,
            'notes' => $data['notes'] ?? null,
            'registration_opens_at' => $data['registrationOpensAt'] ?? null,
            'registration_closes_at' => $data['registrationClosesAt'] ?? null,
            'registration_max_guests' => $data['registrationMaxGuests'] ?? null,
            // A new form starts closed (ADR 0033); both details are asked.
            'registration_enabled' => $data['registrationEnabled'] ?? false,
            'registration_asks_address' => $data['registrationAsksAddress'] ?? true,
            'registration_asks_table' => $data['registrationAsksTable'] ?? true,
        ]);
        $event->tags()->sync(EventTag::distinctIds($data['tagIds'] ?? []));

        // The title is the label; App\Support\Audit explains why the caller
        // supplies it.
        Audit::record($request->user(), 'event.created', 'event', $event->id, $event->title);

        $event->loadCount(self::counts());
        $event->loadSum(Event::guestCount(), 'quantity');
        $request->attributes->set(EventResource::ANSWERABLE_COUNT, self::answerable($request));

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
        // array_key_exists() on validated(), not isset(): isset() is false for
        // an explicit null, so clearing the attire or the notes would answer
        // 200 and change nothing.
        //
        // The timestamps go in as sent; see store().
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
            'registrationEnabled' => 'registration_enabled',
            'registrationAsksAddress' => 'registration_asks_address',
            'registrationAsksTable' => 'registration_asks_table',
        ];

        foreach ($columns as $field => $column) {
            if (array_key_exists($field, $data)) {
                $event->{$column} = $data[$field];
            }
        }

        $event->save();

        // Absent keeps the tags; `[]` clears them, the same distinction the
        // columns above draw between a missing field and a null one.
        if (array_key_exists('tagIds', $data)) {
            $event->tags()->sync(EventTag::distinctIds($data['tagIds']));
            $event->unsetRelation('tags');
        }

        // Audited with the NEW title: a row still labelled with the old one
        // names an event that no longer exists under that name.
        Audit::record($request->user(), 'event.updated', 'event', $event->id, $event->title);

        // Loaded explicitly: an organiser who also plays has their own answer
        // on this event, and a response reporting myAttendance as null would
        // reset the buttons on their own screen. See EventResource.
        $event->load(self::myAttendance($request))->loadExists(self::myRegistration($request));
        $event->loadCount(self::counts());
        $event->loadSum(Event::guestCount(), 'quantity');
        $request->attributes->set(EventResource::ANSWERABLE_COUNT, self::answerable($request));

        return new EventResource($event);
    }

    /**
     * Publish a draft.
     *
     * Requires `events.manage`. Makes the event visible to every member (and,
     * once `isPublic` is set, on the public agenda) and answers with it.
     *
     * A published event always has a start, an end after it, and a location.
     * A draft that lacks any of them is refused with `event_incomplete`, and
     * `errors` names each field: `required` for one that is missing,
     * `must_be_after` on `endsAt` when the end does not follow the start.
     * Nothing is changed.
     * Publishing an event that is already published is not an error and moves
     * nothing.
     */
    #[Emits('event_incomplete')]
    public function publish(Request $request, Event $event): JsonResponse|EventResource
    {
        if (! $event->isDraft()) {
            return $this->present($request, $event);
        }

        // The columns allow a draft without dates (ADR 0027), so publishing is
        // where a complete event is enforced.
        $problems = [];
        foreach (['startsAt' => 'starts_at', 'endsAt' => 'ends_at', 'location' => 'location'] as $field => $column) {
            if ($event->{$column} === null) {
                $problems[] = ['field' => $field, 'reason' => 'required'];
            }
        }

        // A draft is built one field at a time, so PATCH can leave it with an
        // end before its start; the create and edit rules only compare the two
        // when both arrive together. Checked here, once both exist.
        if ($problems === [] && $event->ends_at <= $event->starts_at) {
            $problems[] = ['field' => 'endsAt', 'reason' => 'must_be_after'];
        }

        if ($problems !== []) {
            return ApiError::json(422, 'event_incomplete', 'The event cannot be published as it stands', $problems);
        }

        $event->published_at = CarbonImmutable::now();
        $event->save();

        Audit::record($request->user(), 'event.published', 'event', $event->id, $event->title);

        return $this->present($request, $event);
    }

    /**
     * Put a published event back to draft.
     *
     * Requires `events.manage`. Refused with `event_has_answers` once any
     * member has answered or anybody has booked, because their answers would
     * then sit on an event nobody else can see. Unpublishing a draft is not an
     * error and changes nothing.
     */
    #[Emits('event_has_answers')]
    public function unpublish(Request $request, Event $event): JsonResponse|EventResource
    {
        if ($event->isDraft()) {
            return $this->present($request, $event);
        }

        if ($event->attendance()->exists() || $event->registrations()->exists()) {
            return ApiError::json(409, 'event_has_answers', 'Members have already answered or booked this event');
        }

        $event->published_at = null;
        $event->save();

        Audit::record($request->user(), 'event.unpublished', 'event', $event->id, $event->title);

        return $this->present($request, $event);
    }

    /** The event as every write answers with it, carrying the caller's own answer and the counts. */
    private function present(Request $request, Event $event): EventResource
    {
        $event->load(self::myAttendance($request))->loadExists(self::myRegistration($request));
        $event->loadCount(self::counts());
        $event->loadSum(Event::guestCount(), 'quantity');
        $request->attributes->set(EventResource::ANSWERABLE_COUNT, self::answerable($request));

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
    #[Response(200, 'Deleted, with the counts of answers and bookings that went with it.')]
    public function destroy(Request $request, Event $event): JsonResponse
    {
        // No AccessIntegrity check, unlike deleting a member: an event has no
        // lockout invariant to violate.
        //
        // The title and id are captured before the delete, because the label
        // is all the audit entry has once the row is gone. No test pins this
        // order (Eloquent keeps a deleted model's attributes in memory), but
        // the audit must not depend on what a delete leaves behind.
        $label = $event->title;
        $id = $event->id;

        // Counted before the delete, because the cascade removes these rows,
        // so the confirmation can warn what is about to be discarded. That is
        // also why this answers a body rather than 204.
        $attendanceDeleted = $event->attendance()->count();
        $registrationsDeleted = $event->registrations()->count();

        // One transaction: the delete spans four tables (the choices
        // Event::booted() clears first, then the cascades into registrations,
        // options and attendance), and a failure part-way would leave
        // bookings pointing at nothing.
        DB::transaction(fn () => $event->delete());

        Audit::record($request->user(), 'event.deleted', 'event', $id, $label);

        return response()->json([
            'ok' => true,
            'attendanceDeleted' => $attendanceDeleted,
            'registrationsDeleted' => $registrationsDeleted,
        ]);
    }
}
