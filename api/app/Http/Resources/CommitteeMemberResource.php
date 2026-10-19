<?php

namespace App\Http\Resources;

use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One seat on the committee: a name and the seat that person holds.
 *
 * A separate shape from PublicMemberResource: a member without a seat is not
 * on this page, so `function` is required here instead of nullable in a
 * shared shape.
 *
 * The seat travels as its name, not its id. It is text the committee types,
 * so it is rendered verbatim and never translated: whoever names a thing
 * decides whether it can be translated (ADR 0014).
 *
 * `function` is deliberately not null-safe: CommitteeController inner-joins
 * committee_functions, so every member here has a seat, and `?->` would
 * publish the field as nullable.
 *
 * @mixin Member
 */
class CommitteeMemberResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'firstName' => $this->first_name,
            'lastName' => $this->last_name,
            /** The seat they hold, as the committee named it. Content, so never translated. */
            'function' => $this->committeeFunction->name,
        ];
    }
}
