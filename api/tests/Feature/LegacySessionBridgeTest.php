<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\LegacySession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * READ THIS BEFORE TRUSTING THIS FILE.
 *
 * WHAT IS COVERED: only App\Support\LegacySession::shapeFor() — the pure
 * function producing the array written to $_SESSION['user']. That is the part
 * that must stay byte-identical to what the old app's App\Auth::user()
 * returns, and it is the only part that can be asserted here.
 *
 * WHAT IS NOT COVERED: the bridge actually working. PHP's native session is
 * process-global and cannot be meaningfully started under PHPUnit — output has
 * already begun, so LegacySession's headers_sent()/CLI guard makes write() and
 * forget() deliberately inert in this process. Asserting on $_SESSION here
 * would therefore prove nothing about production, so this file does not
 * pretend to. Specifically NOT covered:
 *   - that write() sets a PHPSESSID cookie the old app accepts
 *   - that the cookie flags match App\Auth::startSession()
 *   - that an old members' page renders as logged in after POST /api/login
 *   - that forget() logs that page back out
 *
 * THE REAL VERIFICATION IS OVER HTTP against the running local stack, which
 * already dispatches /api/* into Laravel exactly as the servers will after the
 * cutover:
 *   1. GET /sanctum/csrf-cookie, then POST /api/login with the XSRF-TOKEN
 *      cookie echoed as an X-XSRF-TOKEN header and Origin: http://localhost:8090,
 *      keeping one cookie jar.
 *   2. GET /inscriptions_utilisateurs with that jar -> renders (200); without
 *      it -> 302 to /authentification_inscription.
 *   3. GET /planning_repet as demo.admin -> contains the admin-only
 *      #admin-interface block; as demo.user -> does not.
 *   4. POST /api/logout, then repeat step 2 -> 302 again.
 * Re-run those by hand after touching LegacySession or App\Auth. A green suite
 * here is not evidence the bridge works.
 */
class LegacySessionBridgeTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $username, string $role): User
    {
        return User::create([
            'username' => $username,
            'password' => 'secret123',
            'role' => $role,
        ]);
    }

    /**
     * The old app's App\Auth::completeLogin() writes exactly
     * ['username' => ..., 'role' => ...]. Anything else and App\Auth::user()
     * / ::role() misread the session.
     */
    public function test_shape_matches_what_the_old_app_expects(): void
    {
        $user = $this->makeUser('demo.admin', 'admin');

        $this->assertSame(
            ['username' => 'demo.admin', 'role' => 'admin'],
            LegacySession::shapeFor($user)
        );
    }

    public function test_shape_carries_the_role_through_for_every_role(): void
    {
        foreach (['user', 'moderator', 'admin'] as $role) {
            $user = $this->makeUser("demo.$role", $role);

            $this->assertSame($role, LegacySession::shapeFor($user)['role']);
        }
    }

    /**
     * No extra keys. A password hash reaching $_SESSION would put it in the
     * session store (and, with the old app's file sessions, on disk) for no
     * reason at all.
     */
    public function test_shape_contains_no_extra_keys_and_never_the_password(): void
    {
        $user = $this->makeUser('demo.user', 'user');

        $shape = LegacySession::shapeFor($user);

        $this->assertSame(['username', 'role'], array_keys($shape));
        $this->assertArrayNotHasKey('password', $shape);
        $this->assertNotContains($user->getAttributes()['password'], $shape);
    }

    /**
     * Documents the guard rather than the behaviour: under PHPUnit the bridge
     * must be a silent no-op, not a source of "headers already sent" noise or
     * a stray session file. If this ever fails, the guard in
     * LegacySession::start() has been weakened.
     */
    public function test_write_and_forget_are_inert_when_no_session_can_be_started(): void
    {
        $user = $this->makeUser('demo.user', 'user');

        LegacySession::write($user);
        LegacySession::forget();

        $this->assertSame(PHP_SESSION_NONE, session_status());
        $this->assertArrayNotHasKey('user', $_SESSION ?? []);
    }
}
