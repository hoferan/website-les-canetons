<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One size of a library photo (#105): its dimensions, byte count and the
 * SHA-256 of its bytes, which names its URL.
 *
 * Read-only through Eloquent, and only through Image::sizes(), which never
 * selects `data`. ImageController writes the bytes (an upload and a
 * replacement both, through insertSizes()) and ImageFileController alone reads
 * them, both with the query builder. The table's primary
 * key is (image_id, width), which Eloquent cannot address, so `image_id`
 * stands in for it here and nothing saves or deletes a row through this model.
 *
 * @property int $image_id
 * @property int $width
 * @property int $height
 * @property int $bytes
 * @property string $sha256
 */
class ImageFile extends Model
{
    public $timestamps = false;

    public $incrementing = false;

    protected $primaryKey = 'image_id';

    protected function casts(): array
    {
        return [
            'image_id' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
            'bytes' => 'integer',
        ];
    }
}
