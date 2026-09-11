<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gives every request an identifier, echoes it, and puts it in the log line.
 *
 * It is what turns "it said something went wrong" into a log line. A member
 * reporting a failure reads one string off the screen — RFC 9457's `requestId`
 * extension member, which App\Exceptions\ApiError puts in every problem
 * document — and that string finds the request in the log.
 *
 * GLOBAL, and prepended, so it wraps everything including the middleware groups.
 * It deliberately does NOT go on the `api` group: RunPendingMigrations has to be
 * index 0 there (AutoMigrateTest asserts it), and prepending anything else would
 * displace it. Global middleware is a separate stack that Router::
 * getMiddlewareGroups() never sees, so this cannot disturb that.
 *
 * AN INBOUND ID IS HONOURED, but only if it is a well-formed ULID. A caller
 * behind a gateway that already stamps requests can correlate its logs with
 * ours; a caller sending anything else gets a fresh one rather than having
 * arbitrary text written into our logs and echoed back to it.
 *
 * self::current() GENERATES ONE IF THIS MIDDLEWARE NEVER RAN. That is not
 * defensive padding — it is what makes the identifier correct for the one case
 * that matters most. RunPendingMigrations sits inside the group, which is deeper
 * in the stack than this; when it refuses a request with 503 the exception
 * unwinds past here, and the renderer still needs an id to put in the body.
 * The body is the half a human reads out; the echoed header is the convenience.
 */
class RequestId
{
    public const HEADER = 'X-Request-Id';

    /**
     * The key this is filed under in Illuminate's Context, which every log
     * record written during the request picks up automatically.
     */
    public const CONTEXT_KEY = 'requestId';

    public function handle(Request $request, Closure $next): Response
    {
        $inbound = $request->headers->get(self::HEADER);

        // ALWAYS WRITTEN, never merely defaulted. Context is not guaranteed to
        // be empty when a request starts: it survives between requests in the
        // test process, and would survive between requests in a worker under
        // Octane. Leaving the previous request's value in place and falling
        // back to current() gave two consecutive requests the same identifier —
        // which makes the whole feature quietly useless, because every log line
        // in a worker's lifetime then names one request.
        $id = is_string($inbound) && Str::isUlid($inbound)
            ? $inbound
            : (string) Str::ulid();

        Context::add(self::CONTEXT_KEY, $id);

        $response = $next($request);
        $response->headers->set(self::HEADER, $id);

        return $response;
    }

    /**
     * The identifier for the request being handled, minting one on first call.
     *
     * Safe to call from an exception renderer, from a log call, or from code
     * running outside a request altogether.
     */
    public static function current(): string
    {
        $existing = Context::get(self::CONTEXT_KEY);

        if (is_string($existing) && $existing !== '') {
            return $existing;
        }

        $id = (string) Str::ulid();
        Context::add(self::CONTEXT_KEY, $id);

        return $id;
    }
}
