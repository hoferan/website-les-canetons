<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Support\EffectivePermissions;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * DONE WHEN, from #190: holding attendance.respond is the same set of members
 * as section_id IS NOT NULL, and holding events.view is every member. Both on a
 * fresh database and on one migrated from main.
 */
class SeedMemberAndMusicianRolesTest extends TestCase
{
    use RefreshDatabase;

    public function test_member_grants_the_planning_and_the_account(): void
    {
        $this->assertEqualsCanonicalizing(
            [Permission::EventsView, Permission::AccountManage],
            Role::baseline()->permissions()->all(),
        );
        $this->assertSame('member', Role::baseline()->key);
    }

    public function test_musician_grants_answering_and_is_not_the_baseline(): void
    {
        $musician = Role::where('key', 'musician')->sole();

        $this->assertEqualsCanonicalizing([Permission::AttendanceRespond], $musician->permissions()->all());
        $this->assertFalse($musician->is_baseline);
    }

    public function test_on_a_fresh_database_the_holders_match_the_old_rules(): void
    {
        $this->seedRoster();

        $this->migration()->up();

        $this->assertHoldersMatchTheOldRules();
    }

    public function test_on_a_database_migrated_from_main_the_holders_match_the_old_rules(): void
    {
        $this->seedRoster();
        $this->stripTheNewData();

        $this->migration()->up();

        $this->assertHoldersMatchTheOldRules();
    }

    public function test_it_is_safe_to_run_twice(): void
    {
        $this->seedRoster();
        $this->stripTheNewData();

        $this->migration()->up();
        $this->migration()->up();

        $this->assertSame(1, Role::where('key', 'member')->count());
        $this->assertSame(1, Role::where('key', 'musician')->count());
        $this->assertSame(
            Member::count(),
            DB::table('member_roles')->where('role_id', Role::baseline()->id)->count(),
        );
        $this->assertHoldersMatchTheOldRules();
    }

    public function test_it_does_not_undo_what_the_committee_changed(): void
    {
        // A role's permissions are the committee's business once seeded.
        $this->migration()->up();
        Role::where('key', 'musician')->sole()->syncPermissions([]);

        $this->migration()->up();

        $this->assertSame([], Role::where('key', 'musician')->sole()->permissions()->all());
    }

    public function test_nobody_gains_an_organising_permission(): void
    {
        $organiser = Member::factory()->administrator()->create();
        $committee = Member::factory()->committee()->create();
        $before = [
            $organiser->id => EffectivePermissions::for($organiser->id)->map->value->sort()->values()->all(),
            $committee->id => EffectivePermissions::for($committee->id)->map->value->sort()->values()->all(),
        ];

        $this->stripTheNewData();
        $this->migration()->up();

        foreach ([$organiser, $committee] as $person) {
            $after = EffectivePermissions::for($person->id)->map->value->sort()->values()->all();
            $this->assertSame([], array_values(array_diff($before[$person->id], $after)), 'lost a permission');
            $this->assertEqualsCanonicalizing(
                ['events.view', 'account.manage'],
                array_values(array_diff($after, $before[$person->id])),
                'gained more than the baseline',
            );
        }
    }

    private function assertHoldersMatchTheOldRules(): void
    {
        $this->assertEqualsCanonicalizing(
            Member::pluck('id')->all(),
            EffectivePermissions::memberIdsWith(Permission::EventsView)->all(),
            'events.view must be held by every member',
        );
        $this->assertEqualsCanonicalizing(
            Member::whereNotNull('section_id')->pluck('id')->all(),
            EffectivePermissions::memberIdsWith(Permission::AttendanceRespond)->all(),
            'attendance.respond must be held by exactly the members with a register',
        );
        $this->assertEqualsCanonicalizing(
            Member::pluck('id')->all(),
            EffectivePermissions::memberIdsWith(Permission::AccountManage)->all(),
        );
    }

    private function seedRoster(): void
    {
        Member::factory()->count(2)->create();                                  // no register
        Member::factory()->inSection('Cloches')->create();
        Member::factory()->inSection('Trompettes')->administrator()->create();  // plays and organises
    }

    /** Puts the database back to what main had: no new roles, no new grants. */
    private function stripTheNewData(): void
    {
        $ids = Role::whereIn('key', ['member', 'musician'])->pluck('id');
        DB::table('member_roles')->whereIn('role_id', $ids)->delete();
        DB::table('role_permissions')->whereIn('role_id', $ids)->delete();
        DB::table('roles')->whereIn('id', $ids)->delete();
    }

    private function migration(): object
    {
        return require database_path('migrations/2026_09_29_000002_seed_member_and_musician_roles.php');
    }
}
