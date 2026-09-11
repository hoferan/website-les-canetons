<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Turns off two of PHP's json_encode defaults for every JSON response.
 *
 * Both are valid JSON either way — RFC 8259 permits `\/` and `\uXXXX`, and every
 * parser in existence decodes them back to the same string, so nothing a client
 * receives changes. What changes is what a human sees, and what goes over the
 * wire:
 *
 *   JSON_UNESCAPED_SLASHES
 *       "\/api\/v1\/events\/42" becomes "/api/v1/events/42". PHP escapes
 *       slashes so that a `</script>` inside a string cannot terminate a script
 *       tag when JSON is inlined into HTML. This API never inlines its bodies
 *       into HTML — it is the SPA's data source, not a page renderer — so the
 *       protection buys nothing and costs legibility in exactly the places
 *       meant to be read by a person: a problem document's `instance` and
 *       `type`, pasted into a chat message with a requestId.
 *
 *   JSON_UNESCAPED_UNICODE
 *       "Répétition" becomes "Répétition". This is the one with a
 *       measurable cost rather than an aesthetic one. Every event title,
 *       location, attire note and guest name in this API is French, and
 *       escaping turns each accented character from two bytes into six. A
 *       representative title plus a path measured 78 bytes escaped against 62
 *       unescaped — about a fifth of the payload, on a site whose image budget
 *       exists because people open it on a phone at a rehearsal.
 *
 * UTF-8 is safe to emit raw here: JSON is defined as UTF-8 (RFC 8259 §8.1), and
 * `application/json` needs no charset parameter to say so.
 *
 * setEncodingOptions() re-encodes from the response's own data, so this is a
 * re-serialisation rather than a string rewrite — it cannot corrupt a string by
 * unescaping something that was meant to stay escaped.
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
