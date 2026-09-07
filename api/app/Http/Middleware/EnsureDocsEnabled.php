<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Hides the API reference unless this environment enables it.
 *
 * 404, NOT 403. A 403 tells an anonymous caller that the feature exists on
 * this host and is merely switched off, which is an invitation; a 404 says
 * nothing at all. The route is not "forbidden", it is not there.
 *
 * abort(404) raises a bare HttpException, which App\Exceptions\ApiError
 * deliberately does not claim — so this renders through Laravel's default JSON
 * rather than the {error, code, fields[]} contract. That is fine and
 * deliberate: nothing in the SPA calls these routes, so no French copy is owed
 * for a token no display layer will ever see.
 */
class EnsureDocsEnabled
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(config('docs.enabled', false), 404);

        return $next($request);
    }
}
