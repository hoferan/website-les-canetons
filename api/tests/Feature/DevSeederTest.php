<?php

namespace Tests\Feature;

use App\Models\Member;
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

    public function test_the_sections_are_ordered(): void
    {
        $names = Section::orderBy('sort_order')->pluck('name')->all();

        $this->assertSame('Trompettes', $names[0]);
        $this->assertGreaterThanOrEqual(4, count($names));
    }
}
