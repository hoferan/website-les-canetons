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
 * FAILS CLOSED. A session with no auth.started_at stamp — one predating this
 * middleware, or one assembled by hand — is refused rather than trusted,
 * because "we do not know when this began" is not a reason to allow it.
 *
 * Throws AuthenticationException rather than returning a response, so the
 * refusal renders through ApiError::unauthenticated() and stays inside the
 * {error, code, fields[]} contract.
 */
class EnforceAbsoluteSessionLifetime
{
    public function handle(Request $request, Closure $next): Response
    {
        // Restores session.same_site AFTER Sanctum has forced it to "lax".
        //
        // Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::
        // configureSecureCookieSessions() unconditionally sets
        // config(['session.same_site' => 'lax']) on every request through the
        // `api` group — for the benefit of SPAs that live on a DIFFERENT origin
        // from their API, where a cross-site top-level navigation needs Lax to
        // carry the cookie at all. This deployment is same-origin: the SPA
        // shell is a static file that needs no cookie to load, so every request
        // that must carry the session is an XHR from an already-loaded page,
        // which Strict covers just as well while also closing the cross-site
        // cases Lax leaves open. There is nothing here for Strict to cost.
        //
        // This must run UNCONDITIONALLY, before the $request->user() check
        // below, because the cookie also needs to be Strict on responses where
        // no user is attached yet — most importantly the login response itself,
        // which sets the session cookie before Auth::login() has run.
        //
        // Ordering relies on this middleware being APPENDED to the `api` group
        // (see bootstrap/app.php), which nests it inside
        // EnsureFrontendRequestsAreStateful's own pipeline as the innermost
        // "next" — so it runs after configureSecureCookieSessions() on the way
        // in, and, because config() is a single mutable array for the whole
        // request lifecycle, the value set here is still in place when
        // Illuminate\Session\Middleware\StartSession builds the Set-Cookie
        // header on the way OUT, several layers further up the same pipeline.
        // Verified empirically by
        // SessionLifetimeTest::test_the_session_cookie_carries_strict_secure_and_http_only,
        // which fails with SameSite=Lax if this line is removed.
        //
        // Reads 'session.same_site_intended' rather than 'session.same_site'
        // itself, because Sanctum's override above mutates 'same_site' in
        // place — re-reading it here would just read Sanctum's own "lax" back.
        // See config/session.php for why the second key exists. Reads from
        // config rather than hardcoding 'strict' so a server can still choose
        // a different value.
        //
        // If Sanctum is ever removed — the project spec lists this as a likely
        // future change — nothing calls configureSecureCookieSessions() any
        // more, session.same_site is never disturbed in the first place, and
        // this line becomes a harmless no-op reassignment of a config key to
        // itself.
        config(['session.same_site' => config('session.same_site_intended')]);

        if ($request->user() === null) {
            return $next($request);
        }

        // AN AUTHENTICATED REQUEST WITH NO SESSION. Today that combination is
        // unreachable through the front door — Sanctum authenticates this API
        // by session cookie, so no session means no user and the branch above
        // has already returned. It becomes reachable the moment a second
        // credential exists that does not carry one: an API token, which the
        // public-contract programme's A6 adds.
        //
        // Without this guard that request 500s on the session() call below,
        // which is the same defect a black-box review found in
        // AuthController::login on 2026-09-11 — found again here by a UTF-8
        // test that happened to authenticate without a session. Twice in one
        // codebase makes it a pattern worth naming rather than a one-off:
        // `$request->session()` throws, it does not return null, and being
        // inside an authenticated branch is not proof that a session exists.
        //
        // Passing through is correct rather than merely safe. This middleware
        // enforces an ABSOLUTE SESSION lifetime; a caller with no session has
        // no session to expire, and a token's lifetime is the token's own
        // business.
        if (! $request->hasSession()) {
            return $next($request);
        }

        $startedAt = $request->session()->get('auth.started_at');
        $maxAgeSeconds = ((int) config('session.absolute_lifetime', 720)) * 60;

        // now()->timestamp, NOT time(). The stamp is written with the same
        // call, and Carbon's clock is the one a test can move — PHP's cannot.
        // Reading the real clock here made EventIndexTest fail once a day: it
        // travels to 10:00 today to pin an unrelated rule, so the session it
        // creates is stamped 10:00 while this compared against the wall clock,
        // and every request after 22:00 local answered 401 for a reason with
        // nothing to do with what that test asserts. Found 2026-09-11 at 22:20.
        if (! is_int($startedAt) || (now()->timestamp - $startedAt) > $maxAgeSeconds) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            throw new AuthenticationException;
        }

        return $next($request);
    }
}
