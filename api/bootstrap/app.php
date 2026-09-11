<?php

use App\Exceptions\AccessIntegrityViolation;
use App\Exceptions\ApiError;
use App\Exceptions\AttendanceRefused;
use App\Exceptions\ReauthenticationFailed;
use App\Exceptions\SchemaUnavailable;
use App\Http\Middleware\ApiVersion;
use App\Http\Middleware\EnforceAbsoluteSessionLifetime;
use App\Http\Middleware\EnsureDocsEnabled;
use App\Http\Middleware\NoStoreResponse;
use App\Http\Middleware\PublicWriteGuard;
use App\Http\Middleware\RequestId;
use App\Http\Middleware\RequirePermission;
use App\Http\Middleware\RunPendingMigrations;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    // The contract lives under /api/v1. The prefix is what makes a future v2
    // possible without renaming every URL at the moment clients exist — see
    // docs/superpowers/specs/2026-09-11-api-v1-public-contract-design.md, A1.
    //
    // The site .htaccess needs no change for this: its dispatch matches
    // `^api(/|$)`, which already covers /api/v1/..., and the substituted
    // _api/public/index.php still cannot re-match that pattern.
    //
    // Every `$request->is('api/*')` guard in withExceptions() below still
    // matches, because Str::is()'s `*` crosses slashes.
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: ApiVersion::PREFIX,
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        // routes/meta.php stays UNVERSIONED at /api/*: the reference and the
        // migration trigger describe or operate the API rather than being part
        // of it. Same `api` middleware group as routes/api.php, so
        // RunPendingMigrations still sits in front of them exactly as it did
        // when they lived in that file.
        then: function (): void {
            Route::middleware('api')
                ->prefix('api')
                ->group(__DIR__.'/../routes/meta.php');
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Sanctum SPA mode: same-origin cookie session auth (no API tokens,
        // no CORS). Registers EnsureFrontendRequestsAreStateful on the `api`
        // group so requests from the stateful domains authenticate via the
        // session cookie.
        $middleware->statefulApi();

        // Laravel installs `redirectGuestsTo(fn () => route('login'))` by
        // default (ApplicationBuilder::withMiddleware()), and the Authenticate
        // middleware resolves it BEFORE throwing — before any exception
        // renderer runs. An API-only app defines no `login` route, so a guest
        // whose request does not expectsJson() got a RouteNotFoundException
        // instead of a 401: an opaque 500 on PROD, where APP_DEBUG=false, for
        // anyone who pastes an API URL into a browser. Returning null suppresses
        // the redirect, so the AuthenticationException falls through to
        // ApiError::unauthenticated() below whatever the client's Accept header
        // says.
        $middleware->redirectGuestsTo(fn () => null);

        // Self-healing schema. The deploy host firewalls the GitHub runner's IP,
        // so CI cannot call POST /api/migrate after an FTP deploy — the request
        // path is a deployed server's only migration trigger. See
        // App\Http\Middleware\RunPendingMigrations for the full argument; it
        // restores what the old app's App\AutoMigrator did before the cutover.
        //
        // BOTH GROUPS, and `web` is not an afterthought. Laravel serves exactly
        // two things here: routes/api.php on the `api` group, and Sanctum's
        // GET /sanctum/csrf-cookie on the `web` group. app/assets/js/api.js
        // primes that cookie route before EVERY mutating call, so on a
        // never-migrated server the first Laravel request a real visitor makes
        // — a login, a contact submit — is the `web` one. With
        // SESSION_DRIVER=database, StartSession would read a `sessions` table
        // that does not exist yet and 500 before the middleware that would have
        // created it ever ran. Covering only `api` would have left the repair
        // depending on some earlier page happening to fetch GET /api/config
        // first, which is likely but not guaranteed.
        //
        // FIRST IN EACH GROUP, which is load-bearing and is why these calls come
        // AFTER statefulApi(). prependToGroup() array_unshifts, so the last
        // prepend wins the front slot: on `api` that puts this ahead of
        // EnsureFrontendRequestsAreStateful (and therefore ahead of the session
        // pipeline it nests), on `web` ahead of EncryptCookies/StartSession.
        //
        // Router::gatherRouteMiddleware()'s priority sort cannot displace it
        // from index 0 in either group. SortedMiddleware only ever moves a
        // priority-listed middleware
        // to the index of a PREVIOUSLY SEEN priority-listed one, and index 0 is
        // held here by a middleware that is not on that list — so $lastIndex is
        // always >= 1 by the time any move can happen. Pinned by
        // AutoMigrateTest's two placement tests, which assert the real gathered
        // order rather than this reasoning.
        //
        // Running twice in one request is harmless and cannot happen anyway:
        // SortedMiddleware::sortMiddleware() ends in Router::uniqueMiddleware(),
        // and no route carries both groups. Even if one did, the second pass
        // finds nothing pending and returns before touching the lock — and the
        // first pass has already released it, since all the work happens BEFORE
        // $next(), never around it. Pinned by
        // test_traversing_both_groups_migrates_once_and_does_not_deadlock.
        $middleware->prependToGroup('api', RunPendingMigrations::class);
        $middleware->prependToGroup('web', RunPendingMigrations::class);

        // GLOBAL, and ahead of everything: every response carries X-Request-Id,
        // and every log line written during the request carries the same value
        // through Illuminate's Context.
        //
        // Global middleware is a separate stack from the groups, which is what
        // makes this safe — prependToGroup() here would displace
        // RunPendingMigrations from index 0 of the `api` group, and
        // AutoMigrateTest asserts it is index 0 because anything ahead of it
        // runs against a schema that may not exist yet.
        $middleware->prepend(RequestId::class);

        $middleware->alias([
            'permission' => RequirePermission::class,
            'docs' => EnsureDocsEnabled::class,
            'no-store' => NoStoreResponse::class,
            'public-write' => PublicWriteGuard::class,
        ]);

        // APPENDED, not prepended: it needs the session started and the user
        // resolved, so it must run after StartSession and Authenticate rather
        // than in front of them like RunPendingMigrations.
        $middleware->appendToGroup('api', EnforceAbsoluteSessionLifetime::class);

        // Announces the contract version, and one day that it is retiring. It
        // only ever sets response headers, so where it sits in the group does
        // not matter; it skips routes/meta.php by checking the prefix itself,
        // since that file shares this group.
        $middleware->appendToGroup('api', ApiVersion::class);

    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // This governs only Laravel's DEFAULT renderer — whether it falls back
        // to JSON or an HTML error page. Render callbacks bypass it entirely,
        // so it does not scope any of the closures below. That is why each one
        // repeats $request->is('api/*'): those guards are what keep the old
        // app's web pages on HTML error pages, and deleting them as redundant
        // would put the JSON contract on every non-api route too.
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

        // 503. App\Http\Middleware\RunPendingMigrations refused the request
        // because the schema is not known to be current. Registered BEFORE the
        // catch-all HttpException closure below — not that it has to be, since
        // SchemaUnavailable is a plain RuntimeException that closure would never
        // match, but keeping the specific-before-general order means the day
        // someone widens either one, the wrong one cannot silently win.
        //
        // Only /api/* gets the JSON contract. /sanctum/csrf-cookie now carries
        // the middleware too, so it can raise this as well — it is not matched
        // by is('api/*') and falls through to Laravel's default renderer (an
        // HTML error page, since shouldRenderJsonWhen() above answers false for
        // it). That is fine: nothing parses that route's body, only its status,
        // and a 503 there stops the mutating request that was about to follow.
        $exceptions->render(fn (SchemaUnavailable $e, Request $request) => $request->is('api/*')
            ? ApiError::serviceUnavailable($e)
            : null);

        // 409. A write was refused because it would have broken an access
        // invariant — see App\Support\AccessIntegrity. Registered before the
        // catch-all HttpException closure below so the specific case wins.
        $exceptions->render(fn (AccessIntegrityViolation $e, Request $request) => $request->is('api/*')
            ? ApiError::json(409, $e->errorCode, $e->getMessage())
            : null);

        // 403 or 409. An answer was refused for a reason about the STATE of
        // things rather than a missing grant — see App\Support\
        // AttendanceIntegrity. The status travels on the exception because
        // "you are in no register" is not a conflict while C12's closed undo
        // window and C14's self-refusal are; hard-coding either here would
        // make one of the three lie.
        $exceptions->render(fn (AttendanceRefused $e, Request $request) => $request->is('api/*')
            ? ApiError::json($e->status, $e->errorCode, $e->getMessage())
            : null);

        // 403 or 429. A destructive privileged action was refused because the
        // actor did not re-prove their identity — see App\Support\Reauthentication.
        // The status travels on the exception because a wrong password and a
        // throttled actor are different answers, and hard-coding 403 here would
        // turn the throttle into a silent lie.
        //
        // Placed with the other specific renderers and BEFORE the catch-all
        // HttpException one. Not strictly required — ReauthenticationFailed is
        // a plain RuntimeException that closure would never see — but the
        // SchemaUnavailable closure above carries the same comment for the same
        // reason: keeping specific-before-general means widening either one
        // later cannot silently pick the wrong winner.
        $exceptions->render(fn (ReauthenticationFailed $e, Request $request) => $request->is('api/*')
            ? ApiError::json($e->status, $e->errorCode, $e->getMessage())
            : null);

        // 404. Registered BEFORE the catch-all HttpException closure below,
        // which is what makes it reachable at all: NotFoundHttpException IS an
        // HttpException, and invalidSession() returns null for every status but
        // 419, so until this existed a 404 fell straight through to Laravel's
        // default renderer and answered {"message": "..."} — a body with no
        // `code`, which web/src/i18n/'s translateApiError() can only render as
        // the generic French fallback. The one status in the whole API that
        // escaped its own error contract.
        //
        // Route-model binding needs no separate renderer: prepareException()
        // has already rewritten ModelNotFoundException into this by the time
        // any callback runs, the same way it rewrites AuthorizationException
        // into AccessDeniedHttpException above.
        $exceptions->render(fn (NotFoundHttpException $e, Request $request) => $request->is('api/*')
            ? ApiError::notFound($e)
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
