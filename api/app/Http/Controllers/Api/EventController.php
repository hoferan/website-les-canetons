<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Event;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * /api/events — the members' rehearsal-and-events planning feature.
 *
 * A straight port of the legacy app/api/events.php, whose access rules are
 * deliberately asymmetric and are the whole point of this class:
 *
 *   GET    /api/events — PUBLIC. Anonymous visitors get the events with
 *                        `response: null`; a logged-in caller additionally gets
 *                        each event annotated with THEIR OWN answer.
 *   POST   /api/events — admin only (`manage_events`).
 *   PUT    /api/events — admin only (`manage_events`).
 *   DELETE /api/events — admin only (`manage_events`).
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
}
