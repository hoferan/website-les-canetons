<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\Environment;
use Illuminate\Http\JsonResponse;

/**
 * Serves the committed OpenAPI document to the reference page.
 *
 * IT SERVES THE COMMITTED FILE, not a freshly-generated one. Scramble is a dev
 * dependency and is not installed on any server, and CI's openapi-drift job
 * already fails if the committed document disagrees with the code — so this is
 * both cheaper (no static analysis over the whole app per request on shared
 * hosting) and stronger: what the docs show is exactly the document
 * web/src/api/generated/ was produced from, so the documentation cannot
 * describe an API the client does not speak.
 *
 * THE ONE THING IT CHANGES, AND WHY. The committed document declares
 * `servers: [{"url": "https://lescanetons.org/api"}]`. That is deliberate —
 * config/scramble.php pins an absolute production URL so the export is
 * byte-identical on every machine, which is what lets the drift check pass —
 * but Scalar builds every "Send" from that list. Served untouched, the docs
 * page on TEST would fire real requests, INCLUDING MUTATING ONES, at the live
 * production site.
 *
 * The replacement is RELATIVE. OpenAPI 3.1 resolves a relative server URL
 * against the location the document is served from, so the reader calls
 * whatever origin it loaded the page from. It cannot name the wrong
 * environment because it names none — which is stronger than an absolute URL
 * built from APP_URL, a value each server sets by hand.
 *
 * The committed file is never written to.
 */
class DocsDocumentController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $path = config('docs.document');

        if (! is_string($path) || ! is_file($path)) {
            // The artifact is incomplete. A docs page is not worth an error
            // page, and a 500 on this host means reading logs over FTP.
            abort(404);
        }

        $document = json_decode((string) file_get_contents($path), true);

        if (! is_array($document)) {
            abort(404);
        }

        // THE URL IS THE SAFETY PROPERTY; THE DESCRIPTION IS A LABEL. Keeping
        // the url relative is what stops a reader on TEST from firing requests
        // at production — it cannot name the wrong environment because it
        // names none. The description is display text a human reads next to
        // it, so naming the environment there is useful rather than dangerous:
        // the worst a wrong label can do is mislabel, never misroute. The
        // assertions below this in DocsTest keep them apart on purpose.
        //
        // Shared with the SPA's env ribbon via App\Support\Environment, so the
        // two cannot disagree about which environment this is, and inheriting
        // its fail-safe: an unrecognised APP_ENV reads as Production rather
        // than as staging.
        //
        // English, despite the site's UI being French. This is an API JSON
        // response body, which CLAUDE.md keeps English without exception, and
        // the audience is a developer reading a document whose every other
        // string — endpoint summaries, response descriptions, the schema — is
        // English too.
        $document['servers'] = [[
            'url' => '/api',
            'description' => Environment::label(),
        ]];

        // no-store: the document describes whatever code this server is
        // running, and a proxy holding a stale copy after a deploy would
        // describe the previous release.
        $response = response()
            ->json($document)
            ->header('Cache-Control', 'no-store');

        return $response;
    }
}
