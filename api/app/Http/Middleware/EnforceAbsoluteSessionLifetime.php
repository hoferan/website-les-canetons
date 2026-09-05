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
        if ($request->user() === null) {
            return $next($request);
        }

        $startedAt = $request->session()->get('auth.started_at');
        $maxAgeSeconds = ((int) config('session.absolute_lifetime', 720)) * 60;

        if (! is_int($startedAt) || (time() - $startedAt) > $maxAgeSeconds) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            throw new AuthenticationException;
        }

        return $next($request);
    }
}
