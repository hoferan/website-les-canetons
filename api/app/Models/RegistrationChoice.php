<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * How many of one option a booking asked for.
 *
 * A quantity, not a row per person: UNIQUE(registration_id, option_id) keeps
 * it one row per option.
 *
 * No factory: a choice cannot exist without a registration and an option, so
 * RegistrationFactory builds them through withChoice().
 */
class RegistrationChoice extends Model
{
    protected $fillable = [
        'registration_id',
        'option_id',
        'quantity',
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
