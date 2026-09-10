<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The roster: everyone the band tracks for events.
 *
 * EVERY MEMBER HAS AN ACCOUNT (2026_09_08_000001). A young member's parent uses
 * their login on their behalf, so there is no such thing as an unused one.
 * People the band merely DISPLAYS — instructors, honorary members, sponsors —
 * are content, hold no permissions, appear in no attendance list, and are not
 * rows in this table.
 */
class MemberIndexTest extends TestCase
{
    use RefreshDatabase;

    private ?Member $admin = null;

    private function administrator(): Member
    {
        return $this->admin ??= Member::factory()->named('Dominique', 'Direction')->administrator()->create();
    }

    private function actingAsAdministrator(): static
    {
        return $this->actingAsMember($this->administrator());
    }

    public function test_every_member_has_an_account(): void
    {
        // THE SCHEMA IS THE GUARD, and it replaces five AccessIntegrity tests.
        // Nullable credentials let somebody hold members.manage while being
        // unable to log in, so "two administrators, delete one, blank the
        // other's username" locked the band out with no shell to repair it.
        // NOT NULL dissolves that rather than guarding against it; this is what
        // keeps it dissolved.
        $columns = collect(Schema::getColumns('members'))->keyBy('name');

        $this->assertFalse($columns['username']['nullable'], 'members.username must be NOT NULL');
        $this->assertFalse($columns['password']['nullable'], 'members.password must be NOT NULL');

        $body = $this->actingAsAdministrator()->getJson('/api/members')->assertOk()->json();

        foreach ($body as $row) {
            $this->assertNotNull($row['username'], 'every member on the roster has a username');
        }

        // There is no "does this person have an account?" question left to ask.
        $this->assertArrayNotHasKey('hasAccount', $body[0]);
    }

    public function test_it_is_ordered_by_name_so_a_person_can_be_found(): void
    {
        // Scanned for a person, not browsed by register. Grouping by register
        // is the UI's business, and it has sectionName to do it with.
        Member::factory()->named('Zoe', 'Alpha')->create();
        Member::factory()->named('Anne', 'Zulu')->create();

        $body = $this->actingAsAdministrator()->getJson('/api/members')->assertOk()->json();

        $this->assertSame(['Alpha', 'Direction', 'Zulu'], array_column($body, 'lastName'));
    }

    public function test_each_entry_carries_what_the_roster_screen_renders(): void
    {
        $section = Section::where('name', 'Cloches')->sole();
        $role = Role::where('key', 'committee')->sole();
        $member = Member::factory()
            ->named('Camille', 'Committee')
            ->inSection($section)
            ->publiclyVisible()
            ->committee()
            ->create(['committee_title' => 'Présidente']);

        $body = $this->actingAsAdministrator()->getJson('/api/members')->assertOk()->json();
        $camille = collect($body)->firstWhere('lastName', 'Committee');

        $this->assertSame($member->id, $camille['id']);
        $this->assertSame('Camille', $camille['firstName']);
        $this->assertSame('camille.committee', $camille['username']);
        $this->assertSame($section->id, $camille['sectionId']);
        $this->assertSame('Cloches', $camille['sectionName']);
        $this->assertTrue($camille['isPlayer']);
        // committee_title is text a person typed, so it is stored and rendered
        // verbatim — never translated. Contrast a role's name, which is a key.
        $this->assertSame('Présidente', $camille['committeeTitle']);
        $this->assertTrue($camille['publicVisible']);
        $this->assertFalse($camille['mustChangePassword']);
        $this->assertSame([$role->id], $camille['roleIds']);
        $this->assertNull($camille['lastLoginAt']);
    }

    public function test_it_never_exposes_a_password_hash(): void
    {
        // $hidden on the model covers a model serialised directly; a Resource
        // that reads $this->password would sail straight past it. This is the
        // assertion that catches that.
        $raw = $this->actingAsAdministrator()->getJson('/api/members')->assertOk()->getContent();

        $this->assertStringNotContainsString('password', $raw);
        $this->assertStringNotContainsString('argon2', $raw);
        $this->assertStringNotContainsString('bcrypt', $raw);
    }

    public function test_a_person_without_a_register_is_not_a_player(): void
    {
        // The single fact that decides who is answerable for events. An
        // organiser with no register must not appear in an attendance list, or
        // every count carries a permanent phantom "sans réponse". Note this is
        // a separate question from having an account — everybody has one of
        // those.
        $body = $this->actingAsAdministrator()->getJson('/api/members')->assertOk()->json();
        $dominique = collect($body)->firstWhere('lastName', 'Direction');

        $this->assertNull($dominique['sectionId']);
        $this->assertNull($dominique['sectionName']);
        $this->assertFalse($dominique['isPlayer']);
    }

    public function test_it_answers_401_anonymously_and_403_without_the_permission(): void
    {
        $this->getJson('/api/members')->assertStatus(401)->assertJson(['code' => 'not_authenticated']);

        $this->actingAsMember(Member::factory()->create())
            ->getJson('/api/members')
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);
    }

    public function test_listing_the_roster_costs_a_fixed_number_of_queries(): void
    {
        // ~45 members is the real roster. Without eager loading this is three
        // queries per person on a shared host, and the screen that administers
        // the band is the one that feels it.
        $this->administrator();

        Member::factory()
            ->count(20)
            ->inSection('Trompettes')
            ->committee()
            ->create();

        $queries = 0;
        DB::listen(function () use (&$queries): void {
            $queries++;
        });

        $this->actingAsAdministrator()->getJson('/api/members')->assertOk();

        // Session, permission lookup, the members query and one per eager-loaded
        // relation — a small constant. What must NOT happen is growth with the
        // roster: 21 members here, and an N+1 would be far past this ceiling.
        $this->assertLessThan(15, $queries, "listing 21 members took {$queries} queries");
    }

    /**
     * PINS THE PERMISSION STRING on the whole member-administration group.
     *
     * Found by mutation on 2026-09-10: swapping this group's
     * `permission:members.manage` for `permission:events.manage` left 47
     * tests green. Every positive test in the roster suites acts as
     * `administrator()`, which holds the seeded `direction` role and
     * therefore Permission::cases() — every permission there is — while
     * every negative test uses a member with no role at all. Between those
     * two actors, any string in that middleware separates them, so none of
     * them could see the swap.
     *
     * The events, attendance and registration groups all got a
     * single-permission fixture when the same bug was found there. The
     * roster is the group that was missed.
     */
    public function test_members_manage_alone_admits_and_nothing_else_does(): void
    {
        $exactly = Member::factory()
            ->withRole(Role::factory()->granting(Permission::MembersManage)->create())
            ->create();

        $this->actingAsMember($exactly)->getJson('/api/members')->assertOk();
    }

    public function test_a_different_permission_does_not_admit(): void
    {
        // The other half, and the half that actually kills the mutation: a
        // member who holds a real permission, just not this one.
        $organiser = Member::factory()
            ->withRole(Role::factory()->granting(Permission::EventsManage)->create())
            ->create();

        $this->actingAsMember($organiser)
            ->getJson('/api/members')
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);
    }

    public function test_the_reference_data_needs_the_same_permission(): void
    {
        // /sections and /roles ride in the same group and were equally
        // unpinned.
        $organiser = Member::factory()
            ->withRole(Role::factory()->granting(Permission::EventsManage)->create())
            ->create();

        $this->actingAsMember($organiser)->getJson('/api/sections')->assertStatus(403);
        $this->actingAsMember($organiser)->getJson('/api/roles')->assertStatus(403);
    }
}
