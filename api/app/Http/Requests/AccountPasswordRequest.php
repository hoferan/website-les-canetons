<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A member choosing their own password.
 *
 * EIGHT CHARACTERS, and that is a judgement rather than a standard. The people
 * typing this are 6-16 years old, on a phone, and the account protects a
 * rehearsal calendar. Login is throttled per username AND per IP with a
 * fifteen-minute lockout, there is no password reset by email to phish, and the
 * committee-issued default is ~57 bits — so the marginal value of demanding
 * twelve is small next to the number of children who would write it on the
 * inside of a case lid. Raise it if the committee asks.
 *
 * Rule order: `required` before `min`, so an empty field reports `required`
 * rather than `too_short`.
 */
class AccountPasswordRequest extends FormRequest
{
    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        return [
            'currentPassword' => ['required', 'string'],
            'newPassword' => ['required', 'string', 'min:8', 'max:255'],
        ];
    }
}
