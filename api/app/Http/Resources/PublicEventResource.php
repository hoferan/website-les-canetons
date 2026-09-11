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
 * `isPublic` (R2's business) and is only ever served to a member. Four fields,
 * each one a fact already on a poster.
 *
 * A RESOURCE RATHER THAN AN ARRAY INSIDE RegistrationFormResource, which is
 * where it lived until 2026-09-11. The shape was identical; what changed is
 * that the document now names it. An inline object is published anonymously,
 * so a generated client typed it as an unnamed nested object while every
 * sibling had a component of its own — and R2's public agenda, which needs
 * exactly these four fields, would have had no type to reuse.
 *
 * @mixin Event
 */
class PublicEventResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'title' => $this->title,
            /** When it starts, in UTC. */
            'startsAt' => Iso8601::utc($this->starts_at),
            /** When it ends, in UTC. May fall on a later day. */
            'endsAt' => Iso8601::utc($this->ends_at),
            /** Where it happens, as free text. */
            'location' => $this->location,
        ];
    }
}
