<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Creating and editing a person on the roster.
 *
 * EVERY MEMBER HAS AN ACCOUNT (2026_09_08_000001), so creating a person and
 * giving them a login are one operation. Create mints a generated password and
 * returns it exactly once, the same way a reset does — there is no
 * "person without an account yet" state to fall into.
 *
 * That matters for more than tidiness: a member created with an unusable
 * placeholder password could be given members.manage and then be the only
 * administrator left after a deletion, unable to log in. That is the ghost
 * administrator the credentials migration dissolved, and it must not come back
 * through the create path.
 */
class MemberWriteTest extends TestCase
{
    use RefreshDatabase;

    private Member $actor;

    protected function setUp(): void
    {
        parent::setUp();

        $this->actor = Member::factory()->named('Dominique', 'Direction')->administrator()->create();
    }

    private function acting(?Member $as = null): static
    {
        return $this->actingAsMember($as ?? $this->actor);
    }

    private function section(string $name = 'Cloches'): Section
    {
        return Section::where('name', $name)->sole();
    }

    /** @return array<string, mixed> */
    private function payload(array $overrides = []): array
    {
        return [
            'firstName' => 'Perrine',
            'lastName' => 'Player',
            'username' => 'perrine.player',
            'publicVisible' => false,
            ...$overrides,
        ];
    }

    public function test_it_creates_a_person_with_a_register_but_never_a_role(): void
    {
        $section = $this->section();

        $body = $this->acting()->postJson('/api/v1/members', $this->payload([
            'sectionId' => $section->id,
            'committeeTitle' => 'Présidente',
            'publicVisible' => true,
        ]))->assertCreated()->json();

        $member = Member::where('username', 'perrine.player')->sole();

        $this->assertSame('Perrine', $body['member']['firstName']);
        $this->assertSame($section->id, $member->section_id);
        $this->assertSame('Présidente', $member->committee_title);
        $this->assertTrue($member->public_visible);
        $this->assertSame([], $member->roles->pluck('id')->all());
    }

    public function test_creating_a_person_cannot_grant_a_role_even_if_asked(): void
    {
        // THE HOLE THIS CLOSES. PUT /members/{id}/roles re-authenticates; this
        // endpoint does not. Accepting roleIds here would have made the
        // unguarded path strictly easier than the guarded one — a stolen
        // session could mint a member holding `direction` and read its password
        // straight out of the 201 response, a backdoor needing no password.
        $role = Role::where('key', 'direction')->sole();

        $this->acting()->postJson('/api/v1/members', $this->payload([
            'roleIds' => [$role->id],
        ]))->assertCreated();

        $member = Member::where('username', 'perrine.player')->sole();
        $this->assertSame([], $member->roles->pluck('id')->all(), 'create must never grant a role');
    }

    public function test_a_created_person_can_log_in_with_the_password_it_returns(): void
    {
        // The whole reason create mints a credential rather than leaving the
        // person account-less: a member who cannot log in but can hold
        // members.manage is the ghost administrator that locked the band out.
        $body = $this->acting()->postJson('/api/v1/members', $this->payload())
            ->assertCreated()->json();

        $this->assertMatchesRegularExpression(
            '/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/',
            $body['generatedPassword'],
            'the password is the readable, dictatable one from GeneratedPassword',
        );

        $member = Member::where('username', 'perrine.player')->sole();
        $this->assertTrue(
            Hash::check($body['generatedPassword'], $member->password),
        );
        $this->assertTrue(
            $member->must_change_password,
            'a password somebody read down the phone is not a secret worth keeping',
        );
    }

    public function test_the_password_is_returned_once_and_never_read_back(): void
    {
        $this->acting()->postJson('/api/v1/members', $this->payload())->assertCreated();

        $raw = $this->acting()->getJson('/api/v1/members')->assertOk()->getContent();

        $this->assertStringNotContainsString('generatedPassword', $raw);
        $this->assertStringNotContainsString('argon2', $raw);
    }

    public function test_a_username_is_required_because_every_member_has_an_account(): void
    {
        $this->acting()->postJson('/api/v1/members', [
            'firstName' => 'Nadia',
            'lastName' => 'Sansconnexion',
            'publicVisible' => false,
        ])->assertStatus(400)
            ->assertJson(['code' => 'validation_failed'])
            ->assertJsonPath('errors.0.field', 'username')
            ->assertJsonPath('errors.0.reason', 'required');
    }

    public function test_a_duplicate_username_is_reported_against_its_own_field(): void
    {
        // The most likely error on this whole screen, so its copy matters. An
        // unmapped `unique` rule would render "Identifiant n'est pas dans un
        // format valide", which is both wrong and unhelpful.
        $this->acting()->postJson('/api/v1/members', $this->payload())->assertCreated();

        $this->acting()->postJson('/api/v1/members', $this->payload(['firstName' => 'Autre']))
            ->assertStatus(400)
            ->assertJson(['code' => 'validation_failed'])
            ->assertJsonPath('errors.0.field', 'username')
            ->assertJsonPath('errors.0.reason', 'already_taken');
    }

