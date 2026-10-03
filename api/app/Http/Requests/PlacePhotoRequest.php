<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The photo one place shows: a library image's id, or null to show none.
 */
class PlacePhotoRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            // `present` rather than `required`: `required` rejects the null
            // that empties the place.
            /** An id from `GET /api/v1/images`, or null to remove the photo. */
            'imageId' => ['present', 'nullable', 'integer', 'exists:images,id'],
        ];
    }

    public function imageId(): ?int
    {
        $id = $this->validated('imageId');

        return $id === null ? null : (int) $id;
    }
}
