<?php

namespace App\Http\Resources;

use App\Support\Inbox\InboxItem;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One item in the committee inbox.
 *
 * `kind` is a machine name and stays English; the SPA translates it. `title`
 * and `summary` are content — a stranger's name and their own words — and are
 * rendered verbatim.
 *
 * @mixin InboxItem
 */
class InboxItemResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            /** Which source this came from, e.g. `contactMessage`. */
            'kind' => $this->kind,
            /** The id of the underlying row, unique only within its kind. */
            'id' => $this->id,
            'title' => $this->title,
            'summary' => $this->summary,
            'arrivedAt' => Iso8601::utc($this->arrivedAt),
            /** Where to go to deal with it, relative to the site root. */
            'path' => $this->path,
        ];
    }
}
