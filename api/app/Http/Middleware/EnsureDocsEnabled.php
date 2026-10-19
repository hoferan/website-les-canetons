<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Hides the API reference unless this environment enables it.
 *
 * 404 and not 403, which would tell an anonymous caller that the feature exists
 * on this host and is only switched off.
 *
 * abort(404) raises a bare HttpException, which App\Exceptions\ApiError does
 * not claim, so this renders as Laravel's default JSON. Nothing in the SPA
 * calls these routes, so no translated copy is needed.
 */
class EnsureDocsEnabled
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(config('docs.enabled', false), 404);

        return $next($request);
    }
}
