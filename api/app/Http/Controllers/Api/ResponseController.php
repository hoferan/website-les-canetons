<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Http\Requests\ResponseRequest;
use App\Models\Event;
use App\Models\Response;
use App\Models\User;
use App\Support\Capability;
use Dedoc\Scramble\Attributes\Response as ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * /api/responses — the members' RSVP write and the admin's attendance summary.
 *
 * A straight port of the legacy app/api/responses.php. The two verbs on this one
 * path have OPPOSITE access rules, and that asymmetry is the whole point:
 *
 *   POST /api/responses — `respond` (user/moderator). A member records THEIR
 *                         OWN answer for one event.
 *   GET  /api/responses — `view_summary` (admin). Every eligible member's answer
 *                         for one event.
 *
 * The capability matrix is deliberately not a hierarchy (see
 * App\Support\Capability): `admin` must be refused by the POST — the Team
 * Direction organises events but does not vote in them — and `user`/`moderator`
 * must be refused by the GET, which exposes the whole band's answers.
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
     * $request->user() on the DEFAULT guard, not $request->user('sanctum'),
     * following EventController::index() — see its docblock for the full
     * reasoning. The hazard there is real in principle: Sanctum's RequestGuard
     * memoizes the user it resolved, RequestGuard::setRequest() does not clear
     * that memo, and actingAs() sets the user on the `web` guard without
     * touching it either — so a second request in one test can silently reuse
     * the FIRST caller, a false negative on exactly the cross-user properties
     * this endpoint is tested for.
     *
     * Honest scope of that claim: THESE tests do not exhibit it. Both forms were
     * tried here and ResponseStoreTest passed either way, cross-user cases
     * included, so the choice is convention rather than a difference this file
     * can demonstrate. The two also behave identically over real HTTP (verified
     * against a live login). Kept as the default guard because it is the form
     * the rest of this API uses and the one whose failure mode is understood.
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

    /**
     * GET /api/responses?eventId=N — the admin's attendance summary for one
     * event: [{username, instrument, response}, ...].
     *
     * A member who has NOT answered is still listed, with response: null —
     * inscriptions_admin.js derives both "Convoqués" and "Pas de réponse" from
     * the length of this list, so an omitted row would silently shrink the roll
     * call instead of showing up as a pending answer.
     *
     * Deliberately NOT a 404 for an unknown eventId: the legacy GET never
     * checked the event's existence (only the POST did) and its LEFT JOIN simply
     * matched nothing, so an unknown id lists everyone as unanswered. Changing
     * that would be a user-visible behaviour change, out of scope for this port.
     *
     * Validation is hand-rolled rather than a FormRequest because the two
     * failures the legacy endpoint distinguished — absent vs unusable — map onto
     * different reason tokens, and because ?eventId= arrives in the query string
     * of a GET.
     *
     * THE 200 SHAPE IS DECLARED BELOW because Scramble cannot infer it.
     *
     * index() builds its payload with a Collection::map, and Scramble gives up
     * on that — it emitted `string[]`, which type-checked at every call site
     * and was wrong about every field. GET /api/events had the identical
     * problem and this is the identical fix.
     *
     * A LITERAL, not a @phpstan-type alias: Scramble resolves an alias to a
     * property-less object, which is how the events endpoint ended up as
     * `string[]` in the first place. That means the shape is written twice —
     * here and in summary()'s @return — and ResponseShapeContractTest fails if
     * the two ever disagree, so it is duplication a test catches rather than a
     * comment asking you to remember.
     */
    #[ApiResponse(status: 200, type: 'list<array{username: string, instrument: string|null, response: string|null}>')]
    public function index(Request $request): JsonResponse
    {
        $raw = $request->query('eventId');
        if ($raw === null || $raw === '') {
            return ApiError::json(400, 'validation_failed', 'Invalid form submission', [
                ['field' => 'eventId', 'reason' => 'required'],
            ]);
        }

        // A plain (int) cast, as the old endpoint used: non-numeric text becomes
        // 0 and is refused below. Deliberately not a stricter numeric check —
        // this route is admin-only and tightening it is a behaviour change the
        // port does not need.
        //
        // 'invalid_number', NOT the legacy endpoint's 'invalid_value'. Do not
        // "correct" this back to the more specific-looking token — it has been
        // reintroduced twice already:
        //
        //  - it must be PARAMLESS. i18n.js renders invalid_value as "doit être
        //    l'une des valeurs suivantes : {{allowed}}", and i18next prints a
        //    missing interpolation value literally, so a hand-rolled fields[]
        //    entry — which has nowhere to carry params — would put a raw
        //    {{allowed}} on the admin's screen. invalid_value is reachable ONLY
        //    from Laravel's `in` rule, which does supply that list;
        //  - it is also the ACCURATE one. eventId=0 is a bad number, not an enum
        //    mismatch: "Événement n'est pas un nombre valide" is what actually
        //    went wrong. Same reasoning as SignupRequest's `menus` case.
        //
        // This also makes the read agree with the write: ResponseRequest's gt:0
        // maps to invalid_number too, so the same bad eventId reports the same
        // reason whether it arrives on the POST or the GET (pinned by
        // ResponseSummaryTest::test_a_non_positive_event_id_reports_the_same_token_as_the_post).
        $eventId = (int) $raw;
        if ($eventId <= 0) {
            return ApiError::json(400, 'validation_failed', 'Invalid form submission', [
                ['field' => 'eventId', 'reason' => 'invalid_number'],
            ]);
        }

        return response()->json($this->summary($eventId));
    }

    /**
     * The summary rows, reproducing ResponseRepository::allForEvent()'s single
     * query — one statement, not a per-member lookup.
     *
     * WHICH MEMBERS ARE LISTED is derived from the capability matrix, never
     * hardcoded: only roles holding `respond` belong in an attendance roll call,
     * so the admin is absent. Hardcoding ['user', 'moderator'] here would make
     * the Team Direction show up as "Pas de réponse" on every event the moment a
     * new non-voting role appeared. An empty role list needs no special case —
     * whereIn([]) matches nothing.
     *
     * The event id lives in the LEFT JOIN's ON clause, not in a WHERE: as a
     * WHERE it would drop every member who has not answered, which is precisely
     * the set the summary exists to show.
     *
     * ORDER BY COALESCE(answer, '') DESC, username — the legacy ordering,
     * reproduced rather than improved. On the two enum values it sorts
     * participate, then notparticipate, then the unanswered (COALESCE'd to ''),
     * each alphabetical by username.
     *
     * @return array<int, array{username: string, instrument: ?string, response: ?string}>
     */
    private function summary(int $eventId): array
    {
        return User::query()
            ->leftJoin('instruments', 'instruments.id', '=', 'users.instrument_id')
            ->leftJoin('responses', function ($join) use ($eventId) {
                $join->on('responses.user_id', '=', 'users.id')
                    ->where('responses.event_id', '=', $eventId);
            })
            ->whereIn('users.role', Capability::rolesWith('respond'))
            ->orderByRaw("COALESCE(responses.answer, '') DESC")
            ->orderBy('users.username')
            ->get([
                'users.username',
                'instruments.name as instrument',
                'responses.answer as response',
            ])
            // Shaped explicitly, in the legacy SELECT's key order: the joined
            // rows are hydrated as User models, so returning them raw would ship
            // the model's other attributes — and this list goes to the admin
            // screen, where an extra column is a leak. instrument and response
            // stay nullable; inscriptions_admin.js switches on response and
            // treats anything else as "Pas de réponse".
            ->map(fn (User $row): array => [
                'username' => (string) $row->username,
                'instrument' => $row->instrument === null ? null : (string) $row->instrument,
                'response' => $row->response === null ? null : (string) $row->response,
            ])
            // ->all(), because an empty collection serialises as {} through some
            // paths and inscriptions_admin.js calls .filter() on the parsed body.
            ->all();
    }
}
