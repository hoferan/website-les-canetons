<?php

namespace App\Http\Resources;

use App\Models\Section;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One register's row in the photo placements.
 *
 * @mixin Section
 */
class PhotoPlacementRegisterResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'sectionId' => $this->id,
            /** The register's name, for display only. Ignored when sent back. */
            'name' => $this->name,
            'imageId' => $this->image_id,
        ];
    }
}
