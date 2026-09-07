<?php

namespace App\Http\Resources;

use App\Models\Role;
use App\Support\Permission;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A role, WITH what it grants.
 *
 * The permissions travel with the role because that is how the UI answers "why
 * does she have this?" — always "because she is in Team Direction", never a
 * per-member grant (design §3). The roster screen therefore needs no per-member
 * permission list, which also keeps GET /api/members to one query per relation
 * instead of one per member.
 *
 * @mixin Role
 */
class RoleResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'key' => $this->key,
            'labelFr' => $this->label_fr,
            'permissions' => $this->permissionValues(),
        ];
    }

    /**
     * A typed method, not an inline expression, and that is not style. Measured
     * 2026-09-07: written inline this types as
     * {"type":"object","additionalProperties":{}} in the OpenAPI document and
     * arrives in TypeScript as an untyped object. The docblock is what makes it
     * string[].
     *
     * @return list<string>
     */
    private function permissionValues(): array
    {
        return $this->permissions()
            ->map(fn (Permission $permission): string => $permission->value)
            ->values()
            ->all();
    }
}
