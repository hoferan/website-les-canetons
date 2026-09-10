<?php

namespace App\Http\Requests;

use App\Models\Event;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * A stranger booking a place at an event.
 *
 * THE ONLY ANONYMOUS WRITE THIS RELEASE ADDS, and the second in the whole
 * API. It sits behind PublicWriteGuard.
 *
 * Name, email and phone are required (G4): a Swiss committee reaches
 * somebody by phone the evening before, and every required field past that
 * is a reason to abandon the form. Address and table are optional.
 *
 * RULE ORDER IS LOAD-BEARING, as everywhere: ApiError reports only the FIRST
 * failed rule per field, so `required` leads each list.
 *
 * The per-booking guest cap is checked in after(), not by a rule, because it
 * is a property of the WHOLE choices array against a number stored on the
 * event — no single field is wrong.
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
        $event = $this->route('event');
        $eventId = $event instanceof Event ? $event->id : 0;

        return [
            'firstName' => ['required', 'string', 'max:255'],
            'lastName' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255'],
            'phone' => ['required', 'string', 'max:64'],
            'address' => ['nullable', 'string', 'max:255'],
            'tableName' => ['nullable', 'string', 'max:255'],

            'choices' => ['required', 'array', 'min:1'],

            // Scoped to THIS event's options. Without the where clause a
            // booking could reference an option belonging to a different
            // event entirely, which the foreign key would happily accept.
            'choices.*.optionId' => [
                'required',
                'integer',
                Rule::exists('event_registration_options', 'id')->where('event_id', $eventId),
            ],
            'choices.*.quantity' => ['required', 'integer', 'gt:0'],
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
