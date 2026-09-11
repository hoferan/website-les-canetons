<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ErrorVocabulary;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The documents every problem document's `type` URI points at.
 *
 * RFC 9457 makes `type` the primary identifier for a problem type and
 * encourages it to provide human-readable documentation when dereferenced.
 * Plenty of APIs mint a `type` URI that 404s — legal, since dereferencing is
 * only encouraged — and it is a small lie told to every developer who pastes
 * the URL into a browser, which they will. These pages are what makes it true.
 *
 * UNVERSIONED, in routes/meta.php beside /api/docs, and that is load-bearing
 * rather than tidy. A problem type outlives a contract version: `not_found`
 * means the same thing in v1 and v2. Baking /v1/ into an identifier that can
 * never change afterwards — because clients branch on it — would be a mistake
 * you cannot take back.
 *
 * ALWAYS ON, unlike /api/docs. That reference is gated because it describes the
 * whole schema; this describes what one error token means, and that vocabulary
 * is public anyway — web/src/i18n/fr.ts ships inside the SPA bundle every
 * visitor downloads. A `type` URI that resolved only on TEST would be worse
 * than one that never resolved at all.
 *
 * CONTENT-NEGOTIATED, which is the point of serving it here rather than as
 * JSON only: a developer with a browser gets a page, a tool gets data.
 */
class ProblemController extends Controller
{
    /** The whole vocabulary, for somebody who does not yet know which code they want. */
    public function index(Request $request): Response
    {
        $problems = ErrorVocabulary::all();

        if ($request->wantsJson()) {
            return response()
                ->json(['problems' => $problems])
                ->header('Cache-Control', 'public, max-age=3600');
        }

        return response()
            ->view('problems', ['problems' => $problems, 'one' => null])
            ->header('Cache-Control', 'public, max-age=3600');
    }

    /**
     * One problem type.
     *
     * An unknown code raises the ordinary 404, so this route answers in the very
     * contract it documents — and that 404's own `type` points back here, to a
     * page that does exist.
     */
    public function show(Request $request, string $slug): Response
    {
        // A `type` URI spells the token with hyphens; `code` spells it with
        // underscores. Both are accepted here, because a developer who has the
        // code in front of them will type that one.
        $problem = ErrorVocabulary::describe(ErrorVocabulary::codeFrom($slug));

        if ($problem === null) {
            throw new NotFoundHttpException;
        }

        if ($request->wantsJson()) {
            return response()
                ->json($problem)
                ->header('Cache-Control', 'public, max-age=3600');
        }

        return response()
            ->view('problems', ['problems' => [$problem], 'one' => $problem])
            ->header('Cache-Control', 'public, max-age=3600');
    }
}
