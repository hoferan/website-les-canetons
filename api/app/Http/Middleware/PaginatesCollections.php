<?php

namespace App\Http\Middleware;

use App\Support\Page;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Puts every collection in this API into one envelope: `{data, meta}`, plus an
 * RFC 8288 `Link` header on a read.
 *
 * Every collection, small ones included, so a client reads every list with one
 * function and a growing collection never needs a breaking change to add it.
 *
 * A middleware, so a new endpoint cannot forget it. The condition is the shape
 * of the answer: a JSON body that is a list is a collection. The exported
 * document derives the same from the 200 schema being an array, and
 * Tests\Feature\PaginationTest asserts the two agree route by route. Every
 * other response is a JSON object and is left as it was.
 *
 * The slice happens here and not in the query, because slicing in a controller
 * needs a second `count()` query for `meta.total`, against tests that pin the
 * query count of the roster and the planning
 * (test_listing_the_roster_costs_a_fixed_number_of_queries and its siblings).
 * The domain bounds these sets at a few hundred rows. If one outgrows a page,
 * the slice moves into the query and the envelope does not change.
 *
 * `Link` on a read only. `PUT /events/{event}/registration-options` answers with
 * the options as they now stand, so it gets the envelope, but a `rel="next"` to
 * a URL that has to be PUT again is not a link to follow.
 */
class PaginatesCollections
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! $response instanceof JsonResponse) {
            return $response;
        }

        // A failure is a problem document, an object, so the list check below
        // would pass it through anyway. Checked so an error body that is a list
        // is never enveloped as a collection.
        if (! $response->isSuccessful()) {
            return $response;
        }

        $body = $response->getData(true);

        // `[]` and `[{…}, {…}]` are collections, `{…}` is not. The empty list
        // is enveloped too, so a client meets one shape.
        if (! is_array($body) || ! array_is_list($body)) {
            return $response;
        }

        $page = Page::from($request);
        $total = count($body);

        $response->setData([
            'data' => $page->slice($body),
            'meta' => $page->meta($total),
        ]);

        if ($request->isMethodSafe()) {
            // Appended (the third argument), not replaced. ApiVersion has
            // already set its own `Link: <…>; rel="successor-version"`, and
            // this middleware is appended to the group before that one, so on
            // the way out it runs last and a replacing set() would drop it.
            // No test covers this: the successor is unset on every server and
            // ApiVersionTest calls `/api/v1/config`, which is not a collection.
            //
            // RFC 8288 §3 allows two field lines; a client joins them.
            $response->headers->set('Link', $page->links($request, $total), false);
        }

        return $response;
    }
}
