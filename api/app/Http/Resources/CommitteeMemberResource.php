<?php

namespace App\Http\Resources;

use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One seat on the committee: a name and the seat that person holds.
 *
 * NOT PublicMemberResource PLUS A FIELD, because the seat is what this
 * endpoint is for — a member without one is not on this page at all, so the
 * field is required here and absent there rather than nullable in one shared
 * shape.
 *
 * THE SEAT TRAVELS AS ITS NAME, not as its id. It moved onto a reference table
 * on 2026-09-14, and that bought a rank and a single place to fix a typo — but
 * it is still text the committee types, so it is still rendered verbatim and no
 * translation layer reaches it. That is the trade the editability ladder makes:
 * whoever names a thing decides whether it can ever be translated
 * (ADR 0014). A role's name is a developer's key and can be translated; this
 * cannot. A public page has no use for the id, so it is not sent.
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
            // NOT NULL-SAFE, deliberately, and this is the one place in the
            // codebase where that is true of a relation. CommitteeController
            // reaches this resource through an INNER JOIN on
            // committee_functions, so a member without a seat never arrives
            // here — and a `?->` would publish the field as nullable and make
            // every client branch on a null it can never be handed.
            /** The seat they hold, as the committee named it. Content, so never translated. */
            'function' => $this->committeeFunction->name,
        ];
    }
}
