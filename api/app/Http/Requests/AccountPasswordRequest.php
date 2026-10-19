<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The credentials for changing your own password.
 *
 * Send the password the account is using now and the one to replace it with.
 * The current password is checked server-side before anything is written, so a
 * borrowed session alone cannot change it.
 *
 * The only requirement on the new password is a minimum of eight characters.
 * There is no complexity rule, no reuse check and no expiry.
 */
class AccountPasswordRequest extends FormRequest
{
    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        // Eight characters is a judgement call. The people typing this are 6 to
        // 16 years old, on a phone, the account protects a rehearsal calendar,
        // login is throttled
        // per username and per IP with a fifteen-minute lockout, there is no
        // email reset to phish, and the committee-issued default is about 57
        // bits. Raise it if the committee asks.
        //
        // `required` before `min`, so an empty field reports `required` and not
        // `too_short`.
        return [
            /** The password the account is using right now. Re-verified before the change is applied; a wrong one answers `403 reauth_failed`. */
            'currentPassword' => ['required', 'string'],
            /** The replacement. At least 8 characters; a shorter one fails with `too_short`. */
            'newPassword' => ['required', 'string', 'min:8', 'max:255'],
        ];
    }
}
