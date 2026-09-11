<?php

namespace App\Http\Resources;

use App\Models\Event;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * What an ANONYMOUS visitor may see of an event in order to book a place.
 *
 * DELIBERATELY NOT EventResource. That one carries `notes`, which is
 * internal, and `isPublic`, which is R2's business — and this endpoint is
 * reachable without a session. A stranger gets the four facts they need to
 * recognise the event they were told about, the options, and whether the
 * form is open.
 *
 * The `open` boolean is computed rather than left to the client to derive
 * from the two dates: a browser with a wrong clock would otherwise render an
 * open form for a closed event, and the refusal would arrive only after the
 * guest had filled it in.
 *
 * @mixin Event
 */
class RegistrationFormResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'event' => [
                'title' => $this->title,
                'startsAt' => Iso8601::utc($this->starts_at),
                'endsAt' => Iso8601::utc($this->ends_at),
                'location' => $this->location,
            ],
            'options' => RegistrationOptionResource::collection($this->registrationOptions),
            'maxGuests' => $this->registration_max_guests,
            'opensAt' => $this->registration_opens_at === null
                ? null
                : Iso8601::utc($this->registration_opens_at),
            'closesAt' => $this->registration_closes_at === null
                ? null
                : Iso8601::utc($this->registration_closes_at),
            'open' => $this->registrationIsOpen(),
        ];
    }
}
