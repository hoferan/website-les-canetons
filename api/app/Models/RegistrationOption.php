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
 * PER EVENT, not a reusable catalogue. Next year's souper is a form the
 * committee fills in, and an option list shared between years is one nobody
 * dares edit.
 *
 * `price_cents` is nullable — a free option, or one whose price lives in the
 * description, is a real case and must not be forced to invent a zero that
 * means "unknown".
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
     * What stops a replace-all PUT from deleting it: the foreign key is
     * RESTRICT, so the database would refuse anyway, but refusing in the
     * application is what lets the committee be told WHICH option is in use
     * rather than meeting a 500.
     */
    public function isBooked(): bool
    {
        return $this->choices()->exists();
    }
}
