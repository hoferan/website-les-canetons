<?php

namespace App\Http\Resources;

use App\Models\CommitteeFunction;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A seat on the committee.
 *
 * Shaped like SectionResource because the table is shaped like `sections`: the
 * roster form renders both through the same select, and two reference lists
 * that differ for no reason are two things to learn.
 *
 * @mixin CommitteeFunction
 */
class CommitteeFunctionResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            /** The seat's name, as the committee writes it. Content, so never translated. */
            'name' => $this->name,
            /** Ascending rank order. What the public committee page sorts by. */
            'sortOrder' => $this->sort_order,
        ];
    }
}
