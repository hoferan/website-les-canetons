<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The committee correcting a booking's details.
 *
 * Every rule is `sometimes`, so a form posting only what changed does not
 * blank the rest. `sometimes` and `nullable` are not the same thing and the
 * two optional columns need both — see UpdateEventRequest and
 * UpdateMemberRequest, which make the same call at more length.
 *
 * NO `choices` FIELD, deliberately. Changing what somebody ordered is a
 * different act from fixing their name: it would need the per-booking guest
 * cap re-checked and arguably the confirmation re-sent, and nobody has asked
 * for it. A wrong order is cancelled and re-booked, which is one click for
 * the committee and leaves an honest audit trail.
 */
class UpdateRegistrationRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'firstName' => ['sometimes', 'required', 'string', 'max:255'],
            'lastName' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255'],
            'phone' => ['sometimes', 'required', 'string', 'max:64'],
            'address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'tableName' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}
