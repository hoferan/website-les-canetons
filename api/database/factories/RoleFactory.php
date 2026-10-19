<?php

namespace Database\Factories;

use App\Models\Role;
use App\Support\Permission;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A fixture role, never one of the seeded ones.
 *
 * `direction` and `committee` are reference data from migration
 * 2026_09_07_000001, which RefreshDatabase runs, so producing them here is a
 * duplicate-key error. Read those with Role::where('key', …), or use
 * MemberFactory's administrator() / committee() states.
 *
 * For suites that need a role granting exactly the permissions they name
 * (AccessIntegrityTest needs one with members.manage and one without), which
 * no seeded role does. Roles are editable data, so tests coupled to the
 * seeded grants would break whenever somebody edited one.
 *
 * The definition sets only `key`; a fixture role has no labels.
 *
 * @extends Factory<Role>
 */
class RoleFactory extends Factory
{
    protected $model = Role::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'key' => 'fixture-'.fake()->unique()->numberBetween(1, 99999),
        ];
    }

    public function granting(Permission ...$permissions): static
    {
        return $this->afterCreating(
            fn (Role $role) => $role->syncPermissions($permissions),
        );
    }

    /** Everything the enum defines, like the seeded `direction` role. */
    public function grantingEverything(): static
    {
        return $this->granting(...Permission::cases());
    }
}
