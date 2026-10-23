<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A booking's answer to one block of the form.
 *
 * A quantity block fills `quantity`, a number and not a row per person;
 * every other input kind fills `value` (the text, the chosen answer's key, or
 * `yes`/`no`). UNIQUE(registration_id, option_id) keeps it one row per block.
 *
 * No factory: a choice cannot exist without a registration and an option, so
 * RegistrationFactory builds them through withChoice().
 *
 * @property int|null $quantity
 * @property string|null $value
 */
class RegistrationChoice extends Model
{
    protected $fillable = [
        'registration_id',
        'option_id',
        'quantity',
        'value',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
        ];
    }

    /** @return BelongsTo<Registration, $this> */
    public function registration(): BelongsTo
    {
        return $this->belongsTo(Registration::class);
    }

    /** @return BelongsTo<RegistrationOption, $this> */
    public function option(): BelongsTo
    {
        return $this->belongsTo(RegistrationOption::class, 'option_id');
    }
}
