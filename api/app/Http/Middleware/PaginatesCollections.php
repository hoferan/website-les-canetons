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
 * WHY EVERY COLLECTION AND NOT THE BIG ONES. A public API where `/members`
 * pages and `/roles` does not is worse than either choice applied to
 * everything: a client cannot write one function that reads a list, and the day
 * a small collection grows, adding the envelope is a breaking change to
 * whatever was already reading it. The envelope costs the small collections one
 * key and buys the contract a single shape.
 *
 * WHY IT IS A MIDDLEWARE AND NOT A HELPER IN EIGHT CONTROLLERS. Same argument
 * as App\Support\Scramble\DocumentsFailureModes: eight call sites are eight
 * chances to forget, and the ninth collection added next year has nobody to
 * remind it. The condition here is not a list of routes to maintain either — it
 * is the SHAPE OF THE ANSWER. A JSON body that is a list is a collection, which
 * is true by definition rather than by convention, so a new endpoint returning
 * one is enveloped the day it is written. The exported document derives the
 * same fact statically from the 200 schema being an array, and
 * Tests\Feature\PaginationTest asserts the two agree route by route.
 *
 * NOTHING ELSE IS TOUCHED: every other response in this API is a JSON object —
 * a resource, a problem document, the guest-list JSON export — and an object is
 * left exactly as it was.
 *
 * THE SLICE HAPPENS HERE, NOT IN THE QUERY, and the reason is a measured one.
 * Slicing in each controller needs a second `count()` query per collection to
 * fill in `meta.total`, against tests that pin the query count of the roster
 * and the planning (test_listing_the_roster_costs_a_fixed_number_of_queries and
 * its siblings). That cost is paid on every request, to bound sets the domain
 * already bounds at a few hundred rows. If a collection here ever stops being
 * one page, the slice moves into the query and this envelope does not change —
 * which is the property the envelope exists for.
 *
 * `Link` ON A READ ONLY. `PUT /events/{event}/registration-options` answers
 * with the options as they now stand, so it gets the envelope — one shape for
 * that collection whichever verb asked for it — but a `rel="next"` pointing at
 * a URL you would have to PUT again is not a link anybody should follow.
 */
class PaginatesCollections
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! $response instanceof JsonResponse) {
            return $response;
        }

        // A failure is a problem document, which is an object — so this test
        // would already let one through. Checked anyway, because "the body is a
        // list" is a claim about a SUCCESSFUL representation, and a future
        // error shape that happened to be a list must not be dressed up as a
        // collection.
        if (! $response->isSuccessful()) {
            return $response;
        }

        $body = $response->getData(true);

        // array_is_list is the whole predicate: `[]` and `[{…}, {…}]` are
        // collections, `{…}` is not. An EMPTY collection matters most here —
        // without this it would still be `[]`, and a client would have to
        // handle two shapes for the one case it is likeliest to meet first.
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
            // APPENDED, NOT REPLACED, and the third argument is the whole
            // reason this comment exists. `set()` replaces by default, and
            // App\Http\Middleware\ApiVersion has already put its own `Link`
            // on the response — `<…>; rel="successor-version"`, the one header
            // whose entire job is to reach clients during a v1-to-v2
            // migration. This middleware is appended to the group BEFORE that
            // one, so on the way out it runs LAST and a replacing set() wins.
            //
            // Nothing would have caught it. The successor is null on every
            // server today, so the header does not exist to be destroyed, and
            // ApiVersionTest exercises `/api/v1/config`, which is not a
            // collection. It would have surfaced on the day somebody set
            // API_SUCCESSOR_URL and noticed that seven endpoints had gone
            // quiet while `Deprecation` and `Sunset` kept working.
            //
            // Two field lines is what RFC 8288 §3 asks for: a client joins
            // them, and `fetch()` does it for free.
            $response->headers->set('Link', $page->links($request, $total), false);
        }

        return $response;
    }
}
