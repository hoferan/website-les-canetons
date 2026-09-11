<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRegistrationRequest;
use App\Http\Requests\UpdateRegistrationRequest;
use App\Http\Resources\RegistrationFormResource;
use App\Http\Resources\RegistrationResource;
use App\Mail\RegistrationConfirmation;
use App\Models\Event;
use App\Models\Registration;
use App\Models\RegistrationChoice;
use App\Support\Audit;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\IgnoreResponse;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

#[Group('Registration', 'Public bookings for an event that takes them, and the guest list the committee works from.', weight: 40)]
class RegistrationController extends Controller
{
    /**
     * Read a booking form.
     *
     * Anonymous. Returns what a public form needs: the event's title, dates
     * and location, the options that can be booked, the maximum number of
     * people one booking may cover, and whether the form is open right now.
     *
     * `open` is computed by the server. Do not derive it from `opensAt` and
     * `closesAt` on the client, whose clock may be wrong.
     *
     * An event that takes no registrations answers `404`, whether or not it
     * exists. An event that is enabled but outside its window answers `200`
     * with `open: false`, so the form can say when bookings start or that
     * they have closed.
     */
    public function form(Event $event): RegistrationFormResource
    {
        // 404 rather than 403, deliberately: a stranger must not be able to
        // learn that an event exists but is not taking bookings. That is a
        // fact about the band's private planning and this endpoint needs no
        // session.
        if (! $event->takesRegistrations()) {
            abort(404);
        }

        return new RegistrationFormResource($event->load('registrationOptions'));
    }

    /**
     * Book a place at an event.
     *
     * Anonymous, and protected against automated submission: send the
     * `X-Form-Token` header from `GET /api/v1/form-token` and a `website` field
     * that is present and empty, or the request answers
     * `422 spam_suspected`. Rate limited to 10 a minute per IP.
     *
     * Returns the booking with its line items, the number of people it
     * covers and what it comes to in centimes. A confirmation email is sent
     * to the address given; a mail failure does not fail the booking.
     *
     * Refuses with `registration_not_open` before the window opens and
     * `registration_closed` after it shuts, both `409`. A booking larger
     * than the event's per-booking cap fails validation against `choices`
     * with `too_many_guests`. Options must belong to this event, and each
     * may appear at most once.
     */
    // Scramble cannot see through `response()->json(new Resource(...), 201)`:
    // it reads the JsonResponse and nothing else, so this operation documented
    // `200` with an empty `{"type":"object"}` and the generated client typed a
    // booking as `{ [key: string]: unknown }` — the one endpoint a stranger
    // calls, and the only one whose success body said nothing at all.
    // The inferred 200 goes with it. #[Response] ADDS a status; it does not
    // replace the guess, so without this the operation declares both and a
    // client narrows a branch that cannot happen.
    #[IgnoreResponse(200)]
    #[Response(201, 'The booking, as it was recorded.', type: RegistrationResource::class)]
    public function store(StoreRegistrationRequest $request, Event $event): JsonResponse
    {
        // The takesRegistrations() 404 lives in the Form Request's
        // prepareForValidation(), not here: it has to run BEFORE validation
        // or the caller gets a 400 about option ids instead. See there.
        //
        // NO CAPACITY CHECK (decision G1), and that absence is what keeps
        // this lock-free: a count-then-insert would need a locking read on
        // the one endpoint strangers can hammer. The committee watches the
        // guest list and closes the date early instead.
        $refusal = self::refuseUnlessOpen($event);
        if ($refusal !== null) {
            return $refusal;
        }

        $data = $request->validated();

        $registration = DB::transaction(function () use ($data, $event): Registration {
            $registration = Registration::create([
                'event_id' => $event->id,
                'first_name' => $data['firstName'],
                'last_name' => $data['lastName'],
                'email' => $data['email'],
                'phone' => $data['phone'],
                'address' => $data['address'] ?? null,
                'table_name' => $data['tableName'] ?? null,
            ]);

            foreach ($data['choices'] as $choice) {
                RegistrationChoice::create([
                    'registration_id' => $registration->id,
                    'option_id' => $choice['optionId'],
                    'quantity' => $choice['quantity'],
                ]);
            }

            return $registration;
        });

        $registration->load('choices.option');

        self::confirm($registration, $event);

        return response()->json(new RegistrationResource($registration), 201);
    }

