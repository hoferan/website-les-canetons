<?php

namespace App\Http\Middleware;

use App\Support\Capability;
use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware: capability:respond | manage_events | view_summary.
 *
 * Authentication is a separate concern — pair this with auth:sanctum so an
 * anonymous caller gets 401, not 403.
 *
 * Throws AuthorizationException rather than calling abort(403): abort() raises
 * a bare HttpException, which App\Exceptions\ApiError deliberately does not
 * catch, so the response would be Laravel's native untranslatable shape (and
 * would leak a stack trace under APP_DEBUG). See bootstrap/app.php.
 */
class RequireCapability
{
    public function handle(Request $request, Closure $next, string $capability): Response
    {
        if (! Capability::can($request->user()?->role, $capability)) {
            throw new AuthorizationException;
        }

        return $next($request);
    }
}
