<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The roster: everyone associated with the band, account or not.
 *
 * ONE ROSTER (design §8). The screen that administers people must list people,
 * not accounts — otherwise a person with no login can never be given one, and
 * the band keeps a second list somewhere else.
 */
class MemberIndexTest extends TestCase
{
    use RefreshDatabase;

    private ?Member $admin = null;

    private function administrator(): Member
    {
        return $this->admin ??= tap(Member::create([
            'first_name' => 'Dominique',
            'last_name' => 'Direction',
            'username' => 'dominique',
            'password' => 'secret123',
        ]), fn (Member $m) => $m->roles()->attach(Role::where('key', 'direction')->sole()));
    }

    private function actingAsAdministrator(): static
    {
        return $this->actingAs($this->administrator())
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp]);
    }

    public function test_it_lists_people_with_and_without_accounts(): void
    {
        // A person with no credentials at all — an instructor on the public
        // page, or a child whose parent answers. ONE ROSTER: if this row is
        // missing from the list, the screen is an account list wearing a
        // roster's name, and the person can never be given an account.
        Member::create(['first_name' => 'Nadia', 'last_name' => 'Sansconnexion']);

        $body = $this->actingAsAdministrator()->getJson('/api/members')->assertOk()->json();

        $names = array_column($body, 'lastName');
        $this->assertContains('Sansconnexion', $names);
        $this->assertContains('Direction', $names);

        $nadia = collect($body)->firstWhere('lastName', 'Sansconnexion');
        $this->assertNull($nadia['username']);
        $this->assertFalse($nadia['hasAccount']);
    }

    public function test_it_is_ordered_by_name_so_a_person_can_be_found(): void
    {
        // Scanned for a person, not browsed by register. Grouping by register
        // is the UI's business, and it has sectionName to do it with.
        Member::create(['first_name' => 'Zoe', 'last_name' => 'Alpha']);
        Member::create(['first_name' => 'Anne', 'last_name' => 'Zulu']);

        $body = $this->actingAsAdministrator()->getJson('/api/members')->assertOk()->json();

        $this->assertSame(['Alpha', 'Direction', 'Zulu'], array_column($body, 'lastName'));
    }

    public function test_each_entry_carries_what_the_roster_screen_renders(): void
    {
        $section = Section::where('name', 'Cloches')->sole();
        $role = Role::where('key', 'committee')->sole();
        $member = Member::create([
            'first_name' => 'Camille',
            'last_name' => 'Committee',
            'section_id' => $section->id,
            'username' => 'camille',
            'password' => 'secret123',
            'committee_title' => 'Présidente',
            'public_visible' => true,
        ]);
        $member->roles()->attach($role);

        $body = $this->actingAsAdministrator()->getJson('/api/members')->assertOk()->json();
        $camille = collect($body)->firstWhere('lastName', 'Committee');

        $this->assertSame($member->id, $camille['id']);
        $this->assertSame('Camille', $camille['firstName']);
        $this->assertSame('camille', $camille['username']);
        $this->assertTrue($camille['hasAccount']);
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
        // every count carries a permanent phantom "sans réponse".
        $body = $this->actingAsAdministrator()->getJson('/api/members')->assertOk()->json();
        $dominique = collect($body)->firstWhere('lastName', 'Direction');

        $this->assertNull($dominique['sectionId']);
        $this->assertNull($dominique['sectionName']);
        $this->assertFalse($dominique['isPlayer']);
    }

    public function test_it_answers_401_anonymously_and_403_without_the_permission(): void
    {
        $this->getJson('/api/members')->assertStatus(401)->assertJson(['code' => 'not_authenticated']);

        $plain = Member::create([
            'first_name' => 'Perrine',
            'last_name' => 'Player',
            'username' => 'perrine',
            'password' => 'secret123',
        ]);

        $this->actingAs($plain)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp])
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

        $section = Section::where('name', 'Trompettes')->sole();
        $role = Role::where('key', 'committee')->sole();
        for ($i = 0; $i < 20; $i++) {
            $member = Member::create([
                'first_name' => 'Person',
                'last_name' => 'Number'.str_pad((string) $i, 2, '0', STR_PAD_LEFT),
                'section_id' => $section->id,
            ]);
            $member->roles()->attach($role);
        }

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
}
