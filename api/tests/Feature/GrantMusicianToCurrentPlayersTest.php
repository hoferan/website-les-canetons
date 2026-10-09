<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Support\EffectivePermissions;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The switch from the register to attendance.respond takes answering away from
 * nobody. A member given a register after 2026_09_29_000002 ran holds only the
 * baseline role, which is the state every factory member with inSection() and
 * no musician() reproduces.
 */
class GrantMusicianToCurrentPlayersTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_player_who_joined_after_the_roles_existed_can_answer_again(): void
    {
        $lateJoiner = Member::factory()->inSection('Cloches')->create();
        $this->assertFalse($lateJoiner->hasPermission(Permission::AttendanceRespond));

        $this->migration()->up();

        $this->assertTrue($lateJoiner->hasPermission(Permission::AttendanceRespond));
    }

    public function test_a_member_without_a_register_is_given_nothing(): void
    {
        $organiser = Member::factory()->administrator()->create();
        $before = EffectivePermissions::for($organiser->id)->all();

        $this->migration()->up();

        $this->assertEquals($before, EffectivePermissions::for($organiser->id)->all());
    }

    public function test_it_is_safe_to_run_twice(): void
    {
        $player = Member::factory()->inSection('Cloches')->create();
        $alreadyMusician = Member::factory()->inSection('Batteurs')->musician()->create();

        $this->migration()->up();
        $this->migration()->up();

        $musician = Role::where('key', 'musician')->sole()->id;
        foreach ([$player, $alreadyMusician] as $member) {
            $this->assertSame(1, $member->roles()->whereKey($musician)->count());
        }
    }

    public function test_without_the_role_it_does_nothing(): void
    {
        // A committee that deleted `musician` by hand has decided something
        // this migration has no business reversing.
        $player = Member::factory()->inSection('Cloches')->create();
        Role::where('key', 'musician')->sole()->delete();

        $this->migration()->up();

        $this->assertSame([Role::baseline()->id], $player->roles()->pluck('roles.id')->all());
    }

    private function migration(): object
    {
        return require database_path('migrations/2026_10_09_000002_grant_musician_to_current_players.php');
    }
}
