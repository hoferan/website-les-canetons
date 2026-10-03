<?php

namespace App\Support;

/**
 * Checks an uploaded file is the JPEG the browser was asked to produce, without
 * decoding it. getimagesize() reads the header, and a byte walk reads the
 * marker segments, so no image extension is involved at all (ADR 0028, #105).
 *
 * The walk is an allow-list of what a canvas encoder writes: SOI, APP0
 * (JFIF), APP2 (an ICC profile), APP14 (Adobe), DQT, DHT, DRI, SOF0 to SOF2,
 * each SOS with its scan, and EOI. A comment or any other APPn is metadata.
 * Anything else, and any byte that is not a marker where one should be, is
 * data no photograph needs. Neither is stripped here: web/src/images/shrink.ts
 * removes the segments before the upload, so a refusal means the shrink was
 * bypassed. The scan data itself can carry arbitrary bytes and cannot be
 * checked without decoding; the headers ImageFileController sends are the
 * defence for that.
 *
 * The limits are config('api.images.*'). tools/image-budget.mjs holds the
 * photographs in the repository to the same numbers, and
 * web/src/images/shrink.ts shrinks uploads to them. Change all three together.
 */
final class JpegInspector
{
    public const NOT_JPEG = 'image_not_jpeg';

    public const TOO_LARGE = 'image_too_large';

    public const TOO_HEAVY = 'image_too_heavy';

    public const HAS_METADATA = 'image_has_metadata';

    public const UNEXPECTED_DATA = 'image_unexpected_data';

    public const TRAILING_DATA = 'image_trailing_data';

    /**
     * Every problem inspect() can report. Each one reaches the API as a
     * validation reason, and ApiErrorVocabularyTest reads this list to demand
     * copy for it in both catalogues.
     */
    public const PROBLEMS = [
        self::NOT_JPEG,
        self::TOO_LARGE,
        self::TOO_HEAVY,
        self::HAS_METADATA,
        self::UNEXPECTED_DATA,
        self::TRAILING_DATA,
    ];

    /** The APPn segments a canvas encoder writes, by marker, with the identifier each must start with. */
    private const ALLOWED_APP = [
        0xE0 => "JFIF\0",
        0xE2 => "ICC_PROFILE\0",
        0xEE => 'Adobe',
    ];

    /** DQT, DHT, DRI, and the baseline, extended and progressive frames. */
    private const ALLOWED_SEGMENTS = [0xDB, 0xC4, 0xDD, 0xC0, 0xC1, 0xC2];

    /**
     * @return array{width: int, height: int, problems: list<string>}
     */
    public static function inspect(string $path): array
    {
        $info = @getimagesize($path);
        // A frame of zero pixels is a JPEG header and not a photo, and a zero
        // width would divide by zero in ImageSet::check().
        if ($info === false || $info[2] !== IMAGETYPE_JPEG || $info[0] < 1 || $info[1] < 1) {
            return ['width' => 0, 'height' => 0, 'problems' => [self::NOT_JPEG]];
        }

        [$width, $height] = $info;
        $problems = [];

        if (max($width, $height) > (int) config('api.images.max_edge')) {
            $problems[] = self::TOO_LARGE;
        }
        if (filesize($path) > (int) config('api.images.max_bytes')) {
            $problems[] = self::TOO_HEAVY;
        }

        $walk = self::walk((string) file_get_contents($path));

        if ($walk['metadata']) {
            $problems[] = self::HAS_METADATA;
        }
        if ($walk['structure'] !== null) {
            $problems[] = $walk['structure'];
        }

        return ['width' => $width, 'height' => $height, 'problems' => $problems];
    }

    /**
     * Walks the marker segments from SOI to EOI, stepping over each scan's
     * entropy-coded data, and reports whether a comment or an APPn outside the
     * allow-list was found, and what is wrong with the structure, if anything.
     *
     * The structure is UNEXPECTED_DATA for a byte where a marker should be or a
     * marker outside the allow-list, and TRAILING_DATA when the file does not
     * end exactly where its EOI marker does. Bytes after EOI are ignored by
     * every decoder, so they are where a JPEG/HTML or JPEG/ZIP polyglot keeps
     * its second file. A file cut short before its EOI fails the same check.
     *
     * @return array{metadata: bool, structure: string|null}
     */
    private static function walk(string $bytes): array
    {
        $length = strlen($bytes);
        $metadata = false;

        if (! str_starts_with($bytes, "\xff\xd8")) {
            return ['metadata' => false, 'structure' => self::UNEXPECTED_DATA];
        }

        $pos = 2;

        while ($pos < $length) {
            if ($bytes[$pos] !== "\xff") {
                return ['metadata' => $metadata, 'structure' => self::UNEXPECTED_DATA];
            }
            // Extra 0xFF bytes may pad before a marker.
            while ($pos < $length && $bytes[$pos] === "\xff") {
                $pos++;
            }
            if ($pos >= $length) {
                break;
            }

            $marker = ord($bytes[$pos]);
            $pos++;

            if ($marker === 0xD9) {
                return ['metadata' => $metadata, 'structure' => $pos === $length ? null : self::TRAILING_DATA];
            }

            $isApp = $marker >= 0xE0 && $marker <= 0xEF;
            $isComment = $marker === 0xFE;
            if (! $isApp && ! $isComment && $marker !== 0xDA && ! in_array($marker, self::ALLOWED_SEGMENTS, true)) {
                return ['metadata' => $metadata, 'structure' => self::UNEXPECTED_DATA];
            }

            if ($pos + 2 > $length) {
                break;
            }
            $segmentLength = unpack('n', $bytes, $pos)[1];
            if ($segmentLength < 2) {
                return ['metadata' => $metadata, 'structure' => self::UNEXPECTED_DATA];
            }

            if ($isComment) {
                $metadata = true;
            } elseif ($isApp) {
                $identifier = self::ALLOWED_APP[$marker] ?? null;
                $payload = substr($bytes, $pos + 2, $segmentLength - 2);
                $metadata = $metadata || $identifier === null || ! str_starts_with($payload, $identifier);
            }

            $pos += $segmentLength;

            if ($marker === 0xDA) {
                $pos = self::endOfScan($bytes, $pos);
            }
        }

        return ['metadata' => $metadata, 'structure' => self::TRAILING_DATA];
    }

    /**
     * The offset of the marker that ends a scan's entropy-coded data, or the
     * length of the string when none does. Inside the data, 0xFF is followed
     * by 0x00 (a stuffed byte), by a restart marker, or by more 0xFF fill.
     */
    private static function endOfScan(string $bytes, int $pos): int
    {
        $length = strlen($bytes);

        while (($ff = strpos($bytes, "\xff", $pos)) !== false) {
            if ($ff + 1 >= $length) {
                return $length;
            }

            $next = ord($bytes[$ff + 1]);
            if ($next === 0x00 || ($next >= 0xD0 && $next <= 0xD7)) {
                $pos = $ff + 2;

                continue;
            }
            if ($next === 0xFF) {
                $pos = $ff + 1;

                continue;
            }

            return $ff;
        }

        return $length;
    }
}
