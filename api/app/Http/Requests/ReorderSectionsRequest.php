<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The registers in their new order, every one of them, first to last.
 *
 * Only the shape is checked here. A list that does not name exactly the
 * registers that exist answers `409 registers_changed` instead, because it
 * means somebody added or deleted a register while this one was being moved.
 */
class ReorderSectionsRequest extends FormRequest
{
    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        return [
            'sectionIds' => ['required', 'array'],
            'sectionIds.*' => ['integer'],
        ];
    }

    /** @return list<int> */
    public function sectionIds(): array
    {
        return array_values(array_map('intval', (array) $this->validated('sectionIds')));
    }
}
