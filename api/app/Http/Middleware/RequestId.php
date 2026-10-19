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
 * A member reporting a failure reads one string off the screen (the RFC 9457
 * `requestId` extension member, which App\Exceptions\ApiError puts in every
 * problem document), and that string finds the request in the log.
 *
 * Global and prepended, so it wraps everything including the middleware groups.
 * It stays off the `api` group because RunPendingMigrations must be index 0
 * there (AutoMigrateTest asserts it). Router::getMiddlewareGroups() never sees
 * the global stack.
 *
 * An inbound id is honoured only if it is a well-formed ULID, so a gateway that
 * stamps requests can correlate logs while arbitrary text never reaches the log.
 *
 * self::current() mints an id if this middleware never ran. When
 * RunPendingMigrations, deeper in the stack, refuses with 503, the exception
 * unwinds past here and the renderer still needs an id for the body.
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

        // Always written, never defaulted. Context survives between requests
        // in the test process (and would under Octane), so falling back to
        // current() would give consecutive requests the same identifier.
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
