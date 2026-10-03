<?php

namespace App\Http\Resources;

use App\Models\Image;

/**
 * A library photo as a placement shows it: its largest size, every size as a
 * `srcset`, and the alt text the placement gives it in each language.
 *
 * Only a history entry has alt text to give. The band, concert and register
 * slots pass none, and the page describes those photos by the band's or the
 * register's name.
 *
 * Not a JsonResource: the alt text belongs to the placement, so there is no
 * single model to wrap.
 */
final class PhotoResource
{
    /**
     * Null when nothing is placed.
     *
     * @return array{url: string, width: int, height: int, srcset: string, altFr: ?string, altDe: ?string}|null
     */
    public static function of(?Image $image, ?string $altFr = null, ?string $altDe = null): ?array
    {
        if ($image === null) {
            return null;
        }

        return [
            'url' => ImageResource::largestUrl($image),
            'width' => $image->width,
            'height' => $image->height,
            'srcset' => ImageResource::srcset($image),
            'altFr' => $altFr,
            'altDe' => $altDe,
        ];
    }
}
