<?php

namespace App\Http\Middleware;

use App\Support\EffectivePermissions;
use App\Support\Permission;
use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware: permission:events.manage | attendance.view_all | ...
 *
 * The ONLY place authorization is decided. No role name is ever consulted —
 * roles merely group permissions, and which role granted this one is not a
 * question the enforcement point may ask.
 *
 * Authentication is a separate concern: pair this with auth:sanctum so an
 * anonymous caller gets 401 rather than 403.
 *
 * Throws AuthorizationException rather than calling abort(403). abort() raises
 * a bare HttpException, which App\Exceptions\ApiError deliberately does not
 * catch, so the response would leave the {error, code, fields[]} contract (and
 * leak a stack trace under APP_DEBUG). See bootstrap/app.php.
 *
 * A permission string that is not an enum case throws InvalidArgumentException
 * rather than quietly denying. A typo in a route definition is a programming
 * error, and a silent denial would look like a working guard while the real
 * one was never applied.
 */
class RequirePermission
{
    /**
     * `permission:a` requires a; `permission:a,b` requires a OR b. The list
     * form is for a read that two screens share, such as GET /roles: the
     * roster form and the role editor, either of which somebody may hold
     * alone. Every name is checked before any is matched, so a typo in a
     * list fails as loudly as a typo on its own.
     */
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        if ($permissions === []) {
            throw new InvalidArgumentException('A `permission:` middleware names no permission.');
        }

        $accepted = array_map(function (string $permission): Permission {
            return Permission::tryFrom($permission) ?? throw new InvalidArgumentException(
                "Unknown permission '{$permission}' on a route. ".
                'It must be a case of App\Support\Permission.'
            );
        }, $permissions);

        // The request's memoized set rather than hasPermission(), so the
        // gates that run after this one on the same request read the same
        // set without a second query. See EffectivePermissions::ofRequest().
        $held = EffectivePermissions::ofRequest($request);

        foreach ($accepted as $permission) {
            if ($held->contains($permission)) {
                return $next($request);
            }
        }

        throw new AuthorizationException;
    }
}
