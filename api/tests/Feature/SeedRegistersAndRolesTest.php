<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\Section;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The registers and roles arrive as a migration, not a seeder, because the
 * shared host has no shell: `artisan db:seed` cannot run on a server, and the
 * migration path is the only remote trigger. See ADR 0014.
 *
 * RefreshDatabase runs migrations, so every test in the suite starts with
 * these rows present. They are reference data, not fixtures.
 */
class SeedRegistersAndRolesTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_six_real_registers_exist_in_the_bands_own_order(): void
    {
        $names = Section::orderBy('sort_order')->pluck('name')->all();

        // The band's own order. "Direction" is not a register: a musical
        // director is a member holding the "Responsable Team Direction" seat in
        // committee_functions, or one whose instructor_of_section_id points at
        // the register they teach. As a register it would be selectable as
        // somebody's instrument.
        $this->assertSame([
            'Batteurs',
            'Grosses-caisses',
            'Lyre',
            'Cloches',
            'Trompettes',
            'Trombones',
        ], $names);
    }

    public function test_the_seeded_roles_carry_no_typed_name(): void
    {
        // A seeded role's name is system text chosen by a developer, so it is
        // translated from `key` in web/src/i18n/. `label_fr` and `label_de`
        // hold only what the committee types in the role editor (ADR 0026).
        $this->assertSame(
            0,
            Role::query()->whereNotNull('label_fr')->orWhereNotNull('label_de')->count(),
            'a migration must not write a role name in French or German',
        );
    }

    public function test_the_direction_role_grants_every_organising_permission(): void
    {
        $direction = Role::where('key', 'direction')->sole();

        // The three account-level permissions belong to `member` and `musician`.
        // Direction holds `member` beside them, so it still sees the planning;
        // it does not answer events unless it also plays.
        $expected = array_filter(
            Permission::cases(),
            fn (Permission $p): bool => ! in_array($p, [
                Permission::EventsView,
                Permission::AttendanceRespond,
                Permission::AccountManage,
            ], true),
        );

        $this->assertEqualsCanonicalizing($expected, $direction->permissions()->all());
    }

    public function test_the_committee_role_grants_the_guest_list_and_the_inbox(): void
    {
        $committee = Role::where('key', 'committee')->sole();

        $this->assertEqualsCanonicalizing(
            [Permission::RegistrationsView, Permission::MessagesView],
            $committee->permissions()->all(),
        );
    }

    public function test_re_running_the_migration_neither_duplicates_nor_resets(): void
    {
        // Every migration must be safe to run twice, and a committee that has
        // edited what a role grants must not have it silently reset.
        //
        // up() is called directly: RefreshDatabase has already migrated, so
        // `artisan migrate` would find nothing pending and the assertions
        // would pass without running the migration again.
        $direction = Role::where('key', 'direction')->sole();
        $direction->syncPermissions([Permission::RegistrationsView]);

        $migration = require database_path(
            'migrations/2026_09_07_000001_seed_registers_and_roles.php',
        );
        $migration->up();

        $this->assertSame(6, Section::count());
        // Later migrations add their own roles, so count only this migration's.
        $this->assertSame(2, Role::whereIn('key', ['direction', 'committee'])->count());
        $this->assertSame(
            [Permission::RegistrationsView],
            Role::where('key', 'direction')->sole()->permissions()->all(),
            'a hand-edited role must survive a re-migration',
        );
    }
}
