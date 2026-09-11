<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ErrorVocabulary;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * What every problem document's `type` URI resolves to.
 *
 * RFC 9457 makes `type` the primary identifier for a problem type and
 * encourages it to provide documentation when dereferenced. Plenty of APIs mint
 * a `type` that 404s — legal, since dereferencing is only encouraged — and it is
 * a small lie told to every developer who pastes the URL into a browser, which
 * they will. This is what makes it true.
 *
 * JSON ONLY, and that is a correction. This served a Blade page by default and
 * content-negotiated down to JSON, which meant `curl /api/problems/{code}`
 * answered with HTML — backwards for anything living under /api/, and the thing
 * that made the arrangement feel wrong. Problem types are data; this serves the
 * data. Humans read them in the Scalar reference, which renders the same list
 * from the same source as a sidebar group, and a browser pointed straight here
 * still gets a readable document because browsers pretty-print JSON.
 *
 * The deleted page also bought nothing in availability, which was the argument
 * that settled it: these routes are the same Laravel app, in the same middleware
 * group, as /api/v1/*. If the API is down, a page here would be down with it.
 *
 * UNVERSIONED, in routes/meta.php beside /api/docs, and load-bearing rather than
 * tidy. A problem type outlives a contract version: `not_found` means the same
 * thing in v1 and v2. Baking /v1/ into an identifier that can never change —
 * because clients branch on it — would give one problem type two identities.
 *
 * ALWAYS ON, unlike /api/docs. That reference describes the whole schema; this
 * describes what one error token means, and the vocabulary is public anyway —
 * web/src/i18n/fr.ts ships inside the SPA bundle every visitor downloads. A
 * `type` that resolved only where API_DOCS_ENABLED happened to be on would be
 * worse than one that never resolved.
 */
class ProblemController extends Controller
{
    /** The whole vocabulary, for somebody who does not yet know which code they want. */
    public function index(): JsonResponse
    {
        return response()
            ->json(['problems' => ErrorVocabulary::all()])
            ->header('Cache-Control', 'public, max-age=3600');
    }

    /**
     * One problem type.
     *
     * An unknown code raises the ordinary 404, so this route answers in the very
     * contract it documents — and that 404's own `type` points back here, at a
     * document that does exist.
     */
    public function show(string $slug): JsonResponse
    {
        // A `type` URI spells the token with hyphens; `code` spells it with
        // underscores. Both are accepted, because a developer who has the code
        // in front of them will type that one.
        $problem = ErrorVocabulary::describe(ErrorVocabulary::codeFrom($slug));

        if ($problem === null) {
            throw new NotFoundHttpException;
        }

        return response()
            ->json($problem)
            ->header('Cache-Control', 'public, max-age=3600');
    }
}
