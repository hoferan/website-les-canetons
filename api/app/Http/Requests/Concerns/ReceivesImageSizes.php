<?php

namespace App\Http\Requests\Concerns;

use App\Support\ImageSet;
use App\Support\JpegInspector;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Validator;

/**
 * The checks on the sizes of one photo, sent as `files[]` parts. An upload
 * and a replacement both run them, so a replaced photo is held to exactly
 * what a new one is (ADR 0028).
 *
 * Each part must already be what the site serves: a JPEG of at most 1920
 * pixels on its longest edge and 600 KB, holding only the segments a canvas
 * encoder writes, and ending at its EOI marker. A part's problem is reported
 * against `files.N`, a problem with the set against `files`.
 *
 * The request using this lists `files` and `files.*` in its own rules(), so
 * Scramble documents them on each operation.
 */
trait ReceivesImageSizes
{
    /** @var list<array{width: int, height: int, bytes: int, path: string}>|null */
    private ?array $parts = null;

    /**
     * The checks on the set and on each JPEG, as closure-added reasons. Each
     * token is added bare and stays paramless, for the reason
     * StoreRegistrationRequest::after() gives.
     *
     * The set's count and weight come first and stop everything else, so a
     * request carrying too much is refused before any part is read. Nothing
     * runs while a rule has already failed, `name` on an upload included.
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                $files = array_values((array) $this->file('files'));

                $refusal = ImageSet::checkEnvelope(
                    count($files),
                    array_sum(array_map(fn ($file) => $file instanceof UploadedFile ? (int) $file->getSize() : 0, $files)),
                    $this->header('Content-Length') === null ? null : (int) $this->header('Content-Length'),
                );
                if ($refusal !== null) {
                    $validator->errors()->add('files', $refusal);

                    return;
                }

                $parts = [];
                $failed = false;

                foreach ($files as $index => $file) {
                    if (! $file instanceof UploadedFile) {
                        $validator->errors()->add("files.{$index}", JpegInspector::NOT_JPEG);
                        $failed = true;

                        continue;
                    }

                    $path = (string) $file->getRealPath();
                    $inspection = JpegInspector::inspect($path);

                    if ($inspection['problems'] !== []) {
                        $validator->errors()->add("files.{$index}", $inspection['problems'][0]);
                        $failed = true;

                        continue;
                    }

                    $parts[] = [
                        'width' => $inspection['width'],
                        'height' => $inspection['height'],
                        'bytes' => (int) $file->getSize(),
                        'path' => $path,
                    ];
                }

                if ($failed) {
                    return;
                }

                $problem = ImageSet::check($parts);
                if ($problem !== null) {
                    $validator->errors()->add('files', $problem);

                    return;
                }

                $this->parts = ImageSet::largestFirst($parts);
            },
        ];
    }

    /**
     * The validated sizes, largest first. The first one is the photo.
     *
     * @return list<array{width: int, height: int, bytes: int, path: string}>
     */
    public function sizes(): array
    {
        if ($this->parts === null) {
            throw new \LogicException('Read the sizes only after validation has passed.');
        }

        return $this->parts;
    }
}
