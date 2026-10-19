<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiError;
use App\Support\EntityTag;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Hands out an `ETag` on a read, and demands a matching `If-Match` on a write.
 *
 * `etag:<facet>` on a route. The facet names what is tagged (see
 * App\Support\EntityTag::FACETS) and the route parameter it is read from.
 *
 * It stops lost updates: two people send a PATCH carrying only their own
 * field, both succeed, and the second silently discards the first.
 *
 * The header is required. RFC 9110 §13.1.1 lets a server answer 428 (RFC 6585)
 * when `If-Match` is absent, so a client that forgets it is told so instead of
 * silently getting overwrite semantics.
 *
 * Every write that replaces or removes state a caller read first carries it:
 * PATCH and DELETE on events, members and registrations, the two replace-all
 * PUTs (a member's roles, an event's bookable options) and the publish POST on
 * an event. Replacing roles and deleting a member change who may do what,
 * which is why the member facet is computed over `roleIds` and not over
 * `members.updated_at`.
 *
 * Attendance is exempt on purpose. PUT /events/{event}/attendance is a member
 * answering for themselves: the answer is one value, so there is no half of it
 * to lose, and a first answer has no entity to tag, so the header would cost a
 * read before every one-tap answer. The remaining race (the committee recording
 * on a member's behalf while they answer) is covered by the five-minute undo
 * window and the audit entry.
 *
 * Placing a photo is exempt for the same reason. PUT /photo-slots/{slot} sets
 * one value. Two editors either work on different slots, or the second pick on
 * the same slot is what the page shows, with both in the audit log.
 *
 * There is no conditional GET: `If-None-Match` is not implemented and no 304 is
 * returned, since every route here also sends `Cache-Control: no-store`. The tag
 * is an optimistic-concurrency token. Read this before adding a conditional
 * GET: `GET /events/{event}/registration-options` is a collection that
 * PaginatesCollections slices afterwards, so `?limit=1` and `?limit=500` return
 * different bodies under the same strong tag. If-Match is unaffected, because it
 * compares the facet's state, but a 304 would serve the wrong body.
 */
class ConditionalWrite
{
    /**
     * The methods that must prove they are working from current state.
     *
     * POST is here for two routes that change a thing somebody read first:
     * publishing an event, and replacing a library photo (a POST only because
     * PHP parses multipart bodies on POST alone). A POST that creates something
     * must not carry `etag:`, because there is no entity yet to tag.
     *
     * Public, so the published document and its test read the same list.
     */
    public const CONDITIONED = ['POST', 'PUT', 'PATCH', 'DELETE'];

    public function handle(Request $request, Closure $next, string $facet): Response
    {
        $method = strtoupper($request->method());

        if (! in_array($method, self::CONDITIONED, true)) {
            return $this->tagged($next($request), $request, $facet, $method);
        }

        $header = $request->headers->get('If-Match');

        if ($header === null || trim($header) === '') {
            return ApiError::json(
                428,
                'if_match_required',
                'If-Match is required on this request',
            );
        }

        // One transaction from the check to the commit (#231). The row stays
        // locked from the tag comparison until the write commits, so a second
        // request carrying the same tag waits, re-reads the new state and is
        // refused.
        //
        // A response that is not a success rolls back: Laravel renders a
        // controller's exception into a response before it reaches here, so a
        // write that failed half-way would otherwise commit its first half.
        DB::beginTransaction();

        try {
            $this->lockBound($request, $facet);

            $response = $this->stale($header, $request, $facet)
                ?? $this->tagged($next($request), $request, $facet, $method);
        } catch (Throwable $e) {
            DB::rollBack();

            throw $e;
        }

        $response->isSuccessful() ? DB::commit() : DB::rollBack();

        return $response;
    }

    /**
     * Re-reads the bound row FOR UPDATE and hands that copy to the
     * controller, so it writes from the state the check is about to compare
     * rather than from the one route model binding read before any lock.
     *
     * A row that is gone by now stays as it was bound: its tag is null, and
     * the check refuses it.
     */
    private function lockBound(Request $request, string $facet): void
    {
        $parameter = EntityTag::parameter($facet);
        $bound = $request->route($parameter);

        if (! $bound instanceof Model) {
            return;
        }

        $locked = $bound->newQuery()->whereKey($bound->getKey())->lockForUpdate()->first();

        if ($locked !== null) {
            $request->route()?->setParameter($parameter, $locked);
        }
    }

    /**
     * The tag on a successful response, computed under the same lock as the
     * write, so it names the state the body describes and not one another
     * request wrote a moment later.
     *
     * Never on a DELETE, since there is no entity left to tag.
     *
     * Never on a 412 either: a client could retry blindly with the fresh tag
     * and make exactly the overwrite it was just stopped from making. After a
     * 412 the client has to re-read.
     */
    private function tagged(Response $response, Request $request, string $facet, string $method): Response
    {
        if ($response->isSuccessful() && $method !== 'DELETE') {
            $tag = EntityTag::of($facet, $request);

            if ($tag !== null) {
                $response->headers->set('ETag', $tag);
            }
        }

        return $response;
    }

    /** The 412 this write earns, or null to let it through. */
    private function stale(string $header, Request $request, string $facet): ?Response
    {
        $current = EntityTag::of($facet, $request);

        if ($current === null || ! self::matches($header, $current)) {
            return ApiError::json(
                412,
                'if_match_failed',
                'The If-Match header does not match the current state',
            );
        }

        return null;
    }

    /**
     * RFC 9110 §13.1.1, strong comparison.
     *
     * `*` matches any existing entity, which $current being non-null already
     * establishes. A list is compared entry by entry. A weak tag (`W/"…"`)
     * never matches, because strong comparison requires both sides to be
     * strong, and this API never emits one.
     */
    private static function matches(string $header, string $current): bool
    {
        if (trim($header) === '*') {
            return true;
        }

        foreach (explode(',', $header) as $candidate) {
            if (trim($candidate) === $current) {
                return true;
            }
        }

        return false;
    }
}
