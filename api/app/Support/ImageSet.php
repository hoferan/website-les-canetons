<?php

namespace App\Support;

/**
 * The sizes of one photo, as the browser sends them (#105, ADR 0028).
 *
 * The SPA encodes a photo at up to three widths and uploads them together.
 * JpegInspector checks each JPEG on its own; this checks that the set hangs
 * together, so the library never holds a 480 px size of one photo beside the
 * 1920 px size of another.
 */
final class ImageSet
{
    public const TOO_MANY = 'image_set_too_many';

    public const TOO_HEAVY = 'image_set_too_heavy';

    public const WIDTHS_REPEATED = 'image_set_widths_repeated';

    public const ASPECT_MISMATCH = 'image_set_aspect_mismatch';

    /**
     * Every problem this class can report. Each reaches the API as a
     * validation reason against `files`, and ApiErrorVocabularyTest reads
     * this list to demand copy for it in both catalogues.
     */
    public const PROBLEMS = [self::TOO_MANY, self::TOO_HEAVY, self::WIDTHS_REPEATED, self::ASPECT_MISMATCH];

    /**
     * Room for the multipart boundaries and part headers on top of the JPEG
     * bytes themselves. Each part spends a couple of hundred bytes on them.
     */
    private const MULTIPART_OVERHEAD = 16384;

    /**
     * The checks that need no part to be read: how many there are and how
     * much they weigh together. `Content-Length` is checked when the request
     * has one, and the parts' own sizes always, since a chunked request has
     * none.
     */
    public static function checkEnvelope(int $count, int $partBytes, ?int $contentLength): ?string
    {
        $maxParts = (int) config('api.images.max_parts');

        if ($count > $maxParts) {
            return self::TOO_MANY;
        }

        $maxBytes = $maxParts * (int) config('api.images.max_bytes');

        if ($partBytes > $maxBytes || ($contentLength !== null && $contentLength > $maxBytes + self::MULTIPART_OVERHEAD)) {
            return self::TOO_HEAVY;
        }

        return null;
    }

    /**
     * Whether the inspected parts are sizes of one photo: no two the same
     * width, and every one the shape of the largest. "The same shape" allows
     * one pixel either way on the shorter edge, which is what rounding a
     * scaled edge to whole pixels can cost.
     *
     * @param  list<array{width: int, height: int, bytes: int, path: string}>  $parts
     */
    public static function check(array $parts): ?string
    {
        $widths = array_column($parts, 'width');

        if (count(array_unique($widths)) !== count($widths)) {
            return self::WIDTHS_REPEATED;
        }

        $largest = self::largestFirst($parts)[0] ?? null;
        if ($largest === null) {
            return null;
        }
        $landscape = $largest['width'] >= $largest['height'];

        foreach ($parts as $part) {
            // The browser scales the longest edge to its target and rounds the
            // other, so the other is the one to derive and compare.
            $off = $landscape
                ? abs($part['height'] - $part['width'] * $largest['height'] / $largest['width'])
                : abs($part['width'] - $part['height'] * $largest['width'] / $largest['height']);

            if ($off > 1) {
                return self::ASPECT_MISMATCH;
            }
        }

        return null;
    }

    /**
     * @template T of array{width: int}
     *
     * @param  list<T>  $parts
     * @return list<T>
     */
    public static function largestFirst(array $parts): array
    {
        usort($parts, fn (array $a, array $b): int => $b['width'] <=> $a['width']);

        return $parts;
    }
}
