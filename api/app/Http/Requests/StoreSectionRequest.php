<?php

namespace App\Http\Requests;

use App\Models\Section;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A register's names, typed by the committee (ADR 0026), for a new register
 * and for a rename.
 *
 * The French name is required and unique, so two registers never read the
 * same on the roster form or the band page. A blank German name is stored as
 * null and the SPA falls back to the French one, as for a role.
 */
class StoreSectionRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $this->merge([
            'name' => $this->trimmed('name'),
            'nameDe' => $this->trimmed('nameDe'),
        ]);
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        $section = $this->route('section');

        return [
            'name' => ['required', 'string', 'max:60', Rule::unique('sections', 'name')
                ->ignore($section instanceof Section ? $section->id : null)],
            'nameDe' => ['nullable', 'string', 'max:60'],
        ];
    }

    private function trimmed(string $field): ?string
    {
        $value = $this->input($field);

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
