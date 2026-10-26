<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesBookingAnswers;
use App\Models\Event;
use App\Models\Registration;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Corrections to a booking's contact details and answers, and whether it has
 * been paid.
 *
 * A PATCH: send only the fields that change. An omitted field is left as it
 * is, and an explicit `null` clears `address` or `tableName`.
 *
 * `choices` corrects the text, choice and yes/no answers: `{optionId, value}`
 * per block answered, the same values as the public form. When it is sent it
 * replaces every such answer, so a block left out is no longer answered; a
 * required block left out fails against `answers.<optionId>` with `required`.
 * The quantities cannot be changed here: a quantity block fails with
 * `not_an_answer`. Cancel the booking and make a new one instead. No mail is
 * sent when a booking is corrected.
 */
class UpdateRegistrationRequest extends FormRequest
{
    use ValidatesBookingAnswers;

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // Every rule is `sometimes`, so a form posting only what changed does
        // not blank the rest; the two optional columns also need `nullable`
        // (see UpdateMemberRequest).
        //
        // No quantity in `choices`: changing an order would need the guest cap
        // and the capacity re-checked, and arguably the confirmation re-sent.
        // A wrong order is cancelled and re-booked, which leaves an honest
        // audit trail.
        $choices = $this->choiceRules();
        unset($choices['choices.*.quantity']);

        return [
            'firstName' => ['sometimes', 'required', 'string', 'max:255'],
            'lastName' => ['sometimes', 'required', 'string', 'max:255'],
            /** Where the confirmation went. Correcting it does not send a new one. */
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255'],
            /** A telephone number, in whatever form the guest gave it. */
            'phone' => ['sometimes', 'required', 'string', 'max:64'],
            /** Send `null` to clear it. */
            'address' => ['sometimes', 'nullable', 'string', 'max:255'],
            /** Who the guest sits with, as free text. Send `null` to clear it. */
            'tableName' => ['sometimes', 'nullable', 'string', 'max:255'],
            /** `true` records the payment, `false` takes it back. Sending `true` for a booking already paid keeps the original time. */
            'paid' => ['sometimes', 'boolean'],

            ...$choices,

            /**
             * The text, choice and yes/no answers, one entry per block answered, at most 20. Replaces every such answer; a block left out is no longer answered. Omit it to leave the answers alone. Quantities are not accepted.
             *
             * @example [{"optionId":9,"value":"yes"},{"optionId":11,"value":"Nut allergy"}]
             */
            'choices' => ['sometimes', 'array', 'max:20'],
        ];
    }

    /** The answers, checked against the booking's event: see ValidatesBookingAnswers. */
    public function after(): array
    {
        return $this->has('choices') ? [$this->answersCheck(answersOnly: true)] : [];
    }

    protected function bookingEvent(): ?Event
    {
        $registration = $this->route('registration');

        return $registration instanceof Registration ? $registration->event : null;
    }
}
