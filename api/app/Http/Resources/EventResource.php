<?php

namespace App\Http\Resources;

use App\Models\Event;
use App\Support\EffectivePermissions;
use App\Support\Iso8601;
use App\Support\Permission;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One row on the planning: a rehearsal or a gig.
 *
 * Carries `myAttendance`, the caller's own answer and never anybody else's.
 * The controller scopes that relation to the current member inside the
 * query (EventController::myAttendance()). An unloaded relation reports null,
 * so the write paths that need it load it explicitly.
 *
 * Scramble does not publish this class docblock, while a `/** ... *\/` above
 * an entry in toArray() becomes that property's description. So internal
 * notes go here and caller-facing ones go on the field.
 * DocsTest::test_the_document_names_nothing_internal fails if a field
 * description names a PHP method, and only once the document is generated.
 *
 * The ANSWERABLE_COUNT attribute has one writer, the controller's
 * denominator helper, which sets it only after checking the same permission
 * this Resource checks, so the field's own gate is a second guard.
 *
 * @mixin Event
 */
class EventResource extends JsonResource
{
    /** Request-attribute key the controller and this Resource share for the denominator. */
    public const ANSWERABLE_COUNT = 'answerableCount';

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            /** In the committee's tag order. Empty when the event has none. */
            'tags' => EventTagResource::collection($this->tags),
            /** ISO 8601 in UTC. Convert to Europe/Zurich to show a member when the event starts. Null only on a draft that has no date yet. */
            'startsAt' => $this->starts_at === null ? null : Iso8601::utc($this->starts_at),
            /** ISO 8601 in UTC. After `startsAt` when both are set, and may fall on a later day. Null only on a draft that has no date yet. */
            'endsAt' => $this->ends_at === null ? null : Iso8601::utc($this->ends_at),
            /** Where it happens. Null only on a draft that has no location yet. */
            'location' => $this->location,
            /**
             * The event's poster, or null when it has none. Placed through
             * `PUT /photo-slots/event-{id}`, and not part of the event's ETag.
             */
            'poster' => PhotoResource::of($this->poster?->image),
            /**
             * When the event was published, in UTC. Null means it is still a
             * draft: only people who can manage events see it, and it is not
             * on anybody's planning yet.
             */
            'publishedAt' => $this->published_at === null ? null : Iso8601::utc($this->published_at),
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
             * How many members are answerable at all: the denominator of the
             * fraction. Null when the caller may not see answers.
             */
            'answerableCount' => ! $this->maySeeAnswers($request)
                ? null
                : ($request->attributes->get(self::ANSWERABLE_COUNT) === null
                    ? null
                    : (int) $request->attributes->get(self::ANSWERABLE_COUNT)),
            /**
             * How many people are booked: the sum of the quantities, so
             * "3 x adulte, 1 x enfant" counts as four. Null when the caller
             * may not see bookings.
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
            /** The calling member's own answer for this event, or null if they have not replied. Never anybody else's. */
            'myAttendance' => $this->myAttendance(),
        ];
    }

    /**
     * The caller's own answer, or null when they have not given one, so one
     * request renders the whole planning with the buttons in the right state.
     *
     * Reads a pre-loaded relation that the controller scopes to the current
     * member, and never queries. Querying here would silently leak other
     * answers or add an N+1.
     *
     * An unloaded relation reports null rather than throwing. That suits
     * store() and the series generator, where a new event has no answer, and
     * it is why update() loads it explicitly (pinned by
     * test_editing_an_event_still_reports_my_own_answer).
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
     * An aggregate, or null.
     *
     * Null means either that the caller may not see it or that it was never
     * loaded. Two independent guards keep these counts out of EntityTag:
     *
     * - Guard A, right below: `array_key_exists()` answers null when the
     *   aggregate was never loaded. Pinned by
     *   EventCountsTest::test_unloaded_aggregates_render_as_null_for_an_authorized_caller.
     * - Guard B, in maySeeAnswers() and EffectivePermissions::ofRequest():
     *   a request with no user has an empty permission set, so the gate
     *   answers false whatever is loaded. Pinned by EventCountsTest::
     *   test_loaded_aggregates_render_as_null_for_a_bare_request.
     *
     * In the tag path Guard B does the real work: EntityTag::state() renders
     * through bare(), a request with no user, so adding a ->load() for the
     * aggregates there would still tag correctly.
     *
     * Without them, a member answering an event would move its tag, and a
     * pending edit of the title would answer 412 for an unrelated reason.
     * ConditionalWriteTest::test_answering_an_event_does_not_move_its_tag
     * pins that outcome but cannot tell the guards apart.
     *
     * The SPA renders the strip only when can() passes and the value is
     * non-null, and the tag wants null either way, so the double meaning is
     * invisible to consumers.
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
     * The booked head count, or null. Same two guards as countOrNull().
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
     * Reads the permission set EffectivePermissions::ofRequest() resolves
     * once per request, which keeps the query count fixed.
     */
    private function maySeeAnswers(Request $request): bool
    {
        return EffectivePermissions::ofRequest($request)->contains(Permission::AttendanceViewAll);
    }

    /** The bookings gate. Same permission set as maySeeAnswers(), a different member of it. */
    private function maySeeGuests(Request $request): bool
    {
        return EffectivePermissions::ofRequest($request)->contains(Permission::RegistrationsView);
    }
}
