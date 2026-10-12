<?php

namespace App\Http\Requests;

use App\Models\Role;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A role's names, typed by the committee (ADR 0026).
 *
 * The French name is required and unique among the roles, so two roles never
 * read the same on the roster form. A blank German name is stored as null and
 * the SPA falls back to the French one, as for an event tag.
 */
class RenameRoleRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $this->merge([
            'labelFr' => $this->trimmed('labelFr'),
            'labelDe' => $this->trimmed('labelDe'),
        ]);
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        $role = $this->route('role');

        return [
            'labelFr' => ['required', 'string', 'max:60', Rule::unique('roles', 'label_fr')
                ->ignore($role instanceof Role ? $role->id : null)],
            'labelDe' => ['nullable', 'string', 'max:60'],
        ];
    }

    private function trimmed(string $field): ?string
    {
        $value = $this->input($field);

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
