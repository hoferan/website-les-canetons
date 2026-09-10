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
            'myAttendance' => $this->myAttendance(),
        ];
    }

    /**
     * The CALLER's own answer, or null when they have not given one.
     *
     * One request renders the whole planning with both buttons already in
     * the right state; a per-event fetch would defeat one-tap answering on a
     * bus with poor signal.
     *
     * READS A PRE-LOADED, CALLER-CONSTRAINED RELATION and never queries. The
     * controller is what scopes `attendance` to the current member, so this
     * cannot leak somebody else's answer and cannot become an N+1 — which is
     * the trap, because both failures would be silent.
     *
     * An unloaded relation reports null, so a write path that forgets to
     * load it says "no answer" rather than throwing. That is deliberate for
     * store() and the series generator, where a freshly created event
     * genuinely has none, and it is why update() loads it explicitly —
     * pinned by test_editing_an_event_still_reports_my_own_answer.
     */
    private function myAttendance(): ?AttendanceResource
    {
        if (! $this->relationLoaded('attendance')) {
            return null;
        }

        $mine = $this->attendance->first();

        return $mine === null ? null : new AttendanceResource($mine);
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
