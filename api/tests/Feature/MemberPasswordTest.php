<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\Member;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * An administrator issues a member a new password, and reads it out (§4.4).
 *
 * Issuing a credential and resetting one are the SAME operation — §4.4
 * describes one mechanism, so there is one endpoint. Since 2026_09_08_000001
 * every member already has a password, so this is always a reset; the "give
 * this person an account" case is POST /api/members, which mints one at
 * creation.
 */
class MemberPasswordTest extends TestCase
{
    use RefreshDatabase;

    private const ACTOR_PASSWORD = 'the-actors-password';

    private Member $actor;

    protected function setUp(): void
    {
        parent::setUp();

        $this->actor = Member::create([
            'first_name' => 'Dominique',
            'last_name' => 'Direction',
            'username' => 'dominique',
            'password' => self::ACTOR_PASSWORD,
        ]);
        $this->actor->roles()->attach(Role::where('key', 'direction')->sole());
    }

    private function member(string $username = 'perrine'): Member
    {
        return Member::create([
            'first_name' => 'Perrine',
            'last_name' => 'Player',
            'username' => $username,
            'password' => 'their-old-password',
        ]);
    }

    private function sessionFor(string $id, ?int $memberId): void
    {
        DB::table('sessions')->insert([
            'id' => $id,
            'user_id' => $memberId,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'phpunit',
            'payload' => base64_encode(serialize([])),
            'last_activity' => time(),
        ]);
    }

    private function acting(?Member $as = null): static
    {
        return $this->actingAs($as ?? $this->actor)
            ->withHeaders(['Origin' => 'http://localhost'])
            ->withSession(['auth.started_at' => now()->timestamp]);
    }

    public function test_it_returns_a_password_once_and_stores_only_its_hash(): void
    {
        $target = $this->member();

        $body = $this->acting()->postJson("/api/members/{$target->id}/password")->assertOk()->json();

        // The returned value is the only copy that will ever exist in plaintext.
        $this->assertMatchesRegularExpression('/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/', $body['generatedPassword']);
        $this->assertTrue(Hash::check($body['generatedPassword'], $target->fresh()->password));
        $this->assertNotSame($body['generatedPassword'], $target->fresh()->password);
    }

    public function test_it_forces_a_change_at_the_next_login(): void
    {
        // The password was read out loud down a phone, so it is not a secret
        // and must not survive first use.
        $target = $this->member();

        $this->acting()->postJson("/api/members/{$target->id}/password")->assertOk();

        $this->assertTrue($target->fresh()->must_change_password);
    }

    public function test_it_ends_every_session_the_target_had(): void
    {
        $target = $this->member();
        $bystander = $this->member('bastien');
        $this->sessionFor('target-phone', $target->id);
        $this->sessionFor('target-laptop', $target->id);
        $this->sessionFor('bystander-phone', $bystander->id);

        $body = $this->acting()->postJson("/api/members/{$target->id}/password")->assertOk()->json();

        $this->assertSame(2, $body['sessionsEnded']);
        $this->assertSame(0, DB::table('sessions')->where('user_id', $target->id)->count());
        $this->assertDatabaseHas('sessions', ['id' => 'bystander-phone']);
    }

    public function test_resetting_your_own_password_here_keeps_you_logged_in(): void
    {
        // The UI sends an administrator to /account for their own password, so
        // this path is unusual — but being logged out by your own click, with a
        // generated password you then have to use, is a bad enough outcome to
        // be worth one branch. The forced change still applies.
        //
        // WHAT THIS DOES NOT PROVE, measured 2026-09-08: swapping
        // forMemberExcept() for forMember() here keeps every test in this file
        // green. phpunit.xml runs SESSION_DRIVER=array, so the acting request
        // has no row in `sessions` and both calls delete exactly the same rows;
        // switching that one test to the database driver does not help either,
        // because actingAs() mints a fresh session id per request and persists
        // none of them. The helper's own behaviour IS covered — see
        // SessionRevocationTest — but the choice between the two calls is not
        // observable from here.
        $this->sessionFor('actor-other-device', $this->actor->id);

        $this->acting()->postJson("/api/members/{$this->actor->id}/password")->assertOk();

        $this->acting()->getJson('/api/me')->assertOk();
        $this->assertDatabaseMissing('sessions', ['id' => 'actor-other-device']);
        $this->assertTrue($this->actor->fresh()->must_change_password);
    }

    public function test_it_is_audited(): void
    {
        $target = $this->member();

        $this->acting()->postJson("/api/members/{$target->id}/password")->assertOk();

        $entry = AuditEntry::latest('id')->first();
        $this->assertSame('member.password_reset', $entry->action);
        $this->assertSame($this->actor->id, $entry->actor_member_id);
        $this->assertSame('Perrine Player', $entry->target_label);
    }

    public function test_the_generated_password_never_appears_in_the_audit_log(): void
    {
        // The one place a credential could plausibly get written down forever.
        $target = $this->member();

        $body = $this->acting()->postJson("/api/members/{$target->id}/password")->assertOk()->json();

        $log = AuditEntry::all()->toJson();
        $this->assertStringNotContainsString($body['generatedPassword'], $log);
        $this->assertStringNotContainsString(self::ACTOR_PASSWORD, $log);
    }

    public function test_a_player_cannot_issue_a_password(): void
    {
        $player = $this->member('plain');
        $target = $this->member('someone.else');

        $this->acting($player)->postJson("/api/members/{$target->id}/password")->assertStatus(403)->assertJson(['code' => 'access_denied']);
    }
}
