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
 * No permission is required, and that is the point: this is the screen every
 * member needs and nobody administers. It is also where every first login
 * lands, because a committee-issued password arrives with
 * must_change_password set.
 *
 * setUp() creates the member but deliberately does NOT call actingAs() — every
 * authenticated test opens with actingAsMember($this->member) instead, using
 * the base TestCase helper. That is what lets the last test be genuinely
 * anonymous; un-acting after the fact works until it quietly does not, and an
 * auth test that is accidentally authenticated passes for the wrong reason.
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
        // Knowing the current password is the only thing standing between a
        // borrowed, unlocked phone and a permanently stolen account.
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
        // `min` used to map to 'invalid_number' — "n'est pas un nombre valide"
        // for a short password. ApiError's own docblock predicted this and
        // asked for a too_short token; this is it.
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
        // A stolen session stops working the moment the password changes (§6)
        // — but not the session standing on the screen. Every first login lands
        // on the forced-change form, so logging the actor out here would bounce
        // every new account straight back to the login page.
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

    public function test_an_anonymous_caller_gets_401(): void
    {
        $this->postJson('/api/v1/me/password', [
            'currentPassword' => self::CURRENT,
            'newPassword' => 'a-password-they-chose',
        ])->assertStatus(401)->assertJson(['code' => 'not_authenticated']);
    }
}
