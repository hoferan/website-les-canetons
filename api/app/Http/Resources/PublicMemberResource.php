<?php

namespace App\Http\Resources;

use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A member as a stranger sees them: a name, and nothing else.
 *
 * Deliberately not MemberResource, which carries account details and
 * committee data that must stay private. The protection is that this class
 * does not read those fields: the model's `$hidden` does not apply to a
 * Resource.
 *
 * Most of these people are children, so `public_visible` defaults to false
 * and both controllers that render this resource filter on it themselves.
 * Consent is per person and is the only thing that puts a name on this site.
 *
 * `id` is only a rendering key. It opens nothing:
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
