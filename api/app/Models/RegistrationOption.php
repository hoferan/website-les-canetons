<?php

namespace App\Models;

use Database\Factories\RegistrationOptionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One thing a guest can book at an event: a menu, a seat, a child's portion.
 *
 * Per event, not a reusable catalogue, so editing one year's options cannot
 * change another's.
 *
 * `price_cents` is nullable: a free option, or one whose price is in the
 * description, must not store a zero that means "unknown".
 *
 * @property int|null $price_cents
 */
class RegistrationOption extends Model
{
    /** @use HasFactory<RegistrationOptionFactory> */
    use HasFactory;

    protected $table = 'event_registration_options';

    protected $fillable = [
        'event_id',
        'label',
        'description',
        'price_cents',
        'sort_order',
    ];

    /** @return BelongsTo<Event, $this> */
    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    /** @return HasMany<RegistrationChoice, $this> */
    public function choices(): HasMany
    {
        return $this->hasMany(RegistrationChoice::class, 'option_id');
    }

    /**
     * True when somebody has already booked this option.
     *
     * Stops a replace-all PUT from deleting it. The RESTRICT foreign key would
     * refuse too, but only with a 500; checking here lets the committee be
     * told which option is in use.
     */
    public function isBooked(): bool
    {
        return $this->choices()->exists();
    }
}
