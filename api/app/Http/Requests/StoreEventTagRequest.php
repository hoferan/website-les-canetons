<?php

namespace App\Http\Requests;

use App\Models\EventTag;
use App\Support\TagColour;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * One event tag, created or replaced whole. A blank German label is stored as
 * null and the SPA falls back to the French one (ADR 0026).
 */
class StoreEventTagRequest extends FormRequest
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
        $tag = $this->route('eventTag');

        // `labelFr` is unique under the column's case-insensitive collation, so
        // "concert" beside "Concert" is refused as a taken name instead of
        // reaching the unique index as a 500.
        return [
            /** Unique among the tags, ignoring case: "concert" is refused beside "Concert". */
            'labelFr' => ['required', 'string', 'max:40', Rule::unique('event_tags', 'label_fr')
                ->ignore($tag instanceof EventTag ? $tag->id : null)],
            'labelDe' => ['nullable', 'string', 'max:40'],
            /** One of `violet`, `teal`, `amber`, `pink`, `blue`, `green`, `coral`, `gray`. */
            'colour' => ['required', 'in:'.implode(',', array_column(TagColour::cases(), 'value'))],
            /**
             * Whether answering "Oui" to an event with this tag throws
             * confetti. Required, because the tag is replaced whole and a
             * save without it would switch the confetti off.
             */
            'celebrate' => ['required', 'boolean'],
        ];
    }

    private function trimmed(string $field): ?string
    {
        $value = $this->input($field);

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
