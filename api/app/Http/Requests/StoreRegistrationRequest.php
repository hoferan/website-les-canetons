<?php

namespace App\Http\Requests;

use App\Models\Event;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * An anonymous booking for one event.
 *
 * Anonymous, so it also has to satisfy the public write guard: send the
 * `X-Form-Token` header from `GET /api/v1/form-token` and a `website` field that
 * is present and empty, or the request answers `422 spam_suspected`.
 *
 * Name, email and phone are required, because a Swiss committee reaches
 * somebody by telephone the evening before. Address and table name are
 * optional.
 *
 * `choices` is what is being ordered: a non-empty list of `{optionId,
 * quantity}`, at most 20 entries, each option appearing at most once and
 * belonging to this event. Read the options from
 * `GET /api/v1/events/{event}/registration`. When the event sets a per-booking
 * guest cap, a booking whose quantities add up to more than that cap fails
 * validation against `choices` with `too_many_guests`.
 *
 * An event that takes no bookings answers `404`, whether or not it exists.
 */
class StoreRegistrationRequest extends FormRequest
{
    /**
     * The 404 has to happen BEFORE validation, not in the controller.
     *
     * MEASURED 2026-09-10: with the check in the controller, booking an
     * event that takes no registrations answered 400 with a complaint about
     * `choices.0.optionId` — because the option genuinely does not belong to
     * that event — instead of 404. That leaks two things to an anonymous
     * caller: that the event exists, and that option ids are guessable
     * enough to probe. prepareForValidation runs first, so the refusal is
     * the honest one.
     *
     * RegistrationController::form() keeps its own copy of this check
     * because a GET has no Form Request to put it in.
     */
    protected function prepareForValidation(): void
    {
        $event = $this->route('event');

        if ($event instanceof Event && ! $event->takesRegistrations()) {
            abort(404);
        }
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // THE ONLY ANONYMOUS WRITE THIS RELEASE ADDS, and the second in the
        // whole API. It sits behind PublicWriteGuard.
        //
        // Name, email and phone are required (G4): a Swiss committee reaches
        // somebody by phone the evening before, and every required field past
        // that is a reason to abandon the form. Address and table are
        // optional.
        //
        // RULE ORDER IS LOAD-BEARING, as everywhere: ApiError reports only the
        // FIRST failed rule per field, so `required` leads each list.
        //
        // The per-booking guest cap is checked in after(), not by a rule,
        // because it is a property of the WHOLE choices array against a number
        // stored on the event — no single field is wrong.
        $event = $this->route('event');
        $eventId = $event instanceof Event ? $event->id : 0;

        return [
            'firstName' => ['required', 'string', 'max:255'],
            'lastName' => ['required', 'string', 'max:255'],
            /** Where the confirmation is sent. A mail failure does not fail the booking. */
            'email' => ['required', 'string', 'email', 'max:255'],
            /** A telephone number, in whatever form the guest writes it. Required: this is how the committee reaches them the evening before. */
            'phone' => ['required', 'string', 'max:64'],
            'address' => ['nullable', 'string', 'max:255'],
            /** Who the guest would like to sit with, as free text. Nothing enforces it; the committee reads it when seating the room. */
            'tableName' => ['nullable', 'string', 'max:255'],

            // max:20 because the array is the only one an ANONYMOUS caller
            // controls, and each element costs an exists query during
            // validation. Twenty option lines is already more than any
            // souper offers.
            /** What is being ordered, at least one entry and at most 20. Fails with `too_many_guests` when the quantities exceed the event per-booking cap. */
            'choices' => ['required', 'array', 'min:1', 'max:20'],

            // Scoped to THIS event's options. Without the where clause a
            // booking could reference an option belonging to a different
            // event entirely, which the foreign key would happily accept.
            /** An option offered by this event, from `GET /api/v1/events/{event}/registration`. Each option may appear at most once in `choices`. */
            'choices.*.optionId' => [
                'required',
                'integer',
                // distinct, or a repeated option violates
                // UNIQUE(registration_id, option_id) INSIDE the transaction
                // and answers 500 to an anonymous caller. A client that
                // appends rather than replaces sends this by accident.
                'distinct',
                Rule::exists('event_registration_options', 'id')->where('event_id', $eventId),
            ],
            // max, because the column is an unsignedInteger and an
            // out-of-range value is a 500 rather than a validation failure.
            /** How many of that option, 1 to 50. Order the same option twice by raising this, not by repeating the entry. */
            'choices.*.quantity' => ['required', 'integer', 'gt:0', 'max:50'],
        ];
    }

    /**
     * The per-booking guest cap (`registration_max_guests`).
     *
     * A closure rather than a rule, so it can read the sum of the
     * quantities against a number that lives on the event. The token is
     * added bare and must stay PARAMLESS: App\Exceptions\ApiError's
     * closure-added branch emits `field` and `reason` only, with no way to
     * attach params, and i18next prints a missing interpolation literally.
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $event = $this->route('event');

                if (! $event instanceof Event || $event->registration_max_guests === null) {
                    return;
                }

                $requested = collect($this->input('choices', []))
                    ->sum(fn ($choice) => (int) ($choice['quantity'] ?? 0));

                if ($requested > $event->registration_max_guests) {
                    $validator->errors()->add('choices', 'too_many_guests');
                }
            },
        ];
    }
}
