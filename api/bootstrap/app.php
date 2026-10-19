<?php

use App\Exceptions\AccessIntegrityViolation;
use App\Exceptions\ApiError;
use App\Exceptions\AttendanceRefused;
use App\Exceptions\ReauthenticationFailed;
use App\Exceptions\SchemaUnavailable;
use App\Http\Middleware\ApiVersion;
use App\Http\Middleware\ConditionalWrite;
use App\Http\Middleware\EnforceAbsoluteSessionLifetime;
use App\Http\Middleware\EnsureDocsEnabled;
use App\Http\Middleware\HideDraftEvents;
use App\Http\Middleware\IdempotentWrite;
use App\Http\Middleware\NoStoreResponse;
use App\Http\Middleware\PaginatesCollections;
use App\Http\Middleware\PublicWriteGuard;
use App\Http\Middleware\ReadableJson;
use App\Http\Middleware\RequestId;
use App\Http\Middleware\RequirePermission;
use App\Http\Middleware\RunPendingMigrations;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    // The contract lives under /api/v1, so a v2 can come without renaming
    // every URL (ADR 0013).
    //
    // The site .htaccess dispatch matches `^api(/|$)`, which covers /api/v1/...,
    // and the substituted _api/public/index.php cannot re-match that pattern.
    //
    // The `$request->is('api/*')` guards in withExceptions() below match
    // /api/v1/... too, because Str::is()'s `*` crosses slashes.
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: ApiVersion::PREFIX,
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        // routes/meta.php is unversioned at /api/*: the reference and the
        // migration trigger describe or operate the API rather than being part
        // of it. It shares the `api` middleware group, so RunPendingMigrations
        // sits in front of it too.
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

        // Laravel's default `redirectGuestsTo(fn () => route('login'))` is
        // resolved by Authenticate before any exception renderer runs. This
        // app has no `login` route, so a guest request that does not
        // expectsJson() (an API URL pasted into a browser) would get a
        // RouteNotFoundException, an opaque 500. Returning null lets the
        // AuthenticationException reach ApiError::unauthenticated() below
        // whatever the Accept header says.
        $middleware->redirectGuestsTo(fn () => null);

        // Self-healing schema: CI cannot reach POST /api/migrate through the
        // host's firewall, so the request path is a deployed server's only
        // migration trigger (App\Http\Middleware\RunPendingMigrations, ADR 0008).
        //
        // Both groups. Laravel serves routes/api.php on `api` and Sanctum's
        // GET /sanctum/csrf-cookie on `web`, and the SPA's mutator
        // (web/src/api/http.ts) primes that cookie before its first write on
        // every page load. On a never-migrated server that can be a visitor's
        // first Laravel request, and with SESSION_DRIVER=database StartSession
        // would read a missing `sessions` table and 500 before any migration
        // ran.
        //
        // First in each group, which is why these calls come after
        // statefulApi(): prependToGroup() array_unshifts, so the last prepend
        // wins the front slot. On `api` that is ahead of
        // EnsureFrontendRequestsAreStateful and the session pipeline it nests,
        // on `web` ahead of EncryptCookies and StartSession.
        //
        // The router's priority sort cannot displace it from index 0:
        // SortedMiddleware only moves a priority-listed middleware to the index
        // of a previously seen priority-listed one, and index 0 holds one that
        // is not on that list. AutoMigrateTest's two placement tests assert the
        // real gathered order.
        //
        // It cannot run twice in one request: Router::uniqueMiddleware() dedupes
        // and no route carries both groups. If it did, the second pass would
        // find nothing pending and skip the lock, which the first pass released
        // before $next(). Pinned by
        // test_traversing_both_groups_migrates_once_and_does_not_deadlock.
        $middleware->prependToGroup('api', RunPendingMigrations::class);
        $middleware->prependToGroup('web', RunPendingMigrations::class);

        // Global, ahead of everything: every response carries X-Request-Id,
        // and every log line written during the request carries the same value
        // through Illuminate's Context.
        //
        // Global middleware is a separate stack from the groups. Prepending it
        // to `api` instead would displace RunPendingMigrations from index 0,
        // which AutoMigrateTest asserts, since anything ahead of it runs
        // against a schema that may not exist yet.
        $middleware->prepend(RequestId::class);

        // Also global: it has to see the responses of routes/meta.php as well
        // as the contract's, and no single group covers both.
        $middleware->prepend(ReadableJson::class);

        $middleware->alias([
            'permission' => RequirePermission::class,
            // `etag:<facet>`: hands out an ETag on a read and demands a
            // matching If-Match on a write. ConditionalWrite lists which writes
            // carry it, and why attendance does not.
            'etag' => ConditionalWrite::class,
            // `event.published`: a draft event is a 404 to anybody without
            // events.manage. `event.published:everyone` for the public routes.
            'event.published' => HideDraftEvents::class,
            'docs' => EnsureDocsEnabled::class,
            'no-store' => NoStoreResponse::class,
            'public-write' => PublicWriteGuard::class,
            // `idempotent`: makes a retried public submission safe to send
            // twice. IdempotentWrite explains why it sits behind the write
            // guard.
            'idempotent' => IdempotentWrite::class,
        ]);

        // Appended: it needs the session started and the user resolved, so it
        // runs after StartSession and Authenticate.
        $middleware->appendToGroup('api', EnforceAbsoluteSessionLifetime::class);

        // One envelope for every collection, `{data, meta}` plus a `Link`
        // header. Appended, since it works on the controller's response.
        //
        // Its position relative to ApiVersion matters: both emit `Link`, and
        // this one, appended first, runs last on the way out. It appends to
        // the header so the successor-version link survives (see the
        // middleware).
        //
        // On the group rather than on routes: the condition is the shape of
        // the answer, so a new collection is enveloped without anybody
        // remembering to.
        $middleware->appendToGroup('api', PaginatesCollections::class);

        // Announces the contract version, and its retirement when that comes.
        // It only sets response headers, and it skips routes/meta.php by
        // checking the prefix itself, since that file shares this group.
        $middleware->appendToGroup('api', ApiVersion::class);

    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // This governs only Laravel's default renderer (JSON or an HTML error
        // page). Render callbacks bypass it, so each closure below repeats
        // $request->is('api/*'). Those guards keep the routes outside /api/*
        // (Sanctum's csrf-cookie route, /up) on the default renderer; without
        // them every non-api route would get the JSON contract.
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        // Every /api/* failure is an RFC 9457 problem document whose `code` and
        // `errors[].reason` tokens the SPA translates, in place of Laravel's
        // native {message, errors:{}} (App\Exceptions\ApiError, ADR 0012).
        $exceptions->render(fn (ValidationException $e, Request $request) => $request->is('api/*')
            ? ApiError::validation($e)
            : null);

        $exceptions->render(fn (AuthenticationException $e, Request $request) => $request->is('api/*')
            ? ApiError::unauthenticated($e)
            : null);

        // Typed on AccessDeniedHttpException, not AuthorizationException:
        // Handler::render() runs prepareException() before the callbacks, and
        // it rewrites an AuthorizationException into an
        // AccessDeniedHttpException. A closure typed on AuthorizationException
        // never matches and leaks Laravel's native {message, exception, trace}
        // on a 403. prepareException() leaves ValidationException and
        // AuthenticationException untouched.
        //
        // Three other paths reach a 403 as a bare HttpException(403) and are
        // not covered here:
        //   - abort(403);
        //   - Gate::denyWithStatus(403) / Response::denyWithStatus(403), i.e.
        //     an AuthorizationException that hasStatus();
        //   - OriginMismatchException.
        // Gate::authorize() stays in the contract only for status-less
        // denials; attach a status and it silently leaves it.
        $exceptions->render(fn (AccessDeniedHttpException $e, Request $request) => $request->is('api/*')
            ? ApiError::forbidden($e)
            : null);

        // MethodNotAllowedHttpException passes through prepareException()
        // untouched, so it can be type-hinted directly.
        $exceptions->render(fn (MethodNotAllowedHttpException $e, Request $request) => $request->is('api/*')
            ? ApiError::methodNotAllowed($e)
            : null);

        // 503: App\Http\Middleware\RunPendingMigrations refused the request
        // because the schema is not known to be current. SchemaUnavailable is
        // a plain RuntimeException the catch-all HttpException closure would
        // never match, but the specific renderers stay ahead of it so widening
        // either one later cannot let the wrong one win.
        //
        // /sanctum/csrf-cookie can raise this too and gets Laravel's HTML error
        // page. Nothing parses that route's body, only its status, and a 503
        // there stops the write that was about to follow.
        $exceptions->render(fn (SchemaUnavailable $e, Request $request) => $request->is('api/*')
            ? ApiError::serviceUnavailable($e)
            : null);

        // 409: a write would have broken an access invariant
        // (App\Support\AccessIntegrity).
        $exceptions->render(fn (AccessIntegrityViolation $e, Request $request) => $request->is('api/*')
            ? ApiError::json(409, $e->errorCode, $e->getMessage())
            : null);

        // 403 or 409: an answer was refused for the state of things rather
        // than a missing grant (App\Support\AttendanceIntegrity). The status
        // travels on the exception because "you are in no register" is a 403,
        // while the closed five-minute undo window and the on-behalf route
        // refusing its own caller are conflicts (ADR 0018).
        $exceptions->render(fn (AttendanceRefused $e, Request $request) => $request->is('api/*')
            ? ApiError::json($e->status, $e->errorCode, $e->getMessage())
            : null);

        // 403 or 429: the actor did not re-prove their identity
        // (App\Support\Reauthentication). The status travels on the exception
        // because a wrong password and a throttled actor are different answers.
        $exceptions->render(fn (ReauthenticationFailed $e, Request $request) => $request->is('api/*')
            ? ApiError::json($e->status, $e->errorCode, $e->getMessage())
            : null);

        // 429 from the `throttle:` middleware. ThrottleRequestsException is an
        // HttpException and invalidSession() returns null for every status but
        // 419, so without this it reaches Laravel's default renderer: no
        // `code`, and a stack trace whenever APP_DEBUG is on, on anonymous
        // endpoints. The login lockout's 429 goes through ApiError directly.
        //
        // getHeaders() keeps Retry-After and the RateLimit-* headers that
        // ThrottleRequests puts on the exception, which a client backs off with.
        $exceptions->render(fn (ThrottleRequestsException $e, Request $request) => $request->is('api/*')
            ? ApiError::json(429, 'rate_limited', 'Too many requests')
                ->withHeaders($e->getHeaders())
            : null);

        // 404. NotFoundHttpException is an HttpException, and the catch-all
        // below returns null for every status but 419, so without this a 404
        // would answer Laravel's {"message": "..."} with no `code`, which
        // translateApiError() can only show as the generic fallback.
        //
        // Route-model binding needs no separate renderer: prepareException()
        // has already rewritten ModelNotFoundException into this, as it
        // rewrites AuthorizationException above.
        $exceptions->render(fn (NotFoundHttpException $e, Request $request) => $request->is('api/*')
            ? ApiError::notFound($e)
            : null);

        // 419/CSRF. prepareException() rewrites TokenMismatchException into a
        // bare HttpException(419), so there is no precise type to hint: the
        // base type plus a status check in invalidSession(), which returns null
        // for every other status. Registered last so the subclasses above win.
        $exceptions->render(fn (HttpException $e, Request $request) => $request->is('api/*')
            ? ApiError::invalidSession($e)
            : null);
    })->create();
