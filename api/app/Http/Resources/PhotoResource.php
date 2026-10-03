<?php

namespace App\Http\Resources;

use App\Models\Image;

/**
 * A library photo as a page shows it: its largest size and every size as a
 * `srcset`.
 *
 * It carries no alt text. The page describes each photo by what it
 * illustrates: the band's name, the register's, or the history entry's title.
 *
 * Not a JsonResource, so an empty placement is a plain null rather than a
 * wrapped one.
 */
final class PhotoResource
{
    /**
     * Null when nothing is placed.
     *
     * @return array{url: string, width: int, height: int, srcset: string}|null
     */
    public static function of(?Image $image): ?array
    {
        if ($image === null) {
            return null;
        }

        return [
            'url' => ImageResource::largestUrl($image),
            'width' => $image->width,
            'height' => $image->height,
            'srcset' => ImageResource::srcset($image),
        ];
    }
}
