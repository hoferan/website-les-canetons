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
            'name' => $this->name,
            'sortOrder' => $this->sort_order,
        ];
    }
}
