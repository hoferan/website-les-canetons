<?php

namespace Database\Factories;

use App\Models\Role;
use App\Support\Permission;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A FIXTURE role — never one of the seeded ones.
 *
 * `direction` and `committee` are reference data created by
 * 2026_09_07_000001, which RefreshDatabase runs, so producing them here is a
 * duplicate-key error. Read those with Role::where('key', …), or use
 * MemberFactory's administrator() / committee() states.
 *
 * This exists for suites that need a role granting EXACTLY one permission —
 * AccessIntegrityTest needs one that grants members.manage and one that does
 * not — which no seeded role happens to do. Coupling those tests to reference
 * data would also mean a committee editing a role turns the suite red, and
 * roles are editable data.
 *
 * Roles carry no display name (decision B6): the UI translates by `key`.
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
