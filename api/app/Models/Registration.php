<?php

namespace App\Models;

use Database\Factories\RegistrationFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * One booking, made by a stranger from the public form.
 *
 * WRITE-ONCE FROM THE PUBLIC SIDE (decision G2). There is no cancel token and
 * no self-service: the committee corrects and cancels, on the guest-list
 * screen they need anyway. Every additional anonymous endpoint is another
 * thing to rate-limit, and a token that reads back an address and a phone
 * number is a credential over personal data.
 *
 * The @property-read tags below are for the two Attribute accessors. Larastan
 * runs at level 5 and cannot see through Attribute::get(), so without them
 * every caller of $registration->guest_count reads as an undefined property.
 * Event.php and Member.php carry equivalent blocks for their casts.
 *
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read int $guest_count
 * @property-read int|null $total_cents
 */
class Registration extends Model
{
    /** @use HasFactory<RegistrationFactory> */
    use HasFactory;

    protected $fillable = [
        'event_id',
        'first_name',
        'last_name',
        'email',
        'phone',
        'address',
        'table_name',
    ];

    /** @return BelongsTo<Event, $this> */
    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    /** @return HasMany<RegistrationChoice, $this> */
    public function choices(): HasMany
    {
        return $this->hasMany(RegistrationChoice::class);
    }

    public function fullName(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    /**
     * How many people this booking is for.
     *
     * The sum of the quantities, because "3 x meat, 1 x child" is four
     * people. This is what `registration_max_guests` caps, and it reads the
     * LOADED choices rather than querying, so the guest list does not become
     * an N+1 the first time somebody totals a column.
     */
    protected function guestCount(): Attribute
    {
        return Attribute::get(fn (): int => (int) $this->choices->sum('quantity'));
    }

    /**
     * What this booking comes to, in centimes, or null when nothing it
     * contains has a price.
     *
     * Null rather than zero, and the difference is the whole reason
     * price_cents is nullable: a free event owes nothing, and an event whose
     * prices are written in the descriptions owes an unknown amount. A total
     * of "CHF 0.-" would assert the first about the second.
     */
    protected function totalCents(): Attribute
    {
        return Attribute::get(function (): ?int {
            $priced = $this->choices->filter(
                fn (RegistrationChoice $choice) => $choice->option?->price_cents !== null
            );

            if ($priced->isEmpty()) {
                return null;
            }

            return (int) $priced->sum(
                fn (RegistrationChoice $choice) => $choice->quantity * (int) $choice->option->price_cents
            );
        });
    }
}
