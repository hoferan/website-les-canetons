<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Http\Requests\ResponseRequest;
use App\Models\Event;
use App\Models\Response;
use Illuminate\Http\JsonResponse;

/**
 * /api/responses — the members' RSVP write.
 *
 * A straight port of the legacy app/api/responses.php POST branch:
 *
 *   POST /api/responses — `respond` (user/moderator). A member records THEIR
 *                         OWN answer for one event.
 *
 * The capability matrix is deliberately not a hierarchy (see
 * App\Support\Capability): `admin` must be refused here — the Team Direction
 * organises events but does not vote in them.
 *
 * There is deliberately no respond-on-behalf-of path, no bulk write and no
 * deletion: the legacy API had none, and each would be a new way for one member
 * to affect another's answer.
 */
class ResponseController extends Controller
{
    /**
     * POST /api/responses — the caller's own RSVP. 201 {"ok":true}, matching the
     * old endpoint.
     *
     * THE USER COMES FROM THE SESSION, never from the request. ResponseRequest
     * has no field naming a user and nothing here reads one, so there is no way
     * to answer on someone else's behalf — that absence is the endpoint's main
     * security property and ResponseStoreTest pins it.
     *
     * $request->user() on the DEFAULT guard, not $request->user('sanctum').
     * Sanctum's RequestGuard memoizes the user it resolved and actingAs() sets
     * the user on the `web` guard without clearing that memo, so the explicit
     * 'sanctum' form makes a second request in one test silently reuse the FIRST
     * caller — a false negative on exactly the cross-user properties this
     * endpoint is tested for. See EventController::index() for the full
     * reasoning; the two behave identically over real HTTP.
     *
     * The user is never null here: auth:sanctum runs first, so an anonymous
     * caller is already a 401.
     */
    public function store(ResponseRequest $request): JsonResponse
    {
        $data = $request->validated();
        $eventId = (int) $data['eventId'];

        // Checked explicitly rather than left to the foreign key: a stale list
        // entry or a hand-edited ?id= must be a translatable 404, not a 500 from
        // an integrity-constraint violation.
        if (! Event::whereKey($eventId)->exists()) {
            return ApiError::json(404, 'event_not_found', 'Event not found');
        }

        // UPSERT on (user_id, event_id) — the table's unique key. Answering again
        // CHANGES the answer; the member clicking a second time is a change of
        // mind, not a duplicate, and a plain insert would be a 500 on the
        // unique constraint. Scoped to the caller AND the event, so a second
        // member answering the same event adds their own row instead of
        // overwriting the first.
        Response::updateOrCreate(
            ['user_id' => $request->user()->id, 'event_id' => $eventId],
            ['answer' => (string) $data['participation']],
        );

        return response()->json(['ok' => true], 201);
    }
}
