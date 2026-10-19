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
     * The 404 has to happen before validation. In the controller it would
     * come after a 400 about `choices.0.optionId` (the option does not belong
     * to that event), which tells an anonymous caller that the event exists
     * and lets option ids be probed.
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
        // One of the API's two anonymous writes (the contact form is the
        // other), behind PublicWriteGuard.
        //
        // Name, email and phone are required, since the committee phones the
        // evening before; every further required field is a reason to abandon
        // the form.
        //
        // ApiError reports only the first failed rule per field, so `required`
        // leads each list.
        //
        // The guest cap is checked in after(), because it compares the whole
        // choices array with a number stored on the event.
        //
        // `choices` is capped at 20 because it is the one array an anonymous
        // caller controls and each element costs an exists query. Each
        // `optionId` is scoped to this event's options, since the foreign key
        // would accept another event's option. `quantity` has a max because
        // the column is an unsignedInteger and an out-of-range value would be
        // a 500.
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

            /**
             * What is being ordered, at least one entry and at most 20. Fails with `too_many_guests` when the quantities exceed the event per-booking cap.
             *
             * @example [{"optionId":7,"quantity":2},{"optionId":8,"quantity":1}]
             */
            'choices' => ['required', 'array', 'min:1', 'max:20'],

            /** An option offered by this event, from `GET /api/v1/events/{event}/registration`. Each option may appear at most once in `choices`. */
            'choices.*.optionId' => [
                'required',
                'integer',
                // A repeated option would violate
                // UNIQUE(registration_id, option_id) inside the transaction
                // and answer 500.
                'distinct',
                Rule::exists('event_registration_options', 'id')->where('event_id', $eventId),
            ],
            /** How many of that option, 1 to 50. Order the same option twice by raising this, not by repeating the entry. */
            'choices.*.quantity' => ['required', 'integer', 'gt:0', 'max:50'],
        ];
    }

    /**
     * The per-booking guest cap (`registration_max_guests`).
     *
     * A closure, so it can compare the sum of the quantities with a number on
     * the event. The token must stay without params: ApiError's closure-added
     * branch emits `field` and `reason` only, and i18next prints a missing
     * interpolation literally.
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
