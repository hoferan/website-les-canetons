<?php

namespace Tests\Feature;

use App\Models\CommitteeFunction;
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
 * Every member has an account. A young member's parent uses their login on
 * their behalf. People the band only displays (instructors, honorary members,
 * sponsors) are content, hold no permissions, appear in no attendance list and
 * are not rows in this table.
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
        // The schema is the guard. Nullable credentials would let somebody
        // hold members.manage while unable to log in, so blanking the last
        // administrator's username would lock the band out with no shell to
        // repair it. NOT NULL makes that impossible.
        $columns = collect(Schema::getColumns('members'))->keyBy('name');

        $this->assertFalse($columns['username']['nullable'], 'members.username must be NOT NULL');
        $this->assertFalse($columns['password']['nullable'], 'members.password must be NOT NULL');

        $body = $this->actingAsAdministrator()->getJson('/api/v1/members')->assertOk()->json('data');

        foreach ($body as $row) {
            $this->assertNotNull($row['username'], 'every member on the roster has a username');
        }

        // Every member has an account, so no row says whether it has one.
        $this->assertArrayNotHasKey('hasAccount', $body[0]);
    }

    public function test_it_is_ordered_by_name_so_a_person_can_be_found(): void
    {
        // Scanned for a person, not browsed by register. Grouping by register
        // is the UI's business, and it has sectionName to do it with.
        Member::factory()->named('Zoe', 'Alpha')->create();
        Member::factory()->named('Anne', 'Zulu')->create();

        $body = $this->actingAsAdministrator()->getJson('/api/v1/members')->assertOk()->json('data');

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
            ->musician()
            ->committee()
            ->create(['committee_function_id' => CommitteeFunction::where('name', 'Présidente')->sole()->id]);

        $body = $this->actingAsAdministrator()->getJson('/api/v1/members')->assertOk()->json('data');
        $camille = collect($body)->firstWhere('lastName', 'Committee');

        $this->assertSame($member->id, $camille['id']);
        $this->assertSame('Camille', $camille['firstName']);
        $this->assertSame('camille.committee', $camille['username']);
        $this->assertSame($section->id, $camille['sectionId']);
        $this->assertSame('Cloches', $camille['sectionName']);
        // The id, without the name. The roster form resolves the name from
        // GET /api/v1/committee-functions. App\Support\EntityTag hashes this
        // rendered resource, so a name here would move every committee
        // member's tag when a seat name is corrected and refuse roster edits
        // open at the time.
        $this->assertSame(
            CommitteeFunction::where('name', 'Présidente')->sole()->id,
            $camille['committeeFunctionId'],
        );
        $this->assertTrue($camille['publicVisible']);
        $this->assertFalse($camille['mustChangePassword']);
        $this->assertEqualsCanonicalizing(
            [Role::baseline()->id, Role::where('key', 'musician')->sole()->id, $role->id],
            $camille['roleIds'],
        );
        $this->assertNull($camille['lastLoginAt']);
    }

    public function test_it_never_exposes_a_password_hash(): void
    {
        // $hidden on the model covers a model serialised directly, and a
        // Resource that reads $this->password would bypass it.
        $raw = $this->actingAsAdministrator()->getJson('/api/v1/members')->assertOk()->getContent();

        $this->assertStringNotContainsString('password', $raw);
        $this->assertStringNotContainsString('argon2', $raw);
        $this->assertStringNotContainsString('bcrypt', $raw);
    }

    public function test_a_row_says_nothing_about_answering_beyond_its_roles(): void
    {
        // Whether somebody answers for events is what their roles grant, and
        // the roster already sends roleIds beside GET /api/v1/roles. A second
        // field saying the same thing could disagree with it.
        $body = $this->actingAsAdministrator()->getJson('/api/v1/members')->assertOk()->json('data');

        $this->assertNotEmpty($body);

        foreach ($body as $row) {
            $this->assertArrayNotHasKey('isPlayer', $row);
        }
    }

    public function test_it_answers_401_anonymously_and_403_without_the_permission(): void
    {
        $this->getJson('/api/v1/members')->assertStatus(401)->assertJson(['code' => 'not_authenticated']);

        $this->actingAsMember(Member::factory()->create())
            ->getJson('/api/v1/members')
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);
    }

    public function test_listing_the_roster_costs_a_fixed_number_of_queries(): void
    {
        // The real roster is about 45 members. Without eager loading this is
        // three queries per person on a shared host.
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

        $this->actingAsAdministrator()->getJson('/api/v1/members')->assertOk();

        // Session, permission lookup, the members query and one per eager-loaded
        // relation: a small constant. With 21 members an N+1 would be far past
        // this ceiling.
        $this->assertLessThan(15, $queries, "listing 21 members took {$queries} queries");
    }

    /**
     * Pins the permission string on the whole member-administration group.
     *
     * Every other positive test in the roster suites acts as `administrator()`,
     * which holds every permission, and every negative test uses a member with
     * no role. Any permission string in the middleware separates those two, so
     * only a single-permission fixture catches a swapped one.
     */
    public function test_members_manage_alone_admits_and_nothing_else_does(): void
    {
        $exactly = Member::factory()
            ->withRole(Role::factory()->granting(Permission::MembersManage)->create())
            ->create();

        $this->actingAsMember($exactly)->getJson('/api/v1/members')->assertOk();
    }

    public function test_a_different_permission_does_not_admit(): void
    {
        // The other half: a member who holds a real permission, just not this one.
        $organiser = Member::factory()
            ->withRole(Role::factory()->granting(Permission::EventsManage)->create())
            ->create();

        $this->actingAsMember($organiser)
            ->getJson('/api/v1/members')
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);
    }

    public function test_the_reference_data_needs_the_same_permission(): void
    {
        // /sections and /roles sit in the same route group.
        $organiser = Member::factory()
            ->withRole(Role::factory()->granting(Permission::EventsManage)->create())
            ->create();

        $this->actingAsMember($organiser)->getJson('/api/v1/sections')->assertStatus(403);
        $this->actingAsMember($organiser)->getJson('/api/v1/roles')->assertStatus(403);
    }
}
