<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Marking a message handled, or putting it back.
 *
 * `required` rather than defaulting to true: a PATCH with an empty body would
 * otherwise silently handle the message, and this endpoint is also how one is
 * reopened.
 */
class HandleContactMessageRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['handled' => ['required', 'boolean']];
    }
}
