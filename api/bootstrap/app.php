<?php

use App\Exceptions\ApiError;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Sanctum SPA mode: same-origin cookie session auth (no API tokens,
        // no CORS). Registers EnsureFrontendRequestsAreStateful on the `api`
        // group so requests from the stateful domains authenticate via the
        // session cookie.
        $middleware->statefulApi();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        // The front-end's French layer reads {error, code, fields[]} — see
        // App\Exceptions\ApiError. These renderers replace Laravel's native
        // {message, errors:{}} for every /api/* response.
        $exceptions->render(fn (ValidationException $e, Request $request) => $request->is('api/*')
            ? ApiError::validation($e)
            : null);

        $exceptions->render(fn (AuthenticationException $e, Request $request) => $request->is('api/*')
            ? ApiError::unauthenticated($e)
            : null);

        // Typed on AccessDeniedHttpException, not on Laravel's
        // AuthorizationException, and that is load-bearing: Handler::render()
        // runs prepareException() BEFORE renderViaCallbacks(), and
        // prepareException() rewrites an AuthorizationException into a Symfony
        // AccessDeniedHttpException. A closure type-hinted on
        // AuthorizationException therefore never matches anything and silently
        // leaks Laravel's native {message, exception, trace} shape on a 403.
        // Do not "simplify" this back. ValidationException and
        // AuthenticationException above need no such treatment —
        // prepareException() leaves both untouched.
        //
        // This stays narrower than "any 403". Three other paths reach a 403
        // WITHOUT becoming an AccessDeniedHttpException, and none is covered
        // here — each yields a bare HttpException(403):
        //   - abort(403);
        //   - Gate::denyWithStatus(403) / Response::denyWithStatus(403), i.e.
        //     an AuthorizationException that hasStatus();
        //   - OriginMismatchException.
        // The plan recommends Gate::authorize() as the safe idiom, and it is —
        // but only for status-less denials, which is the arm that becomes an
        // AccessDeniedHttpException. Attach a status and it silently leaves the
        // contract.
        $exceptions->render(fn (AccessDeniedHttpException $e, Request $request) => $request->is('api/*')
            ? ApiError::forbidden($e)
            : null);

        // MethodNotAllowedHttpException passes through prepareException()
        // untouched, so it can be type-hinted directly.
        $exceptions->render(fn (MethodNotAllowedHttpException $e, Request $request) => $request->is('api/*')
            ? ApiError::methodNotAllowed($e)
            : null);

        // 419/CSRF. Same prepareException() trap as the 403 above, but worse:
        // TokenMismatchException is rewritten into a BARE HttpException(419),
        // not a dedicated subclass, so there is no precise type left to hint.
        // Hence the base type plus a status check inside invalidSession(),
        // which returns null for every other HttpException and falls through.
        // Registered last so the specific subclasses above always win.
        $exceptions->render(fn (HttpException $e, Request $request) => $request->is('api/*')
            ? ApiError::invalidSession($e)
            : null);
    })->create();
