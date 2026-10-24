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
 * Deliberately not EventResource, which carries `notes` (internal) and
 * `isPublic` and is only served to members. The fields here are facts
 * already on a poster.
 *
 * A Resource rather than an inline array in RegistrationFormResource so the
 * OpenAPI document names it and the public agenda can reuse the type.
 *
 * `id` and `registrationOpen` let the agenda link to `/events/{id}/book` only
 * when the form takes bookings. Neither discloses anything: `GET
 * /events/{event}/registration` answers 404 for an event that takes no
 * bookings, whether or not it exists, and this list is already filtered to
 * what the committee published. `poster` is safe for the same reason: it is
 * the flyer, shown only on an event this list already shows.
 *
 * Nested in RegistrationFormResource, `registrationOpen` repeats the top-level
 * `open`. Both come from the same method; that screen reads `open`.
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
            /** The event's poster, or null when it has none. */
            'poster' => PhotoResource::of($this->poster?->image),
            /** Whether this event is taking public bookings right now. Link to the booking form only when it is true. */
            'registrationOpen' => $this->takesPublicBookingsNow(),
        ];
    }

    /**
     * Typed methods that refuse a null, so the document keeps promising
     * strings.
     *
     * The model types these three as nullable because a draft may lack them,
     * and Scramble reads types. This list only holds published events, which
     * always have them. A draft reaching here is a bug in a route that forgot
     * to hide it, so it throws instead of sending a null.
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
