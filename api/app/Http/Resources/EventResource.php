<?php

namespace App\Http\Resources;

use App\Models\Event;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One row on the planning — a rehearsal or a gig.
 *
 * NO ATTENDANCE. R1c-2 adds `myAttendance` here; this release is read-only.
 *
 * @mixin Event
 */
class EventResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'startsAt' => $this->startsAt(),
            'endsAt' => $this->endsAt(),
            'location' => $this->location,
            'attire' => $this->attire,
            'isPublic' => $this->is_public,
            'notes' => $this->notes,
        ];
    }

    /**
     * A typed method, not an inline expression — the same pattern
     * MemberResource::lastLoginAt() uses, and for the same measured reason:
     * Scramble types an inline `->toIso8601String()` call as an untyped
     * object in the OpenAPI document, and the docblock below is what makes
     * it `string`.
     */
    private function startsAt(): string
    {
        return $this->starts_at->toIso8601String();
    }

    /** Typed for the same reason as startsAt(). */
    private function endsAt(): string
    {
        return $this->ends_at->toIso8601String();
    }
}
