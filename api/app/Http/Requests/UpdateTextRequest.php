<?php

namespace App\Http\Requests;

use App\Models\TextOverride;
use Illuminate\Foundation\Http\FormRequest;

/**
 * One public text in both languages. Null or blank in a language means the
 * page shows its default there.
 */
class UpdateTextRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // `present`, not `required`: `required` rejects the null that clears a
        // language, and a field left out must not clear it by accident.
        return [
            /** The French wording, or null for the page's default. */
            'fr' => ['present', 'nullable', 'string', 'max:'.TextOverride::MAX_LENGTH],
            /** The German wording, or null: the German page then shows the French value, or its default. */
            'de' => ['present', 'nullable', 'string', 'max:'.TextOverride::MAX_LENGTH],
        ];
    }

    public function fr(): ?string
    {
        return $this->text('fr');
    }

    public function de(): ?string
    {
        return $this->text('de');
    }

    /** A blank value is no value: whitespace alone would show an empty line. */
    private function text(string $field): ?string
    {
        $value = $this->validated($field);

        return is_string($value) && trim($value) !== '' ? $value : null;
    }
}
