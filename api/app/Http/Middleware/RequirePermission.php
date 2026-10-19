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
 * The only place authorization is decided (ADR 0014). No role name is
 * consulted: roles only group permissions.
 *
 * Pair this with auth:sanctum so an anonymous caller gets 401 and not 403.
 *
 * Throws AuthorizationException instead of abort(403): abort() raises a bare
 * HttpException, which App\Exceptions\ApiError does not catch, so the response
 * would leave the problem-document contract (and leak a stack trace under
 * APP_DEBUG). See bootstrap/app.php.
 *
 * A permission string that is not an enum case throws InvalidArgumentException.
 * A typo in a route is a programming error, and a silent denial would look like
 * a working guard.
 */
class RequirePermission
{
    /**
     * `permission:a` requires a; `permission:a,b` requires a or b. The list
     * form is for a read two screens share, such as GET /roles (the roster
     * form and the role editor). Every name is validated before any is
     * matched, so a typo in a list fails as loudly as one on its own.
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
