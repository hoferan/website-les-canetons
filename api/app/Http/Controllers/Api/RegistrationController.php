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
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class RegistrationController extends Controller
{
    /**
     * PUBLIC. What the booking form needs to render itself.
     *
     * 404, NOT 403, for an event that takes no registrations. A stranger
     * should not be able to learn that an event exists but is not taking
     * bookings — that is a fact about the band's private planning, and this
     * endpoint is reachable without a session.
     *
     * An event that is enabled but outside its window DOES answer, with
     * `open: false`, because the form has something worth saying then:
     * "inscriptions dès le 3 janvier" or "les inscriptions sont closes".
     */
    public function form(Event $event): RegistrationFormResource
    {
        if (! $event->takesRegistrations()) {
            abort(404);
        }

        return new RegistrationFormResource($event->load('registrationOptions'));
    }

    /**
     * PUBLIC. Books a place.
     *
     * Behind PublicWriteGuard — honeypot plus a signed timestamp — which is
     * the only thing between this and the open internet.
     *
     * NO CAPACITY CHECK (decision G1), and that absence is what keeps this
     * lock-free. A count-then-insert would need a locking read on the one
     * endpoint strangers can hammer; the committee watches the guest list
     * and closes the date early instead.
     *
     * ONE TRANSACTION for the booking and its choices: a booking whose
     * choices half-landed is a guest the cook cannot count.
     */
    public function store(StoreRegistrationRequest $request, Event $event): JsonResponse
    {
        // The takesRegistrations() 404 lives in the Form Request's
        // prepareForValidation(), not here: it has to run BEFORE validation
        // or the caller gets a 400 about option ids instead. See there.
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
     * The guest list. `registrations.view`.
     *
     * Eager-loads the choices and their options in two queries, not one per
     * booking: a souper is ~100 bookings and this screen is also what the
     * exports read.
     */
    public function index(Event $event): AnonymousResourceCollection
    {
        return RegistrationResource::collection(
            $event->registrations()->with('choices.option')->orderBy('created_at')->get()
        );
    }

    /**
     * Correcting a booking. `registrations.manage`.
     *
     * Guests get no self-service (G2), so this is how a misspelled name or
     * a wrong table gets fixed. The CHOICES are deliberately not editable
     * here: changing what somebody ordered is a different act from fixing
     * their details, it would need the guest cap re-checked and the
     * confirmation re-sent, and nobody has asked for it. A wrong order is
     * cancelled and re-booked.
     *
     * array_key_exists, not isset: both are false for an explicitly-sent
     * null, so clearing an address would silently do nothing.
     */
    public function update(UpdateRegistrationRequest $request, Registration $registration): RegistrationResource
    {
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
     * Cancelling on a guest's behalf. `registrations.manage`.
     *
     * The label is captured BEFORE the delete, because the row is gone by
     * the time anybody reads the audit back — see App\Support\Audit.
     */
    public function destroy(Request $request, Registration $registration): JsonResponse
    {
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
            Log::warning('Registration confirmation mail failed', [
                'registration_id' => $registration->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
