<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ReceivesImageSizes;
use Illuminate\Foundation\Http\FormRequest;

/**
 * New sizes for a photo already in the library, sent exactly as an upload
 * sends them: `multipart/form-data`, one `files[]` part per size, one to
 * three of them.
 *
 * Every check an upload makes is made here, by the same code, and refuses
 * with the same reasons: `image_not_jpeg`, `image_too_large`,
 * `image_too_heavy`, `image_has_metadata`, `image_unexpected_data` or
 * `image_trailing_data` against `files.N`, and `image_set_too_many`,
 * `image_set_too_heavy`, `image_set_widths_repeated` or
 * `image_set_aspect_mismatch` against `files`.
 */
class ReplaceImageFileRequest extends FormRequest
{
    use ReceivesImageSizes;

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // The same two rules as StoreImageRequest, and the same after(): see
        // ReceivesImageSizes.
        return [
            /** The new sizes of the photo, in any order: one to three JPEGs, each at most 1920 pixels on its longest edge and 600 KB, with no Exif or XMP metadata. Send each as a part named `files[]`, since PHP keeps only the last of several parts sharing a bare name. */
            'files' => ['required', 'array'],
            'files.*' => ['file'],
        ];
    }
}
