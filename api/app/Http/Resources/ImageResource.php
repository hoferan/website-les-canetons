<?php

namespace App\Http\Resources;

use App\Http\Middleware\ApiVersion;
use App\Models\Image;
use App\Models\ImageFile;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One photo in the library, with its sizes and every place it is shown.
 *
 * @mixin Image
 */
class ImageResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            /** The committee's label for the photo. Internal: no public page shows it, and it is not alt text. */
            'name' => $this->name,
            /** The largest size. Public, and cached for a year: each size's path is the SHA-256 of its own bytes, so new bytes always get a new path. */
            'url' => self::largestUrl($this->resource),
            'width' => $this->width,
            'height' => $this->height,
            /** Every size as an HTML `srcset`, smallest first. */
            'srcset' => self::srcset($this->resource),
            /** The bytes of all sizes together. */
            'bytes' => $this->bytes,
            /** Each stored size, smallest first. The largest has the photo's own width, height and `url`. */
            'sizes' => self::sizesOf($this->resource),
            'createdAt' => $this->createdAt(),
            /** Every slot the image is shown in, with the name (`label`) and page (`path`) its page gave it; either may be null. An image with any usage cannot be deleted. */
            'usages' => $this->resource->usages(),
        ];
    }

    /** The public path of one stored size, named by the SHA-256 of its bytes. */
    public static function url(string $sizeSha256): string
    {
        return '/'.ApiVersion::PREFIX."/images/{$sizeSha256}.jpg";
    }

    /**
     * The path of the largest size, which is the photo's own. A photo always
     * has its largest size; the image's own digest stands in only for a row
     * written without sizes, which nothing but a test does.
     */
    public static function largestUrl(Image $image): string
    {
        return self::url($image->sizes->sortByDesc('width')->first()->sha256 ?? $image->sha256);
    }

    /** Every size of a photo as an HTML `srcset`, smallest first. */
    public static function srcset(Image $image): string
    {
        return implode(', ', array_map(
            fn (array $size): string => "{$size['url']} {$size['width']}w",
            self::sizesOf($image),
        ));
    }

    /**
     * @return list<array{width: int, height: int, bytes: int, url: string}>
     */
    private static function sizesOf(Image $image): array
    {
        return $image->sizes
            ->map(fn (ImageFile $size): array => [
                'width' => $size->width,
                'height' => $size->height,
                'bytes' => $size->bytes,
                'url' => self::url($size->sha256),
            ])
            ->values()
            ->all();
    }

    private function createdAt(): Iso8601
    {
        return Iso8601::utc($this->created_at);
    }
}
