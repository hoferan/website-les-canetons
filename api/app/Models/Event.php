<?php

namespace App\Models;

use App\Casts\UtcDateTime;
use Carbon\CarbonImmutable;
use Database\Factories\EventFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A rehearsal or gig on the planning. The committee enters it, every member
 * reads it, and every player answers it.
 *
 * A multi-day event is one whose `starts_at` and `ends_at` fall on different
 * days, so there is no flag to keep in step with them. A draft may lack both
 * and its location; a published event never does, and the publish path
 * enforces that (see the add_published_at migration).
 *
 * `published_at` null means draft. It is a separate axis from `is_public`:
 * a draft is seen only by `events.manage`, whatever `is_public` says.
 *
 * The @property tags repeat what casts() does at runtime: Larastan cannot
 * read casts() and would otherwise see the raw column types.
 *
 * @property CarbonImmutable|null $starts_at
 * @property CarbonImmutable|null $ends_at
 * @property string|null $location
 * @property CarbonImmutable|null $published_at
 * @property bool $is_public
 * @property CarbonImmutable|null $registration_opens_at
 * @property CarbonImmutable|null $registration_closes_at
 * @property int|null $registration_max_guests
 */
class Event extends Model
{
    /** @use HasFactory<EventFactory> */
    use HasFactory;

    /**
     * Mirrors the column default. Eloquent's create() never reads back a
     * DB-side DEFAULT, so a caller that omits `is_public` would otherwise see
     * null in the same request rather than false.
     */
    protected $attributes = [
        'is_public' => false,
    ];

    /** What a list eager-loads to render every event's poster. See poster(). */
    public const POSTER = 'poster.image.sizes';

    protected $fillable = [
        'title',
        'starts_at',
        'ends_at',
        'location',
        'attire',
        'is_public',
        'notes',
        'registration_opens_at',
        'registration_closes_at',
        'registration_max_guests',
        'published_at',
    ];

    /**
     * Every answer for this event.
     *
     * GET /api/v1/events loads it constrained to the caller, so `myAttendance`
     * costs one query for the whole list. The chase list does not use this
     * relation: it fetches the answers once and setRelation()s them onto the
     * roster.
     *
     * @return HasMany<Attendance, $this>
     */
    public function attendance(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }

    /**
     * Clears the booking choices before the database cascades run.
     *
     * Deleting an event cascades into both `registrations` and
     * `event_registration_options`, and `registration_choices.option_id` is
     * ON DELETE RESTRICT. MySQL does not order the two cascades, so it can
     * remove an option while choices still point at it and fail the delete.
     * Pinned by
     * RegistrationSchemaTest::test_deleting_the_event_takes_the_whole_booking_tree.
     *
     * RESTRICT stays: deleting a booked option while the event lives would
     * rewrite what somebody ordered, and SQL cannot say "restrict unless the
     * parent goes too". It lives on the model rather than the controller so
     * every writer gets it.
     */
    protected static function booted(): void
    {
        static::deleting(function (Event $event): void {
            RegistrationChoice::query()
                ->whereIn('registration_id', $event->registrations()->select('id'))
                ->delete();

            // The poster's slot goes too, or the library would count its image
            // as in use and refuse to delete it.
            $event->poster()->delete();
        });
    }

    /**
     * The poster (#228): the photo slot `event-{id}`, placed like any other
     * slot through PUT /photo-slots/{slot}.
     *
     * Keyed on posterSlot() rather than a column, so a poster needs no
     * migration, and eager loading still reads every event's poster in one
     * query: Eloquent reads a relation's local key through getAttribute(),
     * which answers for an accessor as it does for a column.
     *
     * @return HasOne<PhotoSlot, $this>
     */
    public function poster(): HasOne
    {
        return $this->hasOne(PhotoSlot::class, 'slot', 'poster_slot');
    }

    /** @return Attribute<string, never> */
    protected function posterSlot(): Attribute
    {
        return Attribute::get(fn (): string => PhotoSlot::forEvent($this->id));
    }

    /**
     * In the committee's tag order, so a card's chips read the same on every
     * event (#107).
     *
     * @return BelongsToMany<EventTag, $this>
     */
    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(EventTag::class)->orderBy('sort_order')->orderBy('event_tags.id');
    }

    /** @return HasMany<RegistrationOption, $this> */
    public function registrationOptions(): HasMany
    {
        return $this->hasMany(RegistrationOption::class)->orderBy('sort_order')->orderBy('id');
    }

    /** @return HasMany<Registration, $this> */
    public function registrations(): HasMany
    {
        return $this->hasMany(Registration::class);
    }

    /**
     * Every option booked at this event, across every booking.
     *
     * Exists so withSum has a relation to name: Laravel's aggregate helpers
     * take one relation, not a dotted path. Nothing reads it as a relation.
     *
     * @return HasManyThrough<RegistrationChoice, Registration, $this>
     */
    public function registrationChoices(): HasManyThrough
    {
        return $this->hasManyThrough(RegistrationChoice::class, Registration::class);
    }

    /**
     * The people booked, for withSum/loadSum: `->withSum(Event::guestCount(), 'quantity')`.
     *
     * Only quantities that count people, so five bottles brought along do not
     * show as five guests on the planning. Same rule as
     * Registration::guestCount().
     *
     * @return array<string, \Closure>
     */
    public static function guestCount(): array
    {
        return ['registrationChoices as guest_count' => fn ($choices) => $choices->whereHas(
            'option',
            fn ($option) => $option->where('counts_guests', true),
        )];
    }

    /** Whether this event has not been published yet. */
    public function isDraft(): bool
    {
        return $this->published_at === null;
    }

    /**
     * Only the events the band can see.
     *
     * @param  Builder<Event>  $query
     * @return Builder<Event>
     */
    public function scopePublished(Builder $query): Builder
    {
        return $query->whereNotNull('published_at');
    }

    /**
     * Whether this event takes public registrations at all.
     *
     * True exactly when `registration_closes_at` is set (ADR 0020). No
     * separate boolean, which could drift out of step with the date.
     */
    public function takesRegistrations(): bool
    {
        return $this->registration_closes_at !== null;
    }

    /**
     * Whether the form is accepting bookings right now.
     *
     * A missing `registration_opens_at` means open immediately, so the
     * committee can enable an event without also having to decide when the
     * form should appear.
     */
    public function registrationIsOpen(): bool
    {
        if (! $this->takesRegistrations()) {
            return false;
        }

        if ($this->registration_opens_at !== null && $this->registration_opens_at->isFuture()) {
            return false;
        }

        return $this->registration_closes_at->isFuture();
    }

    protected function casts(): array
    {
        return [
            // Not 'datetime', which would store a Fribourg wall-clock hour in
            // a column every reader treats as UTC (see App\Casts\UtcDateTime).
            // On the column so every writer gets it.
            'starts_at' => UtcDateTime::class,
            'ends_at' => UtcDateTime::class,
            // Null is a draft.
            'published_at' => UtcDateTime::class,
            'is_public' => 'boolean',
            // A closing time typed as 23:59 in Fribourg must not be stored as
            // 23:59 UTC, or the form shuts an hour early in summer.
            'registration_opens_at' => UtcDateTime::class,
            'registration_closes_at' => UtcDateTime::class,
            'registration_max_guests' => 'integer',
        ];
    }
}
