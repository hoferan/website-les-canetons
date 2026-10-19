<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Marking a message handled, or putting it back.
 *
 * `handled` is required and has no default, so an empty PATCH cannot silently
 * handle a message. This endpoint is also how one is reopened.
 */
class HandleContactMessageRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['handled' => ['required', 'boolean']];
    }
}
