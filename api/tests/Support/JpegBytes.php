<?php

namespace Tests\Support;

/**
 * Builds JPEG bytes by hand, because the dev container has no gd and the
 * inspector under test never decodes anything anyway: getimagesize() reads
 * only the header.
 */
final class JpegBytes
{
    /**
     * A 1x1 baseline JPEG: SOI, JFIF, one flat quantisation table, SOF0, two
     * one-symbol Huffman tables, SOS, one scan byte, EOI. It decodes.
     */
    private const SOI = 'ffd8';

    private const BODY_HEX =
        'ffe000104a46494600010100000100010000'
        .'ffdb004300'.'01010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101'
        .'ffc0000b08'.'0001'.'0001'.'01011100'
        .'ffc40014000100000000000000000000000000000000'
        .'ffc40014100100000000000000000000000000000000'
        .'ffda0008010100003f00'.'3f'
        .'ffd9';

    public static function make(
        int $width = 8,
        int $height = 8,
        bool $exif = false,
        bool $xmp = false,
        int $padTo = 0,
    ): string {
        $body = hex2bin(self::BODY_HEX);

        // The SOF0 height and width sit right after its precision byte.
        $sof = strpos($body, "\xff\xc0\x00\x0b\x08");
        $body = substr_replace($body, pack('nn', $height, $width), $sof + 5, 4);

        $segments = '';
        if ($exif) {
            $segments .= self::segment(0xE1, "Exif\0\0".'II*'."\0\x08\0\0\0\0\0");
        }
        if ($xmp) {
            $segments .= self::segment(0xE1, "http://ns.adobe.com/xap/1.0/\0".'<x:xmpmeta xmlns:x="adobe:ns:meta/"/>');
        }

        $bytes = hex2bin(self::SOI).$segments.$body;

        return $padTo > strlen($bytes) ? self::pad($bytes, $padTo) : $bytes;
    }

    /** A valid 1x1 PNG. */
    public static function png(): string
    {
        return base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            true,
        );
    }

    /** One marker segment: the marker, its length and the payload. */
    public static function segment(int $marker, string $payload): string
    {
        return "\xff".chr($marker).pack('n', strlen($payload) + 2).$payload;
    }

    /**
     * Pads the scan to exactly $size bytes, just before EOI. Entropy-coded
     * data is the one place a canvas JPEG grows, and the inspector's
     * allow-list refuses the comment segments that padding used to be.
     */
    private static function pad(string $bytes, int $size): string
    {
        return substr($bytes, 0, -2).str_repeat('x', $size - strlen($bytes)).substr($bytes, -2);
    }
}
