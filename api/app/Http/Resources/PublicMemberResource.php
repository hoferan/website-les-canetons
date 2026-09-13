<?php

namespace App\Http\Resources;

use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A member as a stranger sees them: a name, and nothing else.
 *
 * DELIBERATELY NOT MemberResource, in the same way PublicEventResource is not
 * EventResource. That one carries the username, the last login, the roles and
 * the consent flag itself — every field of it is either an account detail or
 * something the committee administers, and none of it may leave the building.
 * The protection is that this class does not write those lines; a Resource
 * that read them would sail past the model's `$hidden` exactly as MemberResource
 * would.
 *
 * MOST OF THESE PEOPLE ARE CHILDREN, which is why `public_visible` defaults to
 * false and why the two controllers that render this resource filter on it
 * rather than leaving that to a caller. Consent is per person and it is the
 * only thing that puts a name on this site.
 *
 * `id` is here for a rendering key and for nothing else. It opens nothing:
 * `GET /members/{member}` answers 401 without a session.
 *
 * @mixin Member
 */
class PublicMemberResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'firstName' => $this->first_name,
            'lastName' => $this->last_name,
        ];
    }
}
