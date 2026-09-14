<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use App\Support\Permission;
use Database\Seeders\DevSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DevSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DevSeeder::class);
    }

    public function test_it_creates_the_three_demo_logins(): void
    {
        foreach (['demo.direction', 'demo.player', 'demo.both'] as $username) {
            $member = Member::where('username', $username)->first();

            $this->assertNotNull($member, "missing seeded member {$username}");
            $this->assertTrue(Hash::check('demo', $member->password));
        }
    }

    public function test_the_direction_member_can_manage_but_does_not_play(): void
    {
        $member = Member::where('username', 'demo.direction')->sole();

        $this->assertTrue($member->hasPermission(Permission::MembersManage));
        $this->assertTrue($member->hasPermission(Permission::EventsManage));
        $this->assertFalse($member->isPlayer());
    }

    public function test_the_player_has_no_permissions_but_plays(): void
    {
        $member = Member::where('username', 'demo.player')->sole();

        $this->assertTrue($member->permissions()->isEmpty());
        $this->assertTrue($member->isPlayer());
    }

    public function test_one_member_both_organises_and_plays(): void
    {
        // The case the old role matrix could not express.
        $member = Member::where('username', 'demo.both')->sole();

        $this->assertTrue($member->hasPermission(Permission::EventsManage));
        $this->assertTrue($member->isPlayer());
    }

    public function test_seeding_twice_does_not_duplicate_anyone(): void
    {
        $this->seed(DevSeeder::class);

        $this->assertSame(1, Member::where('username', 'demo.player')->count());
    }

    public function test_the_seeder_uses_the_real_registers_rather_than_inventing_any(): void
    {
        // The register list belongs to the 2026_09_07_000001 migration now.
        // What this pins is that the SEEDER did not add to it: a synthetic
        // register in the dev stack means a local screenshot shows a list no
        // server has.
        $names = Section::orderBy('sort_order')->pluck('name')->all();

        $this->assertSame([
            'Batteurs',
            'Grosses-caisses',
            'Lyre',
            'Cloches',
            'Trompettes',
            'Trombones',
        ], $names);
        $this->assertTrue(
            Section::where('sort_order', '!=', 0)->exists(),
            'expected at least one section with a non-zero sort_order',
        );
    }

    public function test_a_hand_edited_roles_permissions_survive_a_reseed(): void
    {
        $direction = Role::where('key', 'direction')->sole();

        // Simulate a developer experimenting with a role's permissions...
        $direction->syncPermissions([Permission::RegistrationsView]);

        // ...and re-running the seeder, as `npm run dev` does on every start.
        $this->seed(DevSeeder::class);

        $this->assertSame(
            [Permission::RegistrationsView],
            $direction->permissions()->all(),
            'a hand-edited role\'s permissions must survive a re-seed',
        );
    }
}