    public function test_a_missing_name_is_a_validation_failure_not_a_500(): void
    {
        $this->acting()->postJson('/api/v1/members', ['username' => 'x.y', 'publicVisible' => false])
            ->assertStatus(400)
            ->assertJson(['code' => 'validation_failed'])
            ->assertJsonPath('errors.0.field', 'firstName')
            ->assertJsonPath('errors.0.reason', 'required');
    }

    public function test_creating_a_person_is_audited_with_their_name(): void
    {
        $this->acting()->postJson('/api/v1/members', $this->payload())->assertCreated();

        $entry = AuditEntry::latest('id')->first();

        $this->assertSame('member.created', $entry->action);
        $this->assertSame($this->actor->id, $entry->actor_member_id);
        $this->assertSame('Perrine Player', $entry->target_label);
    }

    public function test_it_updates_only_the_fields_that_were_sent(): void
    {
        // Untouched, because PATCH means PATCH. A form that posts only the
        // changed field must not silently blank the rest.
        $member = Member::factory()
            ->named('Perrine', 'Player')
            ->inSection($this->section())
            ->publiclyVisible()
            ->create(['committee_title' => 'Caissière']);

        $this->acting()->withHeaders($this->ifMatch('member', $member))->patchJson("/api/v1/members/{$member->id}", ['lastName' => 'Joueuse'])
            ->assertOk();

        $member->refresh();
        $this->assertSame('Joueuse', $member->last_name);
        $this->assertSame('Perrine', $member->first_name);
        $this->assertSame('perrine.player', $member->username);
        $this->assertSame('Caissière', $member->committee_title);
        $this->assertTrue($member->public_visible);
        $this->assertNotNull($member->section_id);
    }

    public function test_an_explicit_null_clears_a_nullable_field(): void
    {
        // The nullable columns go through exists(), not has(): has() is false
        // for an explicitly-sent null, so clearing a register would silently do
        // nothing.
        $member = Member::factory()
            ->named('Perrine', 'Player')
            ->inSection($this->section())
            ->create(['committee_title' => 'Caissière']);

        $this->acting()->withHeaders($this->ifMatch('member', $member))->patchJson("/api/v1/members/{$member->id}", [
            'sectionId' => null,
            'committeeTitle' => null,
        ])->assertOk();

        $member->refresh();
        $this->assertNull($member->section_id);
        $this->assertNull($member->committee_title);
    }

    public function test_updating_a_person_keeps_their_own_username(): void
    {
        // The unique rule must ignore the row being edited, or renaming
        // somebody's surname fails because their username is "already taken"
        // by themselves.
        $member = Member::factory()->named('Perrine', 'Player')->create();

        $this->acting()->withHeaders($this->ifMatch('member', $member))->patchJson("/api/v1/members/{$member->id}", [
            'lastName' => 'Joueuse',
            'username' => 'perrine.player',
        ])->assertOk();

        $this->assertSame('perrine.player', $member->fresh()->username);
    }

    public function test_a_username_cannot_be_cleared_because_it_is_the_login(): void
    {
        // Under the old model this cleared the password and ended the sessions,
        // and had to be refused for the last administrator. The column is NOT
        // NULL now, so the whole branch is gone and the rule rejects it.
        $member = Member::factory()->named('Perrine', 'Player')->create();

        $this->acting()->withHeaders($this->ifMatch('member', $member))->patchJson("/api/v1/members/{$member->id}", ['username' => null])
            ->assertStatus(400)
            ->assertJson(['code' => 'validation_failed'])
            ->assertJsonPath('errors.0.field', 'username');

        $this->assertSame('perrine.player', $member->fresh()->username);
    }

    public function test_neither_write_requires_re_authentication(): void
    {
        // Deliberate. Creating and editing a person are not destructive, and a
        // password prompt on every corrected typo is a prompt people learn to
        // type through without reading — which is worse than not having one,
        // because it trains the reflex the destructive dialogs rely on.
        $this->acting()->postJson('/api/v1/members', $this->payload())->assertCreated();

        $member = Member::where('username', 'perrine.player')->sole();
        $this->acting()->withHeaders($this->ifMatch('member', $member))->patchJson("/api/v1/members/{$member->id}", ['firstName' => 'Perry'])
            ->assertOk();
    }

    public function test_a_player_cannot_write_to_the_roster(): void
    {
        $player = Member::factory()->named('Perrine', 'Player', 'perrine')->create();

        $this->acting($player)->postJson('/api/v1/members', $this->payload(['username' => 'other.one']))
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);

        $this->acting($player)->withHeaders($this->ifMatch('member', $player))->patchJson("/api/v1/members/{$player->id}", ['firstName' => 'X'])
            ->assertStatus(403);
    }
}
