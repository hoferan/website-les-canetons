<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\CommitteeFunction;
use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Creating and editing a person on the roster.
 *
 * Every member has an account, so creating a person and giving them a login
 * are one operation. Create mints a generated password and returns it once,
 * the same way a reset does.
 *
 * A member created with an unusable placeholder password could be given
 * members.manage and then be the only administrator left after a deletion,
 * unable to log in.
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

    /**
     * A committee seat by name. A migration seeds all eight as reference data
     * and RefreshDatabase runs it, so a test that created its own would assert
     * against a ninth seat nobody has.
     */
    private function seat(string $name): CommitteeFunction
    {
        return CommitteeFunction::where('name', $name)->sole();
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

    public function test_it_creates_a_person_with_a_register_and_only_the_baseline_role(): void
    {
        $section = $this->section();

        $body = $this->acting()->postJson('/api/v1/members', $this->payload([
            'sectionId' => $section->id,
            'committeeFunctionId' => $this->seat('Présidente')->id,
            'publicVisible' => true,
        ]))->assertCreated()->json();

        $member = Member::where('username', 'perrine.player')->sole();

        $this->assertSame('Perrine', $body['member']['firstName']);
        $this->assertSame($section->id, $member->section_id);
        $this->assertSame($this->seat('Présidente')->id, $member->committee_function_id);
        $this->assertTrue($member->public_visible);
        $this->assertSame([Role::baseline()->id], $member->roles->pluck('id')->all());
    }

    public function test_creating_a_person_cannot_grant_a_role_even_if_asked(): void
    {
        // Roles are granted only through PUT /members/{id}/roles, which checks
        // the lockout invariants. Accepting roleIds here would let a stolen
        // session mint a member holding `direction` and read its password
        // straight out of the 201 response.
        $role = Role::where('key', 'direction')->sole();

        $this->acting()->postJson('/api/v1/members', $this->payload([
            'roleIds' => [$role->id],
        ]))->assertCreated();

        $member = Member::where('username', 'perrine.player')->sole();
        $this->assertSame(
            [Role::baseline()->id],
            $member->roles->pluck('id')->all(),
            'create grants the baseline and nothing the request asked for',
        );
    }

    public function test_a_created_person_can_log_in_with_the_password_it_returns(): void
    {
        // A member who cannot log in but can hold members.manage could be the
        // last administrator and lock the band out.
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
        // The most likely error on this screen. An unmapped `unique` rule would
        // render "Identifiant n'est pas dans un format valide".
        $this->acting()->postJson('/api/v1/members', $this->payload())->assertCreated();

        $this->acting()->postJson('/api/v1/members', $this->payload(['firstName' => 'Autre']))
            ->assertStatus(400)
            ->assertJson(['code' => 'validation_failed'])
            ->assertJsonPath('errors.0.field', 'username')
            ->assertJsonPath('errors.0.reason', 'already_taken');
    }

    public function test_a_seat_that_does_not_exist_is_refused(): void
    {
        // The field names a row, so a seat that does not exist is refused
        // instead of published with a typo.
        //
        // `invalid_format` is ApiError's general answer for `exists`: the only
        // way to reach it is a stale form holding a deleted seat, which a
        // reload fixes. `sectionId` answers the same way.
        $this->acting()->postJson('/api/v1/members', $this->payload(['committeeFunctionId' => 9999]))
            ->assertStatus(400)
            ->assertJson(['code' => 'validation_failed'])
            ->assertJsonPath('errors.0.field', 'committeeFunctionId')
            ->assertJsonPath('errors.0.reason', 'invalid_format');
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
        // PATCH: a form that posts only the changed field must not blank the rest.
        $member = Member::factory()
            ->named('Perrine', 'Player')
            ->inSection($this->section())
            ->publiclyVisible()
            ->create(['committee_function_id' => $this->seat('Responsable caisse')->id]);

        $this->acting()->withHeaders($this->ifMatch('member', $member))->patchJson("/api/v1/members/{$member->id}", ['lastName' => 'Joueuse'])
            ->assertOk();

        $member->refresh();
        $this->assertSame('Joueuse', $member->last_name);
        $this->assertSame('Perrine', $member->first_name);
        $this->assertSame('perrine.player', $member->username);
        $this->assertSame($this->seat('Responsable caisse')->id, $member->committee_function_id);
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
            ->create(['committee_function_id' => $this->seat('Responsable caisse')->id]);

        $this->acting()->withHeaders($this->ifMatch('member', $member))->patchJson("/api/v1/members/{$member->id}", [
            'sectionId' => null,
            'committeeFunctionId' => null,
        ])->assertOk();

        $member->refresh();
        $this->assertNull($member->section_id);
        $this->assertNull($member->committee_function_id);
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
        // The column is NOT NULL, so the validation rule rejects a null.
        $member = Member::factory()->named('Perrine', 'Player')->create();

        $this->acting()->withHeaders($this->ifMatch('member', $member))->patchJson("/api/v1/members/{$member->id}", ['username' => null])
            ->assertStatus(400)
            ->assertJson(['code' => 'validation_failed'])
            ->assertJsonPath('errors.0.field', 'username');

        $this->assertSame('perrine.player', $member->fresh()->username);
    }

    public function test_neither_write_requires_re_authentication(): void
    {
        // Creating and editing a person are not destructive. A password prompt
        // on every corrected typo teaches people to type through prompts
        // without reading, which undermines the destructive dialogs.
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
