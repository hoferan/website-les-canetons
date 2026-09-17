<?php

namespace App\Http\Resources;

use App\Models\Event;
use App\Support\Iso8601;
use App\Support\Permission;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

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
    /** Request-attribute keys the controller and this Resource share. See permissionsFor(). */
    public const PERMISSIONS = 'eventPermissions';

    public const ANSWERABLE_COUNT = 'answerableCount';

    /**
     * The caller's permission set, resolved ONCE per request.
     *
     * EffectivePermissions::for() is a single query returning EVERY permission
     * the member holds, but Member::hasPermission() re-runs it on every call
     * — so memoizing a boolean PER GATE (the shape this used to take) still
     * costs one query per gate, because each gate's first check throws that
     * whole set away after reading one entry out of it. Memoizing the SET
     * itself, once, keeps the total at one query however many gates
     * (`maySeeAnswers`, `maySeeGuests`, and whatever comes after) end up
     * reading it. Both `EventController::index()` (for the denominator) and
     * this Resource (once per row) read the SAME key, which is what keeps
     * a whole list at one query rather than one per caller.
     *
     * A request with no user resolves to an empty set: EntityTag::state()
     * renders this Resource through a bare Request::create('/'), and every
     * gate must answer false there rather than throw.
     *
     * @return Collection<int, Permission>
     */
    public static function permissionsFor(Request $request): Collection
    {
        if (! $request->attributes->has(self::PERMISSIONS)) {
            $request->attributes->set(
                self::PERMISSIONS,
                $request->user()?->permissions() ?? collect(),
            );
        }

        return $request->attributes->get(self::PERMISSIONS);
    }

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
             * fraction. Null when the caller may not see answers, OR when the
             * attribute was never set (EventController::answerable() is the
             * sole writer, and only after checking the same permission).
             */
            'answerableCount' => ! $this->maySeeAnswers($request)
                ? null
                : ($request->attributes->get(self::ANSWERABLE_COUNT) === null
                    ? null
                    : (int) $request->attributes->get(self::ANSWERABLE_COUNT)),
            /**
             * How many PEOPLE are booked — the sum of the quantities, because
             * "3 x adulte, 1 x enfant" is four people and four is what fills
             * the hall. Null when the caller may not see bookings.
             */
            'guestCount' => $this->guestCountOrNull($request),
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
     * NULL MEANS TWO THINGS AND THAT IS DELIBERATE: the caller may not see
     * it, or it was never loaded. TWO INDEPENDENT GUARDS keep these counts
     * out of EntityTag, and a review proved they are genuinely independent
     * — neither is a restatement of the other:
     *
     * - Guard A, right below: `array_key_exists()` answers null when the
     *   aggregate was never loaded on the model. Isolated by
     *   EventCountsTest::test_unloaded_aggregates_render_as_null_for_an_authorized_caller,
     *   which renders an authorized caller (every gate passes, so Guard B
     *   does not fire) against a model with the aggregates never loaded.
     *   Goes red if Guard A is removed.
     * - Guard B, in maySeeAnswers()/permissionsFor(): a request with no
     *   user resolves to an empty permission set, so the gate answers false
     *   regardless of what is loaded. Isolated by EventCountsTest::
     *   test_loaded_aggregates_render_as_null_for_a_bare_request, which
     *   loads the aggregates and renders a bare, unauthenticated request
     *   anyway. Goes red if Guard B is removed.
     *
     * IN THE TAG PATH SPECIFICALLY, Guard B is the one doing the real work,
     * not Guard A. EntityTag::state() renders this Resource from a
     * freshly-read model with no ->load() at all — unlike the member and
     * registration arms beside it — so Guard A also happens to hold there.
     * But EntityTag::state() also renders through bare(), a request with no
     * user, so Guard B holds independently of whether anything was loaded:
     * a mutation that added a ->load() for the aggregates inside state()
     * would defeat Guard A alone and still tag correctly, on Guard B. That
     * mutation is exactly what test_loaded_aggregates_render_as_null_for_a_bare_request
     * pins.
     *
     * Without both, a member ANSWERING an event would move that event's tag,
     * and a committee member's pending edit of the TITLE would answer 412 for
     * a reason that has nothing to do with the title. That is exactly the
     * failure myAttendance's docblock describes, arrived at from the other
     * side. Pinned by ConditionalWriteTest::
     * test_answering_an_event_does_not_move_its_tag — which pins the
     * user-facing outcome but, being a plain HTTP round trip, cannot tell
     * the two guards apart; the two EventCountsTest cases above do that.
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
     * The booked head count, or null. Same two guards as countOrNull() — see
     * its docblock for why "not loaded" (Guard A) and "no caller" (Guard B)
     * are independent, and which one actually does the work in the tag path.
     */
    private function guestCountOrNull(Request $request): ?int
    {
        if (! array_key_exists('guest_count', $this->getAttributes())) {
            return null;
        }

        return $this->maySeeGuests($request)
            ? (int) ($this->getAttributes()['guest_count'] ?? 0)
            : null;
    }

    /**
     * Whether the caller may see answer counts.
     *
     * Reads the permission set permissionsFor() resolved once for the whole
     * request — see its docblock for why that, and not a boolean memoized
     * per gate, is what keeps the query count fixed.
     */
    private function maySeeAnswers(Request $request): bool
    {
        return self::permissionsFor($request)->contains(Permission::AttendanceViewAll);
    }

    /** The bookings gate. Same permission set as maySeeAnswers(), a different member of it. */
    private function maySeeGuests(Request $request): bool
    {
        return self::permissionsFor($request)->contains(Permission::RegistrationsView);
    }
}
