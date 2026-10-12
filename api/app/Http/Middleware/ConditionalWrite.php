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
 * `etag:<facet>` on a route. The facet names what is tagged — see
 * App\Support\EntityTag::FACETS — and the route parameter it is read from.
 *
 * THE BUG THIS CLOSES IS LIVE AND UNREMARKABLE. Two committee members have the
 * planning open. One moves a start time; the other clears the notes. Both send
 * a PATCH carrying only their own field, both succeed, and the second write
 * silently discards the first — no error, no trace, and the only way anybody
 * finds out is that the band turns up at the wrong hour.
 *
 * REQUIRED, NOT MERELY HONOURED. RFC 9110 §13.1.1 lets a server require
 * `If-Match` and answer 428 (RFC 6585) when it is absent, and that is the
 * rigorous reading: a client that forgets the header is told so, rather than
 * being quietly given the overwrite semantics the header exists to prevent. We
 * own the only client today, and a public API that silently loses writes for
 * the integrator who did not read carefully is worse than one that refuses.
 *
 * WHICH WRITES. Every one that replaces or removes state a caller read first:
 * PATCH and DELETE on events, members and registrations, plus the two
 * replace-all PUTs (a member's roles, an event's bookable options) and the
 * publish POST on an event. The two
 * that change WHO MAY DO WHAT — replacing roles, deleting a member — are the
 * ones this matters most for, and they are the reason the member facet is
 * computed over `roleIds` rather than over `members.updated_at`.
 *
 * ATTENDANCE IS DELIBERATELY EXEMPT, and that is a decision rather than an
 * omission. PUT /events/{event}/attendance is a member answering for
 * themselves: they are its only ordinary writer, the whole answer is one value
 * so there is no half of it to lose, and a member answering for the first time
 * has no entity to have a tag for — so requiring the header would mean a read
 * before every answer, against a design that exists to make answering one tap
 * on a bus with poor signal. The one race left is the committee recording on
 * somebody's behalf while that member answers, which the five-minute undo
 * window and the audit entry already cover.
 *
 * PLACING A PHOTO IS EXEMPT FOR THE SAME REASON. PUT /photo-slots/{slot} sets
 * one value, the image id in one slot, so there is no half of it to lose. Two
 * editors placing photos at once either work on different slots, which never
 * touch, or pick for the same one, where the second pick is what the page
 * shows and both are in the audit log. A tag would buy a read before every
 * pick and a 412 for an editor who lost a race nobody could see.
 *
 * NO CONDITIONAL GET. `If-None-Match` is not implemented and no 304 is ever
 * returned: every route here also sends `Cache-Control: no-store`, so there is
 * no cache to serve one. The tag is an optimistic-concurrency token that
 * happens to be spelled the way HTTP spells one.
 *
 * THAT PARAGRAPH BECAME LOAD-BEARING ON 2026-09-12. `GET /events/{event}/
 * registration-options` is a collection, so App\Http\Middleware * PaginatesCollections slices its body afterwards, and `?limit=1` and
 * `?limit=500` now return different representations under the same strong tag.
 * That is harmless for what the tag is for — If-Match compares the facet's
 * state, which paging cannot touch — and would be a wrong-body 304 the day
 * anybody implements the conditional GET this class says it does not. Read
 * this before implementing one.
 */
class ConditionalWrite
{
    /**
     * The methods that must prove they are working from current state.
     *
     * POST is here for two routes: publishing an event, and replacing a
     * library photo, which is a POST only because PHP parses multipart bodies
     * on POST alone. Every other write listed above is a PUT, PATCH or
     * DELETE, but both change a thing somebody read first. Two people editing
     * a draft, and one publishing it on the strength of what they saw, is the
     * same lost update this class exists to stop. A POST that CREATES
     * something must not carry `etag:`, because there is no entity yet to
     * have a tag for.
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

        // ONE TRANSACTION FROM THE CHECK TO THE COMMIT (#231). The row is
        // locked before its tag is compared and stays locked until the write
        // commits, so a second request carrying the same tag waits, re-reads
        // the state the first one left, and is refused. Comparing first and
        // writing after, with nothing held in between, let both pass and the
        // second silently undo the first.
        //
        // A RESPONSE THAT IS NOT A SUCCESS ROLLS BACK. Laravel renders a
        // controller's exception into a response before it reaches here, so
        // a write that failed half-way would otherwise commit its first half.
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
     * Never on a DELETE: there is no entity left to tag, and an `ETag` on a
     * 200 that announces a deletion would name something that no longer
     * exists.
     *
     * Never on a 412 either, which is the one worth saying out loud: the
     * refusal knows the current tag and sending it would be a kindness that
     * defeats the mechanism — a client could retry blindly with the fresh tag
     * and land exactly the overwrite it was just stopped from making. The fix
     * for a 412 is to re-read and re-decide, not to re-send.
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
     * `*` matches any existing entity — the caller asserting only that there
     * is something there — and $current being non-null is that assertion. A
     * list is compared entry by entry, and a weak tag (`W/"…"`) matches
     * NOTHING here, because strong comparison requires both sides to be
     * strong. We never emit one, so the only way a client sends a weak tag is
     * by having invented it.
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
