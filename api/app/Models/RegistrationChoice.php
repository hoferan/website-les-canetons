<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * How many of one option a booking asked for.
 *
 * A QUANTITY, not a row per person. The old signups.menus was a text column
 * holding ["meat","meat","child"]; this is the normalised form of exactly
 * that, and UNIQUE(registration_id, option_id) is what keeps it one row per
 * option rather than drifting back.
 *
 * No factory: a choice without a registration and an option is not a thing,
 * so RegistrationFactory builds them through withChoice() instead.
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
