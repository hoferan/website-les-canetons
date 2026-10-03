<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One of the two single photographs of the band page, keyed by slot.
 *
 * The rows are inserted by the migration and never created at runtime, so
 * SLOTS is the whole set.
 *
 * @property string $slot
 * @property int|null $image_id
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class SitePhoto extends Model
{
    public const SLOTS = ['band', 'concert'];

    protected $primaryKey = 'slot';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['image_id'];

    /** @return BelongsTo<Image, $this> */
    public function image(): BelongsTo
    {
        return $this->belongsTo(Image::class);
    }
}
