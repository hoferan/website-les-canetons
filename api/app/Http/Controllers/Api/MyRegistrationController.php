<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PutMyRegistrationRequest;
use App\Http\Resources\RegistrationResource;
use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\RegistrationOption;
use App\Support\BookingCapacity;
use App\Support\Emits;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * A member's own booking on a form for members only (#318, ADR 0034).
 *
 * One booking per member per event, in `registrations` like a guest's, with
 * `member_id` set and the name copied from the account. No confirmation mail:
 * an account has no address, and the planning shows the answer.
 */
#[Group('Registration')]
class MyRegistrationController extends Controller
{
    /**
     * Read my booking.
     *
     * Requires a session. Returns the caller's own booking for this event's
     * form, or `404` when they have none. Readable after the form closes, so
     * the answers can still be shown.
     *
     * An event whose form is not open, or not for members, answers `404`.
     */
    public function show(Request $request, Event $event): RegistrationResource
    {
        if (! PutMyRegistrationRequest::takesMemberBookings($event)) {
            abort(404);
        }

        return new RegistrationResource(self::mine($request, $event) ?? abort(404));
    }

    /**
     * Book, or change my answers.
     *
     * Requires a session. Creates the caller's booking (`201`) or replaces
     * its answers (`200`), quantities included. Send every answer each time:
     * a block left out is no longer answered. No confirmation mail is sent.
     *
     * Refuses with `registration_not_open` before the window opens and
     * `registration_closed` after it shuts, both `409`. An option with a
     * `capacity` takes no more than is left, not counting the places this
     * booking already holds; asking for more fails against
     * `choices.N.quantity` with `not_enough_places`.
     */
    // Scramble documents response()->json($resource, $status) as an untyped
    // 200. A #[Response] for the same status replaces it, so both are named
    // here; #[IgnoreResponse(200)] would drop the named 200 as well.
    #[Response(200, 'The booking, with its answers replaced.', type: RegistrationResource::class)]
    #[Response(201, 'The booking, as it was created.', type: RegistrationResource::class)]
    #[Emits('registration_not_open', 'registration_closed')]
    public function put(PutMyRegistrationRequest $request, Event $event): JsonResponse
    {
        $refusal = RegistrationController::refuseUnlessOpen($event);
        if ($refusal !== null) {
            return $refusal;
        }

        $choices = $request->validated()['choices'];
        /** @var Member $member */
        $member = $request->user();

        // Read before the transaction opens: see BookingCapacity.
        $kinds = $event->registrationOptions()->get()->mapWithKeys(
            fn (RegistrationOption $option): array => [$option->id => $option->kind]
        );

        [$registration, $created] = DB::transaction(function () use ($event, $member, $choices, $kinds): array {
            // Always, not only for a capped block as a guest's booking does:
            // "one booking each" is a check followed by an insert too, and
            // two taps on a slow connection would otherwise both insert.
            BookingCapacity::lock($event);

            $registration = Registration::query()
                ->where('event_id', $event->id)
                ->where('member_id', $member->id)
                ->first();

            // FOR UPDATE, so the committee's correction (#317), which checks
            // its tag under the same row lock, waits for this write and then
            // finds its tag stale, instead of passing and overwriting it.
            // By primary key and only once the booking exists: a locking read
            // that finds no row takes a gap lock, and two first bookings would
            // deadlock each other's inserts.
            if ($registration !== null) {
                $registration = Registration::query()->whereKey($registration->id)->lockForUpdate()->first();
            }

            BookingCapacity::refuse($event, $choices, $registration?->id);

            $created = $registration === null;
            $registration ??= new Registration(['event_id' => $event->id, 'member_id' => $member->id]);

            // From the account on every write, so a renamed member's booking
            // follows them; kept on the row so a deleted account's booking
            // still has a name.
            $registration->fill(['first_name' => $member->first_name, 'last_name' => $member->last_name]);
            $registration->save();
            $registration->writeChoices($choices, $kinds);

            return [$registration, $created];
        });

        return response()->json(
            new RegistrationResource($registration->load('choices.option')),
            $created ? 201 : 200,
        );
    }

    /**
     * Withdraw my booking.
     *
     * Requires a session. Removes the caller's booking and its answers, until
     * the form closes. Answers `{"ok": true}`, or `404` when there is none.
     *
     * Refuses with `registration_not_open` or `registration_closed`, `409`,
     * outside the window.
     */
    #[Response(200, 'Withdrawn. The booking and its answers are gone.')]
    #[Emits('registration_not_open', 'registration_closed')]
    public function destroy(Request $request, Event $event): JsonResponse
    {
        if (! PutMyRegistrationRequest::takesMemberBookings($event)) {
            abort(404);
        }

        $registration = self::mine($request, $event) ?? abort(404);

        $refusal = RegistrationController::refuseUnlessOpen($event);
        if ($refusal !== null) {
            return $refusal;
        }

        DB::transaction(function () use ($registration): void {
            $registration->choices()->delete();
            $registration->delete();
        });

        return response()->json(['ok' => true]);
    }

    private static function mine(Request $request, Event $event): ?Registration
    {
        return Registration::query()
            ->where('event_id', $event->id)
            ->where('member_id', $request->user()?->id)
            ->with('choices.option')
            ->first();
    }
}
