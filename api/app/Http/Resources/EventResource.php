<?php

namespace App\Http\Resources;

use App\Models\Event;
use App\Support\Iso8601;
use App\Support\Permission;
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
            /**
             * How many answerable members have replied, or null when the
             * caller may not see answers.
             */
            'answeredCount' => $this->countOrNull($request, 'answered_count'),
            /**
             * How many members are answerable at all — the denominator of the
             * fraction. Null when the caller may not see answers.
             */
            'answerableCount' => $this->maySeeAnswers($request)
                ? $request->attributes->get('answerableCount')
                : null,
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

    /**
     * An aggregate, or null.
     *
     * NULL MEANS TWO THINGS AND THAT IS DELIBERATE: the caller may not see it,
     * or it was never loaded. The second is what keeps these counts out of
     * EntityTag. EntityTag::state() renders this Resource from a freshly-read
     * model with no ->load() at all — unlike the member and registration arms
     * beside it — so every aggregate is absent there and drops out of the
     * hash.
     *
     * Without that, a member ANSWERING an event would move that event's tag,
     * and a committee member's pending edit of the TITLE would answer 412 for
     * a reason that has nothing to do with the title. That is exactly the
     * failure myAttendance's docblock describes, arrived at from the other
     * side. Pinned by ConditionalWriteTest::
     * test_answering_an_event_does_not_move_its_tag.
     *
     * The overload is invisible to every consumer: the SPA renders the strip
     * only when can() passes AND the value is non-null, and the tag wants null
     * either way.
     */
    private function countOrNull(Request $request, string $attribute): ?int
    {
        if (! array_key_exists($attribute, $this->getAttributes())) {
            return null;
        }

        return $this->maySeeAnswers($request)
            ? (int) $this->getAttributes()[$attribute]
            : null;
    }

    /**
     * Whether the caller may see answer counts, memoized ON THE REQUEST
     * under the key `maySeeAnswers` — the exact key
     * EventController::maySeeAnswers() reads and writes.
     *
     * Member::hasPermission() runs EffectivePermissions::for(), a query every
     * time it is called — and this Resource's toArray() runs once per row.
     * Calling it directly from both count fields, unmemoized, is an N+1 that
     * scales with the number of events on the list; sharing the key with the
     * controller's own check (rather than a Resource-local one) is what
     * keeps the total at one query rather than two, caught by
     * EventCountsTest::test_listing_the_planning_for_the_committee_costs_a_fixed_number_of_queries,
     * not by anything that checks a value. `show()` never populates the key
     * first, so this resolves and caches it lazily on its own.
     */
    private function maySeeAnswers(Request $request): bool
    {
        if (! $request->attributes->has('maySeeAnswers')) {
            $request->attributes->set(
                'maySeeAnswers',
                $request->user()?->hasPermission(Permission::AttendanceViewAll) ?? false,
            );
        }

        return (bool) $request->attributes->get('maySeeAnswers');
    }
}
