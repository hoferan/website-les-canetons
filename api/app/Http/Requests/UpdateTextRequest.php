<?php

namespace App\Http\Requests;

use App\Models\TextOverride;
use Illuminate\Foundation\Http\FormRequest;

/**
 * One public text in both languages. Null in a language means the page shows
 * its default there; an empty string means it shows nothing (ADR 0037).
 */
class UpdateTextRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // `present`, not `required`: `required` rejects the null that clears a
        // language, and a field left out must not clear it by accident.
        return [
            /** The French wording, null for the page's default, or "" for nothing. */
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

    /** Whitespace alone is stored as nothing, so it never shows an empty line. */
    private function text(string $field): ?string
    {
        $value = $this->validated($field);

        if (! is_string($value)) {
            return null;
        }

        return trim($value) === '' ? '' : $value;
    }
}
