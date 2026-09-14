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
        // Field names are camelCase because contact.js posts the form via
        // FormData with those input names, and App\Exceptions\ApiError echoes
        // them straight into fields[].field, where i18n.js looks them up.
        // Renaming them silently breaks the French error messages. (The signup
        // form uses snake_case — the two forms genuinely differ; do not
        // normalise.)
        //
        // Rule ORDER is load-bearing: ApiError reports only the first failed
        // rule per field, so `required` must come first (an empty field reports
        // `required`, not `invalid_format`) and `max` must precede `email` (an
        // over-long address reports `too_long`). This mirrors
        // App\Dto\ContactInput's attribute order.
        return [
            'lastName' => ['required', 'string', 'max:255'],
            'firstName' => ['required', 'string', 'max:255'],
            /** Where the committee will reply. Nothing is sent to it automatically. */
            'email' => ['required', 'string', 'max:255', 'email'],
            'subject' => ['required', 'string', 'max:255'],
            // max:5000 against a TEXT column of 65535 BYTES. Without it a
            // ~70 KB body overflows in MySQL strict mode and answers 500 to
            // an anonymous caller. 5000 characters is a long letter.
            /** The message body, up to 5000 characters. Plain text; no markup is rendered. */
            'message' => ['required', 'string', 'max:5000'],
        ];
    }
}
