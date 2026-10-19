<?php

namespace Tests\Feature;

use App\Models\AuditEntry;
use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * A member changes their own password.
 *
 * No permission is required: every member needs this screen and nobody
 * administers it. Every first login lands here, because a committee-issued
 * password arrives with must_change_password set.
 *
 * setUp() deliberately does not call actingAs(); each authenticated test calls
 * actingAsMember() itself, so the last test is genuinely anonymous. An auth
 * test that is accidentally authenticated passes for the wrong reason.
 */
class AccountPasswordTest extends TestCase
{
    use RefreshDatabase;

    private const CURRENT = 'issued-by-the-committee';

    private Member $member;

    protected function setUp(): void
    {
        parent::setUp();

        $this->member = Member::factory()
            ->named('Perrine', 'Player', 'perrine')
            ->withPassword(self::CURRENT)
            ->mustChangePassword()
            ->create();
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

    public function test_a_member_can_change_their_own_password(): void
    {
        $this->actingAsMember($this->member)->postJson('/api/v1/me/password', [
            'currentPassword' => self::CURRENT,
            'newPassword' => 'a-password-they-chose',
        ])->assertOk();

        $this->assertTrue(Hash::check('a-password-they-chose', $this->member->fresh()->password));
    }

    public function test_it_clears_the_forced_change_flag(): void
    {
        $this->actingAsMember($this->member)->postJson('/api/v1/me/password', [
            'currentPassword' => self::CURRENT,
            'newPassword' => 'a-password-they-chose',
        ])->assertOk();

        $this->assertFalse($this->member->fresh()->must_change_password);
    }

    public function test_the_wrong_current_password_changes_nothing(): void
    {
        // The current password is what stands between a borrowed, unlocked
        // phone and a stolen account.
        $before = $this->member->password;

        $this->actingAsMember($this->member)->postJson('/api/v1/me/password', [
            'currentPassword' => 'not-it',
            'newPassword' => 'a-password-they-chose',
        ])->assertStatus(403)->assertJson(['code' => 'reauth_failed']);

        $this->assertSame($before, $this->member->fresh()->password);
        $this->assertTrue($this->member->fresh()->must_change_password);
    }

    public function test_a_short_password_is_refused_with_a_message_about_length(): void
    {
        // A short password answers too_short, not invalid_number ("n'est pas
        // un nombre valide").
        $this->actingAsMember($this->member)->postJson('/api/v1/me/password', [
            'currentPassword' => self::CURRENT,
            'newPassword' => 'short',
        ])->assertStatus(400)
            ->assertJson(['code' => 'validation_failed'])
            ->assertJsonPath('errors.0.field', 'newPassword')
            ->assertJsonPath('errors.0.reason', 'too_short')
            ->assertJsonPath('errors.0.params.min', 8);
    }

    public function test_it_ends_the_members_other_sessions_but_not_this_one(): void
    {
        // A stolen session stops working when the password changes, but the
        // current one stays. Every first login lands on the forced-change
        // form, so logging the actor out would bounce every new account back
        // to the login page.
        $this->sessionFor('their-phone', $this->member->id);
        $this->sessionFor('their-laptop', $this->member->id);

        $this->actingAsMember($this->member)->postJson('/api/v1/me/password', [
            'currentPassword' => self::CURRENT,
            'newPassword' => 'a-password-they-chose',
        ])->assertOk();

        $this->assertSame(0, DB::table('sessions')->where('user_id', $this->member->id)
            ->whereIn('id', ['their-phone', 'their-laptop'])->count());
    }

    public function test_the_member_is_still_logged_in_afterwards(): void
    {
        $this->actingAsMember($this->member)->postJson('/api/v1/me/password', [
            'currentPassword' => self::CURRENT,
            'newPassword' => 'a-password-they-chose',
        ])->assertOk();

        $this->actingAsMember($this->member)->getJson('/api/v1/me')->assertOk();
    }

    public function test_it_is_audited_without_either_password(): void
    {
        $this->actingAsMember($this->member)->postJson('/api/v1/me/password', [
            'currentPassword' => self::CURRENT,
            'newPassword' => 'a-password-they-chose',
        ])->assertOk();

        $entry = AuditEntry::latest('id')->first();
        $this->assertSame('account.password_changed', $entry->action);
        $this->assertSame($this->member->id, $entry->actor_member_id);

        $log = AuditEntry::all()->toJson();
        $this->assertStringNotContainsString(self::CURRENT, $log);
        $this->assertStringNotContainsString('a-password-they-chose', $log);
    }

    /**
     * #92. A committee-issued password is read out over the phone, so somebody
     * else has heard it, and must_change_password keeps it from outliving its
     * first use. "Changing" it to itself would keep the password a third party
     * knows and clear the flag that protects it.
     */
    public function test_a_new_password_identical_to_the_current_one_is_refused(): void
    {
        $this->actingAsMember($this->member)->postJson('/api/v1/me/password', [
            'currentPassword' => self::CURRENT,
            'newPassword' => self::CURRENT,
        ])->assertStatus(409)->assertJson(['code' => 'password_unchanged']);
    }

    public function test_a_refused_change_leaves_the_forced_change_gate_standing(): void
    {
        $this->actingAsMember($this->member)->postJson('/api/v1/me/password', [
            'currentPassword' => self::CURRENT,
            'newPassword' => self::CURRENT,
        ])->assertStatus(409);

        // If the flag cleared anyway, the next login would pass the gate on the
        // password that was dictated over the phone.
        $fresh = $this->member->fresh();
        $this->assertTrue($fresh->must_change_password);
        $this->assertTrue(Hash::check(self::CURRENT, $fresh->password));
    }

    /**
     * Order matters. Re-authentication runs first, so a caller with the wrong
     * current password is told so even when the two fields match each other.
     * Checking equality first would answer `password_unchanged` to somebody
     * who does not know the password at all, which misleads them.
     */
    public function test_a_wrong_current_password_still_answers_reauth_failed(): void
    {
        $this->actingAsMember($this->member)->postJson('/api/v1/me/password', [
            'currentPassword' => 'not-the-current-one',
            'newPassword' => 'not-the-current-one',
        ])->assertStatus(403)->assertJson(['code' => 'reauth_failed']);
    }

    public function test_an_anonymous_caller_gets_401(): void
    {
        $this->postJson('/api/v1/me/password', [
            'currentPassword' => self::CURRENT,
            'newPassword' => 'a-password-they-chose',
        ])->assertStatus(401)->assertJson(['code' => 'not_authenticated']);
    }
}
