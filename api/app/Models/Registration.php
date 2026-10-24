<?php

namespace App\Models;

use App\Support\PhoneNumber;
use Database\Factories\RegistrationFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * One booking: a stranger's from the public form, or a member's from a
 * members-only form (`member_id` set, no email or phone; ADR 0034).
 *
 * Write-once from the public side (ADR 0020): no cancel token and no
 * self-service. The committee corrects and cancels on the guest list. Each
 * anonymous endpoint is another thing to rate-limit, and a token that reads
 * back an address and a phone number is a credential over personal data.
 *
 * The @property-read tags cover the two Attribute accessors, which Larastan
 * cannot see through.
 *
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property Carbon|null $paid_at
 * @property string|null $phone_e164
 * @property int|null $member_id
 * @property-read int $guest_count
 * @property-read int|null $total_cents
 */
class Registration extends Model
{
    /** @use HasFactory<RegistrationFactory> */
    use HasFactory;

    protected $fillable = [
        'event_id',
        'member_id',
        'first_name',
        'last_name',
        'email',
        'phone',
        'address',
        'table_name',
        'paid_at',
    ];

    /**
     * The dial string follows the number as typed, on every write. See
     * App\Support\PhoneNumber for why it is a companion and never a
     * replacement.
     */
    protected static function booted(): void
    {
        static::saving(function (Registration $registration): void {
            if ($registration->isDirty('phone') || $registration->phone_e164 === null) {
                $registration->phone_e164 = PhoneNumber::e164((string) $registration->phone);
            }
        });
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['paid_at' => 'datetime'];
    }

    /** @return BelongsTo<Event, $this> */
    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    /** @return BelongsTo<Member, $this> */
    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class);
    }

    /** Whether a member made this booking with their account. */
    public function isMember(): bool
    {
        return $this->member_id !== null;
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
     * The sum of the quantities on blocks that count people, so "3 x meat,
     * 1 x child" is four people and "5 bottles" is none.
     * `registration_max_guests` caps this. It reads the loaded choices and
     * their options rather than querying, so the guest list does not become an
     * N+1.
     */
    protected function guestCount(): Attribute
    {
        return Attribute::get(fn (): int => (int) $this->choices
            ->filter(fn (RegistrationChoice $choice): bool => $choice->option?->counts_guests === true)
            ->sum('quantity'));
    }

    /**
     * What this booking comes to, in centimes, or null when nothing it
     * contains has a price.
     *
     * Null rather than zero, which is why price_cents is nullable: prices
     * written in the descriptions are an unknown amount, not CHF 0.
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
