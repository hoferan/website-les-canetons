<?php

namespace App\Support;

use App\Models\User;

/**
 * TEMPORARY BRIDGE — DELETE IN SUB-PROJECT 3.
 *
 * Laravel is the source of truth for authentication. But until sub-project 3
 * replaces the old app's server-rendered members' pages with an SPA, those
 * pages (app/pages/*.php) still gate on PHP's native $_SESSION['user'] via the
 * old app's App\Auth. Without this bridge, a member who logs in through
 * POST /api/login is authenticated to the API yet appears logged out on
 * /planning_repet, /inscriptions_utilisateurs and every other members' page.
 *
 * So on a successful Laravel login we ALSO write PHP's native session, and on
 * logout we clear it. Nothing ever reads back from it here — the old pages do.
 *
 * This is only possible because both apps now run in one PHP-FPM pool behind
 * one origin (the single-origin Apache stack); as separate services on
 * separate ports they could not have shared a session cookie.
 *
 * It is deliberately the dumb, deletable option: one class, two call sites
 * (AuthController::login() and ::logout()). Do not grow it into a shared
 * session handler or a custom Laravel session driver. When the old pages are
 * gone, delete this file and its two calls — that is the whole removal.
 *
 * The array shape written here and the session cookie flags set here are a
 * contract with the old app, which is the only reader: App\Auth::user() returns
 * this exact array, and App\Auth::startSession() sets these exact cookie params.
 * If either side drifts, the two halves fight over the same PHPSESSID cookie.
 */
final class LegacySession
{
    /**
     * The exact array the old app's App\Auth::user() returns.
     *
     * Pure on purpose: the shape is the part that can actually be asserted in
     * a test, so it must not require a live session. Only these two keys —
     * never the password hash, never the whole model.
     *
     * @return array{username: string, role: string}
     */
    public static function shapeFor(User $user): array
    {
        return ['username' => $user->username, 'role' => $user->role];
    }

    /** Log the user in to the old app's native PHP session. */
    public static function write(User $user): void
    {
        if (! self::start()) {
            return;
        }

        // Regenerate first, then store the identity App\Auth::user() reads back.
        session_regenerate_id(true);
        $_SESSION['user'] = self::shapeFor($user);
    }

    /** Log the user out of the old app's native PHP session. */
    public static function forget(): void
    {
        if (! self::start()) {
            return;
        }

        // Clear the identity so App\Auth::check() reads the pages as logged out.
        $_SESSION = [];
        session_destroy();
    }

    /**
     * Start PHP's native session with the same cookie params as
     * App\Auth::startSession(). Every unset key (path, domain, lifetime)
     * deliberately falls through to the same php.ini defaults the old app
     * gets — both apps run in the same PHP-FPM pool, so those match.
     *
     * Returns false, doing nothing, when a session cannot be started: under
     * PHPUnit output has already begun, so session_start() would either warn
     * ("headers already sent") or fail outright. Being inert there is why the
     * end-to-end behaviour of this class is verified over real HTTP instead
     * of in the test suite.
     */
    private static function start(): bool
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return true;
        }

        if (headers_sent() || PHP_SAPI === 'cli') {
            return false;
        }

        session_set_cookie_params([
            'httponly' => true,
            'samesite' => 'Lax',
            'secure' => (! empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        ]);

        return session_start();
    }
}
