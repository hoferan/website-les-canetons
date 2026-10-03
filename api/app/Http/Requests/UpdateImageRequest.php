<?php

namespace App\Http\Requests;

use App\Support\PhotoName;
use Illuminate\Foundation\Http\FormRequest;

/**
 * A new name for a library photo. The name is the committee's label for it,
 * shown in the library and the picker and on no public page.
 */
class UpdateImageRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            /** At most 120 characters once trimmed, with no control or bidirectional formatting characters. Leading and trailing spaces are dropped. */
            'name' => PhotoName::RULES,
        ];
    }

    /** The name as stored. TrimStrings has trimmed it already; this narrows the type. */
    public function photoName(): string
    {
        return (string) $this->validated('name');
    }
}
