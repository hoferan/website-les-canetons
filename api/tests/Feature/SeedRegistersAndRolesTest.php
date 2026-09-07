<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\Section;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The registers and roles arrive as a MIGRATION, not a seeder, because the
 * shared host has no shell: `artisan db:seed` cannot be run on a server, and
 * the only remote trigger that exists is the migration path. See the rebuild
 * design's §7 and decision B2 in the R1b plan.
 *
 * RefreshDatabase runs migrations, so every test in the suite now starts with
 * these rows present. That is intentional — they are reference data, not
 * fixtures.
 */
class SeedRegistersAndRolesTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_six_real_registers_exist_in_the_bands_own_order(): void
    {
        $names = Section::orderBy('sort_order')->pluck('name')->all();

        // The band's own order, recovered from the pre-rebuild /canetons page.
        // "Direction" was listed there too and is NOT a register: a musical
        // director is a member with a committee_title, or one whose
        // instructor_of_section_id points at the register they teach. Putting
        // it here would make it selectable as somebody's instrument.
        $this->assertSame([
            'Batteurs',
            'Grosses-caisses',
            'Lyre',
            'Cloches',
            'Trompettes',
            'Trombones',
        ], $names);
    }

    public function test_the_direction_role_grants_every_permission(): void
    {
        $direction = Role::where('key', 'direction')->sole();

        $this->assertSame('Team Direction', $direction->label_fr);
        $this->assertEqualsCanonicalizing(Permission::cases(), $direction->permissions()->all());
    }

    public function test_the_committee_role_grants_only_the_guest_list(): void
    {
        $committee = Role::where('key', 'committee')->sole();

        $this->assertSame('Comité', $committee->label_fr);
        $this->assertSame([Permission::RegistrationsView], $committee->permissions()->all());
    }

    public function test_re_running_the_migration_neither_duplicates_nor_resets(): void
    {
        // A deployed server re-runs nothing, but RunPendingMigrations and
        // `artisan migrate` both must be safe to invoke twice, and a
        // committee that has edited what a role grants must not have it
        // silently reset underneath them — the "roles are editable data"
        // capability this rebuild exists to add.
        //
        // The migration's up() is invoked DIRECTLY rather than through
        // `artisan migrate`. RefreshDatabase has already migrated, so `migrate`
        // would find nothing pending and no-op — the assertions below would
        // then pass without the idempotency they claim to test ever being
        // exercised. Mutation-tested: making the migration re-sync
        // unconditionally fails this test, which it could not do via artisan.
        $direction = Role::where('key', 'direction')->sole();
        $direction->syncPermissions([Permission::RegistrationsView]);

        $migration = require database_path(
            'migrations/2026_09_07_000001_seed_registers_and_roles.php',
        );
        $migration->up();

        $this->assertSame(6, Section::count());
        $this->assertSame(2, Role::count());
        $this->assertSame(
            [Permission::RegistrationsView],
            Role::where('key', 'direction')->sole()->permissions()->all(),
            'a hand-edited role must survive a re-migration',
        );
    }
}
