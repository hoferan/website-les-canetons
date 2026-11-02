<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Marking a message handled, putting it back, or clearing its spam flag.
 *
 * `handled` is required unless `suspect` is sent, and has no default, so an
 * empty PATCH cannot silently handle a message. This endpoint is also how one
 * is reopened.
 */
class HandleContactMessageRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'handled' => ['required_without:suspect', 'boolean'],
            /** `false` clears the spam flag. Only `false` is accepted: nobody flags a message by hand. */
            'suspect' => ['sometimes', 'boolean', 'declined'],
        ];
    }
}
