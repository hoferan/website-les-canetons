<?php

namespace App\Http\Resources;

use App\Models\Section;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A register ("pupitre"), in both languages it may be named in.
 *
 * The two counts are there only where the query counted them: the register
 * list and the single read the editor starts from. They are what a delete
 * would refuse on, so the editor can say so before anybody tries.
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
            /** The register's French name, as the band writes it. */
            'name' => $this->name,
            /** Its German name, or null when nobody has typed one: show `name` then (ADR 0026). */
            'nameDe' => $this->name_de,
            /** Ascending display order. */
            'sortOrder' => $this->sort_order,
            /** How many members play in it. */
            'playerCount' => $this->whenCounted('members'),
            /** How many members teach it. */
            'instructorCount' => $this->whenCounted('instructors'),
        ];
    }
}
