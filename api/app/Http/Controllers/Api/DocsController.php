<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Contracts\View\View;

/**
 * The API reference page.
 *
 * A static shell: it names the document's URL and lets the reader fetch it, so
 * the servers rewrite lives in exactly one place (DocsDocumentController) and
 * this response has nothing environment-specific in it at all.
 *
 * Returning a View from a route in the `api` group is fine. bootstrap/app.php's
 * shouldRenderJsonWhen() governs only how EXCEPTIONS render, not successful
 * responses.
 */
class DocsController extends Controller
{
    public function __invoke(): View
    {
        return view('docs');
    }
}
