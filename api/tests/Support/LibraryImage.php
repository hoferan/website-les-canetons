<?php

namespace Tests\Support;

use App\Models\Image;
use Illuminate\Support\Facades\DB;

/**
 * A library photo written straight to the database, for tests that need one
 * in place rather than uploaded.
 */
final class LibraryImage
{
    /**
     * One `images` row and an `image_files` row per width, each holding small
     * stand-in bytes. The largest width is the photo's; the others keep its
     * shape. `bytes` on the photo is the total of the sizes, as an upload
     * would record it.
     *
     * @param  list<int>|null  $widths  every size's width; just the photo's own when null
     */
    public static function create(
        ?string $sha256 = null,
        int $width = 800,
        int $height = 600,
        ?array $widths = null,
        int $bytesEach = 1000,
        string $name = 'Photo de test',
    ): Image {
        $widths ??= [$width];
        rsort($widths);

        $image = Image::query()->create([
            'name' => $name,
            'sha256' => $sha256 ?? hash('sha256', uniqid('', true)),
            'width' => $width,
            'height' => $height,
            'bytes' => $bytesEach * count($widths),
        ]);

        foreach ($widths as $each) {
            // Distinct per photo and per size, so every size has its own
            // digest and URL, as real sizes do.
            $data = substr(str_pad("{$image->sha256}/{$each}", $bytesEach, "\xAB"), 0, $bytesEach);
            DB::table('image_files')->insert([
                'image_id' => $image->id,
                'width' => $each,
                'height' => (int) round($each * $height / $width),
                'bytes' => $bytesEach,
                'sha256' => hash('sha256', $data),
                'data' => $data,
            ]);
        }

        return $image->load('sizes');
    }

    /** The URL a stored size of the photo is served at: the digest of its bytes. */
    public static function url(Image $image, int $width): string
    {
        $sha256 = DB::table('image_files')->where('image_id', $image->id)->where('width', $width)->value('sha256');

        return "/api/v1/images/{$sha256}.jpg";
    }
}
