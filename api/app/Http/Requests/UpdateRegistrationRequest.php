<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Corrections to a booking's contact details.
 *
 * A PATCH: send only the fields that change. An omitted field is left as it
 * is, and an explicit `null` clears `address` or `tableName`.
 *
 * What was ordered cannot be changed here; there is no `choices` field.
 * Cancel the booking and make a new one instead. No mail is sent when a
 * booking is corrected.
 */
class UpdateRegistrationRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // Every rule is `sometimes`, so a form posting only what changed does
        // not blank the rest. `sometimes` and `nullable` are not the same
        // thing and the two optional columns need both — see
        // UpdateEventRequest and UpdateMemberRequest, which make the same call
        // at more length.
        //
        // NO `choices` FIELD, deliberately. Changing what somebody ordered is
        // a different act from fixing their name: it would need the
        // per-booking guest cap re-checked and arguably the confirmation
        // re-sent, and nobody has asked for it. A wrong order is cancelled and
        // re-booked, which is one click for the committee and leaves an honest
        // audit trail.
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
        ];
    }
}
