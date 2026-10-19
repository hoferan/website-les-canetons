<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Contracts\View\View;

/**
 * The API reference page.
 *
 * A static shell that names the document's URL and lets the reader fetch it,
 * so the servers rewrite lives only in DocsDocumentController and this
 * response is the same in every environment.
 *
 * Returning a View from the `api` group is fine: shouldRenderJsonWhen() in
 * bootstrap/app.php governs only how exceptions render.
 */
class DocsController extends Controller
{
    public function __invoke(): View
    {
        return view('docs');
    }
}
