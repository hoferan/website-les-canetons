<?php

namespace App\Models;

use App\Support\BookingChangeKind;
use App\Support\BookingJournal;
use App\Support\OptionKind;
use App\Support\PhoneNumber;
use Database\Factories\RegistrationFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

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
     * Columns whose change the committee would not notice on the guest list:
     * payment lives in its spreadsheet, and the dial string follows the
     * number. A write touching only these is not a change (ADR 0035).
     */
    private const UNJOURNALED = ['paid_at', 'phone_e164', 'updated_at'];

    /**
     * The dial string follows the number as typed, on every write. See
     * App\Support\PhoneNumber for why it is a companion and never a
     * replacement.
     *
     * Every booking write also lands in the journal here, on the model, so no
     * controller can forget it (ADR 0035). Answers are journaled by
     * writeChoices(), which the row's own events do not see.
     */
    protected static function booted(): void
    {
        static::saving(function (Registration $registration): void {
            if ($registration->isDirty('phone') || $registration->phone_e164 === null) {
                $registration->phone_e164 = PhoneNumber::e164((string) $registration->phone);
            }
        });

        static::created(fn (Registration $registration) => BookingJournal::record($registration, BookingChangeKind::Created));
        static::deleted(fn (Registration $registration) => BookingJournal::record($registration, BookingChangeKind::Cancelled));
        static::updated(function (Registration $registration): void {
            if ($registration->changedForJournal()) {
                BookingJournal::record($registration, BookingChangeKind::Changed);
            }
        });
    }

    /** Whether the last save changed something the guest list shows. */
    private function changedForJournal(): bool
    {
        return array_diff(array_keys($this->getChanges()), self::UNJOURNALED) !== [];
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

    /**
     * Replaces this booking's answers with the ones sent.
     *
     * Each kind keeps only its own column, whatever else the entry carried,
     * and a blank text is no answer: the request let it through as such, and
     * an empty row would read as answered.
     *
     * `$answersOnly` keeps the quantities, the only rows with one: the
     * committee corrects answers, never an order (#317).
     *
     * @param  list<array{optionId: int, quantity?: int|null, value?: string|null}>  $choices
     * @param  Collection<int, OptionKind>  $kinds  each option's kind, by id
     */
    public function writeChoices(array $choices, Collection $kinds, bool $answersOnly = false): void
    {
        $before = $this->wasRecentlyCreated ? null : $this->answerSnapshot();

        // Only a booking that had answers. On a new one the DELETE would take
        // a gap lock at the end of the index, and two bookings doing that at
        // once deadlock each other's inserts.
        if (! $this->wasRecentlyCreated) {
            $this->choices()->when($answersOnly, fn ($rows) => $rows->whereNull('quantity'))->delete();
        }

        foreach ($choices as $choice) {
            $quantity = $kinds[$choice['optionId']] === OptionKind::Quantity;
            $value = $quantity ? null : trim((string) ($choice['value'] ?? ''));

            if ($value === '') {
                continue;
            }

            RegistrationChoice::create([
                'registration_id' => $this->id,
                'option_id' => $choice['optionId'],
                'quantity' => $quantity ? $choice['quantity'] : null,
                'value' => $value,
            ]);
        }

        $this->unsetRelation('choices');

        // One journal row per booking per write: a new booking is already
        // `new`, and a save that changed the row itself already said
        // `changed`. A member's screen resends every answer, so only a real
        // difference counts.
        if ($before !== null && ! $this->changedForJournal() && $before !== $this->answerSnapshot()) {
            BookingJournal::record($this, BookingChangeKind::Changed);
        }
    }

    /**
     * The answers as comparable strings, in a fixed order.
     *
     * @return list<string>
     */
    private function answerSnapshot(): array
    {
        return $this->choices()
            ->get(['option_id', 'quantity', 'value'])
            ->map(fn (RegistrationChoice $choice) => "{$choice->option_id}|{$choice->quantity}|{$choice->value}")
            ->sort()
            ->values()
            ->all();
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
