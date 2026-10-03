<?php

namespace App\Http\Resources;

use App\Models\HistoryEntry;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One entry of the band's history, in every language it was written in.
 *
 * @mixin HistoryEntry
 */
class HistoryEntryResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            /** `Y-m-d`, truncated to `precision`: 2002-10-01 for October 2002. */
            'occurredOn' => $this->occurred_on->toDateString(),
            /** `year`, `month` or `day`: how much of `occurredOn` to show. */
            'precision' => $this->precision,
            'titleFr' => $this->title_fr,
            'bodyFr' => $this->body_fr,
            'titleDe' => $this->title_de,
            'bodyDe' => $this->body_de,
            /** Drawn larger on the timeline. */
            'important' => $this->important,
            /** One of the history icon keys, or null for the plain dot. */
            'icon' => $this->icon,
            'createdAt' => $this->createdAt(),
            'updatedAt' => $this->updatedAt(),
        ];
    }

    private function createdAt(): Iso8601
    {
        return Iso8601::utc($this->created_at);
    }

    private function updatedAt(): Iso8601
    {
        return Iso8601::utc($this->updated_at);
    }
}