    /**
     * List everyone booked for an event.
     *
     * Requires `registrations.view`. Returns every booking oldest first,
     * each with its line items, the number of people it covers and its
     * total in centimes.
     *
     * This contains personal data supplied by members of the public. The
     * same list is available as a file from
     * `GET /api/v1/events/{event}/registrations.{format}`.
     */
    public function index(Event $event): AnonymousResourceCollection
    {
        // Two queries whatever the guest count, not one per booking: a
        // souper is ~100 bookings and this is also what the exports read.
        $bookings = $event->registrations()->with('choices.option')->orderBy('created_at')->get();

        return RegistrationResource::collection($bookings);
    }

    /**
     * Correct a booking's details.
     *
     * Requires `registrations.manage`. Guests cannot amend their own
     * booking, so this is how a misspelled name, a wrong number or a
     * seating change is fixed.
     *
     * Send only the fields that change. An explicit `null` clears an
     * optional field; an omitted field is left alone.
     *
     * What was ordered cannot be changed here. Cancel the booking and make
     * a new one instead.
     */
    public function update(UpdateRegistrationRequest $request, Registration $registration): RegistrationResource
    {
        // The choices are deliberately not editable: changing an order
        // would need the per-booking cap re-checked and arguably the
        // confirmation re-sent, and nobody has asked for it.
        //
        // array_key_exists, not isset: both are false for an
        // explicitly-sent null, so clearing an address would silently do
        // nothing.
        $data = $request->validated();

        $columns = [
            'firstName' => 'first_name',
            'lastName' => 'last_name',
            'email' => 'email',
            'phone' => 'phone',
            'address' => 'address',
            'tableName' => 'table_name',
        ];

        foreach ($columns as $field => $column) {
            if (array_key_exists($field, $data)) {
                $registration->{$column} = $data[$field];
            }
        }

        $registration->save();

        Audit::record(
            $request->user(),
            'registration.updated',
            'registration',
            $registration->id,
            $registration->fullName(),
        );

        return new RegistrationResource($registration->load('choices.option'));
    }

    /**
     * Cancel a booking.
     *
     * Requires `registrations.manage`. Removes the booking and everything
     * it ordered. The guest is not notified.
     *
     * Answers `{"ok": true}`.
     */
    public function destroy(Request $request, Registration $registration): JsonResponse
    {
        // Captured BEFORE the delete: the row is gone by the time anybody
        // reads the audit back. See App\Support\Audit.
        $label = $registration->fullName();
        $id = $registration->id;

        DB::transaction(function () use ($registration): void {
            // Explicit, not left to the cascade: registration_choices
            // cascades from registrations, but doing it inside the same
            // transaction keeps the two tables consistent even if a future
            // migration relaxes that.
            $registration->choices()->delete();
            $registration->delete();
        });

        Audit::record($request->user(), 'registration.deleted', 'registration', $id, $label);

        return response()->json(['ok' => true]);
    }

    /** Refuses a booking outside the window, naming which end was missed. */
    private static function refuseUnlessOpen(Event $event): ?JsonResponse
    {
        if ($event->registrationIsOpen()) {
            return null;
        }

        // Two codes rather than one, because the two are different news:
        // "come back on the 3rd" and "you have missed it" send the reader
        // to different places.
        if ($event->registration_opens_at !== null && $event->registration_opens_at->isFuture()) {
            return ApiError::json(409, 'registration_not_open', 'Registration has not opened yet');
        }

        return ApiError::json(409, 'registration_closed', 'Registration has closed');
    }

    /**
     * Sends the confirmation, and never lets it fail the booking.
     *
     * BEST-EFFORT ON PURPOSE (decision G5). The row is already committed:
     * this host has no queue worker and no way to run one — no shell, no
     * supervisor, and a cron job would have to be configured by hand on
     * each server, whose failure mode is mail that silently never sends. So
     * the mail goes inline, and an SMTP blip must not throw away a real
     * registration that is already stored.
     *
     * Logged rather than swallowed, so a server whose mail is broken says
     * so somewhere.
     */
    private static function confirm(Registration $registration, Event $event): void
    {
        try {
            Mail::to($registration->email)->send(new RegistrationConfirmation($registration, $event));
        } catch (\Throwable $e) {
            // error, not warning. MEASURED 2026-09-10: .env.example sets
            // LOG_LEVEL=error, and warning sits below it in Monolog, so
            // this line was never written on any server — the docblock's
            // claim that a broken mail server 'says so somewhere' was
            // false. Guests would book, get no confirmation, and nobody
            // would find out.
            Log::error('Registration confirmation mail failed', [
                'registration_id' => $registration->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
