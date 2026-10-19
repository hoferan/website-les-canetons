<?php

namespace App\Http\Resources;

use App\Models\Attendance;
use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One row of the chase list: a member who holds attendance.respond, and what
 * they said if anything.
 *
 * `attendance` is null for somebody who has not replied; the list is read to
 * find those. The register travels as a name, not an id, because the screen
 * groups people by register.
 *
 * @mixin Member
 */
class ChaseListEntryResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            /** The member this row is about. */
            'memberId' => $this->id,
            'firstName' => $this->first_name,
            'lastName' => $this->last_name,
            /** The register they play in, or null for a member who answers without one. For grouping only: holding `attendance.respond` is what puts somebody on this list. */
            'sectionName' => $this->sectionName(),
            /** The register's German name, or null when nobody has typed one: show `sectionName` then. */
            'sectionNameDe' => $this->sectionNameDe(),
            /** Their answer, or null if they have not replied. The nulls are what this list is read for. */
            'attendance' => $this->answer(),
        ];
    }

    /**
     * Typed method rather than an inline expression: Scramble types an inline
     * relation read as an untyped object, and the return type makes it a
     * nullable string.
     */
    private function sectionName(): ?string
    {
        return $this->section?->name;
    }

    /** Typed for the same reason as sectionName(). */
    private function sectionNameDe(): ?string
    {
        return $this->section?->name_de;
    }

    /**
     * Typed for the same reason as sectionName().
     *
     * Read through getRelation() because Member has no `attendance` relation:
     * AttendanceController fetches one event's answers in a single query and
     * setRelation()s each onto its member, so this Resource never queries per
     * row.
     */
    private function answer(): ?AttendanceResource
    {
        if (! $this->resource->relationLoaded('attendance')) {
            return null;
        }

        $mine = $this->resource->getRelation('attendance');

        return $mine instanceof Attendance ? new AttendanceResource($mine) : null;
    }
}
