<?php

namespace App\Http\Resources;

use App\Models\Event;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One row on the planning: a rehearsal or a gig.
 *
 * Carries `myAttendance`, the CALLER's own answer and never anybody else's.
 * The controller scopes that relation to the current member inside the
 * query, so another member's answer is not loaded at all; see
 * EventController::myAttendance(). An unloaded relation reports null, which
 * is why the write paths that need it load it explicitly.
 *
 * Scramble does NOT publish this class docblock. Measured 2026-09-10: a
 * Resource's schema description comes from nothing, while a `/** ... *\/`
 * above an entry in toArray() below becomes that property's description in
 * the reference. So the notes here stay internal, and anything a caller
 * needs goes on the field.
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
            /** ISO 8601 in UTC. Convert to Europe/Zurich to show a member when the event starts. */
            'startsAt' => $this->startsAt(),
            /** ISO 8601 in UTC. Always after `startsAt`, and may fall on a later day. */
            'endsAt' => $this->endsAt(),
            'location' => $this->location,
            /** What to wear, or null when nothing was specified. */
            'attire' => $this->attire,
            /** Whether the event may be shown to people outside the band. */
            'isPublic' => $this->is_public,
            /** Free text for members. Not shown to the public. */
            'notes' => $this->notes,
            'registrationOpensAt' => $this->registration_opens_at?->utc()->toIso8601String(),
            'registrationClosesAt' => $this->registration_closes_at?->utc()->toIso8601String(),
            'registrationMaxGuests' => $this->registration_max_guests,
            /** Whether this event accepts public bookings at all. True exactly when `registrationClosesAt` is set. */
            'takesRegistrations' => $this->takesRegistrations(),
            /** The CALLING member's own answer for this event, or null if they have not replied. Never anybody else's. */
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
     *
     * ->utc() BEFORE ->toIso8601String(), HERE AND IN EVERY RESOURCE. That call
     * renders in whatever timezone the Carbon instance is carrying, which is
     * not always what the database holds: App\Casts\UtcDateTime normalises on
     * READ, but a model whose attribute was just ASSIGNED keeps the instance it
     * was given, and Eloquent's class-cast cache hands that same object back.
     *
     * A black-box review found the consequence on 2026-09-11.
     * POST /api/v1/events/series builds its times as Europe/Zurich wall-clock —
     * a season must keep the same clock time across the daylight-saving change,
     * which is the whole reason that endpoint takes `H:i` — so its 201 rendered
     * `+01:00` while a GET on the very same row rendered `+00:00`. The same
     * instant, the same declared resource, two spellings.
     *
     * Forcing it here makes that unreachable whatever a caller left in the
     * attribute. Tests\Feature\UtcRenderingTest compares a creation response
     * against a read of the same row, which is the only comparison that catches
     * it — asserting that a READ is UTC passed throughout.
     *
     * It is written inline rather than behind a helper deliberately: a helper
     * was tried and Scramble could not infer nullability through the static
     * call, which silently retyped `registrationOpensAt` from `string|null` to
     * `string` in the published contract. The nullsafe form below is what keeps
     * that right.
     */
    private function startsAt(): string
    {
        return $this->starts_at->utc()->toIso8601String();
    }

    /** Typed for the same reason as startsAt(). */
    private function endsAt(): string
    {
        return $this->ends_at->utc()->toIso8601String();
    }
}
