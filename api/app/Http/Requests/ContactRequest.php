<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A message sent through the public contact form.
 *
 * Anonymous, so it also has to satisfy the public write guard: send the
 * `X-Form-Token` header from `GET /api/v1/form-token` and a `website` field that
 * is present and empty, or the request answers `422 spam_suspected`.
 *
 * Every field here is required. The body is capped at 5000 characters, which
 * is a long letter; anything longer is refused rather than truncated.
 */
class ContactRequest extends FormRequest
{
    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        // App\Exceptions\ApiError echoes these field names into the error's
        // field list, where the SPA looks them up, so renaming one breaks its
        // translated error message.
        //
        // Rule order matters: ApiError reports only the first failed rule per
        // field, so `required` comes first (an empty field reports `required`,
        // not `invalid_format`) and `max` precedes `email` (an over-long address
        // reports `too_long`).
        //
        // `message` is capped at max:5000 because it goes into a TEXT column
        // of 65535 bytes; a body of about 70 KB would overflow in MySQL strict
        // mode and answer 500 to an anonymous caller.
        return [
            'lastName' => ['required', 'string', 'max:255'],
            'firstName' => ['required', 'string', 'max:255'],
            /** Where the committee will reply. Nothing is sent to it automatically. */
            'email' => ['required', 'string', 'max:255', 'email'],
            'subject' => ['required', 'string', 'max:255'],
            /** The message body, up to 5000 characters. Plain text; no markup is rendered. */
            'message' => ['required', 'string', 'max:5000'],
        ];
    }
}
