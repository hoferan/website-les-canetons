<?php

namespace App\Http\Resources;

use App\Models\Event;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

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
            /** When it starts, in UTC. */
            'startsAt' => Iso8601::utc($this->starts_at),
            /** When it ends, in UTC. May fall on a later day. */
            'endsAt' => Iso8601::utc($this->ends_at),
            /** Where it happens, as free text. */
            'location' => $this->location,
            /** Whether this event is taking public bookings right now. Link to the booking form only when it is true. */
            'registrationOpen' => $this->registrationIsOpen(),
        ];
    }
}
