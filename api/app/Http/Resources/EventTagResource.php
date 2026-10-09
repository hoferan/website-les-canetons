<?php

namespace App\Http\Resources;

use App\Models\EventTag;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One event tag, in both languages it may be named in.
 *
 * `eventCount` is there only where the query counted it, which is the tag
 * list. On an event the tag is compact, and its count would cost a query per
 * chip for a number nobody looks at there.
 *
 * @mixin EventTag
 */
class EventTagResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'labelFr' => $this->label_fr,
            /** Null when the committee gave no German name; show `labelFr` then. */
            'labelDe' => $this->label_de,
            'colour' => $this->colour,
            /** Whether answering "Oui" to an event carrying this tag throws confetti. */
            'celebrate' => $this->celebrate,
            /** How many events carry the tag, drafts included. Only on the tag list. */
            'eventCount' => $this->whenCounted('events'),
        ];
    }
}
