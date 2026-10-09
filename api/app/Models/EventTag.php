<?php

namespace App\Models;

use App\Support\TagColour;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A label the committee puts on events, such as "Répétition" or "Carnaval" (#107).
 *
 * The name is content typed by the committee, in both languages (ADR 0026),
 * so it carries no developer key: nothing would ever read one.
 *
 * @property int $id
 * @property string $label_fr
 * @property string|null $label_de
 * @property TagColour $colour
 * @property bool $celebrate
 * @property int $sort_order
 */
class EventTag extends Model
{
    protected $fillable = ['label_fr', 'label_de', 'colour', 'celebrate', 'sort_order'];

    /**
     * Validated `tagIds` as distinct integers, ready for the pivot.
     *
     * Cast before comparing: the `integer` rule lets "+2" through and
     * `exists` finds it, so array_unique() over the raw strings would keep
     * both spellings and the second insert would break the primary key.
     *
     * @param  array<int, int|string>  $raw
     * @return list<int>
     */
    public static function distinctIds(array $raw): array
    {
        return array_values(array_unique(array_map('intval', $raw)));
    }

    /** @return BelongsToMany<Event, $this> */
    public function events(): BelongsToMany
    {
        return $this->belongsToMany(Event::class);
    }

    protected function casts(): array
    {
        return [
            'colour' => TagColour::class,
            'celebrate' => 'boolean',
            'sort_order' => 'integer',
        ];
    }
}
