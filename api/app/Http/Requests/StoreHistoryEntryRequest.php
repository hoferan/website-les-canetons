<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\RequiresImagesManageToPlacePhoto;
use App\Support\HistoryIcon;
use App\Support\HistoryPrecision;
use Illuminate\Foundation\Http\FormRequest;

/**
 * One entry of the band's history, in French, German or both.
 *
 * Every text field is optional, but not all four at once: an entry with no
 * text at all is refused with `history_entry_empty`. Blank text counts as none
 * and is stored as null.
 */
class StoreHistoryEntryRequest extends FormRequest
{
    use RequiresImagesManageToPlacePhoto;

    public const TEXT_FIELDS = ['titleFr', 'bodyFr', 'titleDe', 'bodyDe'];

    protected function prepareForValidation(): void
    {
        $this->requireImagesManageWhenPlacingPhoto();

        // Blank and absent mean the same thing, so the controller's all-empty
        // check and the stored nulls agree.
        $normalised = [];
        foreach (self::TEXT_FIELDS as $field) {
            $value = $this->input($field);
            $normalised[$field] = is_string($value) && trim($value) !== '' ? trim($value) : null;
        }
        $this->merge($normalised);
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // camelCase names, echoed into errors[].field and looked up under
        // `fields:` in both catalogues. `required` first wherever it applies:
        // ApiError reports only the first failed rule per field.
        return [
            /** The day, or any day in the month or year, per `precision`. Stored truncated to it. */
            'occurredOn' => ['required', 'date'],
            /** `year`, `month` or `day`. */
            'precision' => ['required', HistoryPrecision::rule()],
            'titleFr' => ['nullable', 'string', 'max:120'],
            'bodyFr' => ['nullable', 'string', 'max:5000'],
            'titleDe' => ['nullable', 'string', 'max:120'],
            'bodyDe' => ['nullable', 'string', 'max:5000'],
            /** Drawn larger on the timeline. */
            'important' => ['required', 'boolean'],
            /** One of the history icon keys, or null for the plain dot. */
            'icon' => ['nullable', HistoryIcon::rule()],
            /** The entry's photo, an id from `GET /api/v1/images`. Leave it out to keep the current one, send `null` to remove it. Sending any of `imageId`, `imageAltFr` and `imageAltDe` needs `images.manage`. */
            'imageId' => ['sometimes', 'nullable', 'integer', 'exists:images,id'],
            /** The photo's alt text in French. Sent without `imageId`, it replaces the alt text of the entry's current photo, and is stored as null when the entry has no photo. A null `imageId` clears it whatever is sent here. */
            'imageAltFr' => ['nullable', 'string', 'max:250'],
            /** The photo's alt text in German. Same rules as `imageAltFr`. */
            'imageAltDe' => ['nullable', 'string', 'max:250'],
        ];
    }

    /** True when none of the four text fields carries anything. */
    public function isEmpty(): bool
    {
        foreach (self::TEXT_FIELDS as $field) {
            if ($this->validated($field) !== null) {
                return false;
            }
        }

        return true;
    }
}
