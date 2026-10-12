<?php

namespace App\Http\Resources;

use App\Models\Role;
use App\Support\Permission;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A role, WITH what it grants.
 *
 * TWO KINDS OF NAME. `labelFr` and `labelDe` are what the committee typed in
 * the role editor, rendered verbatim (ADR 0026). A seeded role nobody has
 * renamed has neither, and the UI translates its fixed `key` through
 * web/src/i18n/fr.ts instead: a name a developer chose is system text, and the
 * API is English without exception.
 *
 * The permissions travel with the role because that is how the UI answers "why
 * does she have this?" — always "because she is in Team Direction", never a
 * per-member grant (ADR 0014). The roster screen therefore needs no per-member
 * permission list, which also keeps GET /api/v1/members to one query per relation
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
