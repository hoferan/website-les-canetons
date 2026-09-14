<?php

namespace App\Http\Resources;

use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One seat on the committee: a name and the title that person holds.
 *
 * NOT PublicMemberResource PLUS A FIELD, because the title is what this
 * endpoint is for — a member without one is not on this page at all, so the
 * field is required here and absent there rather than nullable in one shared
 * shape.
 *
 * The title is TEXT SOMEBODY TYPED. It is stored and rendered verbatim and no
 * translation layer reaches it, which is the trade the editability ladder
 * makes: whoever names a thing decides whether it can ever be translated
 * (design §3.1). A role's name is a key and can be; this cannot.
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
            /** The seat they hold, as the committee typed it. Content, so never translated. */
            'title' => $this->committee_title,
        ];
    }
}
