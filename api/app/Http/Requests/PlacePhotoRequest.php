<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The photo one slot shows: a library image's id, or null to show none, and
 * how the library should describe the place.
 */
class PlacePhotoRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            // `present` rather than `required`: `required` rejects the null
            // that empties the slot.
            /** An id from `GET /api/v1/images`, or null to remove the photo. */
            'imageId' => ['present', 'nullable', 'integer', 'exists:images,id'],
            /** The page's name for the slot, which the library shows under "Utilisée sur". */
            'label' => ['nullable', 'string', 'max:120'],
            /** The path of the page the slot is on, starting with `/`, which the library links to. */
            'path' => ['nullable', 'string', 'max:255', 'starts_with:/'],
        ];
    }

    public function imageId(): ?int
    {
        $id = $this->validated('imageId');

        return $id === null ? null : (int) $id;
    }

    public function label(): ?string
    {
        $label = $this->validated('label');

        return is_string($label) && $label !== '' ? $label : null;
    }

    public function path(): ?string
    {
        $path = $this->validated('path');

        return is_string($path) && $path !== '' ? $path : null;
    }
}
