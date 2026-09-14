<?php

namespace App\Http\Resources;

use App\Models\Section;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A register ("pupitre").
 *
 * @mixin Section
 */
class SectionResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            /** The register's name, as the band writes it. */
            'name' => $this->name,
            /** Ascending display order. */
            'sortOrder' => $this->sort_order,
        ];
    }
}
