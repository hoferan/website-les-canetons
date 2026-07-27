<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\EventRequest;
use App\Models\Event;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * /api/events — the members' rehearsal-and-events planning feature.
 *
 * A straight port of the legacy app/api/events.php, whose access rules are
 * deliberately asymmetric and are the whole point of this class:
 *
 *   GET    /api/events        — PUBLIC. Anonymous visitors get the events with
 *                               `response: null`; a logged-in caller additionally
 *                               gets each event annotated with THEIR OWN answer.
 *   POST   /api/events        — admin only (`manage_events`).
 *   PUT    /api/events/{id}   — admin only (`manage_events`).
 *   DELETE /api/events/{id}   — admin only (`manage_events`).
 *
 * The capability matrix is not a hierarchy: `user`/`moderator` hold `respond`
 * and must be refused by all three writes; `admin` holds `manage_events` and
 * cannot respond. See App\Support\Capability.
 *
 * Request and response keys are camelCase (startTime/endTime/weekend) while the
 * columns are snake_case. That is fixed by two existing consumers —
 * planning_repet.js reads the response and posts the request in camelCase, and
 * app/assets/js/i18n.js looks up fields[].field by those same camelCase names.
 * The mapping therefore happens HERE, in one place, and is not normalised in
 * either direction.
 */
class EventController extends Controller
{
    /**
     * GET /api/events — public index, ordered by date.
     *
     * `response` is the CALLER'S OWN answer or null. There is deliberately no
     * request parameter naming a user (no ?username=, no ?userId=): that
     * absence is what keeps a previously-fixed IDOR closed. The `responses`
     * relation is additionally CONSTRAINED to the caller's own user_id, so the
     * rows fetched from the database cannot carry another member's answer at
     * all — a mistake in the shaping code below could not leak one.
     *
     * Eager-loaded rather than queried per event: one events query plus one
     * responses query, instead of the N+1 a per-event lookup would cost. It is
     * also closer to the old single LEFT JOIN than N queries would be. A JOIN
     * was avoided only because Eloquent would then need a raw select alias to
     * carry `answer` alongside the model's own columns; the constrained
     * eager-load expresses the same restriction declaratively.
     *
     * OPTIONAL authentication, on the DEFAULT guard. This route deliberately
     * carries no auth middleware — it must serve anonymous visitors — so
     * nothing has called Auth::shouldUse() and $request->user() resolves the
     * default `web` guard. Under Sanctum SPA mode that is exactly right:
     * statefulApi() only starts a session for a request whose referer/origin
     * matches a configured stateful domain, so the `web` guard sees a user in
     * precisely the cases Sanctum considers authenticated, and nowhere else. No
     * user resolved is not an error here; it is the anonymous case, which is a
     * legitimate 200 with `response: null` throughout.
     *
     * $request->user('sanctum') was tried and deliberately reverted. It behaves
     * identically over real HTTP (both were verified against a live login), but
     * Sanctum's RequestGuard memoizes the user it resolved, and actingAs() sets
     * the user on the `web` guard without clearing that memo — so a second
     * request in one test kept the FIRST user. That makes the harness unable to
     * detect a cross-user leak across requests, i.e. a false negative on exactly
     * the property EventIndexTest exists to guard. The token case it would have
     * covered is hypothetical (this API is SPA cookie mode — see
     * bootstrap/app.php) and its failure mode is a caller seeing no answers, not
     * someone else's.
     */
    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;

        $events = Event::query()
            ->when(
                $userId !== null,
                fn ($query) => $query->with([
                    'responses' => fn ($responses) => $responses->where('user_id', $userId),
                ])
            )
            // ORDER BY date only — exactly the old query. No secondary key is
            // added: that would change the order of same-date events relative
            // to the endpoint being replaced.
            ->orderBy('date')
            ->get()
            ->map(fn (Event $event): array => $event->toFrontendShape(
                // relationLoaded() distinguishes "anonymous, never asked" from
                // "logged in, no answer yet"; both shape to null, but only the
                // second may read the relation.
                $event->relationLoaded('responses')
                    ? $event->responses->first()?->answer
                    : null
            ))
            ->all();

        // ->all() first: an empty collection serialises as `{}` through some
        // paths, and planning_repet.js calls .sort() on the parsed body.
        return response()->json($events);
    }

    /** POST /api/events — admin only. 201 {"ok":true}, matching the old endpoint. */
    public function store(EventRequest $request): JsonResponse
    {
        Event::create($this->columns($request));

        return response()->json(['ok' => true], 201);
    }

    /**
     * PUT /api/events/{id} — admin only. The id is a route parameter,
     * constrained to digits by whereNumber() in routes/api.php, so it is
     * always present and numeric by the time this method runs.
     *
     * The EventRequest is injected, so field validation still runs before the
     * Event::find() lookup below — the legacy endpoint's order, now simply a
     * consequence of Laravel resolving the FormRequest before the controller
     * body executes, rather than an explicit id check this method used to do.
     *
     * A well-formed id for an event that no longer exists is a 200 {"ok":true}
     * no-op, NOT a 404: the old `UPDATE ... WHERE id=?` matched no rows and
     * reported success just the same. planning_repet.js treats any non-2xx as a
     * failure and shows a French error, so turning a stale list entry into a 404
     * would be a user-visible behaviour change, out of scope for this port.
     */
    public function update(EventRequest $request, int $id): JsonResponse
    {
        $event = Event::find($id);
        if ($event === null) {
            return response()->json(['ok' => true]);
        }

        // `weekend` PRESERVATION, reproducing EventRepository::update()'s
        // currentWeekend() lookup: when the key is absent from the payload the
        // stored flag is kept, rather than defaulting to 0. Defaulting would let
        // any client that omits the field silently downgrade a weekend event to
        // a single-day one — a silent data change on an otherwise valid edit.
        // planning_repet.js always sends the checkbox's state, so this branch is
        // for other clients; an EXPLICIT false still clears the flag.
        //
        // No extra query is needed for it: the row is already loaded above.
        $columns = $this->columns($request);
        if (! $request->has('weekend')) {
            unset($columns['weekend']);
        }
        $event->update($columns);

        return response()->json(['ok' => true]);
    }

    /**
     * DELETE /api/events/{id} — admin only. The id is a route parameter,
     * constrained to digits by whereNumber() in routes/api.php, so it is
     * always present and numeric by the time this method runs — unlike the
     * legacy query-string id, an absent or non-numeric one never reaches this
     * method at all (the route itself 404s).
     *
     * The event's responses go with it via the FK's ON DELETE CASCADE; nothing
     * here deletes them explicitly.
     */
    public function destroy(int $id): JsonResponse
    {
        Event::where('id', $id)->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * Map the validated camelCase request onto the snake_case columns. This is
     * the ONE place the two naming conventions meet.
     *
     * `attire` is normalised exactly as the old endpoint did — trimmed, and ''
     * for anything that is not a string (absent or null included) — because the
     * column is `NOT NULL`-shaped in practice and planning_repet.js assigns
     * `event.attire` straight into an input's value, where null would render the
     * literal text "null".
     *
     * @return array<string, mixed>
     */
    private function columns(EventRequest $request): array
    {
        $data = $request->validated();
        $attire = $data['attire'] ?? null;

        return [
            'date' => $data['date'],
            'title' => $data['title'],
            'start_time' => $data['startTime'],
            'end_time' => $data['endTime'],
            'location' => $data['location'],
            'attire' => is_string($attire) ? trim($attire) : '',
            'weekend' => (int) ($data['weekend'] ?? 0),
        ];
    }
}
