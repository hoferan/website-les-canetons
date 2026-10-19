<?php

namespace App\Http\Resources;

use App\Models\Event;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * What an anonymous visitor may see of an event in order to book a place.
 *
 * Deliberately not EventResource, which carries the internal `notes` and
 * `isPublic`; this endpoint needs no session. A stranger gets
 * PublicEventResource's facts, the options, and whether the form is open.
 *
 * `open` is computed here rather than derived by the client from the two
 * dates, so a browser with a wrong clock cannot show an open form for a
 * closed event.
 *
 * @mixin Event
 */
class RegistrationFormResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'event' => new PublicEventResource($this->resource),
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
