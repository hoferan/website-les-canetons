<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\HistoryEntryFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
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
    ];

    protected function casts(): array
    {
        return [
            'occurred_on' => 'immutable_date',
            'important' => 'boolean',
        ];
    }
}
