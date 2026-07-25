<?php

use App\Exceptions\ApiError;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

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

        $exceptions->render(fn (AuthorizationException $e, Request $request) => $request->is('api/*')
            ? ApiError::forbidden($e)
            : null);
    })->create();
