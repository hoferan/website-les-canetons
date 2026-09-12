<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiError;
use App\Support\EntityTag;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

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
 * replace-all PUTs (a member's roles, an event's bookable options). The two
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
 * somebody's behalf while that member answers, which C12's five-minute undo
 * window and the audit entry already cover.
 *
 * NO CONDITIONAL GET. `If-None-Match` is not implemented and no 304 is ever
 * returned: every route here also sends `Cache-Control: no-store`, so there is
 * no cache to serve one. The tag is an optimistic-concurrency token that
 * happens to be spelled the way HTTP spells one.
 */
class ConditionalWrite
{
    /** The methods that must prove they are working from current state. */
    private const CONDITIONED = ['PUT', 'PATCH', 'DELETE'];

    public function handle(Request $request, Closure $next, string $facet): Response
    {
        $method = strtoupper($request->method());

        if (in_array($method, self::CONDITIONED, true)) {
            $refusal = $this->check($request, $facet);

            if ($refusal !== null) {
                return $refusal;
            }
        }

        $response = $next($request);

        // Emitted only on success, and never on a DELETE: there is no entity
        // left to tag, and an `ETag` on a 200 that announces a deletion would
        // name something that no longer exists.
        //
        // Never on a 412 either, which is the one worth saying out loud: the
        // refusal knows the current tag and sending it would be a kindness
        // that defeats the mechanism — a client could retry blindly with the
        // fresh tag and land exactly the overwrite it was just stopped from
        // making. The fix for a 412 is to re-read and re-decide, not to
        // re-send.
        if ($response->isSuccessful() && $method !== 'DELETE') {
            $tag = EntityTag::of($facet, $request);

            if ($tag !== null) {
                $response->headers->set('ETag', $tag);
            }
        }

        return $response;
    }

    /** The refusal this write earns, or null to let it through. */
    private function check(Request $request, string $facet): ?Response
    {
        $header = $request->headers->get('If-Match');

        if ($header === null || trim($header) === '') {
            return ApiError::json(
                428,
                'if_match_required',
                'If-Match is required on this request',
            );
        }

        $current = EntityTag::of($facet, $request);

        if ($current === null || ! $this->matches($header, $current)) {
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
    private function matches(string $header, string $current): bool
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
