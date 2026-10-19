<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\ApiVersion;
use App\Support\Environment;
use Illuminate\Http\JsonResponse;

/**
 * Serves the committed OpenAPI document to the reference page.
 *
 * It serves the committed file rather than generating one. Scramble is a dev
 * dependency absent from every server, and CI's openapi-drift job fails if the
 * committed document disagrees with the code. So no request pays for static
 * analysis, and the docs show exactly the document web/src/api/generated/ was
 * produced from.
 *
 * The one thing it changes is `servers`. The committed document declares
 * `https://lescanetons.org/api/v1`, because config/scramble.php pins an
 * absolute URL to keep the export byte-identical for the drift check. Scalar
 * builds every "Send" from that list, so served untouched, the docs page on
 * TEST would fire real requests, mutating ones included, at production.
 *
 * The replacement is relative. OpenAPI 3.1 resolves it against the document's
 * own location, so the reader calls whatever origin served the page and cannot
 * name the wrong environment. An absolute URL built from APP_URL would depend
 * on a value each server sets by hand.
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

        // The relative url is the safety property; the description is only a
        // label, so naming the environment there can mislabel but never
        // misroute. DocsTest asserts the two separately.
        //
        // The label comes from App\Support\Environment, like the SPA's env
        // ribbon, so the two agree and an unrecognised APP_ENV reads as
        // Production. It is English, like every API response body.
        //
        // The url is built from ApiVersion::PREFIX so the docs follow the
        // contract if the version changes.
        $document['servers'] = [[
            'url' => '/'.ApiVersion::PREFIX,
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
