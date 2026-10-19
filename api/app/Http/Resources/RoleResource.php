<?php

namespace App\Http\Resources;

use App\Models\Role;
use App\Support\Permission;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A role, with what it grants.
 *
 * `labelFr` and `labelDe` are what the committee typed in the role editor,
 * rendered verbatim (ADR 0026). A seeded role nobody has renamed has neither,
 * and the UI translates its fixed `key` through web/src/i18n/ instead.
 *
 * The permissions travel with the role because every grant comes from a role,
 * never from a per-member grant (ADR 0014). The roster therefore needs no
 * per-member permission list, which keeps GET /api/v1/members to one query
 * per relation.
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
            /** Stable identifier, never shown. A role with no typed name is translated by this key. */
            'key' => $this->key,
            /** The name the committee typed in French, or null for a seeded role nobody has renamed. */
            'labelFr' => $this->label_fr,
            /** The name in German, or null. Show the French one when only that exists. */
            'labelDe' => $this->label_de,
            /**
             * True for exactly one role: the one every account holds. It cannot be removed from anyone, so keep it in
             * every `roleIds` sent to `PUT /api/v1/members/{member}/roles`.
             */
            'isBaseline' => $this->is_baseline,
            /** Everything this role grants, as permission strings. */
            'permissions' => $this->permissionValues(),
            /** Who holds it, by last name. Only on `GET /api/v1/roles/{role}`, where deleting it starts. */
            'holders' => $this->whenLoaded('members', fn () => $this->holders()),
        ];
    }

    /**
     * Typed for the same reason as permissionValues().
     *
     * @return list<array{id: int, firstName: string, lastName: string}>
     */
    private function holders(): array
    {
        return $this->members
            ->sortBy(fn ($member) => [$member->last_name, $member->first_name])
            ->map(fn ($member): array => [
                'id' => (int) $member->id,
                'firstName' => (string) $member->first_name,
                'lastName' => (string) $member->last_name,
            ])
            ->values()
            ->all();
    }

    /**
     * A typed method, not an inline expression: written inline this types as
     * {"type":"object","additionalProperties":{}} in the OpenAPI document. The
     * docblock makes it string[].
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
