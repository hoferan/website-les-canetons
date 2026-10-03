<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ReceivesImageSizes;
use App\Support\PhotoName;
use Illuminate\Foundation\Http\FormRequest;

/**
 * One photograph for the library, in one to three sizes, sent as
 * `multipart/form-data` with one `files[]` part per size and a `name`.
 *
 * Each part must already be what the site serves: a JPEG of at most 1920
 * pixels on its longest edge and 600 KB, holding only the segments a canvas
 * encoder writes (no comment, no Exif, XMP or other metadata), and ending at
 * its EOI marker. The SPA shrinks and re-encodes a photo in the browser before
 * sending it, so a camera original never reaches the server. A part's problem
 * is reported against `files.N` with its own reason: `image_not_jpeg`,
 * `image_too_large`, `image_too_heavy`, `image_has_metadata`,
 * `image_unexpected_data` or `image_trailing_data`.
 *
 * The parts must be sizes of one photo: distinct widths and the same aspect
 * ratio. The largest is the photo. A problem with the set is reported against
 * `files`: `image_set_too_many`, `image_set_too_heavy`,
 * `image_set_widths_repeated` or `image_set_aspect_mismatch`.
 */
class StoreImageRequest extends FormRequest
{
    use ReceivesImageSizes;

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // No `image`, `mimes` or `dimensions` rule: each reads the MIME type
        // through the fileinfo extension, and the library depends on no image
        // or file extension at all. after() reads the JPEG header instead
        // (ADR 0028).
        return [
            /** The sizes of one photo, in any order: one to three JPEGs, each at most 1920 pixels on its longest edge and 600 KB, with no Exif or XMP metadata. Send each as a part named `files[]`, since PHP keeps only the last of several parts sharing a bare name. */
            'files' => ['required', 'array'],
            'files.*' => ['file'],
            /** The committee's label for the photo: at most 120 characters once trimmed, with no control or bidirectional formatting characters. The SPA sends the file name without its extension. */
            'name' => PhotoName::RULES,
        ];
    }

    /** The name as stored. TrimStrings has trimmed it already; this narrows the type. */
    public function photoName(): string
    {
        return (string) $this->validated('name');
    }
}
