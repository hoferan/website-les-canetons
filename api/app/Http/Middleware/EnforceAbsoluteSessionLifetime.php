<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ends a session that began too long ago, however recently it was used.
 *
 * Laravel's session.lifetime is an IDLE timeout: it is refreshed on every
 * request, so someone who opens the site daily is never logged out. This is the
 * absolute cap on top of it.
 *
 * Fails closed: a session with no auth.started_at stamp is refused, since its
 * start is unknown.
 *
 * Throws AuthenticationException so the refusal renders through
 * ApiError::unauthenticated() and stays inside the problem-document contract.
 */
class EnforceAbsoluteSessionLifetime
{
    public function handle(Request $request, Closure $next): Response
    {
        // Restores session.same_site after Sanctum has forced it to "lax".
        //
        // EnsureFrontendRequestsAreStateful::configureSecureCookieSessions()
        // sets it to "lax" on every `api` request, for SPAs on a different
        // origin from their API. This one is same-origin: every request that
        // carries the session is an XHR from an already-loaded page, which
        // Strict covers.
        //
        // It runs before the user check below because the login response sets
        // the cookie before Auth::login() has run.
        //
        // It works only because this middleware is appended to the `api` group
        // (bootstrap/app.php), so it runs inside Sanctum's pipeline after the
        // override, and config() still holds this value when StartSession
        // builds the Set-Cookie header on the way out.
        // SessionLifetimeTest::test_the_session_cookie_carries_strict_secure_and_http_only
        // fails with SameSite=Lax without this line.
        //
        // It reads 'session.same_site_intended' because Sanctum overwrites
        // 'same_site' in place (config/session.php explains the second key).
        config(['session.same_site' => config('session.same_site_intended')]);

        if ($request->user() === null) {
            return $next($request);
        }

        // An authenticated request with no session. Sanctum authenticates by
        // session cookie today, so this is reachable only through a test or a
        // future API token (ADR 0010). `$request->session()` throws rather
        // than returning null, so without this guard such a request 500s. A
        // caller with no session has no session lifetime to enforce.
        if (! $request->hasSession()) {
            return $next($request);
        }

        $startedAt = $request->session()->get('auth.started_at');
        $maxAgeSeconds = ((int) config('session.absolute_lifetime', 720)) * 60;

        // now()->timestamp, not time(): the stamp is written with the same
        // call, and a test that travels in time (EventIndexTest does) moves
        // Carbon's clock only. With time() such a test fails every evening.
        if (! is_int($startedAt) || (now()->timestamp - $startedAt) > $maxAgeSeconds) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            throw new AuthenticationException;
        }

        return $next($request);
    }
}
