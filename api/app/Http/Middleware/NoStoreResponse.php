<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Marks a response as never cacheable.
 *
 * WHY IT IS A MIDDLEWARE. Design §4: "Because /events varies by identity, every
 * identity-dependent API response must send Cache-Control: no-store, or a
 * shared proxy can serve a member's view to an anonymous visitor. The current
 * split-by-page design avoided this bug by accident; the new one must avoid it
 * on purpose."
 *
 * On purpose means structurally. Nine roster endpoints each remembering to call
 * ->header(...) is a rule that holds until the tenth is added by somebody who
 * did not read the other nine.
 *
 * Sets `no-store` alone and lets Symfony's Response::prepare() append
 * ", private" as it already does whenever a session cookie is present — which
 * on these routes is always. Tests should therefore assert the DIRECTIVE, not
 * the header's exact string.
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
