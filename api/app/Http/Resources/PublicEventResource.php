<?php

namespace App\Http\Resources;

use App\Models\Event;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use LogicException;

/**
 * An event as a stranger sees it: enough to recognise the one they were told
 * about, and nothing else.
 *
 * DELIBERATELY NOT EventResource, which carries `notes` (internal) and
 * `isPublic` (the public agenda's business) and is only ever served to a
 * member. Four fields, each one a fact already on a poster.
 *
 * A RESOURCE RATHER THAN AN ARRAY INSIDE RegistrationFormResource, which is
 * where it lived until 2026-09-11. The shape was identical; what changed is
 * that the document now names it. An inline object is published anonymously,
 * so a generated client typed it as an unnamed nested object while every
 * sibling had a component of its own — and the public agenda, which needs
 * exactly these four fields, would have had no type to reuse.
 *
 * `id` AND `registrationOpen` WERE ADDED WHEN THE BOOKING SCREENS WERE BUILT,
 * and they are the two facts a booking form is unreachable without. The agenda
 * is the only public list of events there is; with no id it cannot link to
 * `/events/{id}/book`, and with no flag it would either link to a form that
 * refuses everybody or hide a form that is taking bookings. Neither is a
 * disclosure: the id opens nothing on its own — `GET /events/{event}/registration`
 * answers 404 for an event that takes no bookings, whether or not it exists —
 * and this list is already filtered to what the committee chose to publish.
 *
 * `registrationOpen` REPEATS RegistrationFormResource's top-level `open`
 * when this resource is nested inside it. The two are always equal and
 * computed from the same method; the top-level one is the form's own answer
 * and stays the one that screen reads.
 *
 * @mixin Event
 */
class PublicEventResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            /** In the committee's tag order. Empty when the event has none. */
            'tags' => EventTagResource::collection($this->tags),
            /** When it starts, in UTC. */
            'startsAt' => $this->startsAt(),
            /** When it ends, in UTC. May fall on a later day. */
            'endsAt' => $this->endsAt(),
            /** Where it happens, as free text. */
            'location' => $this->location(),
            /** Whether this event is taking public bookings right now. Link to the booking form only when it is true. */
            'registrationOpen' => $this->registrationIsOpen(),
        ];
    }

    /**
     * TYPED METHODS THAT REFUSE A NULL, so the document keeps promising strings.
     *
     * The model now types these three as nullable, because a draft may not
     * have them yet, and Scramble reads types. This list only ever holds
     * published events, which always have all four, so the contract must not
     * widen with the model. A draft reaching here is a bug in a route that
     * forgot to hide it, and failing loudly beats a null in a field a
     * generated client treats as a string.
     */
    private function startsAt(): Iso8601
    {
        return Iso8601::utc($this->starts_at ?? throw new LogicException('A draft reached the public event resource.'));
    }

    private function endsAt(): Iso8601
    {
        return Iso8601::utc($this->ends_at ?? throw new LogicException('A draft reached the public event resource.'));
    }

    private function location(): string
    {
        return $this->location ?? throw new LogicException('A draft reached the public event resource.');
    }
}
