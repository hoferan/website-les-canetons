<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Taking back a guest list's read mark, naming the mark the screen showed.
 *
 * A tab left open for days still shows the mark it loaded with. Naming it
 * means "mark as unread" there cannot take back a colleague's newer mark.
 */
class UnmarkBookingsReadRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            /** `markId` from the read this screen opened with, as a query parameter. */
            'mark' => ['required', 'integer'],
        ];
    }

    public function mark(): int
    {
        return (int) $this->validated('mark');
    }
}
