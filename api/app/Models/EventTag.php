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
 * @property int $sort_order
 */
class EventTag extends Model
{
    protected $fillable = ['label_fr', 'label_de', 'colour', 'sort_order'];

    /** @return BelongsToMany<Event, $this> */
    public function events(): BelongsToMany
    {
        return $this->belongsToMany(Event::class);
    }

    protected function casts(): array
    {
        return [
            'colour' => TagColour::class,
            'sort_order' => 'integer',
        ];
    }
}
