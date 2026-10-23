<?php

namespace App\Models;

use App\Support\OptionKind;
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
 * `capacity` caps the bookings across every guest; null is no limit (ADR
 * 0031). RegistrationController counts against it under a lock.
 *
 * `kind` makes it one block of the event's form (ADR 0032). Price, capacity
 * and `counts_guests` mean something only on a quantity; a choice keeps its
 * answers in `settings`.
 *
 * @property OptionKind $kind
 * @property string|null $label
 * @property bool $required
 * @property bool $counts_guests
 * @property array<string, mixed>|null $settings
 * @property int|null $price_cents
 * @property int|null $capacity
 */
class RegistrationOption extends Model
{
    /** @use HasFactory<RegistrationOptionFactory> */
    use HasFactory;

    protected $table = 'event_registration_options';

    protected $fillable = [
        'event_id',
        'kind',
        'label',
        'description',
        'required',
        'counts_guests',
        'price_cents',
        'capacity',
        'settings',
        'sort_order',
    ];

    /** Mirrors the column defaults, which create() never reads back. */
    protected $attributes = [
        'kind' => 'quantity',
        'required' => false,
        'counts_guests' => false,
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'kind' => OptionKind::class,
            'required' => 'boolean',
            'counts_guests' => 'boolean',
            'settings' => 'array',
        ];
    }

    /**
     * A choice's answers, in the order the committee wrote them.
     *
     * The id is what a booking stores, so renaming an answer renames it on
     * every booking that picked it. Empty for every other kind.
     *
     * @return list<array{id: string, label: string}>
     */
    public function answers(): array
    {
        if ($this->kind !== OptionKind::Choice) {
            return [];
        }

        return array_values($this->settings['answers'] ?? []);
    }

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

    /**
     * How many more can be booked, or null when there is no limit.
     *
     * Never below zero: the committee may lower a capacity under what is
     * already booked, to stop further bookings, and the form should read
     * "sold out" rather than a negative number.
     *
     * Reads `choices_sum_quantity` when the query loaded it with
     * withSum('choices', 'quantity'), so a list costs one query, not one per
     * option.
     */
    public function remaining(): ?int
    {
        if ($this->capacity === null) {
            return null;
        }

        $booked = array_key_exists('choices_sum_quantity', $this->attributes)
            ? (int) $this->attributes['choices_sum_quantity']
            : (int) $this->choices()->sum('quantity');

        return max(0, $this->capacity - $booked);
    }
}
