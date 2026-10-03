<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

#[Group('Images', weight: 65)]
class ImageFileController extends Controller
{
    /**
     * One size of a library photo, as a JPEG. Public.
     *
     * Read the path from an image's `url` or `srcset` rather than building it.
     * It is the SHA-256 of this size's own bytes, so a given URL can only ever
     * serve those bytes, and it is cached for a year. The `ETag` is the same
     * digest: send it back as `If-None-Match` and the answer is `304`.
     */
    #[Endpoint(operationId: 'image.file')]
    #[Response(200, 'The JPEG.', mediaType: 'image/jpeg', type: 'string', format: 'binary')]
    #[Response(304, 'The `If-None-Match` names these bytes: the copy you have is current.')]
    public function __invoke(Request $request, string $sha256): HttpResponse
    {
        $tag = '"'.$sha256.'"';

        // No query at all. The tag is the digest of the bytes this path
        // serves, computed from those bytes when they were stored, so whoever
        // holds it holds exactly these bytes. A size deleted in the meantime
        // still answers 304, which tells the browser nothing it did not
        // already have. The connection this saves counts against the host's
        // ten.
        if ($this->matches($request->header('If-None-Match'), $tag)) {
            return response('', 304, $this->headers($tag));
        }

        // Exactly one query, and the only place `data` is ever read. A HEAD
        // asks for the length alone.
        $head = $request->isMethod('HEAD');
        // Any row with this digest holds these bytes, so the first will do.
        $row = DB::table('image_files')
            ->where('sha256', $sha256)
            ->first($head ? ['bytes'] : ['bytes', 'data']);

        // The row is in memory now. Sending it can take seconds on a slow
        // phone, and the connection would otherwise stay open, one of the
        // host's ten, until the last byte has left.
        DB::disconnect();

        if ($row === null) {
            abort(404);
        }

        $data = $head ? '' : (string) $row->data;

        return response($data, 200, [
            ...$this->headers($tag),
            'Content-Type' => 'image/jpeg',
            // From the bytes sent, so a `bytes` column that ever drifted could
            // not cut a response short or leave the browser waiting.
            'Content-Length' => (string) ($head ? $row->bytes : strlen($data)),
            'Content-Disposition' => 'inline',
        ]);
    }

    /**
     * What a 200 and a 304 both carry. The bytes are a JPEG and nothing else
     * may sniff them, and the sandbox keeps any HTML a crafted file might hide
     * from running even when the file is opened on its own.
     *
     * @return array<string, string>
     */
    private function headers(string $tag): array
    {
        return [
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'ETag' => $tag,
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; sandbox",
        ];
    }

    /** RFC 9110's weak comparison over a list of tags. `*` is left to the read. */
    private function matches(?string $header, string $tag): bool
    {
        if ($header === null) {
            return false;
        }

        foreach (explode(',', $header) as $candidate) {
            $candidate = trim($candidate);
            if (str_starts_with($candidate, 'W/')) {
                $candidate = substr($candidate, 2);
            }
            if ($candidate === $tag) {
                return true;
            }
        }

        return false;
    }
}
