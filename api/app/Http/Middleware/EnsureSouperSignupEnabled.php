<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Route middleware: feature.souper_signup.
 *
 * Ports the old app's server-owned `souper_signup` flag (App\Features) to the
 * API side. Before the cutover, app/src/routes.php wrapped the whole `signups`
 * and `altcha` endpoint names in `if (Features::enabled('souper_signup'))`, so
 * on a server with the flag off those paths were never registered and the front
 * controller answered 404 — "routes only exist while the feature is on, so a
 * disabled server genuinely 404s rather than exposing a dead link". Registering
 * them unconditionally in Laravel lost that: the UI hid the form while
 * POST /api/signups still accepted anonymous writes for an unannounced event.
 *
 * A 404, not a 403: the point is that the endpoint does not exist on this
 * server, and a 403 would advertise that it exists but is switched off.
 *
 * Middleware rather than an `if` around the route registrations, which would be
 * the more literal port: config() is then read per request, so `php artisan
 * route:cache` cannot bake yesterday's flag into the route file, and a test can
 * flip the flag with config([...]) the same way it already flips
 * app.altcha_secret. The cost is that `route:list` still lists the routes on a
 * disabled server.
 *
 * The thrown message reproduces the one Laravel's own router raises for an
 * unmatched path (Illuminate\Routing\AbstractRouteCollection::handleMatchedRoute)
 * so a gated route is indistinguishable from an absent one, right down to the
 * response body under APP_DEBUG=false.
 *
 * Deliberately not parameterised the way `capability:` is: there is exactly one
 * flag, and it lives in config/app.php next to the other server-owned settings
 * rather than in a generic `features` section. A second flag is the moment to
 * generalise this into a `feature:<name>` middleware with an explicit
 * name => config-key map — never string-built keys, which would make the config
 * key ungreppable.
 */
class EnsureSouperSignupEnabled
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! config('app.souper_signup_enabled')) {
            throw new NotFoundHttpException(sprintf(
                'The route %s could not be found.',
                $request->path()
            ));
        }

        return $next($request);
    }
}
