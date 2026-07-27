<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Field names are camelCase because contact.js posts the form via FormData with
 * those input names, and App\Exceptions\ApiError echoes them straight into
 * fields[].field, where i18n.js looks them up. Renaming them silently breaks
 * the French error messages. (The signup form uses snake_case — the two forms
 * genuinely differ; do not normalise.)
 *
 * Rule ORDER is load-bearing: ApiError reports only the first failed rule per
 * field, so `required` must come first (an empty field reports `required`, not
 * `invalid_format`) and `max` must precede `email` (an over-long address
 * reports `too_long`). This mirrors App\Dto\ContactInput's attribute order.
 */
class ContactRequest extends FormRequest
{
    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'lastName' => ['required', 'string', 'max:255'],
            'firstName' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'max:255', 'email'],
            'subject' => ['required', 'string', 'max:255'],
            'message' => ['required', 'string'],
        ];
    }
}
