<?php

namespace App\Http\Resources;

use App\Models\Attendance;
use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One row of the chase list: a member who is answerable, and what they said
 * if anything.
 *
 * `attendance` is NULL for somebody who has not replied, and that null is the
 * whole point of the screen — the list exists to be scanned for it.
 *
 * The register travels as a NAME, not an id: this screen is read to work out
 * who to nudge, and grouping by register is how a Guggenmusik thinks about
 * its own roster.
 *
 * @mixin Member
 */
class ChaseListEntryResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'memberId' => $this->id,
            'firstName' => $this->first_name,
            'lastName' => $this->last_name,
            'sectionName' => $this->sectionName(),
            'attendance' => $this->answer(),
        ];
    }

    /**
     * A typed private method rather than an inline expression, for the reason
     * MemberResource and EventResource both record: Scramble types an inline
     * relation read as an untyped object in the OpenAPI document, and the
     * docblock is what makes it a nullable string.
     */
    private function sectionName(): ?string
    {
        return $this->section?->name;
    }

    /**
     * Typed for the same reason as sectionName().
     *
     * Read through getRelation() rather than as `$this->attendance`, because
     * there is no such relation ON Member to read: AttendanceController
     * fetches one event's answers in a single query and setRelation()s each
     * onto its member, precisely so this Resource cannot issue a query per
     * row. Larastan is right that the property does not exist — the value is
     * put there by hand, and this is the honest way to take it back out.
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
