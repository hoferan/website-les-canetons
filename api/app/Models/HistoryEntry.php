<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\HistoryEntryFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One dated entry of the band's history.
 *
 * @property int $id
 * @property CarbonImmutable $occurred_on
 * @property string $precision
 * @property string|null $title_fr
 * @property string|null $body_fr
 * @property string|null $title_de
 * @property string|null $body_de
 * @property bool $important
 * @property string|null $icon
 * @property int|null $image_id
 * @property string|null $image_alt_fr
 * @property string|null $image_alt_de
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class HistoryEntry extends Model
{
    /** @use HasFactory<HistoryEntryFactory> */
    use HasFactory;

    protected $attributes = ['important' => false];

    protected $fillable = [
        'occurred_on',
        'precision',
        'title_fr',
        'body_fr',
        'title_de',
        'body_de',
        'important',
        'icon',
        'image_id',
        'image_alt_fr',
        'image_alt_de',
    ];

    /** @return BelongsTo<Image, $this> */
    public function image(): BelongsTo
    {
        return $this->belongsTo(Image::class);
    }

    protected function casts(): array
    {
        return [
            'occurred_on' => 'immutable_date',
            'important' => 'boolean',
        ];
    }
}
