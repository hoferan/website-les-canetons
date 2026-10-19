<?php

namespace App\Http\Resources;

use App\Models\Section;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One register on the public band page: who plays in it, and who teaches it.
 *
 * The register is always rendered, even empty. Dropping a register whose
 * members all withheld consent would tell a visitor the band has no such
 * players, and would let them infer consent. The screen shows the gap.
 *
 * `instructors` is a second list rather than a flag on each member because an
 * instructor teaches one register and may play in another (`section_id` and
 * `instructor_of_section_id`), so a person can appear under two headings.
 *
 * @mixin Section
 */
class PublicSectionResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            /** The register's French name, as the band typed it. */
            'name' => $this->name,
            /** Its German name, or null when nobody has typed one: show `name` then (ADR 0026). */
            'nameDe' => $this->name_de,
            /** Everyone who plays in it and has consented to appear. May be empty. */
            'members' => PublicMemberResource::collection($this->publicMembers),
            /** Everyone who teaches it and has consented to appear. May be empty. */
            'instructors' => PublicMemberResource::collection($this->publicInstructors),
        ];
    }
}
