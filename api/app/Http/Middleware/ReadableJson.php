<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Turns off two of PHP's json_encode defaults for every JSON response.
 *
 * RFC 8259 permits `\/` and `\uXXXX` and every parser decodes them to the same
 * string, so clients receive the same data. What changes is legibility and size:
 *
 *   JSON_UNESCAPED_SLASHES
 *       "\/api\/v1\/events\/42" becomes "/api/v1/events/42". PHP escapes
 *       slashes so a `</script>` in a string cannot end a script tag when JSON
 *       is inlined into HTML. This API never inlines its bodies into HTML, and
 *       the escaping hurts legibility where a person reads it: a problem
 *       document's `instance` and `type`, pasted into a chat with a requestId.
 *
 *   JSON_UNESCAPED_UNICODE
 *       "R\u00e9p\u00e9tition" becomes "Répétition". Event titles, locations,
 *       attire notes and guest names are French, and escaping turns each
 *       accented character from two bytes into six: a representative title
 *       plus a path is 78 bytes escaped against 62 unescaped.
 *
 * UTF-8 is safe to emit raw: JSON is defined as UTF-8 (RFC 8259 §8.1), and
 * `application/json` needs no charset parameter to say so.
 *
 * setEncodingOptions() re-encodes from the response's own data, so no string is
 * rewritten.
 */
class ReadableJson
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($response instanceof JsonResponse) {
            $response->setEncodingOptions(
                $response->getEncodingOptions() | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
            );
        }

        return $response;
    }
}
