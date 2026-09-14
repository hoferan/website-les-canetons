<?php

namespace App\Http\Resources;

use App\Models\Event;
use App\Support\Iso8601;
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
            'registrationOpensAt' => $this->registration_opens_at === null
                ? null
                : Iso8601::utc($this->registration_opens_at),
            'registrationClosesAt' => $this->registration_closes_at === null
                ? null
                : Iso8601::utc($this->registration_closes_at),
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
     * Scramble types an inline rendering call as an untyped object in the
     * OpenAPI document, and the declared return type is what gives it a shape.
     *
     * THE UTC CONVERSION MOVED INTO App\Support\Iso8601 on 2026-09-11, with
     * the argument for why it has to happen at all. It used to be written out
     * at every call site with a warning above it; a rule that has to be
     * remembered at nine call sites is a rule one of them will get wrong.
     *
     * The NULLABLE timestamps above are written as a ternary rather than as a
     * `?Iso8601` helper, and that is not stylistic. A helper was tried and
     * Scramble could not infer nullability through the static call, which
     * silently retyped `registrationOpensAt` from `string|null` to `string` in
     * the published contract — an optional field made required for every
     * generated client. Scramble reads the expression, not the signature.
     */
    private function startsAt(): Iso8601
    {
        return Iso8601::utc($this->starts_at);
    }

    /** Typed for the same reason as startsAt(). */
    private function endsAt(): Iso8601
    {
        return Iso8601::utc($this->ends_at);
    }
}
