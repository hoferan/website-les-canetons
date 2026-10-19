<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Marks a response as never cacheable.
 *
 * Every identity-dependent response (/events varies by identity) must send
 * Cache-Control: no-store, or a shared proxy can serve a member's view to an
 * anonymous visitor (ADR 0010). A middleware means a new endpoint cannot forget
 * the header.
 *
 * Sets `no-store` alone; Symfony's Response::prepare() appends ", private"
 * whenever a session cookie is present, which on these routes is always. Tests
 * should assert the directive, not the header's exact string.
 */
class NoStoreResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('Cache-Control', 'no-store');

        return $response;
    }
}
